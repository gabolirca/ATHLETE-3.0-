# MUNDO FIT · App del gimnasio

App móvil (iOS y Android) para los socios de **Mundo Fit**, gimnasio con varias sucursales. La desarrolla **LIRCA**
(Gabo) en sociedad con el dueño del gimnasio: nosotros operamos la app y sus actualizaciones; el gimnasio no la edita.

> Este repo nació como copia de **ATHLETE 3.0**, producto propio de LIRCA. Desde el 12-nov-2026 los dos repos
> **se separan**: Mundo Fit tiene requerimientos propios. Un cambio de Mundo Fit solo pasa a ATHLETE si Gabo lo decide
> (ver [ADR-0005](docs/decisions/0005-mundo-fit-y-athlete.md)).

---

## 1. Estado actual (lo que ya funciona)

| Área | Qué hay | Detalle |
|---|---|---|
| Entrenamiento | Rutinas de fuerza, sesiones guiadas, series/RIR, descanso, récords, "la vez pasada", carga sugerida | `frontend/mobile/app/workout`, `shared/domain` |
| Modo híbrido | Programas por semana con bloques (calentamiento, circuito por rondas, AMRAP, EMOM, por tiempo) y plantillas | `shared/domain/src/templates` |
| Cardio y cuerpo | Carrera, bici, remo, natación; peso y medidas; metas corporales | |
| Progreso | Racha, volumen por músculo, carga semanal (sRPE), calificación de sesión | |
| Nutrición | Registro de comidas, meta diaria, plan provisional (Mifflin-St Jeor), **plan SMAE** por tiempos de comida, foto de comida con IA (sin llaves aún) | [modo-nutriologo.md](docs/product/modo-nutriologo.md) |
| Profesionales | **Modo nutriólogo** (asigna plan SMAE) y **modo coach** (asigna programas, ve progreso, comenta), con vínculo por código y alcance separado | [modo-coach.md](docs/product/modo-coach.md) |
| Cuenta y nube | Inicio de sesión por código al correo, sincronización offline-first, datos cifrados en el teléfono | [ADR-0003](docs/decisions/0003-persistencia-y-sincronizacion.md) |
| Marca | Logos, colores (negro + rojo), nombre MUNDO FIT, "by LIRCA" | `frontend/mobile/assets/brand` |

**Pendientes conocidos:** SMTP propio para que cualquier correo pueda registrarse (hoy solo miembros del equipo de
Supabase), llaves de IA de la foto de comida (se va a quitar, ver §2), cuenta de Apple Developer y Google Play.

---

## 2. Requerimientos de Mundo Fit (levantamiento del 11-nov-2026)

Estado: **en análisis, nada implementado todavía.** Cada punto trae lo que implica técnicamente.

