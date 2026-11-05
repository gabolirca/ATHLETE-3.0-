# Informe de seguridad — Backend ATHLETE 3.0

**Estado:** Implementado y probado en entorno LOCAL. Nada aplicado a proyectos remotos.
**Autor:** Claude · **Fecha:** 3 de noviembre de 2026
**Alcance:** `supabase/migrations/*`, `packages/data`, `packages/contracts`.

## 1. Principios

1. **El servidor es la autoridad.** Toda regla de seguridad se aplica en Postgres (RLS, privilegios,
   restricciones, triggers), no en la app. La validación del cliente solo mejora la experiencia.
2. **Identidad = `auth.uid()`** del JWT verificado por Supabase. Ningún `user_id` del cliente se acepta.
3. **Mínimo privilegio.** `anon` no tiene acceso a nada de ATHLETE 3.0; `authenticated` solo SELECT/INSERT/UPDATE
   sobre sus filas; nadie borra físicamente.
4. **Sin ruta privilegiada.** `sync_push`/`sync_pull` son `SECURITY INVOKER`: pasan por RLS y triggers igual que
   cualquier escritura directa. Solo dos funciones son `SECURITY DEFINER` (límite de frecuencia y consulta del propio
   rol), ambas con `search_path` vacío y sin parámetros de identidad.

## 2. Controles implementados

| # | Requisito | Control | Prueba |
|---|---|---|---|
| 1 | RLS habilitado y **forzado** en todas las tablas | `enable` + `force row level security` en todas las tablas de `athlete3` y `athlete3_private`; la migración 0900 **falla** si falta en alguna | `security-baseline.test.ts` |
| 2 | Cada usuario solo ve/modifica lo suyo | Políticas `select/insert/update` con `user_id = (select auth.uid())` | `isolation.test.ts` |
| 3 | Nadie modifica su rol | Roles en `athlete3_private.user_roles` sin GRANT a `authenticated`; el perfil no tiene columna de rol | `isolation.test.ts › roles` |
| 4 | Políticas para lectura, inserción, actualización y eliminación | Select/insert/update por propietario; **DELETE sin privilegio ni política** (borrado lógico vía UPDATE); 0900 falla si `authenticated` puede borrar | `security-baseline`, `isolation` |
| 5 | No confiar en `user_id` del cliente | Trigger `tg_synced_row`: asigna `auth.uid()`, rechaza otro valor (`FORBIDDEN`), `user_id` e `id` inmutables; `sync_push` rechaza campos gestionados por el servidor | `isolation`, `validation` |
| 6 | Validación en servidor | CHECK de rangos/enum/pasos de 0.5, fecha local = zona del inicio, coherencia de natación/FC, referencias existentes; lote estructuralmente validado; tamaño de payload ≤ 32 KiB | `validation.test.ts` |
| 7 | Restricciones, índices y FK | **FK compuestas `(parent_id, user_id)`**: un hijo no puede colgarse de un padre ajeno; índices `(user_id, change_seq)` y de historial | `isolation`, `sync` |
| 8 | Sesiones y tokens | Supabase Auth (JWT 1 h, refresh rotativo); tokens solo en SecureStore; `signOut({scope:'local'})`; renovación con margen; revocación → cierre local | `auth-transport.test.ts` |
| 9 | Acceso horizontal | RLS + FK compuestas + política restrictiva de visibilidad de ejercicios + `mutation_id` ajeno no revela resultados | `isolation.test.ts` |
| 10 | Operaciones privilegiadas | Esquema privado no expuesto; helpers sin EXECUTE para PUBLIC/anon; 0900 verifica que ninguna función sea ejecutable por `anon` y que toda `SECURITY DEFINER` fije `search_path` | `security-baseline` |
| 11 | Sin `service_role` en el cliente | `assertPublicKey` rechaza `sb_secret_*` y JWT con rol ≠ `anon`; `loadEnvironment` también | `config-security.test.ts` |
| 12 | Sin contraseñas en SQLite / almacenamiento inseguro | El esquema local no tiene columnas de credenciales; el `AuthService` no persiste contraseñas; sesión en SecureStore | revisión de código + `auth-transport` |
| 13 | Sin datos sensibles en logs | Los adaptadores solo registran eventos y códigos; `safeLogger`/`redact` eliminan tokens, JWT, claves, correos y payloads | `config-security`, `auth-transport` |
| 14 | Límites de frecuencia | Servidor: `sync_push` 120/min, `sync_pull` 240/min, `ensure_profile` 30/min por usuario. Auth: `config.toml` (`sign_in_sign_ups`=20/5 min por IP, correo 2/h, `max_frequency`=60 s). Cliente: 1 recuperación/min por correo | `sync.test.ts › límite`, `auth-transport` |
| 15 | Pruebas negativas | 69 pruebas de base de datos, mayoría negativas; verificadas con sabotaje deliberado (una política abierta y un trigger debilitado hacen fallar la suite) | ver §5 |

