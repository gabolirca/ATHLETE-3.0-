# Modelo de datos inicial — ATHLETE 3.0

**Estado:** Propuesta inicial  
**Responsable:** Claude  
**Revisión:** Codex y propietario del producto

## 1. Objetivo

Definir el modelo de dominio inicial para la aplicación móvil.

El modelo debe soportar el MVP personal y permitir crecimiento hacia múltiples usuarios.

No representa autorización para ejecutar migraciones.

## 2. Convenciones

- Identificadores UUID.
- Propiedad explícita mediante `user_id`.
- Timestamps UTC.
- Fechas deportivas con referencia local.
- Zona horaria del usuario.
- Valores medidos y estimados diferenciados.
- Identificadores estables para ejercicios.
- Borrado lógico cuando sea necesario para sincronización.
- Restricciones e índices documentados.

El mecanismo definitivo de generación de UUID y versionado de registros debe documentarse en una ADR técnica.

## 3. Dominios

### Identidad

`profiles`

Datos de configuración del atleta.

`memberships`

Relaciones y roles para futuras capacidades multiusuario.

### Catálogo

`exercises`

Catálogo de ejercicios con identificadores estables.

`muscle_groups`

Grupos musculares.

`equipment`

Equipamiento disponible.

### Programación

`training_plans`

Programas de entrenamiento.

`training_days`

Días de un programa.

`training_day_exercises`

Ejercicios y objetivos planificados.

### Entrenamiento

`workout_sessions`

Sesiones ejecutadas.

`session_exercises`

Ejercicios incluidos en cada sesión.

`sets`

Series registradas.

### Actividades cardiovasculares

`cardio_sessions`

Sesiones de carrera, caminata, bicicleta y otras modalidades.

`swim_sessions`

Registros específicos de natación, cuando el modelo lo requiera.

### Seguimiento corporal

`body_weights`

Registros de peso.

`body_measurements`

Medidas corporales.

### Bienestar

`daily_checkins`

Sueño, energía y percepción de recuperación, cuando se apruebe su alcance.

### Nutrición

`nutrition_days`

Resumen nutricional diario.

`meal_entries`

Comidas y alimentos.

### Analítica

`recommendations`

Recomendaciones y predicciones inmutables.

`model_versions`

Versiones de modelos predictivos.

### Sincronización

`sync_state`

Estado de sincronización por dispositivo o usuario.

`sync_operations`

Operaciones pendientes o confirmadas, si la implementación lo requiere.

## 4. Reglas de propiedad

Toda entidad privada debe pertenecer a un usuario.

Las políticas deben impedir acceso cruzado entre usuarios.

Los catálogos globales deben distinguirse de los ejercicios personalizados.

## 5. Sesiones y series

Una sesión puede contener múltiples ejercicios.

Un ejercicio de sesión puede contener múltiples series.

Cada serie debe conservar:

- Orden.
- Peso opcional.
- Repeticiones opcionales.
- RIR opcional.
- RPE opcional.
- Tipo de serie.
- Duración opcional.
- Distancia opcional.

No se debe inferir información que no haya sido registrada.

## 6. Métricas

El dominio debe distinguir fuerza y cardio.

El calentamiento no debe contabilizarse automáticamente como serie efectiva.

Los cálculos deben coincidir entre la lógica compartida y las consultas de base de datos.

## 7. Fechas y zonas horarias

Los registros deben conservar el instante real de ejecución.

Los informes por día deben utilizar la fecha local del atleta.

No utilizar recortes UTC de timestamps para determinar días deportivos locales.

## 8. Sincronización

Las operaciones deben poder identificarse de manera única.

Se debe definir:

- Identificador de mutación.
- Revisión de origen.
- Estado de operación.
- Política de conflictos.
- Borrado lógico.
- Cursor incremental.

La aplicación nunca debe perder una sesión local por una descarga remota.

## 9. Alcance

Este modelo es una propuesta de dominio.

Cada tabla y campo debe vincularse a un requisito del producto antes de convertirse en migración.

## 10. Criterio de aceptación

El modelo será aprobado cuando:

- Las entidades del MVP estén identificadas.
- Las relaciones estén documentadas.
- Las reglas de propiedad estén definidas.
- Las restricciones estén especificadas.
- Los contratos estén alineados con Codex.
- Las pruebas de seguridad estén previstas.