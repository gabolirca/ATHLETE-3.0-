# Adaptive Training: inventario, arquitectura, métricas y plan

Autor: Claude · 4-nov-2026 · Estado: **propuesta**. No se ha entrenado ni desplegado ningún modelo.
Base: auditoría de `carga-v1` (`docs/reports/claude/2026-11-04-auditoria-modelo-diario-gym-claude.md`) y la
decisión del propietario: atletas de fuerza **e híbridos**, con visión integral (entrenamiento, recuperación, sueño,
nutrición y actividad).

---

## 1. Inventario de datos y variables

Estado en ATHLETE 3.0, verificado en `packages/contracts`, `packages/data` y migraciones `athlete3`:
- **✅** contrato, almacenamiento local y servidor con pruebas;
- **📄** solo contrato;
- **—** no existe.

### 1.1 Entrenamiento de fuerza

| Variable | Estado | Fuente | Notas para modelado |
|---|---|---|---|
| Carga por serie (`weightKg`, 2 decimales) | ✅ | manual | Base del e1RM y del volumen |
| Repeticiones (`reps`, 0–1000) | ✅ | manual | `0` = intento fallido (dato válido) |
| RIR (`rir`, 0–10 en pasos de 0.5, `null` = no registrado) | ✅ | manual | Esfuerzo percibido por serie; su error de estimación varía por persona y por cercanía al fallo |
| RPE por serie (`rpe`, 1–10) | ✅ | manual | Redundante con RIR; la UI debería pedir solo uno |
| Tipo de serie (calentamiento/trabajo) | ✅ | manual | Excluir calentamientos de intensidad y volumen efectivo |
| Hora de ejecución (`completedAt`) | ✅ | manual | Permite medir el descanso real entre series |
| Descanso planificado/registrado | ✅ (`restSeconds`) | manual | |
| Objetivos de rutina (series, rango de reps, RIR, carga, descanso) | ✅ | manual | Permite medir la adherencia al plan |
| Sesión: inicio, fin, zona horaria, fecha local | ✅ | manual | Base de la frecuencia y la duración |
| Catálogo: patrón, grupo muscular, equipo, tipo de carga | ✅ | catálogo | Falta el **incremento mínimo** por ejercicio y equipo del usuario (—) |
| RPE de sesión (sRPE) | — | | Necesario para la carga interna (sRPE × minutos) comparable entre disciplinas |

### 1.2 Cardio y actividad complementaria

| Variable | Estado | Notas |
|---|---|---|
| Actividad (`run`, `walk`, `swim`, `bike`, `row`, `circuit`, `hybrid`), duración, distancia | ✅ | Ritmo derivado en `domain` |
| RPE de cardio, FC media y máxima | ✅ | Opcionales |
| Natación: piscina, longitud, largos, estilo | ✅ | |
| Rondas y repeticiones (circuitos) | ✅ | |
| Pasos y actividad diaria, FC en reposo, HRV | — | Wearables / Apple Health / Health Connect: después del MVP (decisión previa) |
| Zonas de FC, umbrales, potencia | — | Necesarios para la carga de resistencia más allá de sRPE |

### 1.3 Recuperación y sueño

| Variable | Estado | Notas |
|---|---|---|
| Horas de sueño | — | Diario Gym lo tenía (`sleep_logs`) |
| Calidad de sueño (escala) | — | |
| Disposición percibida, dolor muscular, estrés | — | Cuestionario breve (bienestar) antes de entrenar |
| HRV, FC en reposo | — | Wearables, fase posterior |

### 1.4 Alimentación y disponibilidad energética

| Variable | Estado | Notas |
|---|---|---|
| Comidas: kcal, proteína, carbohidratos, grasa, tipo | 📄 (`MealEntry`) | Sin almacenamiento local ni servidor |
| Objetivos nutricionales | 📄 (`NutritionTarget`) | |
| Resumen diario con registros incompletos | 📄 (`NutritionDaySummary.entriesMissingEnergy`) | Imprescindible: un día sin registrar no es un día con 0 kcal |
| Disponibilidad energética (kcal − gasto del ejercicio) / masa libre de grasa | — | Requiere estimar el gasto del ejercicio y la composición corporal; tratarla como **estimación** |

