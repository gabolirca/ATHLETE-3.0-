# Informe — Auditoría del modelo predictivo de Diario Gym v2 (GymAI)

**Agente:** Claude · **Fecha:** 4 de noviembre de 2026
**Alcance:** solo lectura. No se modificó ni se copió nada de Diario Gym a ATHLETE. No se entrenó ningún modelo.

Leyenda: **[V]** verificado (código leído o ejecutado) · **[R]** reportado por una fuente que no pude verificar ·
**[H]** hipótesis.

---

## 0. Fuentes y limitación principal

| Fuente pedida | Estado |
|---|---|
| Respaldo de Diario Gym v2 con `codigo/`, `base_de_datos/` y `LEEME.md` | **No encontrado en este equipo.** Busqué en `~` (profundidad 8, incluido iCloud Drive), en la indexación de Spotlight y en todo el disco interno (profundidad 7): no existen `base_de_datos` ni un `LEEME.md` de Diario Gym. Solo existen los `LEEME.md` de otro proyecto (Puntos de venta) |
| Código del sistema | Repositorio fuente `~/GYM/diario-gym` (git, `HEAD 837424b`): `ml/`, `supabase/migrations/`, `supabase/functions/sugerir-carga/`, `v2/modelo.json`, `v2/index.html`. Probablemente es el mismo contenido que `codigo/` del respaldo **[H]** |
| Datos (predicciones, entrenamientos) | No disponibles: el proyecto Supabase `gymai-v2` dejó de existir el 3-nov-2026 y no tengo el respaldo |

**Consecuencia:** todo lo relativo al *modelo y su metodología* está verificado en código. Todo lo relativo a *datos
reales y resultados en producción* no se pudo verificar. **Para cerrar la auditoría necesito la ruta del respaldo.**

### Cifras de 166 predicciones y 38 con error

- **No verificadas contra el respaldo** (no disponible).
- Coinciden con una lectura directa que hice de la base viva `gymai-v2` el 3-nov-2026, antes de que desapareciera:
  `predictions` 166, de ellas 38 con `error_kg`; `model_versions` 1. Es una corroboración independiente del número
  reportado, pero **no** prueba que el respaldo las contenga íntegras.
- Datos reales en esa misma lectura **[R]**: 19 entrenamientos de **1 usuario** (2026-09-14 → 2026-10-28), 391 series
  (6 sin RIR), 21 pesos corporales, 12 registros de sueño, 9 de nutrición (5 no manuales), 5 de natación y 14 usuarios
  de Auth.
- **No conozco los valores de `error_kg`**, así que **no se puede calcular el MAE en producción**.

## 1. Qué sistema predictivo había

Hay **cuatro estimadores**; solo uno es un modelo entrenado.

| Sistema | Tipo | Dónde |
|---|---|---|
| **Carga sugerida (`carga-v1`)** | Random Forest de regresión, entrenado | `ml/`, `v2/modelo.json`, Edge Function `sugerir-carga` |
| 1RM estimado | Fórmula de Epley | vistas y cliente |
| Calificación de sesión 0–100 | Heurística ponderada: esfuerzo 40, progresión 25, registro 20, constancia 15 | migración 18 + cliente |
| Porcentaje "estimado por foto" | Estimación por imagen (IA externa), marcada como estimada | cliente / `food_scans` |

El resto del informe trata `carga-v1`.

## 2. Ficha del modelo `carga-v1` [V]

