# Validación de la entrega

Comprobado en Windows con Python 3.12.14:

- Instalación editable del núcleo y extras de desarrollo completada.
- `pytest -q`: 11 pruebas pasan; Starlette emite aviso de deprecación de HTTPX
  en su cliente de pruebas. No afecta a la ruta HTTPX de Ollama.
- `ruff check .`: sin errores; `pip check`: sin dependencias incompatibles.
- Instalador PowerShell sin opciones de instalar software del sistema: completado;
  genera `.env` y conserva una configuración existente. La política de este equipo
  exige `-ExecutionPolicy Bypass` para esa invocación.
- La primera ejecución del instalador encontró permisos incompatibles en cachés
  temporales de pruebas creadas dentro del sandbox. Repetido con directorio temporal
  nuevo y sin caché pytest: 11 pruebas pasan.
- API arrancada mediante TestClient con `.env` generado: `/health` devuelve 200.

No se instaló Python ni Ollama mediante winget ni se descargó un modelo. No se usaron
claves reales, no se ejecutó inferencia real, no se abrió un Codespace ni se probó
avatar/audio. LiteLLM se prueba con doble de SDK; resolver sus dependencias no
equivale a verificar su ejecución o seguridad. CI complementa la verificación
con Windows/Linux y Python 3.11–3.13; consultar resultados del PR.
