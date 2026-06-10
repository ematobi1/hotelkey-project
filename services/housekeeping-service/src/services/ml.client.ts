import { createLogger } from '@hotel-key/logger'
import { config } from '../config'

const logger = createLogger({ service: 'housekeeping-service' })

export interface WorkloadPrediction {
  predictedMinutesPerRoom: number
  shap_values: Record<string, number>
  modelVersion: string
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms))
}

function backoff(attempt: number) {
  return Math.min(100 * 2 ** attempt + Math.random() * 50, 30_000)
}

export async function predictWorkload(features: {
  tenantId: string
  hourOfDay: number
  dayOfWeek: number
  occupancyRate: number
  checkoutsToday: number
  avgTaskDuration7d: number
  tasksInProgress: number
  staffOnDuty: number
}): Promise<WorkloadPrediction | null> {
  for (let attempt = 0; attempt <= 3; attempt++) {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 10_000)
    try {
      const res = await fetch(
        `${config.ML_SERVICE_URL}/v1/predict/housekeeping-workload`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tenant_id: features.tenantId,
            hour_of_day: features.hourOfDay,
            day_of_week: features.dayOfWeek,
            occupancy_rate: features.occupancyRate,
            checkouts_today: features.checkoutsToday,
            avg_task_duration_7d: features.avgTaskDuration7d,
            tasks_in_progress: features.tasksInProgress,
            staff_on_duty: features.staffOnDuty,
          }),
          signal: ctrl.signal,
        },
      )
      clearTimeout(t)
      if (!res.ok) {
        if (res.status < 500) return null
        if (attempt < 3) {
          await sleep(backoff(attempt))
          continue
        }
        return null
      }
      const data = (await res.json()) as {
        predicted_minutes_per_room: number
        shap_values: Record<string, number>
        model_version: string
      }
      return {
        predictedMinutesPerRoom: data.predicted_minutes_per_room,
        shap_values: data.shap_values,
        modelVersion: data.model_version,
      }
    } catch {
      clearTimeout(t)
      if (attempt < 3) {
        await sleep(backoff(attempt))
        continue
      }
      logger.warn('ML service unreachable, using fallback')
      return null
    }
  }
  return null
}
