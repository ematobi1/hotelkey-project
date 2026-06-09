from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', env_ignore_empty=True)

    host: str = '0.0.0.0'
    port: int = 8001
    log_level: str = 'info'
    mlflow_uri: str = 'http://localhost:5000'
    feast_repo_path: str = './feast_repo'
    model_dir: str = './models'
    otel_endpoint: str = 'http://localhost:4318/v1/traces'
    shadow_mode: bool = False


settings = Settings()
