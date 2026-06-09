package state

import (
	"sync"
	"time"
)

type RoomStatus string

const (
	RoomStatusAvailable   RoomStatus = "available"
	RoomStatusOccupied    RoomStatus = "occupied"
	RoomStatusCleaning    RoomStatus = "cleaning"
	RoomStatusMaintenance RoomStatus = "maintenance"
	RoomStatusCheckout    RoomStatus = "checkout"
)

type Room struct {
	ID                   string
	TenantID             string
	RoomNumber           string
	RoomType             string
	Floor                int
	Status               RoomStatus
	CurrentGuestID       string
	CurrentReservationID string
	LastUpdated          time.Time
}

type ReservationStatus string

const (
	ReservationTentative  ReservationStatus = "tentative"
	ReservationConfirmed  ReservationStatus = "confirmed"
	ReservationCheckedIn  ReservationStatus = "checked_in"
	ReservationCheckedOut ReservationStatus = "checked_out"
	ReservationCancelled  ReservationStatus = "cancelled"
)

type Reservation struct {
	ID           string
	TenantID     string
	GuestID      string
	RoomID       string
	CheckInDate  time.Time
	CheckOutDate time.Time
	Status       ReservationStatus
	Adults       int
	Children     int
	TotalAmount  float64
	LastUpdated  time.Time
}

type Staff struct {
	ID            string
	TenantID      string
	Name          string
	Role          string
	IsOnDuty      bool
	CurrentTaskID string
	LastUpdated   time.Time
}

type HousekeepingTask struct {
	ID          string
	TenantID    string
	RoomID      string
	TaskType    string
	Status      string
	AssignedTo  string
	Priority    int
	CreatedAt   time.Time
	LastUpdated time.Time
}

// TenantState holds all twin data for one hotel.
type TenantState struct {
	mu           sync.RWMutex
	Rooms        map[string]*Room
	Reservations map[string]*Reservation
	Staff        map[string]*Staff
	HkTasks      map[string]*HousekeepingTask
}

func NewTenantState() *TenantState {
	return &TenantState{
		Rooms:        make(map[string]*Room),
		Reservations: make(map[string]*Reservation),
		Staff:        make(map[string]*Staff),
		HkTasks:      make(map[string]*HousekeepingTask),
	}
}