Adicionales:
- **Control optimista**: todo UPDATE debe traer la revisión actual (incluso por PostgREST directo). Impide
  sobrescribir un registro nuevo con datos viejos.
- **Tombstones definitivos**: un registro eliminado no se puede editar ni "resucitar".
- **Errores seguros**: `sync_push` devuelve código + mensaje genérico; nunca SQL, nombres internos ni stack.
  El cliente tampoco propaga mensajes del servidor (`fromSupabaseError`).
- **Sin enumeración de cuentas**: registro con correo existente y recuperación de contraseña responden igual.
- **Producción bloqueada en código** hasta aprobar su `project ref` (`APPROVED_PRODUCTION_PROJECT_REF = null`).
- **Una base SQLite por usuario** (`localDatabaseName`) y comprobación de propietario al abrir.

## 3. Modelo de amenazas

| Amenaza | Vector | Mitigación | Riesgo residual |
|---|---|---|---|
| Lectura de datos ajenos | PostgREST con JWT propio y filtros por id ajeno | RLS forzado por `auth.uid()` | Bajo |
| Escritura en nombre de otro | `user_id` falso en INSERT / payload | Trigger + RLS WITH CHECK + lista blanca de columnas | Bajo |
| Colgar datos de recursos ajenos | `session_id` de otro usuario | FK compuesta con `user_id` | Bajo |
| Escalada de rol | UPDATE de perfil / INSERT en roles | Roles en esquema privado sin GRANT | Bajo |
| Abuso de funciones internas | Llamar helpers privados | No expuestos en Data API; EXECUTE revocado a PUBLIC/anon; sin parámetros de identidad | Bajo |
| Inyección SQL en sync | `entity`/claves del payload | Lista blanca de entidades; columnas validadas contra el catálogo y citadas con `quote_ident`/`format('%I')`; valores vía `jsonb_populate_record` | Bajo |
| Pérdida de datos por sync | Respuestas viejas, reintentos, dos dispositivos | Revisión por registro, idempotencia por `mutation_id`, `defer_pending`, conflictos explícitos | Bajo |
| Robo de tokens en el dispositivo | Malware / backup | SecureStore (Keychain/Keystore); refresh rotativo; `signOut` local | Medio: depende del SO |
| Acceso a datos locales | Dispositivo robado o con root | SQLite en el sandbox de la app; **cifrado SQLCipher previsto, aún no integrado** | **Medio** hasta integrar SQLCipher |
| Fuerza bruta de login | Endpoint de Auth | Rate limits de Supabase Auth; política de contraseña | Medio: sin CAPTCHA ni MFA en el MVP |
| Exposición de clave privilegiada | Build de la app | Validación de clave al arrancar; plantillas `.env` sin secretos | Bajo |
| DoS por un usuario | Lotes enormes / bucles | Lote ≤ 100, payload ≤ 32 KiB, límites por minuto | Medio: sin límite por IP en las RPC |
| Mezcla entre ambientes | URL/clave equivocada | Validación por ambiente (local ↔ host local, https remoto, prod bloqueada) | Bajo |
| Interferencia con sistemas legados | Objetos en `public`, triggers en `auth.users` | Solo `athlete3*`; 0900 y pruebas verifican que no hay nada en `public` ni triggers en `auth.users` | Bajo (verificado solo en local) |

## 4. Riesgos residuales y pendientes de seguridad

1. **Cifrado de la base local**: el adaptador admite `encryptionKey` (SQLCipher), pero requiere el config plugin de
   expo-sqlite (`useSQLCipher: true`) y generar/guardar la clave en SecureStore. Tarea compartida con Codex.
2. **Validación real de Supabase**: las pruebas usan Postgres 16 con un *stub* de `auth` que replica la semántica de
   `auth.uid()`. Falta ejecutarlas contra `supabase start` (Postgres 17, PostgREST, GoTrue reales). Requiere Docker.
3. **Pruebas de Auth reales** (registro, confirmación, expiración de JWT en PostgREST): preparadas por puertos con
   dobles; no ejecutadas contra GoTrue.
4. **Rate limit de RPC por IP** y protección anti-bot (CAPTCHA) en Auth: no configurados.
5. **Retención**: `sync_mutations` y `rate_limit_buckets` crecen sin purga; definir política (p. ej. 90 días) y job.
6. **Fotografías corporales** (Storage privado + políticas por usuario): fuera de esta fase.
7. **MFA**: no habilitado en el MVP.
8. **Dependencias**: la app de Codex reporta 32 vulnerabilidades transitivas (Expo SDK 54); este paquete añade
   `@supabase/supabase-js` y `pg` (solo pruebas). `npm audit` en esta rama: 0 vulnerabilidades.
9. **Despliegue**: el historial de migraciones del proyecto remoto debe reconciliarse antes de cualquier `db push`
   (schema-isolation §8). No se ha tocado.
