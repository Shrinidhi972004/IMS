package api

import (
	"os"
	"sync"
	"time"

	jwtware "github.com/gofiber/contrib/jwt"
	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/shrinidhi972004/ims/internal/models"
	"golang.org/x/crypto/bcrypt"
)

// ---------------------------------------------------------------------------
// In-memory user store — signup/login without a DB dependency
// ---------------------------------------------------------------------------

type user struct {
	ID           string
	Username     string
	PasswordHash string
	CreatedAt    time.Time
}

type userStore struct {
	mu    sync.RWMutex
	users map[string]*user // keyed by username
}

var users = &userStore{
	users: map[string]*user{},
}

func (s *userStore) create(username, password string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, exists := s.users[username]; exists {
		return fiber.NewError(fiber.StatusConflict, "username already taken")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), 10)
	if err != nil {
		return err
	}
	s.users[username] = &user{
		ID:           uuid.New().String(),
		Username:     username,
		PasswordHash: string(hash),
		CreatedAt:    time.Now().UTC(),
	}
	return nil
}

func (s *userStore) verify(username, password string) (*user, error) {
	s.mu.RLock()
	u, exists := s.users[username]
	s.mu.RUnlock()
	if !exists {
		return nil, models.ErrInvalidCredentials
	}
	if err := bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(password)); err != nil {
		return nil, models.ErrInvalidCredentials
	}
	return u, nil
}

// ---------------------------------------------------------------------------
// JWT helpers
// ---------------------------------------------------------------------------

func jwtSecret() []byte {
	s := os.Getenv("JWT_SECRET")
	if s == "" {
		s = "ims-super-secret-change-in-production"
	}
	return []byte(s)
}

func makeToken(username string) (string, error) {
	claims := jwt.MapClaims{
		"sub": username,
		"exp": time.Now().Add(24 * time.Hour).Unix(),
		"iat": time.Now().Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(jwtSecret())
}

// JWTMiddleware protects routes.
func JWTMiddleware() fiber.Handler {
	return jwtware.New(jwtware.Config{
		SigningKey: jwtware.SigningKey{Key: jwtSecret()},
		ErrorHandler: func(c *fiber.Ctx, err error) error {
			return c.Status(fiber.StatusUnauthorized).JSON(models.ErrorResponse{
				Error: models.ErrUnauthorized.Error(),
			})
		},
	})
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

// SignupRequest is the body for POST /api/v1/auth/signup
type SignupRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

// Signup handles POST /api/v1/auth/signup
func Signup(c *fiber.Ctx) error {
	var req SignupRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(models.ErrorResponse{Error: "invalid request body"})
	}
	if len(req.Username) < 3 {
		return c.Status(fiber.StatusBadRequest).JSON(models.ErrorResponse{Error: "username must be at least 3 characters"})
	}
	if len(req.Password) < 6 {
		return c.Status(fiber.StatusBadRequest).JSON(models.ErrorResponse{Error: "password must be at least 6 characters"})
	}
	if err := users.create(req.Username, req.Password); err != nil {
		return c.Status(fiber.StatusConflict).JSON(models.ErrorResponse{Error: err.Error()})
	}
	token, err := makeToken(req.Username)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(models.ErrorResponse{Error: "failed to generate token"})
	}
	return c.Status(fiber.StatusCreated).JSON(models.LoginResponse{Token: token})
}

// Login handles POST /api/v1/auth/login
func Login(c *fiber.Ctx) error {
	var req models.LoginRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(models.ErrorResponse{Error: "invalid request body"})
	}
	u, err := users.verify(req.Username, req.Password)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(models.ErrorResponse{Error: models.ErrInvalidCredentials.Error()})
	}
	token, err := makeToken(u.Username)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(models.ErrorResponse{Error: "failed to generate token"})
	}
	return c.JSON(models.LoginResponse{Token: token})
}
