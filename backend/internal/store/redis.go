package store

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog/log"
	"github.com/shrinidhi972004/ims/internal/models"
)

const (
	dashboardKey      = "ims:dashboard:state"
	debounceKeyPrefix = "ims:debounce:"
	dashboardTTL      = 3 * time.Second
	debounceTTL       = 15 * time.Second // slightly longer than 10s window
)

// RedisStore handles the hot-path cache for the dashboard and debounce tracking.
type RedisStore struct {
	client *redis.Client
}

// NewRedisStore connects to Redis with retry logic.
func NewRedisStore(ctx context.Context, addr, password string, db int) (*RedisStore, error) {
	client := redis.NewClient(&redis.Options{
		Addr:         addr,
		Password:     password,
		DB:           db,
		PoolSize:     20,
		MinIdleConns: 5,
		DialTimeout:  5 * time.Second,
		ReadTimeout:  3 * time.Second,
		WriteTimeout: 3 * time.Second,
	})

	for attempt := 1; attempt <= 5; attempt++ {
		if err := client.Ping(ctx).Err(); err == nil {
			log.Info().Str("component", "redis").Msg("connected successfully")
			return &RedisStore{client: client}, nil
		}
		wait := time.Duration(math.Pow(2, float64(attempt))) * time.Second
		log.Warn().
			Str("component", "redis").
			Int("attempt", attempt).
			Dur("retry_in", wait).
			Msg("connection failed, retrying")
		time.Sleep(wait)
	}
	return nil, fmt.Errorf("redis: failed to connect after 5 attempts")
}

// Close shuts down the Redis client.
func (s *RedisStore) Close() error {
	return s.client.Close()
}

// ---------------------------------------------------------------------------
// Dashboard state cache
// ---------------------------------------------------------------------------

// SetDashboardState serialises and caches the dashboard state.
func (s *RedisStore) SetDashboardState(ctx context.Context, state *models.DashboardState) error {
	data, err := json.Marshal(state)
	if err != nil {
		return fmt.Errorf("redis: marshal dashboard state: %w", err)
	}
	return s.client.Set(ctx, dashboardKey, data, dashboardTTL).Err()
}

// GetDashboardState retrieves the cached dashboard state.
// Returns nil, nil if the key has expired (cache miss).
func (s *RedisStore) GetDashboardState(ctx context.Context) (*models.DashboardState, error) {
	data, err := s.client.Get(ctx, dashboardKey).Bytes()
	if err == redis.Nil {
		return nil, nil // cache miss — caller should rebuild from Postgres
	}
	if err != nil {
		return nil, fmt.Errorf("redis: get dashboard state: %w", err)
	}
	var state models.DashboardState
	if err := json.Unmarshal(data, &state); err != nil {
		return nil, fmt.Errorf("redis: unmarshal dashboard state: %w", err)
	}
	return &state, nil
}

// InvalidateDashboard removes the cached state, forcing a rebuild on next request.
func (s *RedisStore) InvalidateDashboard(ctx context.Context) error {
	return s.client.Del(ctx, dashboardKey).Err()
}

// ---------------------------------------------------------------------------
// Debounce tracking
// Stores componentID → workItemID for the 10-second debounce window.
// ---------------------------------------------------------------------------

// SetDebounceEntry stores a componentID → workItemID mapping with TTL.
// Called when the first signal for a component creates a new WorkItem.
func (s *RedisStore) SetDebounceEntry(ctx context.Context, componentID, workItemID string) error {
	key := debounceKeyPrefix + componentID
	return s.client.Set(ctx, key, workItemID, debounceTTL).Err()
}

// GetDebounceEntry returns the active WorkItemID for a componentID, or "" if none.
func (s *RedisStore) GetDebounceEntry(ctx context.Context, componentID string) (string, error) {
	key := debounceKeyPrefix + componentID
	val, err := s.client.Get(ctx, key).Result()
	if err == redis.Nil {
		return "", nil // no active debounce window
	}
	if err != nil {
		return "", fmt.Errorf("redis: get debounce entry: %w", err)
	}
	return val, nil
}

// ---------------------------------------------------------------------------
// Throughput counter — atomic increments for signals/sec calculation
// ---------------------------------------------------------------------------

// IncrementSignalCounter atomically increments the signal counter for the current second.
func (s *RedisStore) IncrementSignalCounter(ctx context.Context) error {
	key := fmt.Sprintf("ims:throughput:%d", time.Now().Unix())
	pipe := s.client.Pipeline()
	pipe.Incr(ctx, key)
	pipe.Expire(ctx, key, 10*time.Second) // keep 10 seconds of buckets
	_, err := pipe.Exec(ctx)
	return err
}

// GetSignalsPerSecond computes the average signals/sec over the last 5 seconds.
func (s *RedisStore) GetSignalsPerSecond(ctx context.Context) (float64, error) {
	now := time.Now().Unix()
	keys := make([]string, 5)
	for i := range keys {
		keys[i] = fmt.Sprintf("ims:throughput:%d", now-int64(i))
	}
	vals, err := s.client.MGet(ctx, keys...).Result()
	if err != nil {
		return 0, err
	}
	var total float64
	var buckets float64
	for _, v := range vals {
		if v != nil {
			var count float64
			if _, err := fmt.Sscanf(fmt.Sprintf("%v", v), "%f", &count); err == nil {
				total += count
				buckets++
			}
		}
	}
	if buckets == 0 {
		return 0, nil
	}
	return total / buckets, nil
}

// Ping checks Redis connectivity.
func (s *RedisStore) Ping(ctx context.Context) error {
	return s.client.Ping(ctx).Err()
}