### 1.5 Cuerpo

| Variable | Estado | Notas |
|---|---|---|
| Peso corporal con unidad de entrada | ✅ | Tendencia con media móvil; no usar el valor de un día aislado |
| Perímetros (14 sitios) | ✅ | |
| Estatura, experiencia, objetivos | ✅ (perfil) | Hay que **versionar** el perfil para no aplicar valores actuales a filas históricas (fuga en `carga-v1`) |
| Disciplinas del atleta | — | Propuesto: `Profile.sports` |

### 1.6 Variables derivadas (en `@athlete/domain`, sin almacenar)

| Variable | Estado |
|---|---|
| e1RM (Epley/Brzycki), récords | ✅ |
| Volumen efectivo, resumen de sesión y semana | ✅ |
| Ritmo y velocidad de cardio | ✅ |
| Carga aguda y crónica, monotonía, frecuencia por grupo muscular | — (por implementar en `domain`) |
| Intensidad relativa (% e1RM), reps en reserva estimadas por carga | — |

### 1.7 Datos históricos de Diario Gym

**No se usan.** La decisión es que ATHLETE no migra datos antiguos automáticamente y la restricción de esta fase es
no copiarlos. Solo podrían servir, con consentimiento y anonimización, como banco de pruebas para la metodología;
nunca como entrenamiento de un modelo productivo sin decisión explícita.

## 2. Arquitectura propuesta

### 2.1 Tres tareas separadas

| Tarea | Pregunta | Salida | Tipo |
|---|---|---|---|
| **A. Predicción de rendimiento** | ¿Qué puede hacer hoy esta persona en este ejercicio? | Por ejercicio: e1RM esperado o reps esperadas a una carga y RIR dados, **con intervalo** | Predicción (estimación de estado) |
| **B. Recomendación de carga** | ¿Qué carga y cuántas reps debería hacer en la próxima sesión para cumplir el objetivo (p. ej., RIR 2 en 3 × 8)? | Carga, reps y RIR objetivo + explicación + motivo de cualquier recorte | Decisión (política) |
| **C. Evaluación de recuperación** | ¿Está listo para la carga planificada? | Estado (p. ej., bajo, normal o alto respecto a su propia línea base) con los factores que lo explican | Evaluación de estado |

**No se combinan en un único número.** Responden preguntas distintas, se validan con verdades de terreno distintas
y fallan por motivos distintos. Un índice único (como la calificación 0–100 de Diario Gym) mezcla esfuerzo,
adherencia y progreso: impide saber qué falló y no es evaluable. Se relacionan así:

```
datos ──► features (por instante de corte) ──► A: rendimiento (con incertidumbre)
                                           └─► C: recuperación (respecto a la línea base personal)
A + C + plan (objetivo, RIR objetivo) + restricciones de seguridad ──► B: recomendación
```

- **B consume A y C como entradas explícitas.** No reaprende la decisión histórica del usuario, que era el defecto
  de fondo de `carga-v1`.
- **C no se usa para ajustar A durante el entrenamiento**, solo como entrada de B. Así se puede auditar qué parte de
  una recomendación se debe a la recuperación.

### 2.2 Componentes

| Componente | Paquete | Responsabilidad |
|---|---|---|
| Constructor de características | `@athlete/domain` (puro) | Calcula variables **a un instante de corte** (`asOf`): solo usa registros con `completedAt`/`measuredAt` < `asOf` y la versión del perfil vigente entonces. Mismo código para entrenar y para inferir |
| Modelos A y C | `@athlete/domain` (inferencia ligera) + entrenamiento fuera de línea (Python o TS) | Empezar con modelos **personales e interpretables** (§4). Artefacto versionado con hash |
| Política B | `@athlete/domain` | Reglas explícitas + salidas de A y C. Capa de seguridad con **redondeo al final** (corrige el error 1 de `carga-v1`) |
| Registro de predicciones | `packages/data` (local, sincronizable) | Ver §2.3 |
| Inferencia | En el dispositivo | Funciona sin conexión, los datos de salud no salen del teléfono y no hay que descargar el modelo de una URL pública |

