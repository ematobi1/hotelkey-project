package simulation_test

import (
	"fmt"
	"testing"
	"time"

	"github.com/hotel-key/digital-twin/internal/simulation"
	"github.com/hotel-key/digital-twin/internal/state"
)

func makeSnapshot(numRooms, numOccupied, numReservations int) *state.Snapshot {
	snap := &state.Snapshot{
		TenantID:     "tenant-001",
		Rooms:        make(map[string]*state.Room, numRooms),
		Reservations: make(map[string]*state.Reservation, numReservations),
		Staff:        make(map[string]*state.Staff),
		HkTasks:      make(map[string]*state.HousekeepingTask),
	}
	for i := 0; i < numRooms; i++ {
		id := fmt.Sprintf("room-%04d", i)
		status := state.RoomStatusAvailable
		if i < numOccupied {
			status = state.RoomStatusOccupied
		}
		snap.Rooms[id] = &state.Room{ID: id, Status: status}
	}
	baseTime := time.Now()
	for i := 0; i < numReservations; i++ {
		id := fmt.Sprintf("res-%04d", i)
		snap.Reservations[id] = &state.Reservation{
			ID:           id,
			Status:       state.ReservationConfirmed,
			RoomID:       fmt.Sprintf("room-%04d", i%numRooms),
			CheckInDate:  baseTime.Add(time.Duration(i%12) * time.Hour),
			CheckOutDate: baseTime.Add(time.Duration(i%12+1) * time.Hour),
		}
	}
	return snap
}

func TestSimulate_300RoomsUnder2Seconds(t *testing.T) {
	snap := makeSnapshot(300, 180, 100)
	params := simulation.ScenarioParams{
		TenantID:     "tenant-001",
		HorizonHours: 24,
		StartTime:    time.Now(),
	}
	result := simulation.Simulate(snap, params)
	if result.ElapsedMs >= 2000 {
		t.Errorf("SLO breach: simulation took %dms (limit 2000ms)", result.ElapsedMs)
	}
	if result.RoomsSimulated != 300 {
		t.Errorf("expected 300 rooms, got %d", result.RoomsSimulated)
	}
}

func TestSimulate_OverbookingWarning(t *testing.T) {
	snap := makeSnapshot(10, 9, 5)
	params := simulation.ScenarioParams{
		TenantID:         "tenant-001",
		HorizonHours:     24,
		OverbookingPct:   10,
		GroupBookingSize: 5,
	}
	result := simulation.Simulate(snap, params)
	found := false
	for _, w := range result.Warnings {
		if len(w) > 0 {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected warnings for overbooking scenario")
	}
}

func TestSimulate_GroupBookingImpact(t *testing.T) {
	snap := makeSnapshot(50, 20, 0)
	base := simulation.Simulate(snap, simulation.ScenarioParams{
		TenantID:     "tenant-001",
		HorizonHours: 24,
	})
	withGroup := simulation.Simulate(snap, simulation.ScenarioParams{
		TenantID:         "tenant-001",
		HorizonHours:     24,
		GroupBookingSize: 10,
	})
	if withGroup.ExpectedCheckIns <= base.ExpectedCheckIns {
		t.Error("group booking should increase expected check-ins")
	}
}

func TestSimulate_NilSnapshot(t *testing.T) {
	result := simulation.Simulate(nil, simulation.ScenarioParams{TenantID: "unknown"})
	if len(result.Warnings) == 0 {
		t.Error("should return warning for nil snapshot")
	}
}
