package store

import (
	"context"
	"fmt"
	"math"
	"time"

	"github.com/rs/zerolog/log"
	"github.com/shrinidhi972004/ims/internal/models"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

const (
	signalsCollection = "signals"
)

// MongoStore handles raw signal persistence — the audit log / data lake.
type MongoStore struct {
	client *mongo.Client
	db     *mongo.Database
}

// NewMongoStore connects to MongoDB with exponential backoff retry.
func NewMongoStore(ctx context.Context, uri, dbName string) (*MongoStore, error) {
	opts := options.Client().
		ApplyURI(uri).
		SetMaxPoolSize(50).
		SetMinPoolSize(5).
		SetConnectTimeout(10 * time.Second).
		SetServerSelectionTimeout(10 * time.Second)

	var client *mongo.Client
	var err error

	for attempt := 1; attempt <= 5; attempt++ {
		client, err = mongo.Connect(ctx, opts)
		if err == nil {
			if pingErr := client.Ping(ctx, nil); pingErr == nil {
				log.Info().Str("component", "mongodb").Msg("connected successfully")
				store := &MongoStore{
					client: client,
					db:     client.Database(dbName),
				}
				if err := store.ensureIndexes(ctx); err != nil {
					log.Warn().Err(err).Msg("failed to create mongo indexes")
				}
				return store, nil
			}
		}
		wait := time.Duration(math.Pow(2, float64(attempt))) * time.Second
		log.Warn().
			Str("component", "mongodb").
			Int("attempt", attempt).
			Dur("retry_in", wait).
			Msg("connection failed, retrying")
		time.Sleep(wait)
	}
	return nil, fmt.Errorf("mongodb: failed to connect after 5 attempts: %w", err)
}

// Close disconnects the MongoDB client.
func (s *MongoStore) Close(ctx context.Context) error {
	return s.client.Disconnect(ctx)
}

// ensureIndexes creates indexes for efficient querying of the audit log.
func (s *MongoStore) ensureIndexes(ctx context.Context) error {
	col := s.db.Collection(signalsCollection)
	indexes := []mongo.IndexModel{
		{
			Keys:    bson.D{{Key: "component_id", Value: 1}},
			Options: options.Index().SetName("idx_component_id"),
		},
		{
			Keys:    bson.D{{Key: "work_item_id", Value: 1}},
			Options: options.Index().SetName("idx_work_item_id"),
		},
		{
			Keys:    bson.D{{Key: "received_at", Value: -1}},
			Options: options.Index().SetName("idx_received_at"),
		},
		{
			Keys:    bson.D{{Key: "severity", Value: 1}, {Key: "received_at", Value: -1}},
			Options: options.Index().SetName("idx_severity_time"),
		},
	}
	_, err := col.Indexes().CreateMany(ctx, indexes)
	return err
}

// ---------------------------------------------------------------------------
// Signal operations
// ---------------------------------------------------------------------------

// InsertSignal stores a raw signal in MongoDB.
func (s *MongoStore) InsertSignal(ctx context.Context, signal *models.Signal) error {
	return s.withRetry(ctx, "InsertSignal", func(ctx context.Context) error {
		_, err := s.db.Collection(signalsCollection).InsertOne(ctx, signal)
		return err
	})
}

// LinkSignalToWorkItem updates the work_item_id on a signal after debounce resolution.
func (s *MongoStore) LinkSignalToWorkItem(ctx context.Context, signalID, workItemID string) error {
	return s.withRetry(ctx, "LinkSignalToWorkItem", func(ctx context.Context) error {
		_, err := s.db.Collection(signalsCollection).UpdateOne(
			ctx,
			bson.M{"_id": signalID},
			bson.M{"$set": bson.M{"work_item_id": workItemID}},
		)
		return err
	})
}

// GetSignalsByWorkItemID fetches all raw signals linked to a WorkItem.
// Used by the Incident Detail page to show the audit log.
func (s *MongoStore) GetSignalsByWorkItemID(ctx context.Context, workItemID string) ([]*models.Signal, error) {
	opts := options.Find().
		SetSort(bson.D{{Key: "received_at", Value: -1}}).
		SetLimit(500) // cap to 500 for UI rendering

	cursor, err := s.db.Collection(signalsCollection).Find(
		ctx,
		bson.M{"work_item_id": workItemID},
		opts,
	)
	if err != nil {
		return nil, fmt.Errorf("mongodb: GetSignalsByWorkItemID: %w", err)
	}
	defer cursor.Close(ctx)

	var signals []*models.Signal
	if err := cursor.All(ctx, &signals); err != nil {
		return nil, fmt.Errorf("mongodb: decode signals: %w", err)
	}
	return signals, nil
}

// GetRecentSignals fetches the most recent N signals across all components.
func (s *MongoStore) GetRecentSignals(ctx context.Context, limit int64) ([]*models.Signal, error) {
	opts := options.Find().
		SetSort(bson.D{{Key: "received_at", Value: -1}}).
		SetLimit(limit)

	cursor, err := s.db.Collection(signalsCollection).Find(ctx, bson.M{}, opts)
	if err != nil {
		return nil, fmt.Errorf("mongodb: GetRecentSignals: %w", err)
	}
	defer cursor.Close(ctx)

	var signals []*models.Signal
	if err := cursor.All(ctx, &signals); err != nil {
		return nil, err
	}
	return signals, nil
}

// CountSignalsByComponentID returns total signal count for a component.
func (s *MongoStore) CountSignalsByComponentID(ctx context.Context, componentID string) (int64, error) {
	return s.db.Collection(signalsCollection).CountDocuments(
		ctx,
		bson.M{"component_id": componentID},
	)
}

// ---------------------------------------------------------------------------
// Internal retry helper
// ---------------------------------------------------------------------------

func (s *MongoStore) withRetry(ctx context.Context, op string, fn func(context.Context) error) error {
	var err error
	for attempt := 1; attempt <= 3; attempt++ {
		err = fn(ctx)
		if err == nil {
			return nil
		}
		wait := time.Duration(math.Pow(2, float64(attempt))) * 100 * time.Millisecond
		log.Warn().
			Str("component", "mongodb").
			Str("operation", op).
			Int("attempt", attempt).
			Err(err).
			Dur("retry_in", wait).
			Msg("db operation failed, retrying")
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(wait):
		}
	}
	return fmt.Errorf("mongodb: %s failed after 3 attempts: %w", op, err)
}
