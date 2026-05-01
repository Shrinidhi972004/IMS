package queue

import (
	"sync/atomic"

	"github.com/rs/zerolog/log"
	"github.com/shrinidhi972004/ims/internal/models"
)

const (
	DefaultCapacity = 50_000
	warnThreshold   = 0.80 // log warning when buffer is 80% full
)

// SignalQueue is a bounded in-memory channel buffer.
// It is the backpressure boundary between the HTTP ingestion layer
// and the persistence worker pool. If the channel is full, the
// ingestion handler returns 429 — the system never blocks or crashes
// due to a slow persistence layer.
type SignalQueue struct {
	ch       chan *models.Signal
	capacity int64
	dropped  atomic.Int64
	enqueued atomic.Int64
}

// New creates a SignalQueue with the given capacity.
func New(capacity int) *SignalQueue {
	if capacity <= 0 {
		capacity = DefaultCapacity
	}
	return &SignalQueue{
		ch:       make(chan *models.Signal, capacity),
		capacity: int64(capacity),
	}
}

// TryEnqueue attempts a non-blocking push onto the channel.
// Returns true if the signal was accepted, false if the queue is full.
func (q *SignalQueue) TryEnqueue(signal *models.Signal) bool {
	select {
	case q.ch <- signal:
		q.enqueued.Add(1)
		q.logIfPressured()
		return true
	default:
		q.dropped.Add(1)
		log.Warn().
			Str("component", "queue").
			Str("signal_id", signal.ID).
			Str("component_id", signal.ComponentID).
			Int64("queue_len", int64(len(q.ch))).
			Int64("capacity", q.capacity).
			Int64("total_dropped", q.dropped.Load()).
			Msg("queue full — signal dropped, returning 429 to caller")
		return false
	}
}

// Consume returns the read-only channel for worker goroutines to consume from.
func (q *SignalQueue) Consume() <-chan *models.Signal {
	return q.ch
}

// Len returns the current number of signals waiting in the queue.
func (q *SignalQueue) Len() int {
	return len(q.ch)
}

// Cap returns the total capacity of the queue.
func (q *SignalQueue) Cap() int {
	return int(q.capacity)
}

// DroppedCount returns total signals dropped due to backpressure.
func (q *SignalQueue) DroppedCount() int64 {
	return q.dropped.Load()
}

// EnqueuedCount returns total signals successfully enqueued.
func (q *SignalQueue) EnqueuedCount() int64 {
	return q.enqueued.Load()
}

// FillRatio returns the current queue fill ratio (0.0 to 1.0).
func (q *SignalQueue) FillRatio() float64 {
	return float64(len(q.ch)) / float64(q.capacity)
}

// logIfPressured emits a structured warning when the buffer exceeds 80% capacity.
func (q *SignalQueue) logIfPressured() {
	ratio := q.FillRatio()
	if ratio >= warnThreshold {
		log.Warn().
			Str("component", "queue").
			Float64("fill_ratio", ratio).
			Int("queue_len", len(q.ch)).
			Int64("capacity", q.capacity).
			Msg("queue pressure high — consider scaling workers")
	}
}
