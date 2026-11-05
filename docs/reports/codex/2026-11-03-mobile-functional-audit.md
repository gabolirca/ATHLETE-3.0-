# ATHLETE 3.0 — Auditoría funcional móvil

**Fecha:** 3 de noviembre de 2026  
**Rama auditada:** `codex/mobile-foundation`  
**Alcance:** revisión previa a implementar el ciclo local de entrenamiento.

## Matriz de funcionalidades

| Área | Implementado | Parcial | Pendiente / no funcional | Dependencia del backend |
|---|---|---|---|---|
| Navegación | Cinco tabs de Expo Router: Inicio, Entrenar, Progreso, Nutrición y Perfil. El registro previo indica que aparecen y navegan en iPhone. | CTA de Inicio solo abre el tab Entrenar. | No hay rutas de detalle o flujos secundarios. | Ninguna para tabs. |
| Inicio | Estructura visual de resumen y acceso rápido. | Secciones y tarjetas están dibujadas. | Fecha, nombre, actividad, conteos, hidratación y rutina son constantes hardcoded; CTA navega pero no inicia una sesión; sin estado vacío ni lectura de datos. | Sí, para actividad y programación reales. No existe servicio. |
| Entrenar | Pantalla con presentación de un programa. | Tarjetas de actividad y sesiones planeadas. | Programa y sesiones son constantes; sin catálogo, búsqueda, filtros, creación de rutina, detalle, registro de series/RIR, edición, temporizador, finalización ni historial. Las tarjetas no son acciones. | Catálogo e historial requieren repositorio/API; no hay contrato de código ni API disponible. |
| Progreso | Gráfica y tarjetas visuales. | Filtros de periodo son texto estático. | Volumen, tendencia, peso, récords y sesiones son ficticios; no hay gráfica conectada a datos ni umbrales de datos insuficientes. | Requiere sesiones y mediciones reales. |
| Nutrición | Presentación de resumen nutricional y comidas. | Etiquetas “Añadir” y la hidratación están representadas visualmente. | Los datos son demostrativos, no existen registros ni análisis reales. No ofrece estado vacío. | No hay integración y no debe simularse. |
| Perfil | Tarjeta y filas visuales de configuración. | Opciones aparentan ser accesos. | Nombre, peso y estatura son ficticios; no hay edición, preferencias, unidades, zona horaria, privacidad o cierre de sesión. | Auth/perfil no están integrados. |
| Componentes | `Card`, `Screen`, `Row`, `Title`, `Label`, `Eyebrow` y `SectionHeading` reutilizables. | Aportan estilos y estructura. | No incluyen formulario, accesibilidad de acción, loading, error o empty state. | Ninguna. |
| Estado global | Ninguno. | — | No hay Zustand ni otro store. | No aplica. |
| Repositorios | Ninguno. | — | No hay capa de datos ni adapter Supabase/local. | El backend móvil no está disponible. |
| Persistencia/offline | Ninguna. | — | No hay SQLite, migración local, cola de operaciones, sync state, recuperación o deduplicación. | Especificación propone SQLite, pero no publica contratos de sync. |
| Contratos/validación | `docs/contracts/README.md` describe intención y estructura futura. | — | `packages/contracts` no existe en este checkout; no hay Zod, esquemas, tipos, códigos de error ni API consumible. | Responsable Claude; no se inventarán ni modificarán contratos. |
| Supabase/auth | Nada en cliente. | — | No hay SDK, configuración, sesión o credenciales. | Pendiente de confirmación/implementación backend; no se cambia configuración remota. |
| Pruebas | Typecheck de la configuración base. | — | No hay framework ni pruebas de interfaz, repositorio o persistencia. | No aplica. |

## Arquitectura y huecos

- ADR-0002 prescribe separación presentación/repositorios, SQLite local-first, TanStack Query para caché remota y Zustand para estado de interfaz; esta rama aún no implementa ninguna capa.
- El modelo de datos es propuesta, no contrato aprobado. Requiere sesiones, ejercicios y series; no autoriza construir una API ni una migración remota.
- La implementación local de prueba debe quedar detrás de interfaces de repositorio, marcada como local y no presentada como sincronizada ni como dato real del usuario.
- El esquema/operaciones para sync, identidad del atleta, catálogo remoto, reglas de conflict resolution y contratos de perfil siguen pendientes de Claude.

## Revisión de acciones visibles

- Inicio: el CTA `Comenzar entrenamiento` navega al tab Entrenar; no inicia una sesión.
- Inicio/Progreso: “Ver progreso”, filtros y rangos temporales son texto sin manejador.
- Entrenar: calendario, sesiones y actividades son tarjetas visuales; no abren flujos.
- Nutrición: “Añadir +” y “Añadir vaso” son etiquetas no interactivas.
- Perfil: el lápiz y las filas de opciones son iconos/texto decorativos.

## Prioridad acordada para el trabajo móvil

Cerrar el ciclo de entrenamiento local: persistir catálogo de ejercicios de muestra como fixtures claramente identificados, iniciar sesión, capturar/editar series, finalizar, recuperar tras reinicio y consultar historial mediante un repositorio local SQLite. Las métricas de Inicio/Progreso se derivarán de ese repositorio o mostrarán estados vacíos. No habrá apariencia de sincronización remota hasta recibir los contratos y el adapter del backend.
