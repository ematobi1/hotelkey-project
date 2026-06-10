package config

import "os"

type Config struct {
	Port         string
	KafkaBrokers []string
	KafkaGroupID string
	LogLevel     string
}

func Load() *Config {
	brokers := os.Getenv("KAFKA_BROKERS")
	if brokers == "" {
		brokers = "localhost:9094"
	}
	return &Config{
		Port:         envOrDefault("PORT", "4000"),
		KafkaBrokers: []string{brokers},
		KafkaGroupID: envOrDefault("KAFKA_GROUP_ID", "digital-twin-consumer"),
		LogLevel:     envOrDefault("LOG_LEVEL", "info"),
	}
}

func envOrDefault(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
