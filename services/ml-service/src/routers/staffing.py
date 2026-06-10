from fastapi import APIRouter, HTTPException
from ..models.staffing_demand import (
    StaffingDemandModel,
    StaffingFeatures,
    StaffingPrediction,
)

router = APIRouter(prefix='/v1/predict', tags=['staffing'])
_model = StaffingDemandModel()


@router.post('/staffing-demand', response_model=StaffingPrediction)
async def predict_staffing(features: StaffingFeatures) -> StaffingPrediction:
    try:
        return _model.predict(features)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
