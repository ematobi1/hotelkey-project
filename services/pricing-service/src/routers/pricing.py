from datetime import date

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..services.circuit_breaker import circuit_breaker
from ..services.pricing import pricing_service

router = APIRouter(prefix='/v1/pricing', tags=['pricing'])


class RecommendationRequest(BaseModel):
    tenant_id: str
    room_type: str
    current_rate: float
    floor_rate: float
    ceiling_rate: float
    target_date: date


class OverrideRequest(BaseModel):
    tenant_id: str
    room_type: str
    rate: float
    floor_rate: float
    ceiling_rate: float


class AutonomyRequest(BaseModel):
    tenant_id: str
    enabled: bool


@router.post('/recommendation')
async def post_recommendation(req: RecommendationRequest):
    result = await pricing_service.get_recommendation(
        req.tenant_id, req.room_type, req.current_rate,
        req.floor_rate, req.ceiling_rate, req.target_date,
    )
    return {'data': result}


@router.get('/recommendation')
async def get_recommendation(tenant_id: str, room_type: str = 'standard', target_date: str | None = None):
    td = date.fromisoformat(target_date) if target_date else date.today()
    result = await pricing_service.get_recommendation(tenant_id, room_type, 150.0, 80.0, 500.0, td)
    return {'data': result}


@router.post('/override')
async def set_override(req: OverrideRequest):
    try:
        pricing_service.set_manual_override(
            req.tenant_id, req.room_type, req.rate, req.floor_rate, req.ceiling_rate,
        )
        return {'data': {'status': 'override_set', 'rate': req.rate}}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete('/override')
async def clear_override(tenant_id: str, room_type: str):
    pricing_service.clear_override(tenant_id, room_type)
    return {'data': {'status': 'override_cleared'}}


@router.post('/autonomy')
async def set_autonomy(req: AutonomyRequest):
    pricing_service.set_autonomy(req.tenant_id, req.enabled)
    return {'data': {'tenant_id': req.tenant_id, 'autonomous': req.enabled}}


@router.get('/autonomy/{tenant_id}')
async def get_autonomy_status(tenant_id: str):
    return {
        'data': {
            'tenant_id': tenant_id,
            'autonomous': pricing_service.is_autonomous(tenant_id),
            'circuit_breaker': circuit_breaker.status(tenant_id),
        }
    }


@router.post('/circuit-breaker/resume')
async def resume_circuit_breaker(tenant_id: str):
    circuit_breaker.resume(tenant_id)
    return {'data': {'status': 'resumed'}}
