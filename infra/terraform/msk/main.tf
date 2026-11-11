resource "aws_msk_cluster" "hotel_key" {
  cluster_name           = "hotel-key-${var.environment}"
  kafka_version          = "3.6.0"
  number_of_broker_nodes = 3

  broker_node_group_info {
    instance_type  = "kafka.m5.xlarge"
    client_subnets = var.subnet_ids
    storage_info {
      ebs_storage_info {
        volume_size = 1000
      }
    }
    security_groups = [aws_security_group.msk.id]
  }

  encryption_info {
    encryption_at_rest_kms_key_arn = aws_kms_key.msk.arn

    encryption_in_transit {
      client_broker = "TLS"
      in_cluster    = true
    }
  }

  configuration_info {
    arn      = aws_msk_configuration.hotel_key.arn
    revision = aws_msk_configuration.hotel_key.latest_revision
  }

  logging_info {
    broker_logs {
      cloudwatch_logs {
        enabled   = true
        log_group = aws_cloudwatch_log_group.msk_broker_logs.name
      }
    }
  }

  tags = var.tags
}

resource "aws_msk_configuration" "hotel_key" {
  name              = "hotel-key-${var.environment}"
  kafka_versions    = ["3.6.0"]
  server_properties = <<-PROPS
    auto.create.topics.enable=false
    default.replication.factor=3
    min.insync.replicas=2
    num.partitions=6
    log.retention.hours=168
    log.segment.bytes=1073741824
    log.retention.check.interval.ms=300000
    message.max.bytes=10485760
    replica.fetch.max.bytes=10485760
  PROPS
}

resource "aws_kms_key" "msk" {
  description             = "KMS key for MSK at-rest encryption — hotel-key-${var.environment}"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  tags = merge(var.tags, {
    Name = "hotel-key-msk-${var.environment}"
  })
}

resource "aws_kms_alias" "msk" {
  name          = "alias/hotel-key-msk-${var.environment}"
  target_key_id = aws_kms_key.msk.key_id
}

resource "aws_security_group" "msk" {
  name        = "hotel-key-msk-${var.environment}"
  description = "Security group for Hotel Key MSK cluster"
  vpc_id      = var.vpc_id

  ingress {
    description = "Kafka TLS from VPC"
    from_port   = 9094
    to_port     = 9094
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  ingress {
    description = "Kafka SASL/SCRAM from VPC"
    from_port   = 9096
    to_port     = 9096
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  ingress {
    description = "ZooKeeper from VPC"
    from_port   = 2181
    to_port     = 2181
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.tags, {
    Name = "hotel-key-msk-${var.environment}"
  })
}

resource "aws_cloudwatch_log_group" "msk_broker_logs" {
  name              = "/hotel-key/${var.environment}/msk/broker"
  retention_in_days = 30

  tags = var.tags
}
