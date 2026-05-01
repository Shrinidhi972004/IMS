package store

import (
	"context"
	"fmt"
	"os"

	"github.com/rs/zerolog/log"
)

// Stores is a container for all persistence layers.
// Passed as a single dependency to the rest of the application.
type Stores struct {
	Postgres *PostgresStore
	Mongo    *MongoStore
	Redis    *RedisStore
}

// Config holds DSN/connection strings for all stores.
type Config struct {
	PostgresDSN string
	MongoURI    string
	MongoDB     string
	RedisAddr   string
	RedisPass   string
	RedisDB     int
}

// ConfigFromEnv reads store config from environment variables.
func ConfigFromEnv() Config {
	return Config{
		PostgresDSN: getEnv("POSTGRES_DSN", "postgres://ims:ims@localhost:5432/ims?sslmode=disable"),
		MongoURI:    getEnv("MONGO_URI", "mongodb://localhost:27017"),
		MongoDB:     getEnv("MONGO_DB", "ims"),
		RedisAddr:   getEnv("REDIS_ADDR", "localhost:6379"),
		RedisPass:   getEnv("REDIS_PASS", ""),
		RedisDB:     0,
	}
}

// InitAll connects to all stores, returning a populated Stores container.
func InitAll(ctx context.Context, cfg Config) (*Stores, error) {
	log.Info().Msg("initialising stores...")

	pg, err := NewPostgresStore(ctx, cfg.PostgresDSN)
	if err != nil {
		return nil, fmt.Errorf("store: postgres: %w", err)
	}

	mg, err := NewMongoStore(ctx, cfg.MongoURI, cfg.MongoDB)
	if err != nil {
		return nil, fmt.Errorf("store: mongodb: %w", err)
	}

	rd, err := NewRedisStore(ctx, cfg.RedisAddr, cfg.RedisPass, cfg.RedisDB)
	if err != nil {
		return nil, fmt.Errorf("store: redis: %w", err)
	}

	log.Info().Msg("all stores connected")
	return &Stores{
		Postgres: pg,
		Mongo:    mg,
		Redis:    rd,
	}, nil
}

// Close gracefully shuts down all store connections.
func (s *Stores) Close(ctx context.Context) {
	log.Info().Msg("closing store connections...")
	s.Postgres.Close()
	if err := s.Mongo.Close(ctx); err != nil {
		log.Error().Err(err).Msg("mongo close error")
	}
	if err := s.Redis.Close(); err != nil {
		log.Error().Err(err).Msg("redis close error")
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
