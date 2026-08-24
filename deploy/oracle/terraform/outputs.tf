output "instance_id" {
  value = oci_core_instance.mindsprint.id
}

output "public_ip" {
  value = oci_core_instance.mindsprint.public_ip
}

output "ssh_command" {
  value = "ssh ubuntu@${oci_core_instance.mindsprint.public_ip}"
}

output "next_steps" {
  value = <<-EOT
    1. Point DuckDNS at: ${oci_core_instance.mindsprint.public_ip}
    2. SSH: ssh ubuntu@${oci_core_instance.mindsprint.public_ip}
    3. Wait ~1–2 min for cloud-init/Docker, then:
         git clone https://github.com/holden028/MindSprint.git
         cd MindSprint
         bash deploy/oracle/bootstrap.sh
  EOT
}
