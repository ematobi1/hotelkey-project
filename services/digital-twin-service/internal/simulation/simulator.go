package simulation

import (
	"sort"
	"time"

	"github.com/hotel-key/digital-twin/internal/state"
)

type EventType string

const (
	EventCheckIn     EventType = "check_in"
	EventCheckOut    EventType = "check_out"
	EventCleanStart  EventType = "clean_start"
	EventCleanEnd    EventType = "clean_end"
	EventMaintenance EventType = "maintenance"
)

type SimEvent struct {
	Time    time.Time
	Type    EventType
	RoomID  string
	GuestID string
	StaffID string
}

type ScenarioParams struct {
	TenantID         string
	StartTime        time.Time
	HorizonHours     int
	GroupBookingSize int
	RateChangePct    float64
	StaffingChange   int
	OverbookingPct   float64
}

type SimResult struct {
	TenantID              string   `json:"tenantId"`
	SimulatedHours        int      `json:"simulatedHours"`
	RoomsSimulated        int      `json:"roomsSimulated"`
	PeakOccupancy         float64  `json:"peakOccupancy"`
	AverageOccupancy      float64  `json:"averageOccupancy"`
	ExpectedRevenue       float64  `json:"expectedRevenue"`
	ExpectedCheckIns      int      `json:"expectedCheckIns"`
	ExpectedCheckOuts     int      `json:"expectedCheckOuts"`
	HousekeepingTasks     int      `json:"housekeepingTasks"`
	StaffingAdequacy      string   `json:"staffingAdequacy"`
	// Energy modelling: kWh consumed over the simulation horizon
	EnergyKwh             float64  `json:"energyKwh"`
	EnergyKwhPerRoom      float64  `json:"energyKwhPerRoom"`
	CarbonKgCo2e          float64  `json:"carbonKgCo2e"`
	Warnings              []string `json:"warnings"`
	ElapsedMs             int64    `json:"elapsedMs"`
}

// Simulate runs a discrete-event simulation on a deep-copied snapshot.
// Live state is never modified. SLO: < 2000ms for 300 rooms over 24 hours.
func Simulate(snap *state.Snapshot, params ScenarioParams) *SimResult {
	if snap == nil {
		return &SimResult{
			TenantID: params.TenantID,
			Warnings: []string{"no twin data for this tenant"},
		}
	}

	start := time.Now()

	horizon := params.HorizonHours
	if horizon <= 0 {
		horizon = 24
	}
	simStart := params.StartTime
	if simStart.IsZero() {
		simStart = time.Now()
	}
	simEnd := simStart.Add(time.Duration(horizon) * time.Hour)

	events := make([]SimEvent, 0, len(snap.Reservations)*2+params.GroupBookingSize)

	for _, res := range snap.Reservations {
		if res.Status == state.ReservationConfirmed || res.Status == state.ReservationCheckedIn {
			if res.CheckInDate.After(simStart) && res.CheckInDate.Before(simEnd) {
				events = append(events, SimEvent{
					Time:    res.CheckInDate,
					Type:    EventCheckIn,
					RoomID:  res.RoomID,
					GuestID: res.GuestID,
				})
			}
			if res.CheckOutDate.After(simStart) && res.CheckOutDate.Before(simEnd) {
				events = append(events, SimEvent{
					Time:   res.CheckOutDate,
					Type:   EventCheckOut,
					RoomID: res.RoomID,
				})
			}
		}
	}

	for i := 0; i < params.GroupBookingSize; i++ {
		events = append(events, SimEvent{
			Time:   simStart.Add(time.Duration(i) * time.Hour),
			Type:   EventCheckIn,
			RoomID: "scenario-room",
		})
	}

	sort.Slice(events, func(i, j int) bool {
		return events[i].Time.Before(events[j].Time)
	})

	occupiedCount := 0
	for _, room := range snap.Rooms {
		if room.Status == state.RoomStatusOccupied {
			occupiedCount++
		}
	}

	totalRooms := len(snap.Rooms)
	if totalRooms < 1 {
		totalRooms = 1
	}

	occupancySamples := make([]float64, 0, horizon)
	checkIns, checkOuts, hkTasks := 0, 0, 0
	revenue := 0.0

	currentHour := simStart
	eventIdx := 0

	for i := 0; i < horizon; i++ {
		nextHour := currentHour.Add(time.Hour)
		for eventIdx < len(events) && events[eventIdx].Time.Before(nextHour) {
			e := events[eventIdx]
			switch e.Type {
			case EventCheckIn:
				occupiedCount++
				checkIns++
				revenue += 150.0 * (1 + params.RateChangePct/100)
			case EventCheckOut:
				if occupiedCount > 0 {
					occupiedCount--
				}
				checkOuts++
				hkTasks++
			}
			eventIdx++
		}
		occ := float64(occupiedCount) / float64(totalRooms)
		occupancySamples = append(occupancySamples, occ)
		currentHour = nextHour
	}

	peak, sum := 0.0, 0.0
	for _, s := range occupancySamples {
		sum += s
		if s > peak {
			peak = s
		}
	}
	sampleCount := len(occupancySamples)
	if sampleCount < 1 {
		sampleCount = 1
	}
	avg := sum / float64(sampleCount)

	staffOnDuty := len(snap.Staff) + params.StaffingChange
	staffingAdequacy := "adequate"
	if staffOnDuty > checkIns*3 && checkIns > 0 {
		staffingAdequacy = "overstaffed"
	}

	warnings := make([]string, 0)
	if checkIns > 0 && staffOnDuty < checkIns/3 {
		staffingAdequacy = "strained"
		warnings = append(warnings, "insufficient staff for projected check-in volume")
	}
	if params.OverbookingPct > 0 && peak > 0.95 {
		warnings = append(warnings, "overbooking risk: projected occupancy exceeds 95%")
	}
	if peak > 1.0 {
		warnings = append(warnings, "capacity exceeded — overbooking scenario")
		peak = 1.0
	}

	// Energy modelling: base load 0.4 kWh/room/hr + 1.2 kWh/occupied-room/hr (HVAC+lighting)
	// Carbon factor: 0.233 kg CO2e per kWh (UK grid average; configurable in production)
	const baseKwhPerRoomPerHour = 0.4
	const occupiedKwhPerRoomPerHour = 1.2
	const carbonFactorKgPerKwh = 0.233
	totalKwh := 0.0
	for _, occ := range occupancySamples {
		occupiedRooms := occ * float64(totalRooms)
		totalKwh += float64(totalRooms)*baseKwhPerRoomPerHour + occupiedRooms*occupiedKwhPerRoomPerHour
	}
	kwhPerRoom := totalKwh / float64(totalRooms)
	carbonKg := totalKwh * carbonFactorKgPerKwh

	return &SimResult{
		TenantID:          params.TenantID,
		SimulatedHours:    horizon,
		RoomsSimulated:    totalRooms,
		PeakOccupancy:     peak,
		AverageOccupancy:  avg,
		ExpectedRevenue:   revenue,
		ExpectedCheckIns:  checkIns,
		ExpectedCheckOuts: checkOuts,
		HousekeepingTasks: hkTasks,
		StaffingAdequacy:  staffingAdequacy,
		EnergyKwh:         totalKwh,
		EnergyKwhPerRoom:  kwhPerRoom,
		CarbonKgCo2e:      carbonKg,
		Warnings:          warnings,
		ElapsedMs:         time.Since(start).Milliseconds(),
	}
}
