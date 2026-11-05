# Informe Codex — integración móvil con `@athlete/data`

Fecha: 2026-11-05  
Rama: `codex/mobile-foundation`  
Alcance: aplicación móvil; la implementación de `@athlete/contracts`, `@athlete/domain` y `@athlete/data` pertenece a la rama de Claude.

## Estado

La app tiene un proveedor inicial para abrir `openAthleteData` e inyectar los adaptadores de Expo SQLite, SecureStore y Crypto. El proveedor maneja apertura, reintento, error y cierre; evita aperturas duplicadas bajo el ciclo de montaje de React. Aún no se conecta al layout ni a pantallas: el árbol activo sigue usando `SQLiteProvider`, `LocalTrainingProvider` y `SQLiteTrainingRepository`.

El corte de pantallas queda condicionado al handoff final de migración segura. La API `openAthleteData` abre `athlete3-<localUserId>.db`; la app todavía no puede decidir de forma segura entre ese almacén y la base legacy. La guía de integración describe `active-store` (`legacy`/`new`) como marcador de transición, pero no publica una API/estado operativo para resolverlo ni una estrategia confirmada de copia estable en iOS. Conectar el nuevo proveedor directamente ocultaría rutinas e historial preexistentes, aunque no borrara el archivo. No se abrió, copió ni migró ninguna base del simulador.

## Cambios de Codex

- `package.json`: workspace preparado para `packages/*` al integrar ambas ramas.
- `apps/mobile/package.json`: dependencias declaradas para `@athlete/contracts`, `@athlete/data` y `@athlete/domain`.
- `apps/mobile/src/data/AthleteDataProvider.tsx`: bootstrap de `openAthleteData` con adaptadores Expo y estado de carga/error/reintento.
- `apps/mobile/src/data/AthleteDataProvider.test.tsx`: prueba de apertura oficial, configuración offline sin transporte de cuenta, cierre y error.

Los symlinks locales de `node_modules/@athlete/*` usados para typecheck apuntan al worktree hermano de Claude y están ignorados por Git. No son una solución de instalación ni se deben distribuir. El `package-lock.json` de Codex aún no contiene las dependencias workspace efectivas; la instalación reproducible requiere unir los paquetes oficiales al checkout común y regenerar el lockfile en coordinación.

## Contratos y alcance de UI confirmados en el handoff 0.3.0

**Coordinación pendiente:** el paquete declara versión `0.3.0`, pero al validar el source compartido `packages/contracts/src/index.ts` aún exporta `CONTRACTS_VERSION = '0.2.0'`. Se requiere que Claude alinee el valor antes de aceptar la versión como 0.3.0 integrada.

- `openAthleteData` es la entrada oficial y expone repositorios de perfil, catálogo, planes, sesiones, cardio, composición corporal y sync; sin transporte se mantiene el uso local/offline.
- Las rutinas se representan como plan, día y ejercicios planificados. La sesión iniciada desde día no crea series vacías; la UI debe usar filas objetivo en memoria y llamar `logSet` al guardar una serie.
- Las escrituras regresan `Result<T>` y deben reflejarse desde el valor persistido o volver a consultar el repositorio.
- El contrato acepta RIR de `0` a `10` con incrementos de `0.5`; `null` significa sin respuesta y `0` es un dato válido. La pregunta visual acordada es “¿Cuántas repeticiones más podrías haber hecho?”.
- El perfil expone varios deportes, lo que permite fuerza e híbridos. Sueño y recuperación aún no tienen contratos completos; nutrición figura en contratos pero no está expuesta por la fachada local, según la guía inspeccionada. La UI adaptativa debe esperar contratos reales y no presentar recomendaciones o datos ficticios.

## Pruebas ejecutadas

En Codex (`ATHLETE-CODEX`):

- `npm run typecheck`: pasó.
- `npm test -- --runInBand`: 6 suites, 27 pruebas pasaron.

En Claude (`ATHLETE-CLAUDE`, lectura/validación de sus paquetes; sin editar esos archivos):

- `npm run typecheck --workspaces --if-present`: pasó para contracts, data, domain y supabase-tests.
- `npm test --workspace @athlete/contracts`: 18 pruebas pasaron.
- `npm test --workspace @athlete/domain`: 46 pruebas pasaron.
- `npm test --workspace @athlete/data`: 97 pruebas pasaron.
- `npm run test:integration --workspace @athlete/data`: 10 pruebas no ejecutables; el primer intento fue bloqueado por sandbox (`EPERM`) y el reintento autorizado alcanzó el host local pero recibió `ECONNREFUSED 127.0.0.1:54329`. `pg-transport.ts` restringe explícitamente el host a loopback y usa `athlete3_test`; no se accedió a Supabase remoto.

No se ejecutó iOS Simulator, no se hizo prebuild y no se modificaron SQLCipher, SecureStore, bases, claves ni datos. Las pruebas móviles actuales no prueban persistencia de la implementación oficial con SQLite real ni reinicio de app.

## Bloqueos para completar el corte móvil

1. Publicar un handoff estable de Claude para detectar/registrar el almacén activo, copiar de forma consistente la base legacy y sus archivos WAL/SHM a un backup desechable, abrir sólo la copia e importar; nunca abrir ni modificar la original durante migración.
2. Acordar cómo inicializar el perfil después de importar y cómo conservar la identidad local/clave existentes sin generar un perfil u outbox duplicados.
3. Confirmar disponibilidad real de los paquetes y su lockfile en el checkout integrado; no usar symlinks externos como dependencia de producción.
4. Resolver la operación atómica para crear una rutina con su día y ejercicios o aceptar formalmente una composición móvil con compensación.
5. Ejecutar la batería de integración backend en PostgreSQL local desechable y validar el ciclo offline/reapertura en un simulador iOS desechable sin tocar la base actual.

## Siguiente validación conjunta

Con el handoff de transición estable, reemplazar el árbol SQLite heredado por `AthleteDataProvider`, adaptar rutinas, entrenamiento e historial a `Result<T>` y repositorios oficiales, y cubrir carga/error/vacío y persistencia tras relanzar. Mantener las funciones de recuperación del usuario hasta que la copia/importación reversible esté aprobada y probada con fixture; no hacer un cambio que sólo muestre un almacén nuevo vacío.
