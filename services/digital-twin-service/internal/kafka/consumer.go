package kafka

import (
	"context"
	"encoding/json"

	"github.com/IBM/sarama"
	"github.com/hotel-key/digital-twin/internal/state"
	"github.com/rs/zerolog/log"
)

var topics = []string{
	"hotel-key.reservation",
	"hotel-key.billing",
	"hotel-key.housekeeping",
	"hotel-key.maintenance",
	"hotel-key.guest",
	"hotel-key.auth",
}

type CloudEvent struct {
	Type     string          `json:"type"`
	TenantID string          `json:"tenantid"`
	Data     json.RawMessage `json:"data"`
}

type Consumer struct {
	cg    sarama.ConsumerGroup
	store *state.TwinStore
}

func NewConsumer(brokers []string, store *state.TwinStore) (*Consumer, error) {
	cfg := sarama.NewConfig()
	cfg.Consumer.Group.Rebalance.Strategy = sarama.BalanceStrategyRoundRobin
	cfg.Consumer.Offsets.Initial = sarama.OffsetNewest
	cg, err := sarama.NewConsumerGroup(brokers, "digital-twin-consumer", cfg)
	if err != nil {
		return nil, err
	}
	return &Consumer{cg: cg, store: store}, nil
}

func (c *Consumer) Run(ctx context.Context) {
	handler := &consumerGroupHandler{store: c.store}
	for {
		select {
		case <-ctx.Done():
			return
		default:
			if err := c.cg.Consume(ctx, topics, handler); err != nil {
				log.Error().Err(err).Msg("kafka consumer error")
			}
		}
	}
}

type consumerGroupHandler struct{ store *state.TwinStore }

func (h *consumerGroupHandler) Setup(sarama.ConsumerGroupSession) error   { return nil }
func (h *consumerGroupHandler) Cleanup(sarama.ConsumerGroupSession) error { return nil }

func (h *consumerGroupHandler) ConsumeClaim(session sarama.ConsumerGroupSession, claim sarama.ConsumerGroupClaim) error {
	for msg := range claim.Messages() {
		var event CloudEvent
		if err := json.Unmarshal(msg.Value, &event); err != nil {
			log.Warn().Err(err).Msg("failed to unmarshal event")
			session.MarkMessage(msg, "")
			continue
		}
		h.applyEvent(event)
		session.MarkMessage(msg, "")
	}
	return nil
}

func (h *consumerGroupHandler) applyEvent(event CloudEvent) {
	switch event.Type {
	case "hotel-key.reservation.created":
		var d struct {
			ReservationID string  `json:"reservationId"`
			GuestID       string  `json:"guestId"`
			RoomID        string  `json:"roomId"`
			CheckInDate   string  `json:"checkInDate"`
			CheckOutDate  string  `json:"checkOutDate"`
			TotalAmount   float64 `json:"totalAmount"`
		}
		if err := json.Unmarshal(event.Data, &d); err != nil {
			return
		}
		h.store.ApplyReservationCreated(event.TenantID, d.ReservationID, d.GuestID, d.RoomID, d.CheckInDate, d.CheckOutDate, d.TotalAmount)

	case "hotel-key.reservation.checked_in":
		var d struct {
			ReservationID string `json:"reservationId"`
			GuestID       string `json:"guestId"`
			RoomID        string `json:"roomId"`
		}
		if err := json.Unmarshal(event.Data, &d); err != nil {
			return
		}
		h.store.ApplyCheckedIn(event.TenantID, d.ReservationID, d.GuestID, d.RoomID)

	case "hotel-key.reservation.checked_out":
		var d struct {
			ReservationID string `json:"reservationId"`
			RoomID        string `json:"roomId"`
		}
		if err := json.Unmarshal(event.Data, &d); err != nil {
			return
		}
		h.store.ApplyCheckedOut(event.TenantID, d.ReservationID, d.RoomID)

	case "hotel-key.room.status_changed":
		var d struct {
			RoomID    string `json:"roomId"`
			NewStatus string `json:"newStatus"`
		}
		if err := json.Unmarshal(event.Data, &d); err != nil {
			return
		}
		h.store.ApplyRoomStatusChanged(event.TenantID, d.RoomID, d.NewStatus)

	default:
		log.Debug().Str("type", event.Type).Msg("unhandled event type")
	}
}
