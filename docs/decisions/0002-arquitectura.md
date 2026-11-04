# ADR-0002 — Arquitectura tecnológica de ATHLETE 3.0

**Estado:** Aprobado como dirección arquitectónica  
**Fecha:** 3 de noviembre de 2026

## Contexto

ATHLETE 3.0 requiere una arquitectura móvil moderna, mantenible y preparada para crecer.

El producto comienza como una aplicación personal, pero debe permitir incorporar nuevos usuarios y capacidades sin reconstruir sus fundamentos.

## Decisión

### 1. Arquitectura general

Se utilizará un monorepo TypeScript.

Estructura objetivo:

    ATHLETE-3.0/
    ├── apps/
    │   ├── mobile/
    │   ├── admin/
    │   └── website/
    ├── packages/
    │   ├── contracts/
    │   ├── domain/
    │   ├── data/
    │   ├── validation/
    │   └── config/
    ├── supabase/
    │   ├── migrations/
    │   ├── functions/
    │   └── tests/
    ├── docs/
    ├── tests/
    ├── AGENTS.md
    └── package.json

La aplicación móvil es prioritaria. Las aplicaciones web pertenecen a fases posteriores.

### 2. Aplicación móvil

Tecnologías:

- React Native.
- Expo.
- TypeScript.
- Expo Router.
- SQLite.
- TanStack Query.
- Zustand.
- Zod.

La interfaz no accederá directamente a tablas desde las pantallas.

Se utilizarán repositorios y servicios para mantener separadas la presentación, la lógica y la persistencia.

### 3. Backend

Tecnologías:

- Supabase Auth.
- PostgreSQL.
- Row Level Security.
- Edge Functions.

El esquema de ATHLETE 3.0 será `athlete3`.

Se contempla un esquema privado complementario `athlete3_private` para funciones internas y helpers de seguridad.

La identidad del proyecto Supabase de destino continúa pendiente de confirmación definitiva. La referencia `npdrjhbkilicuieecbgd` fue observada durante una auditoría, pero no se considerará aprobada para despliegues hasta verificarla con el propietario.

### 4. Separación del sistema legado

ATHLETE 3.0 no reutilizará directamente tablas, funciones, políticas ni lógica de Diario Gym v2.

No se migrarán automáticamente datos históricos.

EasyTeacher permanecerá completamente separado.

La separación por esquemas no implica que el historial de migraciones de Supabase sea independiente. Antes de cualquier despliegue se debe reconciliar el historial compartido del proyecto.

### 5. Persistencia

La aplicación será local-first.

SQLite será responsable de la persistencia local.

TanStack Query administrará las consultas y caché remota.

Zustand administrará estados de interfaz y estados transitorios de la aplicación.

El motor de sincronización será independiente de la interfaz.

### 6. Contratos

`packages/contracts` será la fuente compartida de:

- Tipos.
- Esquemas Zod.
- Entradas y salidas.
- Códigos de error.
- Contratos de repositorios.
- Contratos de sincronización.

Los contratos tendrán versionado semántico y CHANGELOG.

### 7. Lógica de dominio

`packages/domain` contendrá lógica pura:

- Cálculos de entrenamiento.
- Volumen.
- e1RM.
- Récords.
- Reglas de progresión.
- Validaciones de negocio.

No dependerá de React Native, Supabase ni interfaces gráficas.

### 8. Seguridad

- RLS para datos privados.
- Propiedad mediante `user_id`.
- Permisos explícitos.
- Validación del servidor.
- No exponer service_role.
- Funciones privilegiadas aisladas.
- Pruebas de aislamiento entre usuarios.

### 9. Calidad

La integración continua verificará:

- Lint.
- TypeScript.
- Formato.
- Pruebas unitarias.
- Pruebas de integración.
- Migraciones locales.
- Build móvil.

### 10. Evolución

Las integraciones con wearables y los productos web se incorporarán después del MVP.

La arquitectura deberá permitir incorporarlos sin acoplarlos al núcleo del entrenamiento.

## Consecuencias

La arquitectura requiere disciplina en los contratos y separación entre módulos.

A cambio, permite que Claude y Codex trabajen en paralelo con responsabilidades claras y menor riesgo de conflictos.

## Revisión

Esta decisión podrá cambiar mediante una nueva ADR cuando exista una justificación técnica documentada.