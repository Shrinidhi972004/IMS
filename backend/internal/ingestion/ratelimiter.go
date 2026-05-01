package ingestion

import (
	"sync"
	"time"
)

// tokenBucket implements a per-key token bucket rate limiter.
// Each unique key (IP address) gets its own bucket.
// Tokens refill at a constant rate up to the burst capacity.
type tokenBucket struct {
	tokens     float64
	capacity   float64
	refillRate float64 // tokens per second
	lastRefill time.Time
	mu         sync.Mutex
}

func newTokenBucket(capacity float64, refillRate float64) *tokenBucket {
	return &tokenBucket{
		tokens:     capacity,
		capacity:   capacity,
		refillRate: refillRate,
		lastRefill: time.Now(),
	}
}

// allow attempts to consume one token. Returns true if the request is allowed.
func (b *tokenBucket) allow() bool {
	b.mu.Lock()
	defer b.mu.Unlock()

	now := time.Now()
	elapsed := now.Sub(b.lastRefill).Seconds()
	b.tokens = min(b.capacity, b.tokens+elapsed*b.refillRate)
	b.lastRefill = now

	if b.tokens >= 1 {
		b.tokens--
		return true
	}
	return false
}

// remaining returns how many tokens are left (approximate, no lock).
func (b *tokenBucket) remaining() int {
	return int(b.tokens)
}

// RateLimiter manages per-key token buckets with periodic cleanup of stale keys.
type RateLimiter struct {
	buckets    map[string]*tokenBucket
	mu         sync.RWMutex
	capacity   float64
	refillRate float64
}

// NewRateLimiter creates a RateLimiter.
// capacity  = max burst (tokens)
// ratePerSec = sustained requests/second per key
func NewRateLimiter(capacity float64, ratePerSec float64) *RateLimiter {
	rl := &RateLimiter{
		buckets:    make(map[string]*tokenBucket),
		capacity:   capacity,
		refillRate: ratePerSec,
	}
	go rl.cleanup()
	return rl
}

// Allow checks whether the given key is within rate limits.
// Also returns remaining tokens and the reset duration for response headers.
func (rl *RateLimiter) Allow(key string) (allowed bool, remaining int, resetIn time.Duration) {
	rl.mu.RLock()
	bucket, exists := rl.buckets[key]
	rl.mu.RUnlock()

	if !exists {
		rl.mu.Lock()
		// double-check after acquiring write lock
		bucket, exists = rl.buckets[key]
		if !exists {
			bucket = newTokenBucket(rl.capacity, rl.refillRate)
			rl.buckets[key] = bucket
		}
		rl.mu.Unlock()
	}

	allowed = bucket.allow()
	remaining = bucket.remaining()
	// approximate time until one token is available
	resetIn = time.Duration(float64(time.Second) / rl.refillRate)
	return
}

// cleanup runs every 5 minutes and removes buckets that haven't been used
// for more than 10 minutes, preventing unbounded memory growth.
func (rl *RateLimiter) cleanup() {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		cutoff := time.Now().Add(-10 * time.Minute)
		rl.mu.Lock()
		for key, bucket := range rl.buckets {
			bucket.mu.Lock()
			stale := bucket.lastRefill.Before(cutoff)
			bucket.mu.Unlock()
			if stale {
				delete(rl.buckets, key)
			}
		}
		rl.mu.Unlock()
	}
}

func min(a, b float64) float64 {
	if a < b {
		return a
	}
	return b
}