| # | Requerimiento | Qué implica |
|---|---|---|
| R1 | **3 sucursales**: la información del gym cambia según la sede | Entidad nueva `sede` (dirección, horario, teléfono/WhatsApp, nutriólogo, fotos, avisos). Todo el contenido depende de la sede del socio. |
| R2 | El socio ve **en qué sede está inscrito** y su plan. **Nada editable** en la app | Entidad `membresía` (socio, sede, plan, vigencia). Solo lectura en la app; la cargamos nosotros (ver dependencia D1). |
| R3 | **Promociones por constancia** (ej. 3 meses seguidos → 10 % el siguiente mes o una visita gratis), sin importar la sucursal | Motor de reglas en el servidor sobre meses pagados/asistencia; cupón o QR que valida recepción. Depende de D1. |
| R4 | El socio ve en su **perfil cuándo le toca pagar** | Fecha de vencimiento de la membresía (R2). |
| R5 | **Notificación de cumpleaños** ("Feliz cumpleaños te desea Mundo Fit") | Fecha de nacimiento en el perfil (con consentimiento), notificaciones push desde el servidor con tarea programada. Requiere cuenta de Apple Developer (D3). |
| R6 | **Logo animado** tipo Duolingo: el MF "se pone mamado" | Animación de marca (Lottie o Rive) hecha por diseño; la app la reproduce en logros (racha, récord). |
| R7 | **Modelo de pago**: el plan gratis solo da rutinas preestablecidas; el socio **no debe sentir que paga** inscripción + mensualidad + nutri + app | Recomendación: la app va **incluida en la membresía** (sin cobro dentro de la app). Lo que desbloquea cada socio sale de su plan del gym (R2). Ver §3. |
| R8 | **Panel del dueño**: a qué hora llegan, edades, buzón de sugerencias (el buzón se envía desde la app del socio) | Datos agregados y anónimos de asistencia (D1) y edad (R5). Mejor como panel **web**. Rol `dueño` en la base. |
| R9 | Compartir el entrenamiento **más instagrameable**: foto de la persona con el resumen como marca de agua | Cámara + composición de imagen (ya usamos `react-native-view-shot`) con logo, sede y ejercicios. |
| R10 | **Coaches con rutinas personalizadas** → plan Pro | Ya existe el modo coach; falta atarlo al plan del socio (R7). |
| R11 | **Aforo en tiempo real**: cuánta gente hay, para decidir si ir | Necesita registro de entradas (D1). Mostrar rangos ("poca / media / mucha gente") y no números exactos. |
| R12 | Nutrición: **solo el contacto del nutriólogo** de la sede; se **quita el escáner** de comida | Tarjeta del nutriólogo + plan asignado (lógica actual del modo nutriólogo). Se queda el **registro manual** de comidas (kcal, proteína, carbos, grasa) con el total del día. Se quita la foto con IA. |
| R13 | **Botón de WhatsApp** al nutriólogo para agendar cita | Enlace `wa.me/<número>?text=...` con mensaje prellenado; el número vive en la sede (R1). |
| R14 | UX/UI: **máximo 4 toques** para cualquier acción; para todas las edades, más limpio | Auditoría de flujos, menos pestañas, texto más grande, menos opciones visibles. Ver §3. |
| R15 | **Quitar natación (alberca)**; el entrenamiento híbrido se queda | Ocultar natación del catálogo, cardio y plantillas en esta app. |

### Decisiones del 12-nov-2026

- **Lanzamiento: 1 de enero de 2027**, con la app al 100 %.
- **3 sedes.**
- **Escala objetivo: 10,000 socios** sin caídas (ver §4, Escalabilidad).
- **Publica LIRCA** en App Store y Google Play.
- **Modelo de pago:** la app va incluida en la membresía; el plan del gym decide qué desbloquea (ver §3).
- **Acceso al gym por reconocimiento facial.** El sistema muestra un ID al entrar. El dueño nos dará acceso a ese sistema;
  la integración va **al final**. Mientras tanto, las membresías se cargan desde nuestro panel.
- **Equipo:** el colaborador nuevo lleva el **front** (empezando por simplificar el inicio, que hoy se ve cargado).
  Gabo y Claude llevan backend, datos, panel de administración e integraciones; el rediseño del inicio se acuerda entre los tres.

### Dependencias que hay que resolver antes de construir

- **D1 · De dónde salen los datos del gimnasio.** Membresías, pagos y entradas alimentan R2, R3, R4, R8 y R11.
  El gym usa **reconocimiento facial** (sistema aún no identificado; el dueño dará acceso). Opciones:
  1. integrarnos con su sistema (API o exportación diaria);
  2. registrar la entrada en la app con un **QR en recepción** y que recepción capture los pagos en un panel nuestro;
  3. importar un CSV periódico.
- **D2 · Panel de administración.** Si "nada es editable en la app", alguien carga sedes, planes, promociones y
  contactos. Propuesta: un panel web para LIRCA (y para el dueño, con R8).
- **D3 · Cuentas de tienda (a nombre de LIRCA).** Apple Developer Program (99 USD/año) y Google Play (25 USD, único).
  Como organización, Apple pide un número D-U-N-S y una empresa constituida, y el trámite puede tardar semanas:
  **iniciarlo ya**. Como persona física es inmediato, pero en la tienda aparece el nombre de la persona.
