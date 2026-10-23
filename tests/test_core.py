from uuid import uuid4

import httpx
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from miu.app import create_app
from miu.config import Settings
from miu.memory import Memory
from miu.providers import Provider, ProviderError

TOKEN = 'x' * 40
AUTH = {'Authorization': f'Bearer {TOKEN}'}


class Fake:
    def __init__(self):
        self.calls = []
        self.fail = False

    async def complete(self, messages, route):
        self.calls.append((messages, route))
        if self.fail:
            raise ProviderError('secret-key-do-not-expose')
        return 'Hola, soy Miu'


@pytest.fixture
def setup(tmp_path):
    s = Settings(_env_file=None, api_token=TOKEN, db_path=tmp_path / 'memory.db')
    fake = Fake()
    with TestClient(create_app(s, fake)) as client:
        yield client, fake, s


def test_auth_validation_and_health(setup):
    c, fake, _ = setup
    assert c.get('/health').status_code == 200
    assert c.post('/v1/chat', json={}).status_code == 401
    assert c.post('/v1/chat', headers=AUTH, json={
        'session_id': str(uuid4()), 'message': '   '}).status_code == 422
    assert not fake.calls


def test_memory_isolation_restart_delete(setup):
    c, fake, s = setup
    session, other = str(uuid4()), str(uuid4())
    for text in ['Hola', '¿Recuerdas?']:
        assert c.post('/v1/chat', headers=AUTH, json={
            'session_id': session, 'message': text}).status_code == 200
    assert fake.calls[1][0][1]['content'] == 'Hola'
    assert len(Memory(s.db_path).history(session, 20)) == 4
    assert c.get(f'/v1/sessions/{other}', headers=AUTH).json()['messages'] == []
    assert c.delete(f'/v1/sessions/{session}', headers=AUTH).status_code == 204
    assert Memory(s.db_path).history(session, 20) == []


def test_cloud_consent_and_failure_atomicity(setup):
    c, fake, _ = setup
    session = str(uuid4())
    body = {'session_id': session, 'message': 'Hola', 'provider': 'cloud'}
    assert c.post('/v1/chat', headers=AUTH, json=body).status_code == 403
    assert not fake.calls
    body['allow_cloud'] = True
    assert c.post('/v1/chat', headers=AUTH, json=body).status_code == 200
    assert fake.calls[-1][1] == 'cloud'
    fake.fail = True
    result = c.post('/v1/chat', headers=AUTH, json=body)
    assert result.status_code == 503
    assert 'secret-key' not in result.text
    assert len(c.get(f'/v1/sessions/{session}', headers=AUTH).json()['messages']) == 2


def test_missing_token_refuses_start(tmp_path):
    s = Settings(_env_file=None, api_token='', db_path=tmp_path / 'unused.db')
    with pytest.raises(RuntimeError), TestClient(create_app(s)):
        pass


@pytest.mark.parametrize('url', ['https://evil.test', 'http://localhost@evil.test',
                               'http://127.0.0.1/path', 'http://localhost?secret=yes'])
def test_ollama_endpoint_restricted(url):
    with pytest.raises(ValidationError):
        Settings(_env_file=None, ollama_url=url)


def test_ollama_adapter(monkeypatch):
    import asyncio
    original = httpx.AsyncClient
    def handler(request):
        assert request.url.path == '/api/chat'
        assert b'"stream":false' in request.content
        return httpx.Response(200, json={'message': {'content': 'local answer'}})
    monkeypatch.setattr(httpx, 'AsyncClient', lambda **kw: original(
        **kw, transport=httpx.MockTransport(handler)))
    s = Settings(_env_file=None)
    assert asyncio.run(Provider(s).complete([{'role': 'user', 'content': 'hi'}], 'ollama')) == 'local answer'


def test_cloud_adapter_without_real_key(monkeypatch):
    import asyncio
    import sys
    from types import SimpleNamespace
    calls = []
    async def complete(**kwargs):
        calls.append(kwargs)
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content='cloud'))])
    monkeypatch.setitem(sys.modules, 'litellm', SimpleNamespace(acompletion=complete))
    s = Settings(_env_file=None, cloud_api_key='test-only')
    assert asyncio.run(Provider(s).complete([], 'cloud')) == 'cloud'
    assert calls[0]['api_key'] == 'test-only'


def test_sql_values_are_not_executable(tmp_path):
    m = Memory(tmp_path / 'db.sqlite')
    text = "'); DROP TABLE messages;--"
    m.save_turn('session', text, 'ok')
    assert m.history('session', 2)[0]['content'] == text


def test_web_assets_and_security_headers(setup):
    c, _, _ = setup
    page = c.get('/')
    assert page.status_code == 200
    assert 'Conversa con Miu' in page.text
    assert "script-src 'self'" in page.headers['content-security-policy']
    assert page.headers['cache-control'] == 'no-store'
    assert c.get('/static/app.js').status_code == 200
    assert c.get('/static/voice.js').status_code == 200
    assert c.get('/static/style.css').status_code == 200
    assert c.get('/static/../config.py').status_code == 404


def test_session_list_and_public_settings(setup):
    c, _, _ = setup
    assert c.get('/v1/sessions').status_code == 401
    assert c.get('/v1/settings').status_code == 401
    assert c.get('/v1/sessions', headers=AUTH).json() == {'sessions': []}
    config = c.get('/v1/settings', headers=AUTH)
    assert config.status_code == 200
    assert set(config.json()) == {'local_model', 'cloud_model', 'cloud_available', 'history_messages'}
    assert TOKEN not in config.text
    first, second = str(uuid4()), str(uuid4())
    for session, text in [(first, '<script>alert(1)</script>'), (second, 'Otra charla')]:
        c.post('/v1/chat', headers=AUTH, json={'session_id': session, 'message': text})
    items = c.get('/v1/sessions', headers=AUTH).json()['sessions']
    assert [s['id'] for s in items] == [second, first]
    c.delete(f'/v1/sessions/{second}', headers=AUTH)
    assert len(c.get('/v1/sessions', headers=AUTH).json()['sessions']) == 1
