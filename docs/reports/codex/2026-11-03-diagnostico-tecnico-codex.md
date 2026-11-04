# Diagnóstico y plan técnico inicial de ATHLETE 3.0

No ejecuté migraciones, no consulté ni modifiqué filas de negocio y no hice cambios en el esquema. El repositorio oficial se clonó solo para inspección en /tmp; está vacío: no tiene archivos ni commits. El checkout disponible en el espacio de trabajo sigue siendo diario-gym, por lo que no lo considero código de ATHLETE 3.0.

## Hallazgos confirmados y límites de la auditoría

- Repositorio: https://github.com/gabolirca/ATHLETE-3.0-.git respondió como repositorio vacío. No hay estructura móvil, backend, migraciones, pruebas ni documentación que auditar todavía.
- Especificación: no está disponible en el repositorio ni en el contexto que puedo consultar en este turno. Puedo proponer los cimientos, pero el modelo funcional final debe contrastarse con esa especificación.
- Proyectos Supabase: la sesión de CLI accesible muestra un proyecto llamado ATHLETE 3.0, referencia npdrjhbkilicuieecbgd, creado el 3 de noviembre de 2026, y otro llamado EasyTeacher. No muestra los proyectos de Diario Gym identificados previamente (usaosgtherqnqwjhgbtt para v2 y ckvogrrzhdfdubqcwayn para v1). No puedo confirmar que el proyecto accesible como ATHLETE 3.0 sea el mismo proyecto que Diario Gym v2. No lo asumiré como origen ni como destino.
- Migraciones y registros: el repositorio anterior tiene 26 archivos locales de migración. La cifra de 28 migraciones remotas y las discrepancias de usuarios, sesiones, series y predicciones provienen de auditorías previas, pero no pude contrastarlas con la base remota en esta sesión. No dispongo de una conexión de base de datos de solo lectura a las referencias de Diario Gym.
- Configuración CLI: el proyecto de ATHLETE 3.0 aparece en el listado de la cuenta, pero eso no da acceso al esquema ni prueba que sea el proyecto legado. No se ejecutó db dump, migration list ni consulta SQL.

Para terminar esa parte del diagnóstico hace falta que la referencia de Diario Gym v2 aparezca accesible en la sesión autenticada de Supabase o contar con un acceso de base de datos de solo lectura a la instancia correcta. No hace falta compartir claves en el chat.

## Riesgo clave: esquema separado, historial de migraciones compartido

