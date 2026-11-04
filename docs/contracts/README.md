# Contratos compartidos — ATHLETE 3.0

**Responsables:** Claude y Codex  
**Fuente de verdad:** `packages/contracts`

## 1. Objetivo

Definir una interfaz estable entre el backend y la aplicación móvil.

Las pantallas no deben depender directamente de nombres de tablas o detalles internos de PostgreSQL.

## 2. Contenido de los contratos

Se organizarán por dominio:

- Perfil.
- Ejercicios.
- Programas.
- Sesiones.
- Series.
- Actividades cardiovasculares.
- Seguimiento corporal.
- Nutrición.
- Sincronización.
- Errores.

## 3. Estructura propuesta

    packages/contracts/
    ├── src/
    │   ├── index.ts
    │   ├── common.ts
    │   ├── profile.ts
    │   ├── exercises.ts
    │   ├── programs.ts
    │   ├── sessions.ts
    │   ├── sets.ts
    │   ├── cardio.ts
    │   ├── body.ts
    │   ├── nutrition.ts
    │   ├── sync.ts
    │   └── errors.ts
    ├── package.json
    └── CHANGELOG.md

## 4. Reglas

- TypeScript para tipos compartidos.
- Zod para validación.
- Tipos de base generados desde Supabase.
- No duplicar manualmente tipos generados.
- Separar entradas de creación, actualización y lectura.
- Documentar campos opcionales.
- Definir códigos de error estables.
- Versionar cambios.

## 5. Contrato de sesión

La aplicación necesita operaciones conceptuales para:

- Iniciar sesión.
- Agregar ejercicios.
- Registrar series.
- Completar sesión.
- Consultar historial.
- Consultar detalle.

Los nombres y estructuras definitivos deben acordarse entre ambos agentes antes de implementar.

## 6. Repositorios

La interfaz móvil consumirá repositorios.

No se permitirá que cada pantalla implemente consultas independientes a Supabase.

Los repositorios deben soportar persistencia local y sincronización.

## 7. Errores

Cada error debe incluir:

- Código estable.
- Mensaje seguro.
- Indicación de si puede reintentarse.
- Contexto técnico cuando corresponda.

Nunca se deben mostrar secretos ni detalles internos del servidor al usuario.

## 8. Sincronización

El contrato debe especificar:

- Push.
- Pull.
- Confirmaciones.
- Conflictos.
- Reintentos.
- Tombstones.
- Idempotencia.

## 9. Versionado

Los cambios incompatibles requieren incremento de versión mayor.

Los cambios compatibles de funcionalidad incrementan versión menor.

Las correcciones compatibles incrementan versión de parche.

Todo cambio requiere actualización del CHANGELOG y revisión cruzada.

## 10. Aprobación

Claude propone y mantiene los contratos de backend.

Codex revisa su utilidad para la aplicación móvil.

Ambos aprueban los cambios compartidos antes de su integración.