# ADR-0006 · Estructura frontend / backend / shared

**Fecha:** 13-nov-2026 · **Estado:** aceptada

## Contexto
Entra un colaborador para el front. Con `apps/`, `packages/` y `supabase/` en la raíz no era obvio dónde va cada cosa.

## Decisión
```
frontend/mobile      app Expo (antes apps/mobile)
backend/supabase     migraciones, Edge Functions y pruebas de base (antes supabase/)
shared/*             contracts, domain, data (antes packages/*)
```
- Los nombres de paquete no cambian (`@athlete/mobile`, `@athlete/contracts`…): solo cambian las carpetas.
- La CLI de Supabase se corre desde `backend/` (o con `--workdir backend`).
- La carpeta nativa de iOS ahora se genera en `frontend/mobile/ios` (ignorada por git).

## Consecuencias
- Tras actualizar: `npm ci` en la raíz y, para iOS, borrar la carpeta `ios` vieja y volver a compilar.
- Los reportes históricos en `docs/reports/` conservan las rutas viejas a propósito.
