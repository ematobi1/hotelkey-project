package state

import (
	"sync"
	"time"
)

// TwinStore is the top-level in-memory store, keyed by tenantID.
type TwinStore struct {
	mu      sync.RWMutex
	tenants map[string]*TenantState
}

func NewTwinStore() *TwinStore {
	return &TwinStore{tenants: make(map[string]*TenantState)}
}

func (s *TwinStore) GetOrCreate(tenantID string) *TenantState {
	s.mu.RLock()
	t := s.tenants[tenantID]
	s.mu.RUnlock()
	if t != nil {
		return t
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if t = s.tenants[tenantID]; t != nil {
		return t
	}
	t = NewTenantState()
	s.tenants[tenantID] = t
	return t
}

func (s *TwinStore) Get(tenantID string) *TenantState {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.tenants[tenantID]
}

func (s *TwinStore) ListTenants() []string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	ids := make([]string, 0, len(s.tenants))
	for id := range s.tenants {
		ids = append(ids, id)
	}
	return ids
}

func (s *TwinStore) ApplyReservationCreated(tenantID, reservationID, guestID, roomID, checkIn, checkOut string, totalAmount float64) {
	t := s.GetOrCreate(tenantID)
	t.mu.Lock()
	defer t.mu.Unlock()
	r := &Reservation{
		ID:          reservationID,
		TenantID:    tenantID,
		GuestID:     guestID,
		RoomID:      roomID,
		Status:      ReservationConfirmed,
		TotalAmount: totalAmount,
		LastUpdated: time.Now(),
	}
	if parsed, err := time.Parse(time.RFC3339, checkIn); err == nil {
		r.CheckInDate = parsed
	}
	if parsed, err := time.Parse(time.RFC3339, checkOut); err == nil {
		r.CheckOutDate = parsed
	}
	t.Reservations[reservationID] = r
}

func (s *TwinStore) ApplyCheckedIn(tenantID, reservationID, guestID, roomID string) {
	t := s.GetOrCreate(tenantID)
	t.mu.Lock()
	defer t.mu.Unlock()
	if r, ok := t.Reservations[reservationID]; ok {
		r.Status = ReservationCheckedIn
		r.LastUpdated = time.Now()
	}
	if room, ok := t.Rooms[roomID]; ok {
		room.Status = RoomStatusOccupied
		room.CurrentGuestID = guestID
		room.CurrentReservationID = reservationID
		room.LastUpdated = time.Now()
	}
}

func (s *TwinStore) ApplyCheckedOut(tenantID, reservationID, roomID string) {
	t := s.GetOrCreate(tenantID)
	t.mu.Lock()
	defer t.mu.Unlock()
	if r, ok := t.Reservations[reservationID]; ok {
		r.Status = ReservationCheckedOut
		r.LastUpdated = time.Now()
	}
	if room, ok := t.Rooms[roomID]; ok {
		room.Status = RoomStatusCheckout
		room.CurrentGuestID = ""
		room.CurrentReservationID = ""
		room.LastUpdated = time.Now()
	}
}

func (s *TwinStore) ApplyRoomStatusChanged(tenantID, roomID, newStatus string) {
	t := s.GetOrCreate(tenantID)
	t.mu.Lock()
	defer t.mu.Unlock()
	if room, ok := t.Rooms[roomID]; ok {
		room.Status = RoomStatus(newStatus)
		room.LastUpdated = time.Now()
	}
}

// GetSnapshot returns a deep-copied, read-only snapshot for simulation isolation.
func (s *TwinStore) GetSnapshot(tenantID string) *Snapshot {
	t := s.Get(tenantID)
	if t == nil {
		return nil
	}
	t.mu.RLock()
	defer t.mu.RUnlock()
	snap := &Snapshot{
		TenantID:     tenantID,
		Rooms:        make(map[string]*Room, len(t.Rooms)),
		Reservations: make(map[string]*Reservation, len(t.Reservations)),
		Staff:        make(map[string]*Staff, len(t.Staff)),
		HkTasks:      make(map[string]*HousekeepingTask, len(t.HkTasks)),
	}
	for k, v := range t.Rooms {
		cp := *v
		snap.Rooms[k] = &cp
	}
	for k, v := range t.Reservations {
		cp := *v
		snap.Reservations[k] = &cp
	}
	for k, v := range t.Staff {
		cp := *v
		snap.Staff[k] = &cp
	}
	for k, v := range t.HkTasks {
		cp := *v
		snap.HkTasks[k] = &cp
	}
	return snap
}

type Snapshot struct {
	TenantID     string
	Rooms        map[string]*Room
	Reservations map[string]*Reservation
	Staff        map[string]*Staff
	HkTasks      map[string]*HousekeepingTask
}
