import asyncio
import secrets
from contextlib import asynccontextmanager
from importlib.util import find_spec
from pathlib import Path
from typing import Annotated, Literal
from uuid import UUID

from fastapi import Depends, FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator

from miu.config import Settings
from miu.memory import Memory
from miu.providers import Provider, ProviderError


class ChatRequest(BaseModel):
    session_id: UUID
    message: str = Field(min_length=1, max_length=8000)
    provider: Literal["ollama", "cloud"] | None = None
    allow_cloud: bool = False

    @field_validator("message")
    @classmethod
    def nonblank(cls, value):
        if not value.strip():
            raise ValueError("Message cannot be blank")
        return value


class ChatResponse(BaseModel):
    session_id: UUID
    reply: str
    provider: str


def create_app(settings: Settings | None = None, provider=None):
    s = settings or Settings()
    backend = provider or Provider(s)
    # Bounded locks serialize each session, including deletion, without an unbounded registry.
    locks = [asyncio.Lock() for _ in range(64)]

    @asynccontextmanager
    async def lifespan(app):
        if len(s.api_token.get_secret_value()) < 32:
            raise RuntimeError("Set MIU_API_TOKEN to a random token of at least 32 characters")
        app.state.memory = Memory(s.db_path)
        yield

    app = FastAPI(title="Miu-JARVIS", version="0.1.0", lifespan=lifespan)
    bearer = HTTPBearer(auto_error=False)

    @app.middleware("http")
    async def browser_headers(request, call_next):
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        if request.url.path == "/" or request.url.path.startswith("/static/"):
            response.headers["Content-Security-Policy"] = (
                "default-src 'self'; script-src 'self'; style-src 'self'; "
                "connect-src 'self'; img-src 'self'; object-src 'none'; "
                "base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
            )
        return response

    web = Path(__file__).parent / "web"
    app.mount("/static", StaticFiles(directory=web), name="static")

    @app.get("/", include_in_schema=False)
    def index():
        return FileResponse(web / "index.html")

    def authorize(credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]):
        if credentials is None or not secrets.compare_digest(
                credentials.credentials.encode(), s.api_token.get_secret_value().encode()):
            raise HTTPException(401, "Invalid bearer token", headers={"WWW-Authenticate": "Bearer"})

    @app.get("/health")
    def health():
        return {"status": "ok", "version": "0.1.0"}

    @app.get("/v1/settings", dependencies=[Depends(authorize)])
    def public_settings():
        return {"local_model": s.local_model, "cloud_model": s.cloud_model,
                "cloud_available": bool(s.cloud_api_key.get_secret_value())
                and find_spec("litellm") is not None,
                "history_messages": s.history_messages}

    @app.get("/v1/sessions", dependencies=[Depends(authorize)])
    def sessions():
        return {"sessions": app.state.memory.sessions()}

    @app.post("/v1/chat", response_model=ChatResponse, dependencies=[Depends(authorize)])
    async def chat(request: ChatRequest):
        route = request.provider or s.provider
        if route == "cloud" and not request.allow_cloud:
            raise HTTPException(403, "Cloud requires allow_cloud=true; history will leave this device")
        session = str(request.session_id)
        async with locks[request.session_id.int % len(locks)]:
            history = app.state.memory.history(session, s.history_messages)
            messages = [{"role": "system", "content": "Eres Miu, un asistente útil y honesto."}]
            messages.extend(history)
            messages.append({"role": "user", "content": request.message})
            try:
                reply = await backend.complete(messages, route)
            except ProviderError:
                raise HTTPException(503, "Modelo no disponible; revisa configuración y servicio") from None
            app.state.memory.save_turn(session, request.message, reply)
        return ChatResponse(session_id=request.session_id, reply=reply, provider=route)

    @app.get("/v1/sessions/{session_id}", dependencies=[Depends(authorize)])
    def history(session_id: UUID):
        return {"messages": app.state.memory.history(str(session_id), s.history_messages)}

    @app.delete("/v1/sessions/{session_id}", status_code=204, dependencies=[Depends(authorize)])
    async def delete(session_id: UUID):
        async with locks[session_id.int % len(locks)]:
            app.state.memory.delete(str(session_id))

    return app
