# Miu-JARVIS — núcleo y chat web

Núcleo Python/FastAPI para un asistente híbrido Windows/Android. Incluye chat con
Ollama local, adaptador opcional LiteLLM para nube, historial SQLite por sesión,
autenticación, chat web e historial. Todavía no incluye interfaz nativa de escritorio,
APK, voz, avatar ni ejecución de acciones en tu equipo.

## Windows: empezar

Clona este repositorio y selecciona la rama del PR antes de fusionarlo:

```powershell
git clone https://github.com/YisusCraiz/Miu-JARVIS.git
cd Miu-JARVIS
git switch feat/chat-interface
powershell -ExecutionPolicy Bypass -File scripts/install.ps1 -InstallPython -InstallOllama
```

Los dos parámetros de instalación son opcionales si ya tienes Python 3.12 y
Ollama. Se usa winget, que debe estar disponible mediante App Installer de Windows.
Los instaladores pueden solicitar permisos o aceptar términos. Si Python acaba de
instalarse y no se detecta, abre una nueva terminal y repite sin esos parámetros.
También puedes pasar `-PythonExe 'C:\ruta\python.exe'` (Python 3.11–3.13).

El script crea `.venv`, instala dependencias de desarrollo, genera un token aleatorio
en `.env` sin sobrescribir configuraciones existentes y ejecuta pruebas. No descarga
modelos ni configura claves de proveedores. Abre Ollama y ejecuta:

```powershell
ollama pull qwen2.5:3b
powershell -ExecutionPolicy Bypass -File scripts/start.ps1
```

El modelo es un ejemplo pequeño; la velocidad depende de RAM/VRAM/CPU. Revisa la
licencia del modelo elegido antes de redistribuirlo. Cambia `MIU_LOCAL_MODEL` si
usas otro. Abre [Miu](http://127.0.0.1:8000) e introduce el valor de
`MIU_API_TOKEN` de tu `.env`. Podrás crear conversaciones, retomarlas desde la lista,
cambiar local/nube y borrar el historial con confirmación. El token solo vive en
memoria de la página: al recargar debes introducirlo de nuevo; no se guarda en
cookies ni almacenamiento del navegador. Las conversaciones permanecen en SQLite.
La nube se habilita cuando hay clave y SDK en el servidor y pide consentimiento
para cada pregunta. Los modelos se muestran en la interfaz y se cambian en `.env`
reiniciando el servidor; las claves de proveedor no se muestran ni editan en el chat.

La API escucha en `127.0.0.1:8000`; también puedes abrir
[Swagger](http://127.0.0.1:8000/docs), pulsa **Authorize** e introduce el valor de
`MIU_API_TOKEN` de tu `.env`. Usa un UUID nuevo como `session_id`, por ejemplo con
`[guid]::NewGuid().ToString()`.

```json
{"session_id":"ed5a2578-e50c-4daa-a19a-463cda5bd2dd","message":"Hola Miu","provider":"ollama"}
```

`POST /v1/chat` conversa; `GET /v1/sessions/{UUID}` muestra el contexto reciente;
`DELETE /v1/sessions/{UUID}` elimina sus filas; `GET /health` comprueba que la API
está viva (no comprueba Ollama). Una indisponibilidad del modelo devuelve 503 y no
guarda un turno incompleto. Reiniciar conserva el historial.

## Nube opcional

Ejecuta el instalador con `-Cloud`, o `.venv\Scripts\python -m pip install -e '.[cloud]'`.
Configura en `.env` `MIU_CLOUD_MODEL` (por ejemplo `openai/gpt-4o-mini`) y
`MIU_CLOUD_API_KEY`, que debes obtener de tu proveedor con su facturación.
Cada petición de nube exige `"provider":"cloud","allow_cloud":true`.
Esto envía al proveedor el mensaje actual **y el historial reciente de esa sesión**.
No hay cambio automático de local a nube. Puedes alternar proveedores en una sesión;
usa sesiones separadas si no quieres compartir su contexto local.

LiteLLM se fija a `1.106.2`: existe un [reporte de compromiso de 1.107.0](https://github.com/BerriAI/litellm/issues/47826).
Es una medida basada en ese reporte, no una auditoría propia del paquete. La ruta
local no instala ni importa LiteLLM. No uses versiones flotantes o imágenes `latest`
para esa integración. El SDK real y los proveedores deben validarse en un entorno
aislado antes de habilitar claves de producción; las pruebas de nube usan un doble.

## Codespaces / Linux

En GitHub elige esta rama → **Code → Codespaces → Create codespace**. El devcontainer
instala Python y prepara entorno/token/pruebas. Después:

```bash
.venv/bin/python -m uvicorn miu.app:create_app --factory --host 0.0.0.0 --port 8000
```

Mantén el puerto reenviado **privado**. Abre su URL raíz para usar el chat e introduce
tu token. `/docs` sigue disponible para explorar la API.
Para nube instala `.[cloud]` dentro de `.venv` y configura las variables mediante
Codespaces Secrets o `.env` (las variables del entorno tienen prioridad).
Para local debes instalar Ollama **dentro del Codespace** y descargar un modelo;
no se instala automáticamente. `localhost` allí no es tu PC. No publiques Ollama
en internet. La inferencia CPU puede ser lenta y consumir cuota/disco; GPU no está
garantizada. Sin proveedor puedes ejecutar todas las pruebas y consultar `/health`.

Codespaces sirve para backend y pruebas; no controla el escritorio Windows, ni
accede directamente al micrófono/altavoces/cámara de tu PC. El futuro cliente web
deberá pedir permisos de audio y renderizar 2D/3D en el navegador con WebGL. Un
avatar nativo, drivers GPU y captura del escritorio se validarán en Windows/Android.

## Desarrollo y seguridad

```powershell
.venv\Scripts\python -m pytest -q
.venv\Scripts\python -m ruff check .
```

En Linux usa `.venv/bin/python`. CI cubre Windows/Linux y Python 3.11–3.13.
Las pruebas no descargan modelos, usan claves reales ni cobran servicios.

El token debe tener al menos 32 caracteres; la API rechaza arrancar sin él.
Es un núcleo de **un usuario**: todos los poseedores del token acceden a todas las
sesiones. UUID no equivale a autorización por usuario. No hay CORS abierto ni
acciones de shell. No expongas el servidor públicamente sin TLS, control de acceso
y límites de peticiones. Usa un solo proceso/worker para mantener el orden por sesión.
El contexto se limita a los últimos 20 mensajes (configurable hasta 100); SQLite
conserva el historial completo hasta borrarlo y no implementa memoria semántica.
Los mensajes se guardan en texto plano en `data/`; protege disco, copias y `.env`.
El borrado es lógico: no garantiza eliminación forense en WAL/copias ni elimina
datos enviados a terceros. No subas secretos ni bases de datos al repositorio.

Consulta [arquitectura y siguientes fases](docs/architecture.md) y
[revisión de referencias/licencias](docs/references.md). Se propone MIT para el código
original de esta fase en el PR; modelos, SDK y recursos mantienen sus propias licencias.
