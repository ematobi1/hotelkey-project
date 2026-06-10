from fastapi import APIRouter, HTTPException
from ..models.maintenance_failure import (
    MaintenanceFailureModel,
    MaintenanceFeatures,
    MaintenancePrediction,
)

router = APIRouter(prefix='/v1/predict', tags=['maintenance'])
_model = MaintenanceFailureModel()


@router.post('/maintenance-failure', response_model=MaintenancePrediction)
async def predict_failure(features: MaintenanceFeatures) -> MaintenancePrediction:
    try:
        return _model.predict(features)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
