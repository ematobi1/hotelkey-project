output "bootstrap_brokers_tls" {
  description = "TLS connection string for the MSK cluster bootstrap brokers"
  value       = aws_msk_cluster.hotel_key.bootstrap_brokers_tls
  sensitive   = true
}

output "bootstrap_brokers_sasl_scram" {
  description = "SASL/SCRAM connection string for the MSK cluster bootstrap brokers"
  value       = aws_msk_cluster.hotel_key.bootstrap_brokers_sasl_scram
  sensitive   = true
}

output "zookeeper_connect_string" {
  description = "ZooKeeper connection string for the MSK cluster"
  value       = aws_msk_cluster.hotel_key.zookeeper_connect_string
  sensitive   = true
}

output "cluster_arn" {
  description = "ARN of the MSK cluster"
  value       = aws_msk_cluster.hotel_key.arn
}

output "security_group_id" {
  description = "ID of the security group attached to the MSK cluster"
  value       = aws_security_group.msk.id
}