- **D4 · Privacidad.** Fecha de nacimiento, asistencia y edad son datos personales: aviso de privacidad (LFPDPPP),
  consentimiento en la app, y el dueño solo ve datos agregados.
- **D5 · Correo.** SMTP propio con dominio verificado para que cualquier socio pueda registrarse.

### Orden propuesto (para discutir)

1. **Base Mundo Fit:** sedes y membresía de solo lectura (R1, R2, R4), nutrición simplificada con WhatsApp
   (R12, R13), quitar natación y escáner (R12, R15), simplificación de UX (R14) y planes por membresía (R7, R10).
2. **Asistencia:** entrada con QR (o integración), aforo (R11), constancia y promociones (R3), cumpleaños con push (R5).
3. **Dueño y marca:** panel del dueño y buzón (R8), compartir con foto (R9), logo animado (R6).

---

## 3. Criterios de producto

- **Todo lo del gym es de solo lectura en la app.** Sedes, planes, precios, promociones y contactos los administra LIRCA.
- **La app no cobra.** Viene con la membresía; el plan del gym decide qué desbloquea:
  - **Básico:** rutinas preestablecidas, registro y progreso.
  - **Pro:** rutinas personalizadas por un coach y plan del nutriólogo.
  - Los nombres y el reparto final los define el dueño.
- **4 toques máximo** para registrar un entrenamiento, ver cuándo pagar, ver el aforo o escribirle al nutriólogo.
  Cada pantalla nueva se revisa contra esa regla.
- **Funciona sin señal** (gyms en sótano): el entrenamiento se guarda en el teléfono y se sincroniza después.

---

## 4. Arquitectura

```
frontend/                  LO QUE VE EL SOCIO
  mobile/                  App Expo (React Native + TypeScript + Expo Router)
backend/                   SERVIDOR
  supabase/                Migraciones SQL, Edge Functions y pruebas de base (RLS, sync)
shared/                    CÓDIGO QUE USAN LOS DOS (paquetes @athlete/*)
  contracts/               Contratos Zod: la forma de los datos (versionados: CONTRACTS_VERSION)
  domain/                  Lógica pura: fuerza, cardio, SMAE, plantillas, analítica (sin I/O)
  data/                    SQLite local cifrado, outbox y motor de sincronización, adaptadores de Supabase
docs/                      Decisiones (ADR), arquitectura, contratos, producto y legal
config/environments/       Plantillas .env por ambiente (sin secretos)
```

**¿Dónde trabajo?** Pantallas y estilos → `frontend/mobile` (`app/` son las pantallas, `src/` los componentes).
Tablas, permisos y funciones del servidor → `backend/supabase`. Si cambias la forma de un dato, toca `shared/contracts`
y avisa: afecta a los dos lados.

- **Offline-first:** la app escribe en SQLite y una cola (outbox) sube los cambios con `sync_push`; baja con `sync_pull`.
- **Supabase:** todo en el esquema `athlete3` con **RLS forzado**; helpers en `athlete3_private`. Las funciones de
  profesionales (`pro_*`, `coach_*`) son `SECURITY DEFINER` y validan rol y vínculo por dentro.
- **Contratos versionados:** si cambia la forma de los datos, sube `CONTRACTS_VERSION` (y el chequeo en
  `frontend/mobile/src/data/OfficialTrainingProvider.tsx`), se registra en `shared/contracts/CHANGELOG.md` y va con su migración.
- Más detalle: [ADR-0002 arquitectura](docs/decisions/0002-arquitectura.md), [modelo de datos](docs/architecture/data-model-athlete3.md),
  [seguridad](docs/architecture/security.md), [pruebas](docs/architecture/testing.md).

### Escalabilidad (objetivo: 10,000 socios)

