from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', env_ignore_empty=True)

    host: str = '0.0.0.0'
    port: int = 8002
    log_level: str = 'info'
    database_url: str = 'postgresql://hotelkey:hotelkey_dev@localhost:5432/hotel_key_pricing'
    mlflow_uri: str = 'http://localhost:5000'
    room_service_url: str = 'http://localhost:3004'
    reservation_service_url: str = 'http://localhost:3003'
    billing_service_url: str = 'http://localhost:3005'
    predicthq_api_key: str = ''
    google_travel_insights_key: str = ''
    signal_poll_interval_seconds: int = 1800  # 30 min
    revpar_drop_threshold: float = 0.15  # 15% — trigger circuit breaker
    max_daily_rate_delta_pct: float = 0.25  # ±25% max daily change
    retraining_lookback_days: int = 90


settings = Settings()