| Aspecto | Valor |
|---|---|
| Algoritmo | `RandomForestRegressor` de scikit-learn exportado a JSON: **40 árboles, profundidad máxima 6** (medida en el archivo), 3 674 nodos. Inferencia en TypeScript/Deno |
| Paridad Python ↔ JS | Comprobada: en las 50 filas de `modelo_muestra.json`, diferencia máxima 5 × 10⁻⁷ |
| Variable objetivo | `target_delta_kg = top_weight_kg(siguiente sesión del ejercicio) − top_weight_kg(actual)`. Es decir, **el cambio de carga que la persona eligió la próxima vez**, no su capacidad ni su rendimiento |
| Entradas | 28 numéricas + 6 categóricas en one-hot (51 columnas) |
| Numéricas | sesión nº; edad; estatura; meses de experiencia; incremento mínimo; carga máxima, reps medias, RIR medio y mínimo, volumen y e1RM de la sesión; cargas de las 3 sesiones previas; RIR de las 2 previas; volumen y e1RM previos; días desde la sesión anterior; % de cambio frente a la anterior; sueño 7 días; peso corporal 7 días; kcal, objetivo, balance, proteína (g y g/kg) y días registrados (7 días) |
| Categóricas | sexo, objetivo, grupo muscular, patrón de movimiento, equipo, compuesto |
| Excluida a propósito | `days_to_next_session` (se conoce a posteriori) |
| Valores faltantes | Se rellenan con la mediana del entrenamiento; categorías no vistas → vector de ceros |
| Postproceso | Redondeo al incremento del ejercicio + capa de seguridad: ≤ +2 incrementos, ≤ +10 %, ≥ −20 % |
| Mínimo de historial | `min_sesiones = 2` del mismo ejercicio |
| **Datos de entrenamiento** | **Solo sintéticos** (`entrenado_con: "datos sintéticos"`). Nunca vio un entrenamiento real |
| Validación | Partición temporal por serie usuario × ejercicio (último 25 %) + partición por usuarios no vistos (25 %) |
| Métricas | MAE, RMSE (kg); % dentro de ±1 incremento; % exacto; mejora frente a la mejor línea base (persistencia, progresión lineal, doble progresión por RIR) |
| Resultado declarado (sintético) | `modelo.json`: MAE 0.902 kg; usuarios nuevos 0.925 kg; mejor línea base 1.768 kg (persistencia) |

## 3. Hallazgos

### 3.1 Errores demostrados [V]

1. **Sugiere cargas que no existen.** La Edge Function y `evaluador.js` redondean al incremento y *después*
   aplican los topes del 10 % y del 20 %, que no son múltiplos del incremento. Lo ejecuté con las funciones reales
   del repositorio:

   | Carga actual | Incremento | Delta del modelo | Sugerido |
   |---|---|---|---|
   | 20 kg | 2.5 | +3 | **22 kg** |
   | 30 kg | 2.5 | +5 | **33 kg** |
   | 12 kg | 1 | +2 | **13.2 kg** |
   | 40 kg | 5 | −15 | **32 kg** |
   | 22.5 kg | 2.5 | +10 | **24.75 kg** |

   Ocurre cuando se activa un tope, sobre todo con cargas ligeras. `entrenar.py` usa el orden contrario
   (tope → redondeo), así que **las métricas de validación no corresponden al sistema desplegado**.
2. **El cierre del ciclo mide algo distinto de lo que predice el modelo.** El disparador `close_prediction_loop`
   calcula `error_kg = predicted_weight_kg − weight_kg` con la **primera serie de trabajo insertada**. El modelo
   predice la **carga máxima** de la sesión. Con series de aproximación o pirámides, el error está sesgado.
3. **El error se contamina por la propia sugerencia.** El botón `usarSugerencia` copia la carga sugerida en **todas**
   las series del ejercicio. Si la persona la acepta, `error_kg = 0` por construcción. En producción, el MAE mediría
   la **adherencia**, no la exactitud.
4. **Se borran predicciones ya cerradas.** Cada llamada ejecuta
   `delete from predictions where user_id = … and predicted_for = fecha` sin excluir las que ya tienen
   `actual_set_id`. Pedir la sugerencia de nuevo el mismo día destruye el error ya medido y crea predicciones nuevas.
   Si la sesión ya estaba registrada, la nueva predicción usa como "última sesión" la de ese mismo día: **fuga de
   información**.
5. **Se predice para todos los ejercicios con historial**, no solo para los de la sesión del día. Las predicciones
   de ejercicios no entrenados ese día nunca se cierran.
6. **El cierre exige la fecha exacta** (`predicted_for = performed_on`) y solo se dispara al insertar. Editar el peso
   después no recalcula el error. Si la Edge Function no recibe fecha, usa la fecha UTC.
7. **La trazabilidad no coincide.** El registro de la migración 20 declara `n_samples 13 088`, 160 usuarios y MAE
   0.908. El `modelo.json` publicado declara 13 798 filas, MAE 0.902 y 0.925 en usuarios nuevos. No se puede afirmar
   qué artefacto exacto produjo cada predicción. Además, el modelo se descarga de una URL pública (GitHub Pages) sin
   hash ni versión fijada.
8. **`target_rir` no es un objetivo:** se guarda el RIR medio de la última sesión.

### 3.2 Explicación probable de "166 / 38" [H]