- La app lee y escribe en el teléfono y sincroniza en segundo plano, así que el servidor recibe poco tráfico.
  Cada consulta de sync filtra por usuario con índice `(user_id, change_seq)` y hay límites de frecuencia por usuario.
- **Supabase Pro** (25 USD/mes) cubre 100,000 usuarios activos al mes, 8 GB de base y 250 GB de transferencia.
  Estimación: ~1 MB por socio activo al año, unos 5 GB al año con 10,000 socios.
- Antes del lanzamiento:
  - **proyecto de producción separado** del de desarrollo;
  - plan Pro con respaldos diarios;
  - SMTP propio con volumen suficiente (un arranque con miles de registros el mismo día);
  - **prueba de carga** (cientos de sincronizaciones simultáneas).
- El aforo y los paneles leen tablas resumidas, no recorren el historial completo en cada consulta.

### Proyectos y nombres

| | Valor |
|---|---|
| Repo | `gabolirca/Mundo_Fit` |
| Supabase (desarrollo) | `hdmtawljiwqsccxfungr` (cuenta de Mundo Fit) |
| Bundle ID / package | `com.atheletsoftliirca.mundofit` |
| Scheme (login) | `mundofit://auth/callback` |

Los nombres internos `athlete3` (esquema, claves locales) se quedan así a propósito: cambiarlos rompe la sincronización
y los datos guardados.

---

## 5. Cómo correrlo

Requisitos: Node 22+, Xcode (iOS) o Android Studio, CocoaPods y la CLI de Supabase (`npx supabase`).

```bash
npm ci
cp frontend/mobile/.env.example frontend/mobile/.env   # pide a Gabo la URL y la clave publicable
cd frontend/mobile
npx expo run:ios --device                      # o: npx expo run:android
```

- En el teléfono, una compilación de **desarrollo** necesita la Mac con el servidor de Expo corriendo
  (`npx expo start --dev-client`), en la misma red WiFi.
- Para probar sin la Mac: `npx expo run:ios --device --configuration Release`.
- Si cambian las dependencias nativas y falla la compilación de iOS: borra `frontend/mobile/ios` y vuelve a correr
  `expo run:ios` (la carpeta se genera sola).
- Sin `.env` la app funciona solo en local, sin cuenta.

### Pruebas

```bash
npm run typecheck                 # todo el monorepo
npm test                          # contratos, dominio, datos y app
backend/supabase/tests/harness/local-postgres.sh start
npm run test:db                   # migraciones reales + RLS + sync contra Postgres local (127.0.0.1:54329)
```

Todo PR debe pasar `npm run typecheck` y `npm run test:all`.

### Migraciones

- **Aditivas** (no borran datos), con el cierre de privilegios y la verificación al final (copiar de la última).
- Nombre: `backend/supabase/migrations/AAAAMMDDHHMMSS_athlete3_<tema>.sql`.
- Toda tabla nueva sincronizable usa `athlete3_private.secure_synced_table(...)` y se agrega a `sync_table` y `sync_pull`.
- Se prueban en local y se aplican **desde la carpeta `backend/`** con `npx supabase db push --linked` **antes** de instalar la app que las usa.
  (La CLI de Supabase busca la carpeta `supabase/` donde la corres; en la raíz ya no está.)

---

## 6. Cómo trabajamos

- Ramas: `feat/<tema>` o `fix/<tema>` desde `main`, PR a `main` y se borra al fusionar. `main` siempre compila y pasa
  las pruebas. Detalle en [flujo-de-ramas.md](docs/decisions/flujo-de-ramas.md).
- Commits pequeños y en español, que expliquen el **porqué**. Los cambios de marca van en commits separados de los funcionales.
- Nunca subir secretos: solo valores públicos (`EXPO_PUBLIC_*`) en la app. Las llaves de servidor van en Supabase.
- Las decisiones importantes se escriben como ADR en `docs/decisions/`.
- Dudas de producto: Gabo. Dudas del negocio del gimnasio: las lleva Gabo con el dueño.
