# ADR-0001 — Responsabilidades y colaboración de agentes

**Estado:** Aprobado  
**Fecha:** 3 de noviembre de 2026

## Contexto

ATHLETE 3.0 utiliza dos agentes de desarrollo con responsabilidades diferenciadas para reducir conflictos, duplicación de trabajo y decisiones arquitectónicas inconsistentes.

## Decisión

### Claude — Backend y arquitectura

Responsable de:

- Supabase.
- PostgreSQL.
- Modelo de datos.
- Migraciones.
- Autenticación.
- Autorización.
- Row Level Security.
- Edge Functions.
- Lógica de negocio.
- Repositorios.
- Persistencia.
- SQLite y sincronización.
- Pruebas de backend.
- Seguridad.
- Documentación de arquitectura.

### Codex — Aplicación móvil

Responsable de:

- React Native.
- Expo.
- TypeScript.
- Expo Router.
- UX/UI.
- Componentes.
- Navegación.
- Design system.
- Pantallas.
- Accesibilidad.
- Integración de contratos.
- Pruebas de interfaz y experiencia móvil.

### Responsabilidad compartida

Ambos agentes deben colaborar en:

- Contratos API.
- Tipos compartidos.
- Esquemas de validación.
- Códigos de error.
- Revisión cruzada.
- Pruebas de integración.
- Criterios de aceptación.
- Documentación.
- Versionado de contratos.

## Reglas de colaboración

1. Claude no debe modificar componentes visuales ni pantallas sin coordinación.
2. Codex no debe modificar migraciones ni lógica de base de datos.
3. Ningún agente debe cambiar contratos compartidos unilateralmente.
4. Todo cambio de contrato debe documentarse y revisarse por ambos.
5. Cada tarea debe tener criterios de aceptación.
6. Cada implementación debe incluir pruebas.
7. Ambos deben trabajar sobre la misma documentación versionada.
8. Los cambios deben realizarse mediante ramas o commits claramente identificables.
9. Los conflictos entre propuestas deben documentarse antes de implementarse.

## Seguridad y autorización

Ningún agente tiene autorización permanente para:

- Eliminar datos.
- Ejecutar migraciones destructivas.
- Modificar objetos legados.
- Cambiar permisos de producción.
- Modificar políticas de seguridad remotas.
- Ejecutar operaciones irreversibles.

Las operaciones sobre el backend remoto requieren aprobación explícita del propietario.

## Fuente de verdad

La documentación del repositorio es la fuente de verdad del proyecto.

Orden de referencia:

1. Especificación del producto.
2. Decisiones arquitectónicas aprobadas.
3. Contratos versionados.
4. Código implementado.
5. Informes de auditoría.

Si existe una contradicción, debe reportarse y resolverse; no debe elegirse silenciosamente una interpretación.

## Criterio de finalización

Una tarea se considera terminada cuando:

- Cumple sus criterios de aceptación.
- Pasa sus pruebas.
- Está documentada.
- Ha sido revisada cuando afecta contratos compartidos.
- Está integrada mediante Git.

## Responsables

- Backend: Claude.
- Aplicación móvil: Codex.
- Aprobación de arquitectura y producto: propietario de ATHLETE 3.0.