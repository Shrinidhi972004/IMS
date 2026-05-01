package api

import (
	"os"
	"time"

	"github.com/gofiber/contrib/jwt"
	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/shrinidhi972004/ims/internal/models"
	"golang.org/x/crypto/bcrypt"
)

// hardcoded demo users — in production this would be a DB table
// passwords are bcrypt hashed: admin/admin123, viewer/viewer123
var demoUsers = map[string]string{
	"admin":  "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy", // admin123
	"viewer": "$2a$10$Ei7JCFpkHGfHMcIHALkOeOtZT.GGLkPiB4/dInxjSikvzs7jOXqXi", // viewer123
}

func jwtSecret() []byte {
	s := os.Getenv("JWT_SECRET")
	if s == "" {
		s = "ims-super-secret-change-in-production"
	}
	return []byte(s)
}

// JWTMiddleware protects routes — returns 401 on missing/invalid token.
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

// Login handles POST /api/v1/auth/login
// Returns a signed JWT valid for 24 hours.
func Login(c *fiber.Ctx) error {
	var req models.LoginRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(models.ErrorResponse{
			Error: "invalid request body",
		})
	}

	hashedPassword, ok := demoUsers[req.Username]
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(models.ErrorResponse{
			Error: models.ErrInvalidCredentials.Error(),
		})
	}

	if err := bcrypt.CompareHashAndPassword([]byte(hashedPassword), []byte(req.Password)); err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(models.ErrorResponse{
			Error: models.ErrInvalidCredentials.Error(),
		})
	}

	claims := jwt.MapClaims{
		"sub":  req.Username,
		"role": "operator",
		"exp":  time.Now().Add(24 * time.Hour).Unix(),
		"iat":  time.Now().Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString(jwtSecret())
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(models.ErrorResponse{
			Error: "failed to generate token",
		})
	}

	return c.JSON(models.LoginResponse{Token: signed})
}