### 2.3 Registro de predicciones y recomendaciones (corrige `carga-v1`)

Nueva entidad sincronizable `ModelOutput` (contrato por definir):
- `task` (A/B/C), `modelVersion` + `artifactSha256`, `asOf`, `featuresSnapshot`;
- salida y salida cruda; `clamped` + motivo;
- `targetSessionExerciseId` cuando aplica.

Reglas:
- La predicción **se enlaza con el ejercicio de sesión** al iniciar desde la rutina o al añadir el ejercicio, **no
  por fecha**. Así se cierra aunque se entrene otro día.
- **Nunca se borra ni se reemplaza.** Una nueva predicción para el mismo objetivo es otra fila; se evalúa la primera
  emitida antes del inicio.
- Se registra si la recomendación se **mostró**, se **aceptó** (sin cambios), se **modificó** o se **ignoró**.
  Sin esto no se distingue la exactitud de la adherencia (error 3 de `carga-v1`).
- El resultado se calcula con **todas las series de trabajo** (máxima, media, RIR alcanzado), con reglas definidas
  de antemano, y se recalcula si se editan.

### 2.4 Atletas híbridos

- **Carga interna común:** sRPE × duración para fuerza y cardio. Externa por disciplina: tonelaje e intensidad
  relativa en fuerza; distancia, ritmo y zonas en resistencia.
- A y B son **por disciplina** (fuerza por ejercicio; carrera y natación por tipo de sesión). C es **global** por
  persona, porque la fatiga se comparte.
- Interferencia: cardio intenso o largo en las 24–48 h previas es una variable de C y de A en fuerza (y viceversa).

### 2.5 Privacidad y seguridad

- Sueño, alimentación y medidas son datos de salud: consentimiento explícito y revocable por categoría, inferencia
  local y ningún dato a terceros sin consentimiento.
- Las salidas son **orientación de entrenamiento, no consejo médico**. C nunca diagnostica; señala desviaciones
  respecto a la propia línea base.
- La capa de seguridad de B es obligatoria y versionada: límites de subida y bajada, sin subir tras un fallo
  inesperado, y redondeo al disco disponible al final.

## 3. Métricas de evaluación

Todas con **validación de origen móvil** (*walk-forward*) por persona: se entrena hasta la semana *t* y se evalúa
*t + 1*. Se reportan por persona, por ejercicio o disciplina y en agregado (mediana e IQR entre personas, no solo la
media global). Siempre frente a líneas base explícitas.

### 3.1 A. Predicción de rendimiento

| Métrica | Definición |
|---|---|
| MAE / RMSE | Del e1RM (kg) o de las reps a una carga y RIR dados (reps), en la siguiente exposición al ejercicio |
| Calibración de intervalos | Cobertura empírica del intervalo del 80 % (objetivo: 75–85 %) y su anchura media |
| Sesgo | Error medio con signo (¿sobreestima sistemáticamente?) |
| Mejora frente a líneas base | (1) e1RM de la última sesión; (2) media de las últimas 3; (3) tendencia lineal personal |
| Curva de aprendizaje | Error frente al número de exposiciones al ejercicio (fija el umbral mínimo de historial con datos, que era el pendiente H3 de Diario Gym) |

### 3.2 B. Recomendación de carga

La verdad de terreno **no** es "la carga que eligió la persona": eso mide adherencia y es circular.

