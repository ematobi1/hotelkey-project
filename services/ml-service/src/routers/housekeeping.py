from fastapi import APIRouter, HTTPException
from ..models.housekeeping_workload import (
    HousekeepingWorkloadModel,
    HousekeepingFeatures,
    HousekeepingPrediction,
)

router = APIRouter(prefix='/v1/predict', tags=['housekeeping'])
_model = HousekeepingWorkloadModel()


@router.post('/housekeeping-workload', response_model=HousekeepingPrediction)
async def predict_workload(features: HousekeepingFeatures) -> HousekeepingPrediction:
    try:
        return _model.predict(features)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
