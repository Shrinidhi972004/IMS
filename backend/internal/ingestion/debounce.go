package ingestion

import (
	"context"
	"sync"

	"github.com/rs/zerolog/log"
	"github.com/shrinidhi972004/ims/internal/models"
	"github.com/shrinidhi972004/ims/internal/store"
)

// debounceEntry tracks the active WorkItem for a component within the 10s window.
type debounceEntry struct {
	workItemID string
}

// Debouncer implements the 10-second debounce window per component_id.
//
// Design:
//   - sync.Map provides lock-free reads for the hot path (most signals will hit
//     an existing entry).
//   - Redis is the durable backing store so debounce state survives a restart.
//   - On startup, the in-memory map is cold; Redis is checked on every miss,
//     so the window is consistent across restarts within the TTL.
type Debouncer struct {
	local sync.Map // componentID -> *debounceEntry (in-process fast path)
	redis *store.RedisStore
}

// NewDebouncer creates a Debouncer backed by Redis.
func NewDebouncer(redis *store.RedisStore) *Debouncer {
	return &Debouncer{redis: redis}
}

// Resolve determines whether a signal should create a new WorkItem or be
// linked to an existing one within the debounce window.
//
// Returns:
//
//	workItemID — the ID of the active or newly created WorkItem
//	isNew      — true if a new WorkItem was created, false if debounced
func (d *Debouncer) Resolve(ctx context.Context, signal *models.Signal, newWorkItemFn func() (*models.WorkItem, error)) (workItemID string, isNew bool, err error) {
	componentID := signal.ComponentID

	// 1. Fast path: check in-process map first (no network hop)
	if v, ok := d.local.Load(componentID); ok {
		entry := v.(*debounceEntry)
		log.Debug().
			Str("component_id", componentID).
			Str("work_item_id", entry.workItemID).
			Msg("debounce: hit local cache")
		return entry.workItemID, false, nil
	}

	// 2. Slow path: check Redis (handles restarts / multi-instance)
	existingID, err := d.redis.GetDebounceEntry(ctx, componentID)
	if err != nil {
		log.Warn().Err(err).Str("component_id", componentID).
			Msg("debounce: redis lookup failed, will create new work item")
		// fall through and create a new work item — degraded but safe
	}

	if existingID != "" {
		// Store in local map to avoid Redis round trips for subsequent signals
		d.local.Store(componentID, &debounceEntry{workItemID: existingID})
		log.Debug().
			Str("component_id", componentID).
			Str("work_item_id", existingID).
			Msg("debounce: hit redis cache")
		return existingID, false, nil
	}

	// 3. No active window — create a new WorkItem
	wi, err := newWorkItemFn()
	if err != nil {
		return "", false, err
	}

	// Register in both Redis (durable, 15s TTL) and local map
	if redisErr := d.redis.SetDebounceEntry(ctx, componentID, wi.ID); redisErr != nil {
		log.Warn().Err(redisErr).Str("component_id", componentID).
			Msg("debounce: failed to set redis entry, window only in local map")
	}
	d.local.Store(componentID, &debounceEntry{workItemID: wi.ID})

	log.Info().
		Str("component_id", componentID).
		Str("work_item_id", wi.ID).
		Str("severity", string(signal.Severity)).
		Msg("debounce: new work item created")

	return wi.ID, true, nil
}

// Expire removes a componentID from the local in-process map.
// Called by the worker when the Redis TTL has passed (window expired).
// The next signal for this component will create a new WorkItem.
func (d *Debouncer) Expire(componentID string) {
	d.local.Delete(componentID)
}
