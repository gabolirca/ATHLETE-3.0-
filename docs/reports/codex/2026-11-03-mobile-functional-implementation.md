# ATHLETE 3.0 — Implementación funcional móvil y estado offline-first

**Fecha:** 3 de noviembre de 2026  
**Rama:** `codex/mobile-foundation`  
**Plataformas objetivo:** iOS y Android  
**Estado:** ciclo de entrenamiento local implementado; sincronización entre dispositivos pendiente de contratos y servicio backend.

## Resumen

Se reemplazaron pantallas demostrativas por flujos locales conectados a SQLite: catálogo de muestra identificado, rutinas, inicio y captura de sesiones, historial, progreso derivado de registros y preferencias locales. Se añadió una outbox persistente con clave de mutación estable, estado de reintento, versionado local/remoto, conflictos y tombstones.

La sincronización remota completa **no está implementada**. En este checkout no existe `packages/contracts`, servicio móvil, contrato de autenticación ni protocolo/cursor de sincronización que se pueda consumir. No se inventaron endpoints, credenciales ni tablas remotas. Por ello, no se afirma que una sesión se replique actualmente a otro dispositivo.

## Matriz funcional tras los cambios

| Área | Implementado | Parcial | Pendiente / no funcional | Backend requerido |
|---|---|---|---|---|
| Navegación | Cinco tabs existentes: Inicio, Entrenar, Progreso, Nutrición y Perfil; rutas para rutinas, ejercicio, sesión e historial. | Prueba unitaria de presencia de tabs; no se pudo completar validación visual en el runtime iOS disponible. | Verificación visual en Android. | No para navegación. |
| Inicio | Conteos, minutos y sesión reciente leídos del repositorio local; CTA inicia o continúa sesión; vacíos y errores. | “Entrenamiento programado” no muestra calendario ficticio y ofrece crear rutina. | Programación/calendario. | Sí, para planes compartidos. |
| Entrenar | Buscar catálogo local, abrir ejercicio, crear rutina con objetivos, iniciar sesión libre o desde rutina, añadir ejercicios/series, registrar peso/repeticiones/RIR, terminar e ir al historial. | El catálogo inicial son fixtures marcados `sample`; RIR puede quedar vacío (`null`). | Catálogo central y sincronizado; filtros avanzados y temporizador. | Sí para catálogo compartido. |
| Persistencia de entrenamiento | Transacciones SQLite para rutinas, sesiones, ejercicios, series, mediciones y preferencias; recuperación de sesión activa y outbox después de reabrir archivo. | La prueba de reinicio usa SQLite real mediante adaptador de prueba Node; la app nativa compila, pero su arranque visual en el simulador actual queda bloqueado por ciclo de vida iOS 27. | Prueba de reinicio manual en dispositivo iOS y Android. | No para uso local. |
| Outbox y errores de red | Mutaciones persistentes, `clientMutationId` único, estado `pending/syncing/failed/conflict/acked`, intentos, recuperación de `syncing` interrumpido, códigos de error seguros, tombstones, versión local/base remota y snapshots de conflicto. | El repositorio permite reclamar una operación y retener/reintentar errores sin cambiar el ID idempotente. No se comunica con un servidor. | Pull incremental, cursor, confirmación del servidor, resolución UI de conflictos y política de compactación/retención. | Sí; contrato de sync necesario. |
| Progreso | Volumen de series efectivamente registradas (sin calentamiento), sesiones completadas, mejores cargas y mediciones corporales desde SQLite; estado sin datos. | No hay gráficas temporales completas ni estadísticas remotas. | Series temporales y mediciones entre dispositivos. | Sí para datos compartidos. |
| Nutrición | Estado vacío honesto; no hay registros ni análisis ficticios. | Preparación visual. | Registros, alimentos e integración nutricional. | Sí si se acuerda el producto/API. |
| Perfil | Preferencias locales: nombre de presentación, deporte, unidades y zona horaria del dispositivo. | Preferencias aún no asociadas a un perfil autenticado ni sincronizadas. | Login, perfil de cuenta y cierre de sesión. | Sí; backend/auth pendiente. |
| Seguridad | Sin credenciales ni claves privilegiadas; clave aleatoria de SQLCipher y clave de propietario local en SecureStore; validación con Zod; consultas deportivas delimitadas por propietario local. | Identidad local es `device:<id>` y no es identidad autenticada. | Aislamiento por cuenta al cambiar usuario, limpieza de cachés, tokens de sesión seguros, identidad verificada en servidor y RLS. | Sí; backend y auth obligatorios. |
| Ambientes | El cliente actual opera en modo local y no contiene secretos de entorno. | Expo conserva configuración nativa para iOS/Android. | Recursos y configuración independientes Local/Development/Testing/Production; política y autorización de migraciones productivas. | Coordinación backend/DevOps. |
| Pruebas | Navegación, formularios de series, validación, ciclo local de rutina/sesión, historial, reinicio de SQLite, outbox/reintento, conflicto/versionado, tombstone, separación de propietarios locales y mediciones. | Persistencia SQLCipher nativa está incluida en build, pero no se probó el flujo en un dispositivo operativo. | Pruebas de auth/cambio de cuenta, sincronización real entre dos dispositivos y matrices nativas iOS/Android. | Sí para pruebas remotas/auth. |

