terraform {
  required_version = ">= 1.5.0"
  required_providers {
    oci = {
      source  = "oracle/oci"
      version = ">= 6.0.0"
    }
  }
}

provider "oci" {
  region = var.region
  # Uses ~/.oci/config by default (from `oci setup config`)
  config_file_profile = var.oci_profile
}

data "oci_identity_availability_domains" "ads" {
  compartment_id = var.compartment_id
}

data "oci_core_images" "ubuntu" {
  compartment_id           = var.compartment_id
  operating_system         = "Canonical Ubuntu"
  operating_system_version = var.ubuntu_version
  shape                    = var.instance_shape
  sort_by                  = "TIMECREATED"
  sort_order               = "DESC"
}

locals {
  ad_name        = data.oci_identity_availability_domains.ads.availability_domains[var.availability_domain_index].name
  ubuntu_image   = data.oci_core_images.ubuntu.images[0].id
  ssh_public_key = var.ssh_public_key != "" ? var.ssh_public_key : file(pathexpand(var.ssh_public_key_path))
}

resource "oci_core_vcn" "mindsprint" {
  compartment_id = var.compartment_id
  display_name   = "${var.name_prefix}-vcn"
  cidr_blocks    = ["10.0.0.0/16"]
  dns_label      = replace(var.name_prefix, "-", "")
}

resource "oci_core_internet_gateway" "mindsprint" {
  compartment_id = var.compartment_id
  vcn_id         = oci_core_vcn.mindsprint.id
  display_name   = "${var.name_prefix}-igw"
  enabled        = true
}

resource "oci_core_route_table" "mindsprint" {
  compartment_id = var.compartment_id
  vcn_id         = oci_core_vcn.mindsprint.id
  display_name   = "${var.name_prefix}-rt"

  route_rules {
    network_entity_id = oci_core_internet_gateway.mindsprint.id
    destination       = "0.0.0.0/0"
    destination_type  = "CIDR_BLOCK"
  }
}

resource "oci_core_security_list" "mindsprint" {
  compartment_id = var.compartment_id
  vcn_id         = oci_core_vcn.mindsprint.id
  display_name   = "${var.name_prefix}-sl"

  egress_security_rules {
    protocol    = "all"
    destination = "0.0.0.0/0"
  }

  # SSH
  ingress_security_rules {
    protocol = "6"
    source   = var.ssh_cidr
    tcp_options {
      min = 22
      max = 22
    }
  }

  # HTTP (Let's Encrypt)
  ingress_security_rules {
    protocol = "6"
    source   = "0.0.0.0/0"
    tcp_options {
      min = 80
      max = 80
    }
  }

  # HTTPS
  ingress_security_rules {
    protocol = "6"
    source   = "0.0.0.0/0"
    tcp_options {
      min = 443
      max = 443
    }
  }
}

resource "oci_core_subnet" "mindsprint" {
  compartment_id             = var.compartment_id
  vcn_id                     = oci_core_vcn.mindsprint.id
  display_name               = "${var.name_prefix}-subnet"
  cidr_block                 = "10.0.1.0/24"
  route_table_id             = oci_core_route_table.mindsprint.id
  security_list_ids          = [oci_core_security_list.mindsprint.id]
  prohibit_public_ip_on_vnic = false
  dns_label                  = "public"
}

resource "oci_core_instance" "mindsprint" {
  availability_domain = local.ad_name
  compartment_id      = var.compartment_id
  display_name        = "${var.name_prefix}-vm"
  shape               = var.instance_shape

  shape_config {
    ocpus         = var.ocpus
    memory_in_gbs = var.memory_in_gbs
  }

  create_vnic_details {
    subnet_id        = oci_core_subnet.mindsprint.id
    assign_public_ip = true
    display_name     = "${var.name_prefix}-vnic"
    hostname_label   = "mindsprint"
  }

  source_details {
    source_type             = "image"
    source_id               = local.ubuntu_image
    boot_volume_size_in_gbs = var.boot_volume_size_in_gbs
  }

  metadata = {
    ssh_authorized_keys = local.ssh_public_key
    user_data           = base64encode(file("${path.module}/cloud-init.yaml"))
  }

  timeouts {
    create = "30m"
  }
}
