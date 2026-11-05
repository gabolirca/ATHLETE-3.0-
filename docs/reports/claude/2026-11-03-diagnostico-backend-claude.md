ATHLETE 3.0: diagnóstico de backend y plan de cimientos

  No ejecuté migraciones, borrados ni ningún cambio de esquema. Todo lo de esta sesión fue de lectura: clonar el repo en

  una carpeta temporal, consultas select sobre Supabase y comprobaciones de DNS y HTTP. Además guardé dos notas en mi

  memoria local con estas decisiones y las cifras de referencia.

  ---

  0. Tres hallazgos que bloquean el arranque

  🔴 B1. El proyecto Supabase de Diario Gym v2 ya no existe para esta cuenta

  - Hoy, en la sesión anterior, leí gymai-v2 (usaosgtherqnqwjhgbtt) sin problema. Ahora ya no aparece en la

    organización, la API responde "You do not have permission" y el DNS da NXDOMAIN (usaosgtherqnqwjhgbtt.supabase.co no

    resuelve). Al proyecto v1 (ckvogrrzhdfdubqcwayn) le pasa lo mismo.

  - En su lugar apareció "ATHLETE 3.0" (npdrjhbkilicuieecbgd), creado hoy a las 22:33 UTC, en us-east-2 y vacío.

  - Lo más probable es que el proyecto se haya eliminado, quizá para liberar el cupo de 2 proyectos del plan Free. Un

    proyecto pausado normalmente sigue apareciendo en la lista. No lo puedo confirmar desde aquí.

  - Consecuencias:

    - Esto contradice dos de tus decisiones: "usaremos el mismo proyecto Supabase de Diario Gym" y "conserva el sistema

      anterior intacto".

    - Tu respaldo es probablemente la única copia de servidor que queda.

    - La app v2 publicada ya no puede sincronizar y funciona solo en modo local.

  - Qué hacer ya:

    a. En el panel de Supabase, revisa si gymai-v2 está en otra organización o en estado de borrado o pausa.

    b. En tu teléfono, no cierres sesión ni borres datos en la app v2. Su localStorage es otra copia de tu historial.

       Usa "Descargar respaldo" para exportarlo.

    c. Verifica el respaldo contra las cifras de la sección 5.

  🟠 B2. El repositorio ATHLETE-3.0- está vacío

  No tiene ningún commit. No hay estructura que auditar todavía.

  🟠 B3. No tengo la especificación ni el plan que definieron en ChatGPT

  No tengo acceso a esas conversaciones. Este plan se apoya en tus decisiones definitivas y en lo aprendido de la v2.

  Sube la especificación al repo, por ejemplo como docs/spec/ATHLETE3_ESPECIFICACION.md: así queda como fuente de verdad

  compartida con Codex. Cada tarea marcada con [SPEC] depende de ese documento.

  ---

  1. Estado del repositorio

  Está vacío. Propongo esta estructura como monorepo, y su creación es la primera tarea que te pido autorizar:

  ATHLETE-3.0-/

    apps/

      mobile/            ← Codex (Expo + RN + TS)

      admin/             ← fase posterior (Next.js)

    packages/

      contracts/         ← compartido: Zod, tipos, códigos de error, versión del contrato

      domain/            ← Claude: lógica de negocio pura en TS (sin I/O)

      data/              ← Claude: repositorios, SQLite local, motor de sincronización

    supabase/

      migrations/        ← Claude: solo esquemas athlete3*

      functions/         ← Claude: Edge Functions con prefijo a3-

      tests/             ← Claude: pgTAP (RLS, invariantes)

    docs/

      spec/  adr/  contracts/

    .github/workflows/

  2. Auditoría del proyecto Supabase "ATHLETE 3.0" (solo lectura)

  ┌──────────────────────┬──────────────────────────────────────────────────────────────────────────────────────────┐

  │       Aspecto        │                                        Resultado                                         │

  ├──────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────┤

  │ Postgres             │ 17.11, us-east-2                                                                         │

  ├──────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────┤

  │ Migraciones          │ 0                                                                                        │

  ├──────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────┤

  │ Esquema public       │ Vacío: 0 tablas, 0 funciones, 0 políticas                                                │

  ├──────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────┤

  │ athlete3             │ No existe                                                                                │

  ├──────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────┤

  │ auth.users           │ 0, sin triggers propios                                                                  │

  ├──────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────┤

  │ Edge Functions,      │ Ninguno                                                                                  │

  │ buckets, Realtime    │                                                                                          │

  ├──────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────┤

  │ Extensiones          │ pgcrypto, uuid-ossp, pg_stat_statements, supabase_vault                                  │

  ├──────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────┤

  │ Asesor de seguridad  │ 0 avisos                                                                                 │

  ├──────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────┤

  │ Privilegios por      │ anon y authenticated reciben todos los permisos (arwdDxtm) en cualquier tabla nueva de   │

  │ omisión de public    │ public. Es el comportamiento estándar de Supabase y el motivo principal para no usar     │

  │                      │ public.                                                                                  │

  └──────────────────────┴──────────────────────────────────────────────────────────────────────────────────────────┘

  3. Objetos del sistema anterior que podrían interferir

  Hoy no hay ningún objeto legado en el proyecto nuevo, así que no interfiere nada. El riesgo aparece si restauras el 

  respaldo de la v2 en este mismo proyecto. Lo que chocaría:

  ┌───────────────────────────────────────────────────────┬─────────────────────────────────────────────────────────┐

  │                     Objeto legado                     │                      Interferencia                      │

  ├───────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────┤

  │ Trigger on_auth_user_created en auth.users →          │ Se dispararía en cada registro de ATHLETE. Si falla,    │

  │ public.handle_new_user()                              │ bloquea el registro.                                    │

  ├───────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────┤

  │ 16 tablas y más de 14 vistas en public con            │ Nombres genéricos (profiles, workouts, exercises) que   │

  │ privilegios amplios por omisión                       │ confunden a los clientes y a los generadores de tipos   │

  ├───────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────┤

  │ Funciones public.es_admin y private.es_admin          │ Choque de nombres si ATHLETE usa private                │

  ├───────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────┤

  │ Edge Functions sugerir-carga, analizar-comida,        │ Mismo espacio de nombres a nivel de proyecto            │

  │ sugerir-menu                                          │                                                         │

  ├───────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────┤

  │ Secretos GEMINI_*, MODELO_URL                         │ Mismo espacio de nombres a nivel de proyecto            │

  ├───────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────┤

  │ supabase_migrations.schema_migrations                 │ El historial es único por proyecto: las 28 migraciones  │

  │                                                       │ legadas y las de ATHLETE se mezclarían                  │

  ├───────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────┤

  │ Usuarios de auth.users                                │ Se comparten: un usuario legado entraría a ATHLETE con  │

  │                                                       │ la misma contraseña                                     │

  └───────────────────────────────────────────────────────┴─────────────────────────────────────────────────────────┘

  Recomendación: restaura el respaldo de la v2 en otro lugar (Postgres local o en tu nube) para verificarlo, no en el

  proyecto ATHLETE. Si decides restaurarlo aquí, el aislamiento de la sección 4 está pensado para resistirlo.

  4. Cómo aislar athlete3

  1. Esquemas propios:

     - athlete3 contiene las tablas y RPC expuestas a la API.

     - athlete3_private contiene los helpers security definer y los triggers; no se expone.

  2. Permisos explícitos, sin heredar de public:

     - revoke all on schema athlete3 from public, anon

     - grant usage to authenticated

     - grant select/insert/update tabla por tabla

     - alter default privileges in schema athlete3 revoke all ... from anon, authenticated

     - anon no recibe nada.

  3. RLS enable y force en todas las tablas, con políticas separadas por operación y to authenticated. La regla base es

     user_id = (select auth.uid()).

  4. Exponer solo athlete3 en la Data API (Settings → API → Exposed schemas). Esto lo haces tú en el panel; no se

     configura por SQL. El cliente usa createClient(url, key, { db: { schema: 'athlete3' } }).

  5. Sin trigger en auth.users. El perfil se crea con una RPC idempotente, athlete3.bootstrap_profile(), al primer

     inicio de sesión. Así ATHLETE no depende de nada que viva en auth, y no choca con el trigger legado si algún día se

     restaura.

  6. Prefijos en lo que es global al proyecto: Edge Functions a3-*, secretos A3_*, buckets athlete3-*.

  7. Guarda en la CI: una prueba falla si alguna migración menciona public. o auth. (salvo auth.uid()), o si alguna

     tabla de athlete3 queda sin RLS.

  8. Roles para multiusuario sin rehacer nada: una tabla athlete3.memberships(user_id, role) con owner, athlete, coach o

     admin, y una función athlete3_private.has_role(). Sin JWT custom claims en el MVP.

  5. Discrepancias de las auditorías anteriores

  Ya no las puedo volver a comprobar, porque el proyecto no responde. Esto es lo que leí hoy en gymai-v2, antes de que

  desapareciera:

  Migraciones: 28 remotas frente a 26 locales

  - Faltan en el repo 25b_vistas_sin_cardio y 25c_participantes_y_calificacion_sin_cardio. Corrigen vistas para excluir

    el cardio, así que el esquema real no se reconstruye con el repo.

  - Las 19 a 26 tienen timestamps distintos entre el repo y el servidor (por ejemplo, 20260813230000 en el repo frente a

    20260814015640 en el servidor).

  - Implicación para el respaldo: si es un pg_dump, contiene el esquema real y tiene prioridad sobre el repo. Si solo

    tienes el repo, faltan las 25b y 25c.

  Cifras de referencia para verificar el respaldo

  ┌────────────────────────────────┬─────────────────────┬─────────────────────────────────────────────────────────┐

  │             Tabla              │        Filas        │                          Notas                          │

  ├────────────────────────────────┼─────────────────────┼─────────────────────────────────────────────────────────┤

  │ auth.users                     │ 14                  │ Una más que profiles: hay un usuario sin perfil         │

  │                                │                     │ (registro a medias o perfil borrado)                    │

  ├────────────────────────────────┼─────────────────────┼─────────────────────────────────────────────────────────┤

  │ profiles                       │ 13                  │ 1 admin, 0 demo, 12 dados de alta, 5 con consentimiento │

  ├────────────────────────────────┼─────────────────────┼─────────────────────────────────────────────────────────┤

  │ workouts                       │ 19                  │ 1 solo usuario, del 14 de septiembre al 28 de octubre   │

  │                                │                     │ de 2026                                                 │

  ├────────────────────────────────┼─────────────────────┼─────────────────────────────────────────────────────────┤

  │ workout_sets                   │ 391                 │ 6 sin RIR                                               │

  ├────────────────────────────────┼─────────────────────┼─────────────────────────────────────────────────────────┤

  │ predictions                    │ 166                 │ 38 cerradas con error_kg                                │

  ├────────────────────────────────┼─────────────────────┼─────────────────────────────────────────────────────────┤

  │ body_weights / body_measures / │ 21 / 9 / 12         │                                                         │

  │  sleep_logs                    │                     │                                                         │

  ├────────────────────────────────┼─────────────────────┼─────────────────────────────────────────────────────────┤

  │ nutrition_logs / meal_entries  │ 9 (5 no manuales) / │                                                         │

  │ / food_scans                   │  26 / 20            │                                                         │

  ├────────────────────────────────┼─────────────────────┼─────────────────────────────────────────────────────────┤

  │ swims / plan_targets /         │ 5 / 260 / 1         │                                                         │

  │ model_versions                 │                     │                                                         │

  ├────────────────────────────────┼─────────────────────┼─────────────────────────────────────────────────────────┤

  │ exercises / routines           │ 46 / 18 (2 propias) │                                                         │

  └────────────────────────────────┴─────────────────────┴─────────────────────────────────────────────────────────┘

  Sin explicar: la documentación de agosto dice que a la v2 se migraron "4 sesiones, 77 series" y que en la v1 había

  "318 series reales". En la v2 las sesiones empiezan el 14 de septiembre. Antes de dar por cerrado el sistema anterior,

  confirma si lo de agosto se borró a propósito.

  6. Modelo de datos inicial (athlete3)

  Es un núcleo de entrenamiento con base sólida. Lo marcado con [SPEC] se confirma cuando tenga la especificación.

  Convenciones de todas las tablas de usuario:

  - id uuid generado en el cliente (UUIDv7, ordenable por tiempo); hace innecesario el client_uid.

  - user_id uuid not null

  - created_at y updated_at (puestos por trigger)

  - deleted_at (borrado suave, para los tombstones de la sincronización)

  - revision bigint (de una secuencia, es el cursor de la sincronización)

  - Las fechas de calendario van en local_date date y la zona horaria en el perfil: esto evita de raíz el error de UTC

    de la v2.

  - Todo dato no medido lleva source (manual, estimated, imported, device), siguiendo el principio de la v2.

  ┌───────────────┬─────────────────────────────────────────────────────────────────────────────────────────────────┐

  │    Dominio    │                                             Tablas                                              │

  ├───────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────┤

  │ Identidad     │ profiles (nombre, sexo, fecha de nacimiento, estatura, timezone, unidades, preferences jsonb    │

  │               │ para el tema y otras opciones de interfaz), memberships                                         │

  ├─────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────┤

  │                 │ exercises (owner_id nulo = global; slug; kind fuerza, cardio, movilidad o acondicionamiento;  │

  │ Catálogo        │ measurement peso×reps, reps, tiempo o distancia×tiempo; músculo principal; patrón; equipo;    │

  │                 │ is_compound; load_increment_kg), muscle_groups                                                │

  ├─────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────┤

  │ Programación    │ programs, program_days, program_day_exercises (orden, series, rango de reps, ventana de RIR,  │

  │                 │ descanso, notas)                                                                              │

  ├─────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────┤

  │                 │ workout_sessions (program_day_id opcional, local_date, started_at, ended_at, status borrador  │

  │ Registro        │ o completada, RPE, notas), session_exercises, sets (set_type calentamiento, trabajo, drop o   │

  │                 │ al fallo; weight_kg, reps, rir, rpe, duration_s, distance_m)                                  │

  ├─────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────┤

  │ Cuerpo          │ body_weights, body_measurements (cintura, cuello, cadera, pecho, brazo, muslo)                │

  ├─────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────┤

  │ Bienestar       │ daily_checkins (sueño, energía, dolor muscular)                                               │

  │ [SPEC]          │                                                                                               │

  ├─────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────┤

  │ Nutrición       │ nutrition_days, meal_entries (con source)                                                     │

  │ [SPEC]          │                                                                                               │

  ├─────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────┤

  │ Metas [SPEC]    │ goals (tipo, objetivo, fecha)                                                                 │

  ├─────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────┤

  │ Recomendaciones │ recommendations inmutables (model_version, generated_at, for_date, inputs jsonb, clamped y su │

  │                 │  razón); la evaluación se calcula por vista o trigger, nunca se reescribe la predicción       │

  ├─────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────┤

  │ Sistema         │ athlete3_private.revision_seq, sync_state                                                     │

  └─────────────────┴───────────────────────────────────────────────────────────────────────────────────────────────┘

  Vistas derivadas (con security_invoker):

  - v_working_sets: el punto único que decide qué cuenta como serie de trabajo, igual que en la v2.

  - v_exercise_history, v_personal_records, v_weekly_volume.

  7. Contratos para Codex

  Fuente de verdad: packages/contracts (versión semántica y CHANGELOG). Codex no escribe SQL y yo no escribo interfaz.

  1. Conexión: EXPO_PUBLIC_SUPABASE_URL y la clave publicable, con el esquema athlete3.

  2. Autenticación:

     - Correo y contraseña, más recuperación por deep link con el esquema de Expo.

     - La sesión se guarda con el adaptador de almacenamiento recomendado para Expo (SecureStore tiene un límite de

       tamaño; va en la ADR-003).

     - Al iniciar sesión se llama a bootstrap_profile().

     - Si más adelante se agrega inicio de sesión social en iOS, Apple exige incluir Sign in with Apple.

  3. Esquemas Zod de cada entidad (lectura, creación y actualización). Los tipos de la base salen de supabase gen types 

     --schema athlete3, y los de Zod se comprueban contra ellos en la CI.

  4. Repositorios (packages/data), la interfaz que Codex consume:

  interface WorkoutRepository {

    startSession(input: StartSession): Promise<Session>

    addSet(sessionExerciseId: UUID, input: NewSet): Promise<SetRecord>

    completeSession(id: UUID): Promise<Session>

    listSessions(range: DateRange): Promise<SessionSummary[]>

    observeSession(id: UUID): Observable<SessionDetail>

  }

  // ExerciseRepository, ProgramRepository, BodyRepository, ProfileRepository …

     Son local-first: escriben en SQLite (expo-sqlite) y el motor de sincronización sube los cambios. La interfaz nunca

     llama a Supabase directamente.

  5. Sincronización:

     - athlete3.sync_push(changes jsonb) aplica los cambios con concurrencia optimista por base_revision y devuelve los

       conflictos.

     - athlete3.sync_pull(since bigint) devuelve los cambios con revision > since, incluidos los tombstones.

     - Está documentada como máquina de estados.

  6. Errores: un catálogo de códigos estables (A3_CONFLICT, A3_VALIDATION, A3_UNAUTHORIZED, A3_RATE_LIMIT…) con su mapeo

     para que la interfaz muestre mensajes.

  7. Lógica de dominio (packages/domain): e1RM, volumen, récords, ventana de RIR, cálculos del plan. Son funciones puras

     que la app usa sin conexión. Si una Edge Function necesita la misma lógica, comparte el mismo código: por cómo se

     empaquetan las Edge Functions, hay que comprobarlo en la ADR-005.

  8. Protocolo de cambios: todo cambio de contrato va en un PR con la etiqueta contract-change, revisión de los dos y

     actualización del CHANGELOG y de los datos de prueba compartidos para las pruebas de integración.

  8. Plan por tareas

  Leyenda: ⛔ bloqueante · ∥ paralelizable · 👤 la haces tú · 🔒 necesita tu aprobación antes de ejecutarse

  Fase 0: cerrar el sistema anterior (no bloquea el diseño, sí cualquier eliminación)

  ┌────────┬─────────────────────────────────────────────────────────────────────────────┬──────────────────────────┐

  │   Id   │                                    Tarea                                    │  Criterio de aceptación  │

  ├────────┼─────────────────────────────────────────────────────────────────────────────┼──────────────────────────┤

  │ L0.1   │ Averiguar el estado real de gymai-v2 (otra organización, eliminado o        │ Estado documentado       │

  │ 👤⛔   │ pausado)                                                                    │                          │

  ├────────┼─────────────────────────────────────────────────────────────────────────────┼──────────────────────────┤

  │ L0.2   │ Exportar el JSON de la app v2 desde el teléfono                             │ Archivo guardado         │

  │ 👤∥    │                                                                             │                          │

  ├────────┼─────────────────────────────────────────────────────────────────────────────┼──────────────────────────┤

  │ L0.3 ∥ │ Te escribo el script de verificación del respaldo: conteos, sumas de        │ Coincide con la tabla de │

  │        │ control de workout_sets y predictions, comprobación de las 25b y 25c        │  la sección 5            │

  ├────────┼─────────────────────────────────────────────────────────────────────────────┼──────────────────────────┤

  │ L0.4   │ Restaurar el respaldo fuera del proyecto ATHLETE y correr L0.3              │ Informe en verde         │

  │ 👤     │                                                                             │                          │

  └────────┴─────────────────────────────────────────────────────────────────────────────┴──────────────────────────┘

  Fase 1: cimientos del repo (sin base de datos)

  ┌──────┬───────────────────────────────────────────────────────────────────────────┬──────────┬───────────────────┐

  │  Id  │                                   Tarea                                   │ Depende  │   Criterio de     │

  │      │                                                                           │    de    │    aceptación     │

  ├──────┼───────────────────────────────────────────────────────────────────────────┼──────────┼───────────────────┤

  │ R1   │ Estructura del monorepo (pnpm workspaces), README, .gitignore y           │ —        │ Clona e instala   │

  │ 🔒   │ .env.example sin secretos                                                 │          │ sin errores       │

  ├──────┼───────────────────────────────────────────────────────────────────────────┼──────────┼───────────────────┤

  │      │ ADRs: 001 esquema athlete3, 002 local-first con SQLite y sincronización   │          │ Revisadas por ti  │

  │ R2 ∥ │ por revisión, 003 sesión de autenticación en Expo, 004 UUIDv7 en el       │ R1       │ y por Codex       │

  │      │ cliente, 005 código compartido con las Edge Functions                     │          │                   │

  ├──────┼───────────────────────────────────────────────────────────────────────────┼──────────┼───────────────────┤

  │ R3   │ Subir la especificación a docs/spec/                                      │ —        │ Está en el repo   │

  │ 👤∥  │                                                                           │          │                   │

  ├──────┼───────────────────────────────────────────────────────────────────────────┼──────────┼───────────────────┤

  │ R4 ∥ │ CI: lint, typecheck y pruebas; supabase start y supabase test db en       │ R1       │ El pipeline corre │

  │      │ GitHub Actions, que sí tiene Docker                                       │          │  en verde vacío   │

  ├──────┼───────────────────────────────────────────────────────────────────────────┼──────────┼───────────────────┤

  │ R5   │ Instalar Docker u OrbStack en tu Mac para la base local (hoy no está      │ —        │ supabase start    │

  │ 👤∥  │ instalado)                                                                │          │ levanta           │

  └──────┴───────────────────────────────────────────────────────────────────────────┴──────────┴───────────────────┘

  Fase 2: esquema (todo se valida primero en local; aplicarlo en remoto requiere tu aprobación 🔒)

  ┌─────┬──────────────────────────────────────────────────┬──────────┬────────────────────────────────────────────┐

  │ Id  │                      Tarea                       │ Depende  │      Criterio de aceptación y pruebas      │

  │     │                                                  │    de    │                                            │

  ├─────┼──────────────────────────────────────────────────┼──────────┼────────────────────────────────────────────┤

  │     │ 0001_schemas_y_permisos: athlete3,               │          │ pgTAP: anon sin acceso a nada;              │

  │ S1  │ athlete3_private, revocaciones y privilegios por │ R4, R5   │ authenticated solo con usage                │

  │     │  omisión                                         │          │                                             │

  ├─────┼──────────────────────────────────────────────────┼──────────┼─────────────────────────────────────────────┤

  │ S2      │ 0002_infra: secuencia de revisión y triggers   │ S1       │ Pruebas del trigger                       │

  │         │ de updated_at y revision                       │          │                                           │

  │ S3      │ 0003_identidad: profiles, memberships,      │ S2             │ RLS: A no ve a B; bootstrap es         │

  │         │ bootstrap_profile()                         │                │ idempotente                            │

  ├─────────┼─────────────────────────────────────────────┼────────────────┼────────────────────────────────────────┤

  │ S4 ∥    │ 0004_catalogo y semilla de ejercicios         │ S2             │ Ejercicios globales en solo lectura; │

  │         │ globales                                      │                │  los propios solo para su dueño      │

  ├─────────┼───────────────────────────────────────────────┼────────────────┼──────────────────────────────────────┤

  │ S5      │ 0005_programas                                │ S4             │ RLS y FK (program_day ajeno →        │

  │         │                                               │                │ rechazado)                           │

  ├─────────┼───────────────────────────────────────────────┼────────────────┼──────────────────────────────────────┤

  │         │ 0006_registro: sesiones, ejercicios de sesión │                │ RLS; restricciones (reps ≥ 0, rir    │

  │ S6      │  y series                                     │ S4             │ entre 0 y 10); una serie no puede    │

  │         │                                               │                │ apuntar a una sesión ajena           │

  ├─────────┼───────────────────────────────────────────────┼────────────────┼──────────────────────────────────────┤

  │ S7 ∥    │ 0007_cuerpo                                   │ S3             │ RLS y unicidad por local_date        │

  ├─────────┼───────────────────────────────────────────────┼────────────────┼──────────────────────────────────────┤

  │ S8      │ 0008_vistas: v_working_sets y derivadas       │ S6             │ Cardio y calentamiento excluidos; el │

  │         │                                               │                │  valor coincide con packages/domain  │

  ├─────────┼───────────────────────────────────────────────┼────────────────┼──────────────────────────────────────┤

  │ S9      │ 0009_sync: sync_push y sync_pull              │ S2, S6, S7     │ Pruebas de conflicto, tombstone y    │

  │         │                                               │                │ reintento idempotente                │

  ├─────────┼───────────────────────────────────────────────┼────────────────┼──────────────────────────────────────┤

  │ S10     │ Nutrición, bienestar, metas, recomendaciones  │ Especificación │ Se define después                    │

  │ [SPEC]  │                                               │                │                                      │

  ├─────────┼───────────────────────────────────────────────┼────────────────┼──────────────────────────────────────┤

  │         │ Guardas de la CI (ninguna migración toca      │                │                                      │

  │ S5         │ 0005_programas                                                                                        │ S4             │ RLS y FK (program_day ajeno → rechazado)                                                       │

  ├────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────┼────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────┤

  │ S6         │ 0006_registro: sesiones, ejercicios de sesión y series                                                │ S4             │ RLS; restricciones (reps ≥ 0, rir entre 0 y 10); una serie no puede apuntar a una sesión ajena │

  ├────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────┼────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────┤

  │ S7 ∥       │ 0007_cuerpo                                                                                           │ S3             │ RLS y unicidad por local_date                                                                  │

  ├────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────┼────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────┤

  │ S8         │ 0008_vistas: v_working_sets y derivadas                                                               │ S6             │ Cardio y calentamiento excluidos; el valor coincide con packages/domain                        │

  ├────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────┼────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────┤

  │ S9         │ 0009_sync: sync_push y sync_pull                                                                      │ S2, S6, S7     │ Pruebas de conflicto, tombstone y reintento idempotente                                        │

  ├────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────┼────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────┤

  │ S10 [SPEC] │ Nutrición, bienestar, metas, recomendaciones                                                          │ Especificación │ Se define después                                                                              │

  ├────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────┼────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────┤

  │ S11        │ Guardas de la CI (ninguna migración toca public o auth; RLS en todo) y asesor de seguridad sin avisos │ S1             │ La CI falla ante una violación                                                                 │

  └────────────┴───────────────────────────────────────────────────────────────────────────────────────────────────────┴────────────────┴────────────────────────────────────────────────────────────────────────────────────────────────┘

  Fase 3: contratos y lógica (en paralelo con la fase 2 a partir de S3)

  ┌──────┬─────────────────────────────────────────────────────────────────────────────────────┬────────────┬───────────────────────────────────────────────────────┐

  │  Id  │                                        Tarea                                        │ Depende de │                Criterio de aceptación                 │

  ├──────┼─────────────────────────────────────────────────────────────────────────────────────┼────────────┼───────────────────────────────────────────────────────┤

  │ C1   │ packages/contracts: Zod, tipos generados y prueba de paridad Zod ↔ tipos de la base │ S3–S7      │ Typecheck y prueba de paridad en verde                │

  ├──────┼─────────────────────────────────────────────────────────────────────────────────────┼────────────┼───────────────────────────────────────────────────────┤

  │ C2 ∥ │ packages/domain: e1RM, volumen, récords, ventana de RIR                             │ R1         │ Pruebas unitarias con valores de referencia           │

  ├──────┼─────────────────────────────────────────────────────────────────────────────────────┼────────────┼───────────────────────────────────────────────────────┤

  │ C3   │ Catálogo de errores y especificación de la máquina de sincronización                │ S9         │ Revisado por Codex                                    │

  ├──────┼─────────────────────────────────────────────────────────────────────────────────────┼────────────┼───────────────────────────────────────────────────────┤

  │ C4   │ Publicar la v0.1.0 del contrato                                                     │ C1, C3     │ Codex puede empezar a integrar contra datos simulados │

  └──────┴─────────────────────────────────────────────────────────────────────────────────────┴────────────┴───────────────────────────────────────────────────────┘

  Fase 4: persistencia y sincronización (packages/data)

  ┌─────┬──────────────────────────────────────────────────────────┬────────────┬─────────────────────────────────────────────────────────────────────────────────────────────────┐

  │ Id  │                          Tarea                           │ Depende de │                                     Criterio de aceptación                                      │

  ├─────┼──────────────────────────────────────────────────────────┼────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────┤

  │ D1  │ Esquema SQLite local y migraciones locales               │ C1         │ Pruebas en Node con better-sqlite3                                                              │

  ├─────┼──────────────────────────────────────────────────────────┼────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────┤

  │ D2  │ Repositorios sobre SQLite                                │ D1         │ Contrato completo, pruebas unitarias                                                            │

  ├─────┼──────────────────────────────────────────────────────────┼────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────┤

  │ D3  │ Motor de sincronización: outbox, push, pull y conflictos │ D2, S9     │ Escenarios: sin conexión, dos dispositivos, borrado sin conexión que no reaparece, mil sesiones │

  ├─────┼──────────────────────────────────────────────────────────┼────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────┤

  │ D4  │ Prueba de integración con un Supabase real en la CI      │ D3, R4     │ Ciclo completo en verde                                                                         │

  └─────┴──────────────────────────────────────────────────────────┴────────────┴─────────────────────────────────────────────────────────────────────────────────────────────────┘

  Qué corre en paralelo

  - Ya, sin esperar nada: L0.x, R3, R5.

  - Tras R1: R2, R4 y C2 en paralelo.

  - Tras S2: S3, S4 y S7 en paralelo; luego S5 y S6.

  - Codex puede empezar navegación, design system y pantallas con datos simulados desde R1, e integrar desde C4.

  - Ruta crítica: R1 → R4 → S1 → S2 → S6 → S9 → C3 → D3 → D4.

  ---

  Lo que necesito que decidas

  1. Sobre gymai-v2 (B1): ¿lo eliminaste tú, o lo moviste? Mientras no esté verificado, recomiendo no eliminar nada más: ni el código v2 publicado ni el localStorage del teléfono.

  2. ¿Confirmas usar el proyecto "ATHLETE 3.0" (npdrjhbkilicuieecbgd) como base, con el esquema athlete3, ya que el de Diario Gym ya no está disponible? Y el respaldo de la v2, ¿se restaura fuera de este proyecto, como recomiendo?

  3. La especificación de ChatGPT en docs/spec/.

  4. Autorización para R1, el primer commit en el repo ATHLETE: solo estructura y documentación, sin base de datos.

  5. Docker u OrbStack en tu Mac (R5).