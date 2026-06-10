import type { Logger } from '@hotel-key/logger'
import type { MaintenanceService } from '../services/maintenance.service'
import type { WorkOrderCategory, WorkOrderPriority } from '../domain/errors'
import { predictFailure } from '../services/ml.client'

const SYSTEM_REPORTER_ID = '00000000-0000-0000-0000-000000000001'

function probabilityToPriority(prob: number): WorkOrderPriority {
  return prob >= 0.6 ? 'urgent' : 'high'
}

function buildDescription(
  topRiskFactors: Array<{ feature: string; contribution: number }>,
  recommendedAction: string,
): string {
  const factors = topRiskFactors
    .map((f) => `${f.feature} (impact: ${f.contribution.toFixed(3)})`)
    .join(', ')
  return `Risk factors: ${factors}. ${recommendedAction}`
}

export async function runFailurePredictionJob(
  maintenanceService: MaintenanceService,
  logger: Logger,
): Promise<void> {
  logger.info('Starting failure prediction job')

  let rooms
  try {
    rooms = await maintenanceService.listRoomsForPrediction()
  } catch (err) {
    logger.error({ err }, 'Failed to query rooms for failure prediction')
    return
  }

  logger.info({ roomCount: rooms.length }, 'Rooms fetched for prediction')

  let proactiveOrdersCreated = 0

  for (const room of rooms) {
    if (room.hasOpenOrder) {
      continue
    }

    const prediction = await predictFailure({
      roomId: room.roomId,
      tenantId: room.tenantId,
      equipmentType: room.equipmentType,
      daysSinceLastMaintenance: room.daysSinceLastMaintenance,
      failureCount90d: room.failureCount90d,
      equipmentAgeDays: 365,
      emergencyCount30d: room.emergencyCount30d,
      lastFailureSeverity: room.lastFailureSeverity,
    })

    if (!prediction) {
      continue
    }

    if (!prediction.willFailWithin7Days) {
      continue
    }

    try {
      await maintenanceService.createWorkOrder({
        tenantId: room.tenantId,
        roomId: room.roomId,
        title: `Proactive maintenance: ${room.equipmentType} (P(failure)=${prediction.failureProbability.toFixed(2)})`,
        description: buildDescription(prediction.topRiskFactors, prediction.recommendedAction),
        category: room.equipmentType as WorkOrderCategory,
        priority: probabilityToPriority(prediction.failureProbability),
        reportedBy: SYSTEM_REPORTER_ID,
      })
      proactiveOrdersCreated++
      logger.info(
        {
          roomId: room.roomId,
          tenantId: room.tenantId,
          equipmentType: room.equipmentType,
          probability: prediction.failureProbability,
          riskLevel: prediction.riskLevel,
        },
        'Proactive work order created',
      )
    } catch (err) {
      logger.error(
        { err, roomId: room.roomId, tenantId: room.tenantId },
        'Failed to create proactive work order',
      )
    }
  }

  logger.info(
    { proactiveOrdersCreated, roomsEvaluated: rooms.length },
    'Failure prediction job completed',
  )
}
