# Arquitectura y entregas

Cliente Windows / futuro Android → API autenticada → servicio de conversación →
proveedor seleccionado (HTTP Ollama o SDK LiteLLM) → SQLite.

La primera fase separa configuración (`miu/config.py`), almacenamiento (`memory.py`),
adaptadores (`providers.py`) y contrato HTTP (`app.py`). SQLite usa transacciones
para guardar cada pareja usuario/asistente. Bloqueos acotados serializan conversación
y borrado; una colisión entre sesiones solo reduce paralelismo. Los límites de
mensajes no son límites de tokens: un modelo con contexto pequeño puede rechazar
peticiones largas. En fase 2 habrá presupuesto de tokens, resumen y retención.

## Compatibilidad

Python 3.11–3.13, FastAPI/Pydantic 2 y HTTPX; Ollama como proceso externo evita
acoplar sus binarios/GPU al backend. SQLite viene con Python. LiteLLM es un extra
opcional con un adaptador asíncrono; solo se usa la API SDK, sin proxy Enterprise.
Las dependencias directas están acotadas, pero no hay lock transitivo ni hashes
todavía: CI resuelve versiones dentro de esos rangos. Antes de distribución estable,
generar locks por plataforma, SBOM y revisión de vulnerabilidades.

## Fase 2 — cliente y voz

Cliente web compartido, pantalla de configuración y selector local/nube; streaming,
cancelación, STT/TTS con contratos independientes. Autorización explícita al usar
micrófono, estado visible y pruebas reales de latencia. Probar primero Windows.
No cargar claves de nube en el cliente.

## Fase 3 — avatar intercambiable

Interfaz AvatarRenderer: cargar/reemplazar recurso, expresión, mirada y visemas.
Un adaptador 2D Live2D y otro 3D VRM consumirán eventos del cliente; el backend no
dependerá de SDK gráficos. Evaluar AIRI y Open-LLM-VTuber como referencias y no
conectar directamente sus frontends: sus protocolos requieren un puente explícito.
Antes de distribuir: elegir assets, aceptar términos de Cubism si aplica, verificar
licencias de cada avatar, empaquetado WebGL y presupuesto GPU móvil.

## Fase 4 — Windows y Android

Empaquetar cliente Windows, instalador firmado y actualizaciones. Después cliente
Android (web/PWA o contenedor nativo) consumiendo API por HTTPS o red privada,
emparejamiento con tokens por dispositivo y almacenamiento seguro del sistema.
En Android inicialmente se ejecutará el cliente, no se presupone que este backend
Python u Ollama corran nativamente. Acciones de escritorio futuras requerirán
servicio local, allowlist, vista previa y confirmación; nunca ejecutar instrucciones
del modelo como comandos directamente.

## Aceptación fase 1

Pruebas de autorización, validación, contexto persistente/aislado, eliminación,
consentimiento nube, ausencia de turnos fallidos y adaptadores simulados. Falta
validación manual con modelo descargado, SDK real nube, winget y Codespaces real;
el entorno de desarrollo de esta entrega no implica que esas plataformas se hayan probado.
