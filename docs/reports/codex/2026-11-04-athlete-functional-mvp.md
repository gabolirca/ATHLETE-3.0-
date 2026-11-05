# ATHLETE 3.0 — Functional MVP móvil

**Fecha:** 4 de noviembre de 2026  
**Rama:** `codex/mobile-foundation`  
**Alcance:** auditoría del flujo móvil existente y ajuste UX de esfuerzo por serie. No se modificaron backend, contratos compartidos, persistencia, configuración SQLCipher ni SecureStore.

## Diagnóstico

La auditoría del 3 de noviembre describe un estado anterior al contenido que hoy está en `apps/mobile`. El checkout actual ya tiene rutas funcionales para crear rutinas, iniciar sesiones libres o desde rutina, registrar series, finalizar y consultar historial y progreso. Las pantallas leen y escriben mediante `TrainingRepository`, implementado localmente por `SQLiteTrainingRepository`; no se encontraron contratos de API/backend móvil consumibles en este checkout.

El hueco UX de este encargo estaba en `SetEditor`: exponía `RIR` como etiqueta y usaba un campo de texto aunque el contrato móvil ya limita el número entero a 0–10, con `null` permitido. Algunas acciones de añadir series/ejercicios tampoco presentaban un error si el repositorio fallaba.

## Estado del flujo

| Paso | Estado en la app móvil actual |
|---|---|
| Crear rutina y elegir ejercicios | Funcional; validación local y guardado por repositorio. |
| Configurar series, repeticiones y descanso | Funcional; objetivos se guardan en la rutina y se copian al iniciar una sesión. |
| Iniciar/continuar entrenamiento | Funcional desde Inicio y Entrenar, libre o desde rutina. El repositorio devuelve la sesión activa existente si ya hay una. |
| Registrar series, peso y repeticiones | Funcional; las ediciones se validan y guardan localmente. |
| Registrar esfuerzo | Ajustado en este cambio; selector inmediato de 0 a 10 que persiste el número en `rir`. |
| Finalizar | Funcional; requiere al menos una serie con peso o repeticiones. |
| Consultar historial/detalle | Funcional para sesiones completadas persistidas localmente. |
| Estadísticas básicas | Funcional para volumen, sesiones, récords y mediciones disponibles en el repositorio local. |

El catálogo inicial sigue identificado como muestra. No hay sincronización de servidor; los estados visibles corresponden al almacenamiento local/outbox y no a una confirmación remota.

## Cambios

- `SetEditor` muestra la pregunta **“¿Cuántas repeticiones más podrías haber hecho?”** y el texto auxiliar solicitado.
- El esfuerzo se elige con botones táctiles de 44 × 48 px, con guardado inmediato; el valor elegido y `null` mantienen el tipo y campo actuales.
- Se conserva el rango admitido 0–10 de `LoggedSetSchema`. La interfaz explica las equivalencias de 0, 1 y 2. Si carga un número guardado fuera de rango, avisa con el valor encontrado y permite corregirlo mediante una opción válida.
- Las pantallas de inicio y de historial describen el esfuerzo en lenguaje simple; el historial también identifica explícitamente un número guardado fuera de rango.
- Al guardar una serie, la vista recarga los datos del repositorio sin interrumpir la pantalla con un estado de carga. Errores al añadir series o ejercicios ahora se comunican en pantalla.
- Se añadieron pruebas de selección y accesibilidad del esfuerzo, rango, corrección de valor inválido y navegación de Entrenar a la ruta de inicio de sesión.

## Pruebas y validación

- `npm run typecheck` — pasó.
- `npm test -- --runInBand` — pasó: 5 suites, 25 pruebas.
- La suite del repositorio usa SQLite real sobre un archivo temporal: cierra la conexión, reabre la misma base y comprueba recuperación de sesión activa y outbox. También verifica rutina, registro, finalización e historial.
- `git diff --check` — pasó.

La persistencia tras reinicio de la base está comprobada automatizadamente. No se hizo una prueba manual de cerrar y volver a abrir la aplicación nativa en iOS/Android ni una validación visual en dispositivo. Por ello, el resultado no se presenta como verificación nativa del ciclo de vida de la app.

## Límites

- No se cambió backend, contratos, columnas, esquema ni lógica de persistencia para traducir el término visual.
- No se ejecutó prebuild y no se tocaron configuración de SQLCipher ni SecureStore.
- La sincronización remota y el catálogo compartido siguen requiriendo contratos y servicio backend.
