FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN go mod tidy && go build -o digital-twin-service ./cmd/server/

FROM alpine:3.19
RUN apk --no-cache add ca-certificates
WORKDIR /app
COPY --from=builder /app/digital-twin-service .
EXPOSE 4000
CMD ["./digital-twin-service"]
