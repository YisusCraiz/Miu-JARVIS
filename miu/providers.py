import httpx

from miu.config import Settings


class ProviderError(Exception):
    pass


class Provider:
    def __init__(self, settings: Settings):
        self.settings = settings

    async def complete(self, messages: list[dict[str, str]], route: str) -> str:
        s = self.settings
        try:
            if route == "ollama":
                async with httpx.AsyncClient(timeout=s.timeout_seconds, trust_env=False) as client:
                    result = await client.post(f"{s.ollama_url}/api/chat", json={
                        "model": s.local_model, "messages": messages, "stream": False,
                    })
                    result.raise_for_status()
                    answer = result.json()["message"]["content"]
            else:
                if not s.cloud_api_key.get_secret_value():
                    raise ProviderError("Cloud API key missing")
                import litellm

                litellm.telemetry = False
                result = await litellm.acompletion(
                    model=s.cloud_model, messages=messages,
                    api_key=s.cloud_api_key.get_secret_value(),
                    timeout=s.timeout_seconds, num_retries=0,
                )
                answer = result.choices[0].message.content
            if not isinstance(answer, str) or not answer.strip():
                raise ProviderError("Empty model response")
            return answer
        except Exception as exc:
            # Never expose provider exceptions: they can contain credentials or user messages.
            raise ProviderError("Model unavailable; check configuration and service") from exc
