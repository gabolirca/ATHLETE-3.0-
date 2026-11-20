# Panel ATHLETE (rutinas y programas)

Sitio estático (HTML + JS, sin compilar) para que el dueño y los coaches creen **rutinas** y **programas por semanas**
que la app muestra como "Rutinas ATHLETE". Se publica tal cual en `athlete.lirca.com.mx`.

- `config.js`: URL del proyecto y llave **publicable** (va en el navegador a propósito). Nunca pongas `sb_secret_` ni `service_role`.
- Seguridad: la ponen las reglas de Supabase (migración `20261120000100_athlete3_library.sql`):
  - Dueño (`admin`): crea, edita, publica, archiva y maneja el equipo.
  - Coach (`editor`): crea borradores y edita solo los suyos mientras no estén publicados.
  - Usuarios de la app: solo leen lo publicado.

## Puesta en marcha (una vez)
1. Aplicar la migración `backend/supabase/migrations/20261120000100_athlete3_library.sql`.
2. Darte el rol de dueño (SQL Editor de Supabase):
   ```sql
   insert into athlete3_private.user_roles (user_id, role)
   select id, 'admin' from auth.users where email = 'TU_CORREO' on conflict do nothing;
   ```
3. Supabase → Authentication → URL Configuration → Redirect URLs: agregar `https://athlete.lirca.com.mx/**`.
4. Subir el contenido de esta carpeta a la raíz del subdominio.

## Coaches
Cada coach entra una vez con "Mandarme un enlace" (crea su cuenta) → tú lo agregas en **Equipo** con su correo.
