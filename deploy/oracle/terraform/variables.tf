variable "compartment_id" {
  description = "OCID of the compartment (often your tenancy OCID)."
  type        = string
}

variable "region" {
  description = "OCI region, e.g. uk-london-1 or eu-frankfurt-1."
  type        = string
}

variable "oci_profile" {
  description = "Profile name in ~/.oci/config"
  type        = string
  default     = "DEFAULT"
}

variable "name_prefix" {
  type    = string
  default = "mindsprint"
}

variable "availability_domain_index" {
  description = "0 = first AD. Try 1 or 2 if capacity is exhausted."
  type        = number
  default     = 0
}

variable "instance_shape" {
  type    = string
  default = "VM.Standard.A1.Flex"
}

variable "ocpus" {
  description = "Always Free ARM total budget is 4 OCPU across all VMs."
  type        = number
  default     = 2
}

variable "memory_in_gbs" {
  description = "Always Free ARM total budget is 24 GB across all VMs."
  type        = number
  default     = 12
}

variable "boot_volume_size_in_gbs" {
  type    = number
  default = 50
}

variable "ubuntu_version" {
  type    = string
  default = "24.04"
}

variable "ssh_public_key" {
  description = "Inline SSH public key. Leave empty to use ssh_public_key_path."
  type        = string
  default     = ""
}

variable "ssh_public_key_path" {
  type    = string
  default = "~/.ssh/id_ed25519.pub"
}

variable "ssh_cidr" {
  description = "Who can SSH. Prefer your home IP/32; 0.0.0.0/0 is open to the world."
  type        = string
  default     = "0.0.0.0/0"
}
