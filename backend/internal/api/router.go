package api

import (
	"context"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/fiber/v2/middleware/recover"
	"github.com/gofiber/websocket/v2"
	"github.com/shrinidhi972004/ims/internal/ingestion"
	"github.com/shrinidhi972004/ims/internal/queue"
	"github.com/shrinidhi972004/ims/internal/store"
	"github.com/shrinidhi972004/ims/internal/worker"
	"github.com/shrinidhi972004/ims/internal/workflow"
)

// SetupRoutes configures and returns the Fiber app with all routes wired.
func SetupRoutes(
	stores *store.Stores,
	q *queue.SignalQueue,
	pool *worker.Pool,
) *fiber.App {
	app := fiber.New(fiber.Config{
		AppName:      "IMS — Incident Management System",
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
		// Return errors as JSON
		ErrorHandler: func(c *fiber.Ctx, err error) error {
			code := fiber.StatusInternalServerError
			if e, ok := err.(*fiber.Error); ok {
				code = e.Code
			}
			return c.Status(code).JSON(fiber.Map{"error": err.Error()})
		},
	})

	// ---------------------------------------------------------------------------
	// Global middleware
	// ---------------------------------------------------------------------------
	app.Use(recover.New()) // never crash on panic
	app.Use(cors.New(cors.Config{
		AllowOrigins: "*",
		AllowHeaders: "Origin, Content-Type, Accept, Authorization",
		AllowMethods: "GET,POST,PATCH,DELETE,OPTIONS",
	}))
	app.Use(logger.New(logger.Config{
		Format: `{"time":"${time}","method":"${method}","path":"${path}","status":${status},"latency":"${latency}"}` + "\n",
	}))

	// ---------------------------------------------------------------------------
	// Dependencies
	// ---------------------------------------------------------------------------
	machine := workflow.NewMachine(stores.Postgres, stores.Redis)
	hub := NewHub()
	ingestHandler := ingestion.NewHandler(q, stores.Postgres, stores.Redis)
	wiHandler := NewWorkItemHandler(stores, machine)
	healthHandler := NewHealthHandler(stores, q, pool)
	metricsCollector := NewMetricsCollector(stores, q, pool, hub)

	// Start background metrics collector
	go func() {
		ctx := context.Background()
		metricsCollector.Start(ctx)
	}()

	// ---------------------------------------------------------------------------
	// Public routes (no auth)
	// ---------------------------------------------------------------------------
	app.Get("/health", healthHandler.Health)
	app.Get("/metrics", MetricsHandler()) // Prometheus scrape endpoint

	// Auth
	app.Post("/api/v1/auth/signup", Signup)
	app.Post("/api/v1/auth/login", Login)

	// WebSocket upgrade check
	app.Use("/ws", func(c *fiber.Ctx) error {
		if websocket.IsWebSocketUpgrade(c) {
			return c.Next()
		}
		return fiber.ErrUpgradeRequired
	})
	app.Get("/ws/incidents", websocket.New(hub.HandleWS))

	// ---------------------------------------------------------------------------
	// Protected routes (JWT required)
	// ---------------------------------------------------------------------------
	protected := app.Group("/api/v1", JWTMiddleware())

	// Signal ingestion
	protected.Post("/signals", ingestHandler.IngestSignal)
	protected.Post("/signals/batch", ingestHandler.IngestBatch)
	protected.Get("/signals/:work_item_id", wiHandler.GetSignals)

	// Work items
	protected.Get("/workitems", wiHandler.ListWorkItems)
	protected.Get("/workitems/:id", wiHandler.GetWorkItem)
	protected.Patch("/workitems/:id/transition", wiHandler.TransitionWorkItem)

	// RCA
	protected.Post("/workitems/:id/rca", wiHandler.SubmitRCA)
	protected.Get("/workitems/:id/rca", wiHandler.GetRCA)

	// Dashboard
	protected.Get("/dashboard", wiHandler.GetDashboard)

	// Hub reference for broadcasting from workflow transitions
	// Store hub on app locals for access from handlers
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("hub", hub)
		return c.Next()
	})

	return app
}
