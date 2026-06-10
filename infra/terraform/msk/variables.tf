variable "environment" {
  description = "Deployment environment (e.g. production, staging)"
  type        = string
  default     = "production"
}

variable "vpc_id" {
  description = "ID of the VPC in which the MSK cluster will be deployed"
  type        = string
}

variable "subnet_ids" {
  description = "List of exactly 3 subnet IDs (one per AZ) for MSK broker placement"
  type        = list(string)

  validation {
    condition     = length(var.subnet_ids) == 3
    error_message = "Exactly 3 subnet IDs must be provided, one per availability zone."
  }
}

variable "vpc_cidr" {
  description = "CIDR block of the VPC, used for security group ingress rules"
  type        = string
}

variable "tags" {
  description = "Map of tags to apply to all resources"
  type        = map(string)
  default     = {}
}
