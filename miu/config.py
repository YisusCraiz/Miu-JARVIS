from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="MIU_", env_file=".env", extra="ignore")
    api_token: SecretStr = SecretStr("")
    provider: Literal["ollama", "cloud"] = "ollama"
    ollama_url: str = "http://127.0.0.1:11434"
    local_model: str = "qwen2.5:3b"
    cloud_model: str = "openai/gpt-4o-mini"
    cloud_api_key: SecretStr = SecretStr("")
    db_path: Path = Path("data/miu.sqlite3")
    history_messages: int = Field(default=20, ge=2, le=100)
    timeout_seconds: float = Field(default=60, gt=0, le=300)

    @field_validator("ollama_url")
    @classmethod
    def local_endpoint(cls, value: str) -> str:
        url = urlsplit(value)
        if (url.scheme != "http" or url.hostname not in {"localhost", "127.0.0.1", "::1"}
                or url.username or url.password or url.query or url.fragment
                or url.path not in {"", "/"}):
            raise ValueError("Ollama must use a loopback HTTP URL")
        return value.rstrip("/")
