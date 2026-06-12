package main

import (
	"context"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/hotel-key/digital-twin/internal/api"
	"github.com/hotel-key/digital-twin/internal/config"
	"github.com/hotel-key/digital-twin/internal/kafka"
	"github.com/hotel-key/digital-twin/internal/state"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
)

func main() {
	zerolog.TimeFieldFormat = zerolog.TimeFormatUnix
	log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stderr})

	cfg := config.Load()

	store := state.NewTwinStore()

	ctx, cancel := context.WithCancel(context.Background())

	consumer, err := kafka.NewConsumer(cfg.KafkaBrokers, store)
	if err != nil {
		log.Warn().Err(err).Msg("kafka unavailable — digital-twin consumer disabled")
	} else {
		go consumer.Run(ctx)
	}

	router := api.NewRouter(store)
	srv := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      router,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 30 * time.Second,
	}

	go func() {
		log.Info().Str("port", cfg.Port).Msg("digital-twin-service started")
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal().Err(err).Msg("server error")
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	cancel()
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Error().Err(err).Msg("graceful shutdown failed")
	}
	log.Info().Msg("digital-twin-service stopped")
}
