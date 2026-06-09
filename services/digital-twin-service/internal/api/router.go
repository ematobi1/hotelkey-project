package api

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/gorilla/mux"
	"github.com/hotel-key/digital-twin/internal/simulation"
	"github.com/hotel-key/digital-twin/internal/state"
	"github.com/rs/zerolog/log"
)

func NewRouter(store *state.TwinStore) http.Handler {
	r := mux.NewRouter()
	h := &handler{store: store}
	r.HandleFunc("/health", h.health).Methods("GET")
	r.HandleFunc("/v1/twin/{tenantId}/state", h.getState).Methods("GET")
	r.HandleFunc("/v1/twin/{tenantId}/rooms", h.getRooms).Methods("GET")
	r.HandleFunc("/v1/twin/{tenantId}/reservations", h.getReservations).Methods("GET")
	r.HandleFunc("/v1/twin/{tenantId}/occupancy", h.getOccupancy).Methods("GET")
	r.HandleFunc("/v1/scenarios/simulate", h.simulate).Methods("POST")
	return r
}

type handler struct{ store *state.TwinStore }

func (h *handler) health(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]string{"status": "ok", "service": "digital-twin-service"})
}

func (h *handler) getState(w http.ResponseWriter, r *http.Request) {
	tenantID := mux.Vars(r)["tenantId"]
	snap := h.store.GetSnapshot(tenantID)
	if snap == nil {
		writeJSON(w, 404, map[string]string{"error": "no twin state for tenant"})
		return
	}
	writeJSON(w, 200, map[string]interface{}{
		"tenantId":     tenantID,
		"rooms":        len(snap.Rooms),
		"reservations": len(snap.Reservations),
		"staff":        len(snap.Staff),
		"hkTasks":      len(snap.HkTasks),
	})
}

func (h *handler) getRooms(w http.ResponseWriter, r *http.Request) {
	tenantID := mux.Vars(r)["tenantId"]
	snap := h.store.GetSnapshot(tenantID)
	if snap == nil {
		writeJSON(w, 200, map[string]interface{}{"data": []interface{}{}, "meta": map[string]int{"total": 0}})
		return
	}
	rooms := make([]*state.Room, 0, len(snap.Rooms))
	for _, rm := range snap.Rooms {
		rooms = append(rooms, rm)
	}
	writeJSON(w, 200, map[string]interface{}{"data": rooms, "meta": map[string]int{"total": len(rooms)}})
}

func (h *handler) getReservations(w http.ResponseWriter, r *http.Request) {
	tenantID := mux.Vars(r)["tenantId"]
	snap := h.store.GetSnapshot(tenantID)
	if snap == nil {
		writeJSON(w, 200, map[string]interface{}{"data": []interface{}{}, "meta": map[string]int{"total": 0}})
		return
	}
	reservations := make([]*state.Reservation, 0, len(snap.Reservations))
	for _, res := range snap.Reservations {
		reservations = append(reservations, res)
	}
	writeJSON(w, 200, map[string]interface{}{"data": reservations, "meta": map[string]int{"total": len(reservations)}})
}

func (h *handler) getOccupancy(w http.ResponseWriter, r *http.Request) {
	tenantID := mux.Vars(r)["tenantId"]
	snap := h.store.GetSnapshot(tenantID)
	if snap == nil {
		writeJSON(w, 200, map[string]interface{}{
			"tenant_id":      tenantID,
			"total_rooms":    0,
			"occupied_rooms": 0,
			"occupancy_rate": 0.0,
			"as_of":          time.Now().UTC().Format(time.RFC3339),
		})
		return
	}
	occupied := 0
	for _, rm := range snap.Rooms {
		if rm.Status == state.RoomStatusOccupied {
			occupied++
		}
	}
	total := len(snap.Rooms)
	if total < 1 {
		total = 1
	}
	writeJSON(w, 200, map[string]interface{}{
		"tenant_id":      tenantID,
		"total_rooms":    len(snap.Rooms),
		"occupied_rooms": occupied,
		"occupancy_rate": float64(occupied) / float64(total),
		"as_of":          time.Now().UTC().Format(time.RFC3339),
	})
}

func (h *handler) simulate(w http.ResponseWriter, r *http.Request) {
	var params simulation.ScenarioParams
	if err := json.NewDecoder(r.Body).Decode(&params); err != nil {
		writeJSON(w, 400, map[string]string{"error": "invalid request body"})
		return
	}
	if params.TenantID == "" {
		writeJSON(w, 400, map[string]string{"error": "tenantId required"})
		return
	}
	if params.HorizonHours <= 0 {
		params.HorizonHours = 24
	}

	snap := h.store.GetSnapshot(params.TenantID)
	result := simulation.Simulate(snap, params)

	if result.ElapsedMs > 2000 {
		log.Warn().Int64("elapsed_ms", result.ElapsedMs).Msg("simulation SLO breach")
	}

	writeJSON(w, 200, map[string]interface{}{"data": result})
}

func writeJSON(w http.ResponseWriter, status int, body interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(body); err != nil {
		log.Error().Err(err).Msg("failed to encode response")
	}
}
