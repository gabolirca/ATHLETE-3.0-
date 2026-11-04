# ATHLETE 3.0 — Especificación del producto

**Versión:** 1.0.0  
**Estado:** Especificación inicial  
**Fecha:** 3 de noviembre de 2026  
**Repositorio:** https://github.com/gabolirca/ATHLETE-3.0-.git

---

## 1. Visión general

ATHLETE 3.0 es una plataforma personal de entrenamiento y rendimiento deportivo.

Su propósito es ayudar al atleta a planificar, registrar, analizar y optimizar su entrenamiento mediante información confiable y herramientas de seguimiento.

No será únicamente un diario de gimnasio. Integrará entrenamiento de fuerza, resistencia cardiovascular, natación, carrera, entrenamiento híbrido, recuperación, seguimiento corporal y nutrición.

La aplicación debe evolucionar desde una herramienta personal hacia una plataforma preparada para múltiples atletas.

## 2. Objetivos del producto

1. Centralizar la información del entrenamiento.
2. Facilitar la planificación semanal y por bloques.
3. Registrar sesiones de manera rápida y confiable.
4. Medir la evolución del rendimiento.
5. Integrar fuerza y resistencia en una sola plataforma.
6. Ofrecer estadísticas útiles para tomar decisiones.
7. Permitir el funcionamiento sin conexión.
8. Preparar una arquitectura extensible para futuras integraciones.

## 3. Principios de diseño

- Calidad sobre cantidad.
- Datos reales antes que estimaciones.
- Separación entre mediciones, estimaciones y predicciones.
- Experiencia móvil como prioridad.
- Funcionamiento offline.
- Privacidad desde el diseño.
- Modularidad y mantenibilidad.
- Evitar complejidad innecesaria en el MVP.

## 4. Usuarios y lanzamiento

El primer lanzamiento será para uso personal.

La arquitectura debe permitir incorporar múltiples usuarios sin reconstruir el modelo de datos ni eliminar las políticas de seguridad.

No se implementará una plataforma comercial multiempresa durante el MVP.

## 5. Plataformas

### Primera etapa

- iOS.
- Android.

Tecnologías:
- React Native.
- Expo.
- TypeScript.
- Expo Router.

### Etapas posteriores

- Panel administrativo privado con Next.js.
- Sitio público de presentación con Next.js.
- Integraciones con Apple Health y Android Health Connect.
- Integraciones con dispositivos deportivos compatibles.

Las integraciones con wearables no son requisito para el MVP.

## 6. Módulos funcionales

### 6.1. Perfil del atleta

- Información personal.
- Estatura.
- Peso inicial.
- Objetivos.
- Nivel de experiencia.
- Preferencias.
- Zona horaria.
- Unidades de medida.
- Configuración de privacidad.

### 6.2. Dashboard

Debe presentar:

- Entrenamiento del día.
- Actividad semanal.
- Sesiones completadas.
- Minutos de actividad.
- Objetivos.
- Últimos registros.
- Evolución general.
- Acceso rápido para iniciar una sesión.

### 6.3. Planificación

- Calendario.
- Rutinas.
- Programas.
- Bloques de entrenamiento.
- Días de descanso.
- Ejercicios programados.
- Objetivos por sesión.
- Modificación de planes.

Debe distinguirse entre entrenamiento planificado y entrenamiento ejecutado.

### 6.4. Entrenamiento de fuerza

Registro de:

- Ejercicios.
- Series.
- Repeticiones.
- Peso.
- RIR opcional.
- RPE opcional.
- Descansos.
- Notas.
- Series de calentamiento y trabajo.

Funciones:

- Temporizador.
- Autoguardado.
- Edición de sesiones.
- Historial.
- Récords personales.
- Comparación entre sesiones.

### 6.5. Entrenamiento cardiovascular

Actividades iniciales:

- Carrera.
- Caminata.
- Natación.
- Bicicleta.
- Remo.
- Circuitos.
- Acondicionamiento híbrido.

Métricas:

- Duración.
- Distancia.
- Ritmo.
- Velocidad.
- Rondas.
- Repeticiones.
- Percepción de esfuerzo.
- Frecuencia cardíaca cuando esté disponible.

Las métricas cardiovasculares no deben mezclarse con las métricas de fuerza.

### 6.6. Seguimiento corporal

- Peso.
- Medidas corporales.
- Historial.
- Gráficas.
- Fotografías opcionales.
- Evolución por periodos.

Las mediciones deben conservar fecha, procedencia y unidad.

### 6.7. Nutrición

Alcance previsto:

- Registro de alimentos.
- Comidas.
- Calorías estimadas.
- Macronutrientes.
- Objetivos.
- Historial.

El registro manual tendrá prioridad en el MVP. La estimación mediante IA será posterior.

### 6.8. Analítica