## Criterio de aceptación offline y multi-dispositivo

| Paso | Resultado |
|---|---|
| Crear sesión sin internet | **Listo en el repositorio local:** inicio, captura y finalización escriben en SQLite sin requerir conexión. |
| Guardar en SQLite | **Listo:** transacciones y outbox local. El build nativo incluye SQLCipher y clave de base de datos en SecureStore. |
| Sobrevivir cierre/reinicio | **Prueba automatizada pasada** al cerrar y reabrir una base SQLite en archivo; falta validación manual del ciclo de app nativa. |
| Sincronizar al recuperar conexión | **Pendiente:** falta contrato y transporte backend; la outbox queda persistente y recuperable. |
| Aparecer en segundo dispositivo autenticado | **Pendiente:** no hay auth ni endpoint/contrato pull/push disponible. |
| No duplicarse al reintentar | **Garantía local preparada:** `clientMutationId` tiene restricción `UNIQUE` y los reintentos conservan el mismo valor. La deduplicación final debe ser aplicada y probada también por el servidor. |

## Decisiones de implementación

- Se conserva Expo SDK 54, React Native 0.81.5, React 19.1.0 y Expo Router; no se cambia la arquitectura visual ni la navegación principal.
- Expo limita plataformas a iOS y Android. No se instala `react-native-web`.
- `SQLiteTrainingRepository` implementa `TrainingRepository`; las pantallas consumen el repositorio local por un provider, no acceden directamente a Supabase.
- Los ejercicios semilla tienen origen `sample`. No se muestran estadísticas de usuario prellenadas.
- Las mutaciones deportivas incrementan `local_version` y agregan payload a `sync_outbox` en la misma transacción. La restricción única sobre `client_mutation_id` da una clave estable para idempotencia.
- El estado de sincronización sólo indica estado de cola local. Un estado `acked` requerirá confirmación de un adaptador servidor aún inexistente.
- Los acknowledgements antiguos no aplican snapshots remotos sobre los datos locales. Los conflictos guardan snapshots local/remoto y marcan el agregado en conflicto; aún falta una pantalla/política de resolución acordada.
- Las eliminaciones se representan con tombstones para conservar la intención de sincronizar el borrado.
- SQLCipher cifra el archivo de la base de datos; la clave aleatoria se conserva en SecureStore. La clave `device:<id>` separa datos del entorno local, pero no reemplaza la identidad autenticada.
- No se agregó infraestructura ni credenciales para Development, Testing o Production y no se tocaron bases de datos ni migraciones remotas.

## Archivos y grupos modificados

- Configuración: `package.json`, `package-lock.json`, `apps/mobile/package.json`, `apps/mobile/app.json`, `apps/mobile/jest.config.js`, `.gitignore`.
- Datos y persistencia: `apps/mobile/src/data/database.ts`, `ids.ts`, `trainingSchemas.ts`, `trainingTypes.ts`, `TrainingRepository.ts`, `SQLiteTrainingRepository.ts`, `LocalTrainingProvider.tsx`.
- Componentes reutilizables: componentes de acción, formulario, picker, estados vacío/sync y editor de series en `apps/mobile/src/components/`.
- Flujos Expo Router: `apps/mobile/app/` incluye Inicio, Entrenar, Progreso, Nutrición, Perfil, creación de rutina, sesión, historial y detalle de ejercicio.
- Pruebas: pruebas de navegación, esquemas, editor de series y repositorio SQLite bajo `apps/mobile/src/`.
- Informes previos actualizados en `docs/reports/codex/README.md`; auditoría inicial en `2026-11-03-mobile-functional-audit.md`.

