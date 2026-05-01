# ============================================================
# Stage 1 — Build
# ============================================================
FROM golang:1.22-alpine AS builder

RUN apk add --no-cache git ca-certificates tzdata

WORKDIR /build

# Cache dependencies first
COPY go.mod go.sum ./
RUN go mod download

# Copy source
COPY . .

# Build binary — static, no CGO
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -ldflags="-w -s -X main.version=$(git describe --tags --always 2>/dev/null || echo dev)" \
    -o ims-server ./cmd/server

# ============================================================
# Stage 2 — Runtime (minimal scratch-based image)
# ============================================================
FROM alpine:3.19

RUN apk add --no-cache ca-certificates tzdata curl

WORKDIR /app

# Copy binary and migrations
COPY --from=builder /build/ims-server .
COPY --from=builder /build/migrations ./migrations

# Non-root user
RUN addgroup -S ims && adduser -S ims -G ims
USER ims

EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1

ENTRYPOINT ["./ims-server"]
