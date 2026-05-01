package api

import (
	"encoding/json"
	"sync"
	"time"

	"github.com/gofiber/websocket/v2"
	"github.com/rs/zerolog/log"
)

// WSMessage is the envelope sent to all WebSocket clients.
type WSMessage struct {
	Type      string      `json:"type"`       // "incident_update" | "dashboard_update" | "ping"
	Payload   interface{} `json:"payload"`
	Timestamp time.Time   `json:"timestamp"`
}

// Hub manages all active WebSocket connections and broadcasts updates.
type Hub struct {
	clients   map[*websocket.Conn]bool
	broadcast chan *WSMessage
	register  chan *websocket.Conn
	unregister chan *websocket.Conn
	mu        sync.RWMutex
}

// NewHub creates and starts a WebSocket Hub.
func NewHub() *Hub {
	h := &Hub{
		clients:    make(map[*websocket.Conn]bool),
		broadcast:  make(chan *WSMessage, 256),
		register:   make(chan *websocket.Conn, 32),
		unregister: make(chan *websocket.Conn, 32),
	}
	go h.run()
	go h.heartbeat()
	return h
}

// run is the Hub's main event loop — single goroutine manages all client state
// so no locks are needed for the map itself.
func (h *Hub) run() {
	for {
		select {
		case conn := <-h.register:
			h.mu.Lock()
			h.clients[conn] = true
			h.mu.Unlock()
			log.Info().
				Str("component", "websocket").
				Int("total_clients", len(h.clients)).
				Msg("client connected")

		case conn := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[conn]; ok {
				delete(h.clients, conn)
				conn.Close()
			}
			h.mu.Unlock()
			log.Info().
				Str("component", "websocket").
				Int("total_clients", len(h.clients)).
				Msg("client disconnected")

		case msg := <-h.broadcast:
			data, err := json.Marshal(msg)
			if err != nil {
				log.Error().Err(err).Msg("websocket: failed to marshal broadcast message")
				continue
			}
			h.mu.RLock()
			for conn := range h.clients {
				if err := conn.WriteMessage(websocket.TextMessage, data); err != nil {
					log.Warn().Err(err).Msg("websocket: write failed, queuing disconnect")
					// Queue disconnect — don't modify map while iterating
					go func(c *websocket.Conn) { h.unregister <- c }(conn)
				}
			}
			h.mu.RUnlock()
		}
	}
}

// heartbeat sends a ping every 30 seconds to keep connections alive
// and detect stale clients.
func (h *Hub) heartbeat() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for range ticker.C {
		h.Broadcast("ping", map[string]string{"status": "ok"})
	}
}

// Broadcast sends a typed message to all connected clients.
func (h *Hub) Broadcast(msgType string, payload interface{}) {
	msg := &WSMessage{
		Type:      msgType,
		Payload:   payload,
		Timestamp: time.Now().UTC(),
	}
	select {
	case h.broadcast <- msg:
	default:
		log.Warn().Str("component", "websocket").Msg("broadcast channel full, dropping message")
	}
}

// ClientCount returns the number of currently connected WebSocket clients.
func (h *Hub) ClientCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients)
}

// HandleWS is the Fiber WebSocket upgrade handler.
// GET /ws/incidents  (requires JWT token as query param ?token=...)
func (h *Hub) HandleWS(c *websocket.Conn) {
	h.register <- c

	defer func() {
		h.unregister <- c
	}()

	// Keep reading to detect client disconnect (ping/pong frames)
	for {
		_, _, err := c.ReadMessage()
		if err != nil {
			break
		}
	}
}
