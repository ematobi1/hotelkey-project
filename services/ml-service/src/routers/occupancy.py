from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from datetime import date, timedelta
from ..models.occupancy_forecast import (
    OccupancyForecastModel,
    OccupancyFeatures,
    OccupancyPrediction,
)

router = APIRouter(prefix='/v1/predict', tags=['occupancy'])
_model = OccupancyForecastModel()


class OccupancyRangeRequest(BaseModel):
    tenant_id: str
    horizon_days: int = 30
    avg_occupancy_7d: float
    avg_occupancy_30d: float
    booking_pace_7d: float
    avg_lead_time_days: float
    avg_adr_30d: float


@router.post('/occupancy', response_model=OccupancyPrediction)
async def predict_occupancy(req: OccupancyRangeRequest) -> OccupancyPrediction:
    try:
        forecasts = []
        today = date.today()
        for i in range(1, req.horizon_days + 1):
            target = today + timedelta(days=i)
            features = OccupancyFeatures(
                tenant_id=req.tenant_id,
                target_date=str(target),
                days_ahead=i,
                day_of_week=target.weekday(),
                month=target.month,
                avg_occupancy_7d=req.avg_occupancy_7d,
                avg_occupancy_30d=req.avg_occupancy_30d,
                booking_pace_7d=req.booking_pace_7d,
                avg_lead_time_days=req.avg_lead_time_days,
                local_events_flag=0,
                avg_adr_30d=req.avg_adr_30d,
            )
            forecasts.append(_model.predict(features))
        return OccupancyPrediction(
            tenant_id=req.tenant_id,
            forecasts=forecasts,
            mape_estimate=7.5,
            model_version=_model.model_version,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