| Métrica | Definición |
|---|---|
| Acierto del objetivo de esfuerzo | En las series **realizadas con la carga recomendada**: % con RIR alcanzado dentro de objetivo ± 1, y error medio de RIR (alcanzado − objetivo) |
| Cumplimiento de reps | % de series en las que se completaron las reps objetivo |
| Fallos no previstos | % de series con RIR 0 o reps incompletas cuando el objetivo era RIR ≥ 2 (métrica de seguridad) |
| Tasa de recorte | % de recomendaciones modificadas por la capa de seguridad (alta = modelo mal calibrado) |
| Adherencia | % mostradas que se aceptan sin cambios; % modificadas al alza o a la baja (señal de confianza; **no** de exactitud) |
| Resultado a medio plazo | Cambio del e1RM a 4–8 semanas frente a la política base (doble progresión por RIR). Requiere un diseño dentro de la misma persona (bloques alternos) y muchas semanas: es una métrica de investigación, no de lanzamiento |

### 3.3 C. Evaluación de recuperación

No hay una verdad directa; se evalúa contra resultados posteriores observables.

| Métrica | Definición |
|---|---|
| Discriminación | AUC para anticipar sesiones con **rendimiento por debajo de lo esperado** (residuo de A < −1 DE personal) |
| Calibración | Proporción observada de sesiones bajas por categoría de C |
| Concordancia | Correlación con la disposición percibida declarada (validez convergente, no objetivo) |
| Estabilidad | Variación de C entre días sin cambios de entrenamiento ni sueño (no debe oscilar por ruido) |

### 3.4 Calidad de datos (umbral para emitir salidas)

- % de series de trabajo con RIR;
- % de días con sueño registrado;
- % de días con nutrición **completa** (no basta con algún registro);
- exposiciones por ejercicio;
- semanas de historial.

Por debajo de un umbral, la salida es "sin datos suficientes", no una estimación débil presentada como buena.

## 4. Plan por etapas

Cada etapa tiene criterios de entrada y salida. **Ninguna incluye entrenar con datos de Diario Gym.**

| Etapa | Contenido | Criterio de salida |
|---|---|---|
| **0. Fundamentos de datos** (ahora → integración) | Integración móvil ↔ `packages/data`. Contratos: sRPE de sesión, sueño (horas y calidad), cuestionario de bienestar, `Profile.sports`, incremento mínimo por ejercicio. Nutrición local y en servidor. Versionado del perfil | Ciclo completo validado en el simulador; las nuevas entidades sincronizan con pruebas |
| **1. Registro y líneas base** | `ModelOutput` (§2.3). Constructor de características con `asOf` y pruebas anti-fuga (una característica nunca cambia al añadir datos posteriores al corte). Política base B: doble progresión por RIR con capa de seguridad (redondeo al final). Métricas §3 calculadas en `domain` | La línea base se emite, registra y evalúa de punta a punta; panel interno con las métricas |
| **2. Modelo A personal** | Modelo jerárquico/bayesiano sencillo por persona y ejercicio (relación carga–reps–RIR con incertidumbre), con un *prior* poblacional ligero. Inferencia en el dispositivo | Con ≥ N exposiciones (N fijado por la curva de aprendizaje): mejora frente a las líneas base de §3.1 y cobertura calibrada |
| **3. Política B informada por A** | B elige la carga que, según A, deja el RIR objetivo, con límites. Comparación frente a la política base | Mejor acierto del objetivo de RIR y fallos no previstos ≤ base, durante ≥ 8 semanas de uso real |
| **4. Recuperación C** | Línea base personal con sueño, bienestar, carga aguda y crónica, interferencia de cardio. Se muestra separada; entra en B solo como ajuste acotado y explicado | AUC por encima de 0.5 con intervalo de confianza que lo excluya, en suficientes personas y semanas |
| **5. Nutrición y horizonte largo** | Disponibilidad energética estimada y proteína como variables de A a 4 semanas (la hipótesis H2 revisada) | Ablación preregistrada: el bloque nutricional mejora el error a 4 semanas |

Gobernanza en todas las etapas:
- artefactos versionados con hash;
- una sola versión activa por tarea;
- tarjeta del modelo (datos, métricas, limitaciones);
- preregistro de la métrica principal antes de evaluar;
- ninguna afirmación de "funciona" basada solo en datos simulados.