Los hallazgos 4, 5 y 6 bastan para que la mayoría de predicciones quede abierta aunque la persona entrene: se
predicen todos los ejercicios con historial, solo cierran los que se entrenan ese mismo día y se borran las cerradas
si se vuelve a pedir la sugerencia. El cociente 38/166 (23 %) es compatible con esto, pero **no es una medida de
uso ni de exactitud**. Para confirmarlo hace falta el respaldo: cruzar `predictions` con `workout_sets` por ejercicio
y fecha.

### 3.3 Calidad de los datos

- **Sintéticos** (los que se usaron para entrenar):
  - El generador decide la carga siguiente con una regla de autorregulación basada en el RIR observado y las
    repeticiones hechas, que son a su vez entradas del modelo. El modelo aprende esa regla (las variables más
    importantes son `avg_reps`, `pct_change_vs_prev`, `min_rir` y `avg_rir`).
  - El propio README lo reconoce: el modelo aprende a anticipar la decisión de carga, no la fisiología.
  - El buen MAE sintético es, en buena parte, **circular**.
  - Simplificaciones irreales: `avg_rir = min_rir`, siempre 3 series, RIR entero 0–6, nutrición y sueño registrados
    cada día.
- **Reales** **[R]**: 1 usuario y 19 sesiones en 6 semanas. Con ~100 filas utilizables como máximo **[H]**, no se
  puede entrenar ni validar con rigor un bosque de 51 variables. Nutrición y sueño, escasos (9 y 12 registros).
- **Vista `v_ml_dataset`** **[V]**:
  - Ventanas correctas: nutrición y sueño de los 7 días previos.
  - El peso corporal incluye el mismo día (aceptable si se pesa antes de entrenar).
  - `sexo`, `objetivo`, `training_since` y estatura son valores **actuales** del perfil aplicados a filas
    históricas: fuga leve si cambiaron.
  - Fecha sin hora: dos sesiones del mismo ejercicio en un día se agregan.

### 3.4 Sobreajuste y fuga

| Riesgo | Situación |
|---|---|
| Fuga temporal dentro de una serie | Bien controlada (partición temporal por serie) |
| Fuga entre series del mismo usuario | La partición es por serie, no por calendario: el entrenamiento puede incluir sesiones de otros ejercicios **posteriores** a las de prueba. Inocuo con datos sintéticos independientes; relevante con datos reales (fatiga compartida) |
| Fuga en inferencia | Hallazgo 4 (repredicción tras registrar) |
| Variable a posteriori | `days_to_next_session` excluida correctamente |
| Sobreajuste al simulador | Alto: las métricas reflejan los supuestos del generador. Ya hubo un error previo de esos supuestos (adaptación absoluta en lugar de relativa, documentado en el README) |
| Sobreajuste con datos reales | No aplicable: nunca se reentrenó con datos reales |
| Selección del modelo | Se eligió con el mismo conjunto de prueba en el que se reporta → optimista |
| Hipótesis H2 (nutrición) | Bien tratada: la ablación muestra que no aporta en un horizonte de una sesión (−2.1 %), y el README propone un horizonte de 4 semanas |

## 4. ¿Reutilizar o reconstruir?

**Conviene reconstruir el modelo y reutilizar la metodología.**

Se reutiliza (buenas decisiones, verificadas en código):
- predecir el **cambio** y no la carga absoluta;
- líneas base explícitas contra las que hay que ganar;
- partición temporal y por usuario nuevo;
- capa de seguridad que registra cuándo recorta;
- **registrar la predicción antes de la sesión, con una instantánea de las variables**;
- exclusión de variables a posteriori;
- ablaciones para contrastar hipótesis.

No se reutiliza:
- el artefacto `carga-v1`: solo datos sintéticos, objetivo = decisión del usuario, error 1 sin corregir;
- el mecanismo de cierre de predicciones: errores 2–6;
- el generador sintético como evidencia: sí como herramienta para probar el flujo.

**No se copió ningún dato ni código a ATHLETE.** La propuesta de evolución está en
`docs/architecture/adaptive-training.md`.

## 5. Para cerrar esta auditoría

1. Ruta del respaldo (`codigo/`, `base_de_datos/`, `LEEME.md`). Con él:
   - verificar 166/38;
   - calcular el MAE real de las 38 y cuántas eran `error_kg = 0`;
   - distinguir cerradas por adherencia de las cerradas por desacuerdo;
   - cruzar las abiertas con los ejercicios entrenados;
   - comprobar qué versión del modelo estaba publicada en cada fecha.
2. Confirmar si el respaldo incluye `model_versions`, `predictions.features` y el historial de `modelo.json`.