- Volumen de entrenamiento.
- Frecuencia.
- Progresión de cargas.
- Evolución por ejercicio.
- Actividad cardiovascular.
- Cumplimiento del plan.
- Evolución corporal.
- Tendencias semanales y mensuales.

### 6.9. Recomendaciones

A futuro, el sistema podrá sugerir:

- Ajustes de carga.
- Progresión.
- Distribución de entrenamiento.
- Cambios de volumen.
- Recomendaciones generales de recuperación.

Toda recomendación debe conservar su fundamento y distinguirse de un resultado real.

## 7. Alcance del MVP

El MVP debe priorizar:

1. Perfil y configuración.
2. Dashboard.
3. Catálogo de ejercicios.
4. Rutinas y planificación.
5. Registro de fuerza.
6. Registro cardiovascular.
7. Historial.
8. Estadísticas básicas.
9. Persistencia local.
10. Sincronización.
11. Seguridad y privacidad.

Nutrición avanzada, inteligencia artificial, wearables, panel web y funciones comerciales podrán desarrollarse posteriormente.

## 8. Arquitectura tecnológica

### Aplicación móvil

- React Native.
- Expo.
- TypeScript.
- Expo Router.
- SQLite.
- TanStack Query.
- Zustand.
- Zod.

### Backend

- Supabase.
- PostgreSQL.
- Supabase Auth.
- Row Level Security.
- Edge Functions.

La identidad del proyecto Supabase de destino debe quedar confirmada documentalmente antes de conectar o desplegar el backend.

### Web futura

- Next.js.
- TypeScript.
- Panel privado.
- Sitio público.

## 9. Persistencia y sincronización

La aplicación será local-first.

Debe permitir:

- Iniciar sesiones offline.
- Registrar ejercicios.
- Guardar series.
- Editar entrenamientos.
- Recuperar sesiones incompletas.
- Sincronizar al recuperar conexión.

Las operaciones deben ser idempotentes.

Las eliminaciones deben conservar información suficiente para evitar que registros eliminados reaparezcan durante una sincronización.

Los conflictos deben detectarse y resolverse explícitamente. No se permitirá sobrescribir todo el almacenamiento local mediante una descarga completa.

## 10. Calidad de los datos

Los registros deben distinguir:

- Manuales.
- Importados.
- Estimados.
- Generados por IA.
- Procedentes de dispositivos.

No se deben inventar valores faltantes.

RIR será opcional y no debe inferirse cuando no se haya registrado.

Las fechas deportivas deben respetar la zona horaria del atleta.

## 11. Seguridad

- RLS habilitado para todas las tablas personales.
- Propiedad explícita de los registros.
- Validación de entradas.
- Autorización en backend.
- Claves privilegiadas exclusivamente en servidor.
- Consentimiento explícito y revocable cuando corresponda.
- Protección de fotografías y datos sensibles.
- Pruebas de aislamiento entre usuarios.

## 12. Diseño visual

Dirección visual: deportiva, tecnológica, minimalista y enfocada en rendimiento.

Paleta inicial:

- Negro: #090B10
- Azul: #1769FF
- Rojo: #EF3340
- Grafito: #252B36

Tema oscuro predeterminado.

El azul será el color principal de acción. El rojo se reservará para alertas y énfasis. El verde se utilizará para estados positivos.

## 13. Navegación móvil propuesta

Secciones principales:

1. Inicio.
2. Entrenar.
3. Progreso.
4. Nutrición.
5. Perfil.

La navegación y los flujos definitivos se validarán mediante prototipos y criterios de aceptación.

## 14. Pruebas

Se requieren:

- Pruebas unitarias.
- Pruebas de integración.
- Pruebas de base de datos.
- Pruebas RLS.
- Pruebas offline.
- Pruebas de sincronización.
- Pruebas E2E en iOS y Android.

## 15. Criterios generales de aceptación

La primera versión debe:

- Funcionar en iOS y Android.
- Permitir registrar entrenamientos.
- Guardar sesiones automáticamente.
- Recuperar sesiones después de cerrar la aplicación.
- Funcionar sin conexión.
- Sincronizar sin duplicaciones.
- Proteger los datos del usuario.
- Mostrar estadísticas correctas.
- Diferenciar mediciones y estimaciones.
- Contar con pruebas automatizadas.

## 16. Fuera del MVP

- Wearables.
- Apple Health.
- Android Health Connect.
- Panel web administrativo.
- Sitio público.
- Suscripciones.
- Comunidad.
- Entrenadores y equipos.
- Marketplace.
- Multiempresa.

## 17. Regla de evolución

Cada módulo deberá contar con:

- Requisitos.
- Contratos.
- Modelo de datos.
- Criterios de aceptación.
- Pruebas.
- Documentación.

Ningún cambio arquitectónico importante deberá introducirse sin documentar su decisión correspondiente.

---

**Este documento es la referencia funcional principal de ATHLETE 3.0.**