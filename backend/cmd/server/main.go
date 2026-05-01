package main

import (
	"context"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
	"github.com/shrinidhi972004/ims/internal/api"
	"github.com/shrinidhi972004/ims/internal/queue"
	"github.com/shrinidhi972004/ims/internal/store"
	"github.com/shrinidhi972004/ims/internal/worker"
	"github.com/shrinidhi972004/ims/internal/workflow"
)

func main() {
	// ---------------------------------------------------------------------------
	// Structured JSON logging via zerolog
	// ---------------------------------------------------------------------------
	zerolog.TimeFieldFormat = zerolog.TimeFormatUnixMs
	if os.Getenv("LOG_PRETTY") == "true" {
		log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stderr, TimeFormat: time.RFC3339})
	}
	log.Info().Msg("IMS — Incident Management System starting")

	// ---------------------------------------------------------------------------
	// Root context — cancelled on SIGINT/SIGTERM for graceful shutdown
	// ---------------------------------------------------------------------------
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// ---------------------------------------------------------------------------
	// Store initialisation (Postgres + MongoDB + Redis)
	// ---------------------------------------------------------------------------
	storeCfg := store.ConfigFromEnv()
	stores, err := store.InitAll(ctx, storeCfg)
	if err != nil {
		log.Fatal().Err(err).Msg("failed to initialise stores")
	}
	defer stores.Close(context.Background())

	// ---------------------------------------------------------------------------
	// Run DB migrations
	// ---------------------------------------------------------------------------
	if err := runMigrations(ctx, stores); err != nil {
		log.Fatal().Err(err).Msg("failed to run migrations")
	}

	// ---------------------------------------------------------------------------
	// Signal queue (bounded channel — backpressure boundary)
	// ---------------------------------------------------------------------------
	queueCapacity := envInt("QUEUE_CAPACITY", 50_000)
	signalQueue := queue.New(queueCapacity)
	log.Info().Int("capacity", queueCapacity).Msg("signal queue initialised")

	// ---------------------------------------------------------------------------
	// Worker pool
	// ---------------------------------------------------------------------------
	workerCount := envInt("WORKER_COUNT", 20)
	pool := worker.New(workerCount, signalQueue, stores)
	pool.Start(ctx)

	// ---------------------------------------------------------------------------
	// Auto-escalation background loop (bonus feature)
	// ---------------------------------------------------------------------------
	escalator := workflow.NewEscalator(stores.Postgres, stores.Redis)
	go escalator.Start(ctx)

	// ---------------------------------------------------------------------------
	// HTTP server
	// ---------------------------------------------------------------------------
	app := api.SetupRoutes(stores, signalQueue, pool)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	// Start server in a goroutine so we can listen for shutdown
	serverErr := make(chan error, 1)
	go func() {
		log.Info().Str("port", port).Msg("HTTP server listening")
		if err := app.Listen(":" + port); err != nil {
			serverErr <- err
		}
	}()

	// ---------------------------------------------------------------------------
	// Block until shutdown signal or server error
	// ---------------------------------------------------------------------------
	select {
	case <-ctx.Done():
		log.Info().Msg("shutdown signal received")
	case err := <-serverErr:
		log.Fatal().Err(err).Msg("server error")
	}

	// ---------------------------------------------------------------------------
	// Graceful shutdown — give in-flight requests 10 seconds to complete
	// ---------------------------------------------------------------------------
	log.Info().Msg("shutting down gracefully...")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := app.ShutdownWithContext(shutdownCtx); err != nil {
		log.Error().Err(err).Msg("HTTP server shutdown error")
	}

	// Wait for all workers to drain the queue
	pool.Wait()
	log.Info().Msg("IMS shutdown complete")
}

// runMigrations executes the SQL migration file on startup.
func runMigrations(ctx context.Context, stores *store.Stores) error {
	log.Info().Msg("running database migrations...")
	migration, err := os.ReadFile("/app/migrations/001_init_schema.sql")
	if err != nil {
		// Try relative path for local dev
		migration, err = os.ReadFile("migrations/001_init_schema.sql")
		if err != nil {
			return err
		}
	}
	_, err = stores.Postgres.Pool().Exec(ctx, string(migration))
	if err != nil {
		// Migration may already be applied — log and continue
		log.Warn().Err(err).Msg("migration exec warning (may already be applied)")
	}
	log.Info().Msg("migrations complete")
	return nil
}

func envInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		var i int
		if _, err := parseIntFast(v, &i); err == nil {
			return i
		}
	}
	return fallback
}

func parseIntFast(s string, out *int) (int, error) {
	n := 0
	for _, c := range s {
		if c < '0' || c > '9' {
			return 0, &parseError{s}
		}
		n = n*10 + int(c-'0')
	}
	*out = n
	return n, nil
}

type parseError struct{ s string }

func (e *parseError) Error() string { return "invalid integer: " + e.s }