El esquema athlete3 aislará tablas y nombres de objetos de los del sistema anterior, pero no crea automáticamente un historial de migraciones independiente. Supabase CLI compara los archivos locales con supabase_migrations.schema_migrations del proyecto; db push ejecuta las migraciones locales que no figuran como aplicadas. Por eso un repositorio v3 vacío no se debe enlazar y desplegar con db push hasta reconciliar las 28 remotas frente a las 26 locales. Supabase: migraciones y sincronización de historial (https://supabase.com/docs/guides/deployment/database-migrations)

Tampoco basta con crear el schema en SQL para que la app móvil lo use: hay que exponerlo en la configuración de Data API, otorgar permisos y consultar explícitamente el schema desde el cliente. Supabase: uso de esquemas personalizados (https://supabase.com/docs/guides/api/using-custom-schemas?language=curl&queryGroups=language)

## Objetos legados que deben revisarse por posible interferencia

El aislamiento de nombres en athlete3 reduce colisiones con las tablas y vistas de public, pero no evita todos los cruces. En la inspección remota pendiente se deben inventariar:

- Tablas, vistas, funciones, triggers, secuencias, políticas y grants existentes en public y otros esquemas.
- Funciones Edge: sus nombres/deployments son del proyecto, no del schema PostgreSQL; ATHLETE 3.0 deberá usar nombres propios para no reemplazar funciones legadas.
- supabase_migrations.schema_migrations: es el historial del proyecto y puede afectar el despliegue de v3.
- Configuración de esquemas expuestos en Data API, roles JWT, extensiones y publicaciones de Realtime.
- Buckets y políticas de Storage, secretos y trabajos pg_cron, que también viven a nivel de proyecto.

En las migraciones nuevas, todas las referencias deben ir calificadas (athlete3.tabla, auth.uid()), con search_path controlado para funciones sensibles. Las tablas propiedad de usuario tendrán políticas RLS propias; no se reutilizarán políticas de public.

## Modelo inicial propuesto

El modelo debe ser suficiente para crecer de uso personal a múltiples usuarios desde el inicio. No es todavía un contrato funcional aprobado: está limitado al núcleo de registro de entrenamiento y debe cotejarse con la especificación.

| Entidad propuesta | Propósito y límites |
|---|---|
| athlete3.profiles | Una fila por auth.users.id; ajustes personales mínimos. No guardar secretos ni usar un ID de propietario global. |
| athlete3.exercises | Catálogo de ejercicios con IDs estables; distinguir registros globales de personalizados si el MVP lo necesita. |
| athlete3.training_plans y tablas hijas | Plantillas y días/ejercicios planificados, solo si la especificación incluye rutinas/programación en el MVP. |
| athlete3.training_sessions | Sesiones con fecha, estado y metadatos básicos. Toda fila de usuario tiene user_id. |
| athlete3.session_sets | Series ordenadas, enlazadas a sesión y ejercicio; validar peso, repeticiones y orden. |
| athlete3.body_measurements | Opcional; incluir solo los datos corporales que la especificación confirme para el MVP. |
| Columnas de sincronización | Identificador de mutación del cliente, marcas temporales y estrategia de borrado/conflicto según el soporte offline decidido. |

No propongo portar nutrición, sueño, escaneos de comida, modelo predictivo, natación ni panel de investigación desde v2 sin requisito explícito de ATHLETE 3.0. Los datos de v2 se preservan por separado y no se migran automáticamente.

### Propiedad, RLS y autenticación

- Cada fila privada tiene user_id; el perfil usa id = auth.uid().
- RLS se habilita y prueba desde la primera migración. La política de cada operación verifica que el propietario sea el usuario autenticado.
- El cliente móvil nunca recibe la clave service_role.
- Aunque el primer lanzamiento sea personal, no se usarán permisos globales ni excepciones especiales para una sola cuenta que luego deban retirarse.
- Los flujos administrativos futuros deben usar autorización explícita y no ampliar el acceso de todos los usuarios.

## Contratos que Codex necesita

La app debería depender de contratos compartidos, no de nombres de tablas distribuidos por las pantallas. Propongo crear, tras revisar la especificación:

- packages/contracts/src/: tipos de dominio y esquemas de validación compartidos.
- packages/contracts/src/sessions.ts: entrada y salida de una sesión y sus series.
- packages/contracts/src/errors.ts: formato estable de error: código, mensaje seguro y si es reintentable.
- packages/contracts/src/sync.ts: contrato de sincronización y reporte de conflictos, si el MVP requiere offline.
- packages/contracts/src/database.types.ts: tipos generados desde el schema athlete3, no editados a mano.
- apps/mobile/src/data/: adaptadores/repositorios que implementan esos contratos.

Contrato preliminar de sesión:

type CreateSessionInput = {
  clientMutationId: string;
  performedAt: string; // ISO 8601 con zona horaria
  exercises: Array<{
    exerciseId: string;
    sets: Array<{
      setIndex: number;
      weightKg: number | null;
      reps: number | null;
      rir: number | null;
      isWarmup: boolean;
    }>;
  }>;
};

type CreateSessionResult = {
  id: string;
  clientMutationId: string;
  createdAt: string;
};

El cliente no decide el user_id; el adaptador obtiene el usuario de la sesión autenticada. Los criterios de validación numérica, estado de borrador y soporte offline se concretan al revisar la especificación. Para CRUD ordinario se puede usar Supabase con .schema('athlete3') y RLS; reservar Edge Functions para lógica que deba ejecutarse en servidor o usar privilegios elevados.

## Reconciliación de 28 migraciones remotas vs. 26 locales

No se debe inferir que las dos migraciones faltantes sean las últimas ni que el esquema remoto coincida con los archivos locales. El diagnóstico de solo lectura debe comparar:

1. Las 28 versiones registradas remotamente con los 26 timestamps de archivos locales.
2. Nombre, contenido y estado de cada versión coincidente y divergente.
3. Diferencia estructural entre el esquema remoto actual y la suma de las migraciones locales.
4. Conteos agregados de auth.users, workouts, workout_sets y predictions, incluyendo sesiones sin client_uid, predicciones abiertas/cerradas y usuarios distintos.
5. Referencias huérfanas, duplicados de llaves de sincronización y separación entre usuarios reales y demos.

Las consultas deben devolver agregados, no correos ni valores personales. Por ejemplo, la salida de la auditoría debería incluir por tabla: total de filas, usuarios distintos, duplicados por clave natural y totales por estado. Los resultados se guardan fuera del repositorio y se comparan antes/después de cualquier cambio futuro.

No ejecutar db push, migration repair, db pull o db reset sobre el proyecto compartido durante el diagnóstico. migration repair modifica el historial; aunque no aplique SQL, sigue siendo una escritura remota.

## Tareas pequeñas y verificables

| ID | Tarea | Archivos/salidas | Dependencias | Aceptación y pruebas |
|---|---|---|---|---|
| A0 | Confirmar acceso, proyecto fuente y alcance funcional | Registro de referencias y roles; copia accesible de especificación | Ninguna | V2 queda identificado por referencia, no por nombre; la especificación está versionada o accesible |
| A1 | Revisar estructura de ATHLETE 3.0 | Repositorio oficial | A0 | Primer commit y archivos visibles; mapa de carpetas e instrucciones documentado |
| A2 | Auditar objetos y datos remotos de Diario Gym, solo lectura | Informe fuera del repo; consultas SQL de auditoría | A0 | Inventario de objetos, 28 versiones remotas y conteos reproducibles; sin PII en el informe |
| A3 | Conciliar discrepancia de migraciones | Informe de versiones y diferencias | A1, A2 | Cada timestamp queda clasificado: coincide, falta local, falta remoto o requiere inspección; ningún repair ejecutado |
| A4 | Acordar límites de athlete3 y despliegue | docs/architecture/schema-isolation.md propuesto | A0, A2, A3 | Se define exposición API, grants/RLS, nombres Edge, search path y tratamiento de migraciones compartidas |
| A5 | Aprobar modelo inicial y diccionario | docs/architecture/data-model.md propuesto | A0, A2 | Cada entidad/campo del MVP traza a requisito y tiene propietario, retención y restricciones |
| A6 | Publicar contratos backend para Codex | packages/contracts/ propuesto; tipos generados cuando exista schema | A5 | Operaciones, validación, errores, autenticación y sync quedan especificados y revisados por ambos |
| A7 | Preparar entorno local y pruebas | supabase/config.toml, supabase/migrations/, tests/ | A3–A5 | Rebuild desde cero en entorno local; pruebas RLS con dos usuarios; nada aplicado al proyecto legado |
| A8 | Implementar migraciones iniciales de athlete3 | supabase/migrations/* | A4–A7 y aprobación explícita | Crear schema/tablas/grants/RLS en entorno local; ninguna referencia accidental a tablas public |
| A9 | Pruebas de integración y seguridad | tests/integration/, tests/security/ | A8 | Aislamiento entre usuarios, permisos anon/auth, integridad FK, idempotencia y errores cubiertos |
| A10 | Proponer despliegue controlado | Runbook y diff revisable | A9 y aprobación posterior | El plan demuestra que solo crea/actualiza objetos athlete3 y no toca datos legados |

## Paralelismo y orden

En paralelo: A0 (recuperar especificación/acceso), A1 (observar repositorio oficial) y preparar A2 (diseñar consultas agregadas sin ejecutarlas). A1 ya confirmó que el repositorio remoto no tiene contenido por ahora.

Dependencias estrictas: A3 espera A2; A4 espera la identidad del proyecto y la conciliación de migraciones; A5 espera la especificación y el inventario; A6 espera A5; A7 espera A3–A5; A8 espera contratos y pruebas locales; A9 espera A8. Cualquier despliegue remoto queda fuera de este plan hasta que revises el diff y lo autorices expresamente.

## Siguiente bloqueo para cerrar el diagnóstico

Para completar el punto de auditoría remota necesito que el proyecto exacto de Diario Gym v2 sea accesible en la cuenta CLI actual o una sesión de base de datos solo lectura para esa referencia. La lista accesible ahora muestra un proyecto nuevo llamado ATHLETE 3.0, pero no demuestra que sea la base compartida de Diario Gym. Hasta resolver esa identidad, el esquema athlete3 y los contratos anteriores son propuestas, y no recomendaría vincular ni desplegar el repo contra ningún proyecto.