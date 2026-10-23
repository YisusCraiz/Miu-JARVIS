# Referencias, licencias y decisiones

Revisión: 22 de octubre de 2026. El repositorio destino estaba vacío, sin licencia,
commits ni instrucciones AGENTS.md. El historial previo solo devolvió referencias
opacas a respuestas; no se pudo recuperar la lista exacta investigada. Esta es una
selección nueva y explícita, no una afirmación de equivalencia con aquella lista.

| Proyecto | Licencia consultada | Uso/compatibilidad |
| --- | --- | --- |
| [FastAPI](https://github.com/fastapi/fastapi/blob/master/LICENSE) | MIT | Base HTTP Python; sin avatar propio |
| [Ollama](https://github.com/ollama/ollama/blob/main/LICENSE) | MIT | Servicio local HTTP; modelos tienen licencias independientes |
| [LiteLLM](https://github.com/BerriAI/litellm/blob/main/LICENSE) | MIT fuera de enterprise/ | SDK opcional nube; Enterprise excluido |
| [Open-LLM-VTuber](https://github.com/Open-LLM-VTuber/Open-LLM-VTuber/blob/main/LICENSE) | MIT con excepción de muestras Live2D | Referencia voz/2D, no vendorizada; frontend separado tiene términos propios |
| [AIRI](https://github.com/moeru-ai/airi/blob/main/LICENSE) | MIT | Referencia cliente/avatares; pila TypeScript separada, requiere adaptación HTTP |
| [three-vrm](https://github.com/pixiv/three-vrm/blob/dev/LICENSE) | MIT | Candidato renderer 3D futuro; modelos VRM no heredan licencia del renderer |

No se ha copiado código ni assets de esos repositorios. No se importan monorepos
completos: eso arrastraría dependencias de audio, Node y SDK que la fase 1 no necesita.
La compatibilidad de avatar se refiere a arquitectura posible, no a integración
binaria o interoperabilidad ya probada. Live2D exige revisar [condiciones de modelos](https://github.com/Open-LLM-VTuber/Open-LLM-VTuber/blob/main/LICENSE-Live2D.md)
y SDK; no se descargan ni aceptan automáticamente.

HTTPX (BSD-3-Clause), Uvicorn (BSD-3-Clause), Pydantic/pydantic-settings (MIT),
pytest (MIT), Ruff (MIT) son dependencias de código con licencias permisivas.
SQLite es dominio público. Conservar avisos si se redistribuyen sus componentes;
una distribución final requiere inventario de versiones transitivas y sus licencias.

[Documentación oficial LiteLLM/Ollama](https://docs.litellm.ai/docs/providers/ollama)
confirma que Ollama es un servicio separado; esta fase usa su HTTP directamente.
El [reporte upstream 47826](https://github.com/BerriAI/litellm/issues/47826) señala
compromiso de 1.107.0 y enumera 1.106.2 entre versiones examinadas por sus autores.
Se fija esa versión opcional; no se ha realizado auditoría independiente ni se
garantiza la seguridad de todas sus dependencias. Revisar estado antes de actualizar.
