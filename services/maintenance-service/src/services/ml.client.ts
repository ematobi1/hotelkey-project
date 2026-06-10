import { createLogger } from '@hotel-key/logger'
import { config } from '../config'

const logger = createLogger({ service: 'maintenance-service' })

export interface FailurePrediction {
  failureProbability: number
  willFailWithin7Days: boolean
  riskLevel: string
  topRiskFactors: Array<{ feature: string; contribution: number }>
  recommendedAction: string
  modelVersion: string
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms))
}

function backoff(attempt: number) {
  return Math.min(100 * 2 ** attempt + Math.random() * 50, 30_000)
}

export async function predictFailure(features: {
  roomId: string
  tenantId: string
  equipmentType: string
  daysSinceLastMaintenance: number
  failureCount90d: number
  equipmentAgeDays: number
  emergencyCount30d: number
  lastFailureSeverity: number
}): Promise<FailurePrediction | null> {
  for (let attempt = 0; attempt <= 3; attempt++) {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 10_000)
    try {
      const res = await fetch(
        `${config.ML_SERVICE_URL}/v1/predict/maintenance-failure`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            room_id: features.roomId,
            tenant_id: features.tenantId,
            equipment_type: features.equipmentType,
            days_since_last_maintenance: features.daysSinceLastMaintenance,
            failure_count_90d: features.failureCount90d,
            equipment_age_days: features.equipmentAgeDays,
            emergency_count_30d: features.emergencyCount30d,
            last_failure_severity: features.lastFailureSeverity,
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
        failure_probability: number
        will_fail_within_7_days: boolean
        risk_level: string
        top_risk_factors: Array<{ feature: string; contribution: number }>
        recommended_action: string
        model_version: string
      }
      return {
        failureProbability: data.failure_probability,
        willFailWithin7Days: data.will_fail_within_7_days,
        riskLevel: data.risk_level,
        topRiskFactors: data.top_risk_factors,
        recommendedAction: data.recommended_action,
        modelVersion: data.model_version,
      }
    } catch {
      clearTimeout(t)
      if (attempt < 3) {
        await sleep(backoff(attempt))
        continue
      }
      logger.warn('ML service unreachable for failure prediction')
      return null
    }
  }
  return null
}