## Pruebas y validaciones realizadas

- `npm run typecheck`: **pasó** (`tsc --noEmit`).
- `npm test`: **pasó**, 4 suites y 11 pruebas. Node muestra el aviso de que su API `node:sqlite` es experimental; se usa sólo para pruebas locales.
- `npx expo-doctor`: **18/18 comprobaciones pasaron**.
- `npx expo start --clear --port 8082`: Metro inició y respondió `packager-status:running`. Se usó 8082 porque otra instancia Expo ocupaba 8081; se detuvo el servidor de verificación al terminar.
- `git diff --check`: **pasó**.
- **iOS:** el prebuild/instalación de pods y compilación Xcode 27.2 para simulador iPhone 17 completaron; el build nativo incluyó SQLite/SQLCipher. La app instalada no pudo llegar a su pantalla: el runtime iOS 27.1 registra `UIScene life cycle is required for apps built with this SDK`. El template Expo SDK 54 generado usa el ciclo de vida anterior. Apple exige escenas a apps construidas con el SDK iOS 27; no se añadió un parche nativo no soportado ni se actualizó Expo fuera del alcance autorizado. Xcode no tiene `Simulator.app` en la ruta estándar en este entorno. [Documentación de Apple sobre el ciclo UIScene](https://developer.apple.com/documentation/uikit/transitioning-to-the-uikit-scene-based-life-cycle).
- **Android:** no validado en dispositivo/emulador; `adb` no está instalado en el entorno. Typecheck, Expo Doctor y pruebas JS sí cubren configuración/código compartido.
- **npm audit:** un intento actual falló al resolver `registry.npmjs.org` (`ENOTFOUND`), por lo que no hay recuento actualizado. El último resultado disponible tras incluir dependencias de pruebas fue 48 alertas (6 bajas, 37 moderadas, 5 altas); debe volverse a ejecutar con acceso al registry antes de distribuir.

## Problemas y riesgos

1. **Bloqueo de sincronización remota:** falta el contrato de Claude para identidad, cursor incremental, pull/push, idempotencia del servidor, control de versión y errores. No es posible satisfacer hoy sincronización ni visibilidad entre dispositivos sin inventar una API.
2. **Autenticación/seguridad de cuenta:** no hay sesión ni perfil server-side. `device:<id>` es identidad local temporal. Al integrar auth se debe diseñar asociación/migración de datos locales, separación por cuenta y borrado de caché privada en cambio/cierre de sesión.
3. **RLS y migraciones:** la protección local no sustituye RLS. No se implementó ni modificó configuración remota o esquema de backend.
4. **Conflictos:** la detección y retención local están preparadas, pero falta una política de resolución aprobada y UX para reconciliar datos.
5. **iOS 27:** el código compila, pero no arranca visualmente bajo el SDK/runtime actual por el requisito UIScene. Es un riesgo de compatibilidad entre SDK 54 y Xcode/iOS 27; resolverlo requiere soporte oficial compatible o decisión explícita de actualización/compatibilidad nativa.
6. **Android y auditoría:** faltan prueba nativa Android y un audit npm actual por ausencia de `adb` y conectividad al registry.

## Siguientes pasos

1. Solicitar/publicar desde backend los contratos versionados y revisados de auth, sync incremental, tombstones, conflictos, errores e idempotencia del servidor; implementar su adaptador sin cambiar unilateralmente contratos compartidos.
2. Definir los cuatro ambientes y su configuración independiente sin almacenar secretos en el cliente; incorporar guardas para impedir migraciones productivas sin revisión/autorización explícita.
3. Acordar identidad/cuenta local y estrategia de transición desde el propietario temporal de dispositivo, incluyendo cambio de usuario y limpieza privada.
4. Ejecutar el ciclo end-to-end en dos dispositivos: offline, reinicio, reconexión, repetición de request, conflicto y RLS.
5. Validar un build y flujo UI en iOS con runtime compatible con SDK 54 o con soporte UIScene oficialmente aprobado; ejecutar build/arranque en Android con SDK y dispositivo/emulador disponibles.
6. Repetir `npm audit` con red, clasificar advisories y actualizar únicamente dentro del conjunto compatible Expo SDK 54/RN 0.81.5 mientras dure esta fase.

No se modificaron backend, `packages/contracts`, `packages/domain`, EasyTeacher, Diario Gym v2 ni bases de datos; no se añadieron secretos, no se ejecutaron migraciones remotas y no se hizo merge a `main`.
