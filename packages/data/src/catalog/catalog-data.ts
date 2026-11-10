/**
 * FUENTE ÚNICA del catálogo global de ATHLETE (ejercicios, músculos y equipo).
 * - `bundled.ts` construye con esto el catálogo que trae la app (sin red ni cuenta).
 * - `scripts/catalog-sql.ts` genera con esto el SQL de las migraciones de catálogo.
 * Una prueba de integración verifica que la app y el servidor coinciden.
 *
 * Reglas: los números (→ UUID) y los slugs NUNCA cambian ni se reutilizan; solo se agregan al final.
 * Para retirar un ejercicio se archiva en una migración, no se borra de aquí.
 */
export const CATALOG_VERSION = '2026-11-10.1';

// [n, slug, nombre]
export const MUSCLE_GROUPS: ReadonlyArray<readonly [number, string, string]> = [
  [1, 'chest', 'Pecho'], [2, 'back', 'Espalda'], [3, 'shoulders', 'Hombros'], [4, 'biceps', 'Bíceps'],
  [5, 'triceps', 'Tríceps'], [6, 'forearms', 'Antebrazos'], [7, 'core', 'Core'], [8, 'quadriceps', 'Cuádriceps'],
  [9, 'hamstrings', 'Isquiotibiales'], [10, 'glutes', 'Glúteos'], [11, 'calves', 'Pantorrillas'], [12, 'full-body', 'Cuerpo completo'],
  // 0.6.0
  [13, 'traps', 'Trapecio'], [14, 'lower-back', 'Espalda baja'], [15, 'adductors', 'Aductores'], [16, 'abductors', 'Abductores'],
];

export const EQUIPMENT: ReadonlyArray<readonly [number, string, string]> = [
  [1, 'barbell', 'Barra'], [2, 'dumbbell', 'Mancuernas'], [3, 'machine', 'Máquina'], [4, 'cable', 'Polea'],
  [5, 'bodyweight', 'Peso corporal'], [6, 'kettlebell', 'Kettlebell'], [7, 'pull-up-bar', 'Barra de dominadas'], [8, 'bench', 'Banco'],
  // 0.6.0
  [9, 'smith-machine', 'Máquina Smith'], [10, 'ez-bar', 'Barra Z'], [11, 'resistance-band', 'Banda elástica'],
  [12, 'trap-bar', 'Barra hexagonal'], [13, 'landmine', 'Landmine'], [14, 'medicine-ball', 'Balón medicinal'],
  [15, 'box', 'Cajón'], [16, 'ab-wheel', 'Rueda abdominal'],
  // 0.7.0 (motor híbrido)
  [17, 'rower', 'Remo (máquina)'], [18, 'stationary-bike', 'Bicicleta fija'], [19, 'treadmill', 'Caminadora'],
  [20, 'pool', 'Alberca'], [21, 'jump-rope', 'Cuerda para saltar'], [22, 'ski-erg', 'SkiErg'],
  [23, 'sled', 'Trineo'], [24, 'sandbag', 'Sandbag'],
];

export type CatalogLoadType = 'external' | 'bodyweight' | 'assisted' | 'time' | 'none';
export type CatalogExerciseRow = readonly [
  n: number, slug: string, name: string, loadType: CatalogLoadType,
  primary: readonly number[], secondary: readonly number[], equipment: readonly number[],
  pattern: string, mechanics: 'compound' | 'isolation', unilateral: 0 | 1, tier: 'free' | 'pro',
  /** 0.7.0: 'cardio' para máquinas, carrera y natación (no salen en el selector de fuerza). Por defecto 'strength'. */
  modality?: 'strength' | 'cardio',
];
export const modalityOf = (row: CatalogExerciseRow): 'strength' | 'cardio' => row[11] ?? 'strength';

const C = 'compound' as const;
const I = 'isolation' as const;
const F = 'free' as const;
const P = 'pro' as const;

// Músculos: 1 pecho · 2 espalda · 3 hombros · 4 bíceps · 5 tríceps · 6 antebrazos · 7 core · 8 cuádriceps
// 9 isquios · 10 glúteos · 11 pantorrillas · 12 cuerpo completo · 13 trapecio · 14 espalda baja · 15 aductores · 16 abductores
// Equipo: 1 barra · 2 mancuernas · 3 máquina · 4 polea · 5 peso corporal · 6 kettlebell · 7 barra dominadas · 8 banco
// 9 Smith · 10 barra Z · 11 banda · 12 barra hexagonal · 13 landmine · 14 balón medicinal · 15 cajón · 16 rueda abdominal
export const EXERCISES: ReadonlyArray<CatalogExerciseRow> = [
  // --- 0.1–0.3 (ids estables) ---
  [1, 'back-squat', 'Sentadilla trasera', 'external', [8, 10], [9, 7], [1], 'squat', C, 0, F],
  [2, 'bench-press', 'Press de banca', 'external', [1], [3, 5], [1, 8], 'horizontal_push', C, 0, F],
  [3, 'deadlift', 'Peso muerto', 'external', [9, 10, 2], [6, 7], [1], 'hinge', C, 0, F],
  [4, 'overhead-press', 'Press militar', 'external', [3], [5, 7], [1], 'vertical_push', C, 0, F],
  [5, 'barbell-row', 'Remo con barra', 'external', [2], [4], [1], 'horizontal_pull', C, 0, F],
  [6, 'pull-up', 'Dominadas', 'bodyweight', [2], [4], [7], 'vertical_pull', C, 0, F],
  [7, 'dip', 'Fondos', 'bodyweight', [5, 1], [3], [5], 'vertical_push', C, 0, F],
  [8, 'romanian-deadlift', 'Peso muerto rumano', 'external', [9], [10], [1], 'hinge', C, 0, F],
  [9, 'dumbbell-curl', 'Curl con mancuernas', 'external', [4], [6], [2], 'elbow_flexion', I, 0, F],
  [10, 'leg-press', 'Prensa de piernas', 'external', [8], [10], [3], 'squat', C, 0, F],
  [11, 'lat-pulldown', 'Jalón al pecho', 'external', [2], [4], [4], 'vertical_pull', C, 0, F],
  [12, 'plank', 'Plancha', 'time', [7], [], [5], 'core_anti_extension', I, 0, F],
  [13, 'seated-cable-row', 'Remo sentado en polea', 'external', [2], [4], [4], 'horizontal_pull', C, 0, F],

  // --- 0.6.0 · Pecho ---
  [14, 'incline-bench-press', 'Press inclinado con barra', 'external', [1], [3, 5], [1, 8], 'horizontal_push', C, 0, F],
  [15, 'decline-bench-press', 'Press declinado con barra', 'external', [1], [5], [1, 8], 'horizontal_push', C, 0, P],
  [16, 'dumbbell-bench-press', 'Press de banca con mancuernas', 'external', [1], [3, 5], [2, 8], 'horizontal_push', C, 0, F],
  [17, 'incline-dumbbell-press', 'Press inclinado con mancuernas', 'external', [1], [3, 5], [2, 8], 'horizontal_push', C, 0, F],
  [18, 'machine-chest-press', 'Press de pecho en máquina', 'external', [1], [3, 5], [3], 'horizontal_push', C, 0, F],
  [19, 'smith-bench-press', 'Press de banca en Smith', 'external', [1], [3, 5], [9, 8], 'horizontal_push', C, 0, P],
  [20, 'dumbbell-fly', 'Aperturas con mancuernas', 'external', [1], [3], [2, 8], 'chest_fly', I, 0, F],
  [21, 'cable-crossover', 'Cruce de poleas', 'external', [1], [3], [4], 'chest_fly', I, 0, P],
  [22, 'pec-deck', 'Aperturas en máquina (pec deck)', 'external', [1], [3], [3], 'chest_fly', I, 0, F],
  [23, 'push-up', 'Lagartijas', 'bodyweight', [1], [5, 3, 7], [5], 'horizontal_push', C, 0, F],
  [24, 'low-cable-fly', 'Aperturas en polea baja', 'external', [1], [3], [4], 'chest_fly', I, 0, P],
  [25, 'close-grip-bench-press', 'Press de banca agarre cerrado', 'external', [5], [1, 3], [1, 8], 'horizontal_push', C, 0, P],

  // --- Espalda ---
  [26, 'chin-up', 'Dominadas supinas', 'bodyweight', [2], [4], [7], 'vertical_pull', C, 0, F],
  [27, 'assisted-pull-up', 'Dominadas asistidas en máquina', 'assisted', [2], [4], [3], 'vertical_pull', C, 0, F],
  [28, 'one-arm-dumbbell-row', 'Remo con mancuerna a una mano', 'external', [2], [4], [2, 8], 'horizontal_pull', C, 1, F],
  [29, 't-bar-row', 'Remo en T', 'external', [2], [4, 13], [13], 'horizontal_pull', C, 0, P],
  [30, 'pendlay-row', 'Remo Pendlay', 'external', [2], [4, 14], [1], 'horizontal_pull', C, 0, P],
  [31, 'chest-supported-row', 'Remo con pecho apoyado', 'external', [2], [4], [2, 8], 'horizontal_pull', C, 0, P],
  [32, 'machine-row', 'Remo en máquina', 'external', [2], [4], [3], 'horizontal_pull', C, 0, F],
  [33, 'close-grip-lat-pulldown', 'Jalón agarre cerrado', 'external', [2], [4], [4], 'vertical_pull', C, 0, P],
  [34, 'straight-arm-pulldown', 'Pullover en polea', 'external', [2], [3], [4], 'vertical_pull', I, 0, P],
  [35, 'inverted-row', 'Remo invertido', 'bodyweight', [2], [4, 7], [5], 'horizontal_pull', C, 0, P],
  [36, 'face-pull', 'Face pull', 'external', [3], [13, 2], [4], 'horizontal_pull', I, 0, F],
  [37, 'barbell-shrug', 'Encogimientos con barra', 'external', [13], [6], [1], 'shrug', I, 0, P],
  [38, 'dumbbell-shrug', 'Encogimientos con mancuernas', 'external', [13], [6], [2], 'shrug', I, 0, F],
  [39, 'back-extension', 'Hiperextensiones', 'bodyweight', [14], [10, 9], [8], 'hinge', I, 0, P],
  [40, 'rack-pull', 'Rack pull', 'external', [2, 14], [10, 9, 13], [1], 'hinge', C, 0, P],

  // --- Hombros ---
  [41, 'dumbbell-shoulder-press', 'Press de hombro con mancuernas', 'external', [3], [5], [2, 8], 'vertical_push', C, 0, F],
  [42, 'arnold-press', 'Press Arnold', 'external', [3], [5], [2, 8], 'vertical_push', C, 0, P],
  [43, 'machine-shoulder-press', 'Press de hombro en máquina', 'external', [3], [5], [3], 'vertical_push', C, 0, F],
  [44, 'lateral-raise', 'Elevaciones laterales con mancuernas', 'external', [3], [13], [2], 'shoulder_raise', I, 0, F],
  [45, 'cable-lateral-raise', 'Elevación lateral en polea', 'external', [3], [13], [4], 'shoulder_raise', I, 1, P],
  [46, 'front-raise', 'Elevaciones frontales', 'external', [3], [1], [2], 'shoulder_raise', I, 0, P],
  [47, 'rear-delt-fly', 'Pájaros (deltoide posterior)', 'external', [3], [13, 2], [2], 'shoulder_raise', I, 0, P],
  [48, 'reverse-pec-deck', 'Aperturas inversas en máquina', 'external', [3], [13, 2], [3], 'shoulder_raise', I, 0, P],
  [49, 'upright-row', 'Remo al mentón', 'external', [3, 13], [4], [1], 'vertical_pull', C, 0, P],
  [50, 'push-press', 'Push press', 'external', [3], [8, 5, 7], [1], 'power', C, 0, P],
  [51, 'landmine-press', 'Press landmine', 'external', [3, 1], [5, 7], [13], 'vertical_push', C, 1, P],

  // --- Bíceps ---
  [52, 'barbell-curl', 'Curl con barra', 'external', [4], [6], [1], 'elbow_flexion', I, 0, F],
  [53, 'ez-bar-curl', 'Curl con barra Z', 'external', [4], [6], [10], 'elbow_flexion', I, 0, P],
  [54, 'hammer-curl', 'Curl martillo', 'external', [4, 6], [], [2], 'elbow_flexion', I, 0, F],
  [55, 'incline-dumbbell-curl', 'Curl inclinado con mancuernas', 'external', [4], [], [2, 8], 'elbow_flexion', I, 0, P],
  [56, 'preacher-curl', 'Curl predicador', 'external', [4], [], [10, 8], 'elbow_flexion', I, 0, P],
  [57, 'cable-curl', 'Curl en polea', 'external', [4], [6], [4], 'elbow_flexion', I, 0, P],
  [58, 'concentration-curl', 'Curl concentrado', 'external', [4], [], [2], 'elbow_flexion', I, 1, P],

  // --- Tríceps ---
  [59, 'triceps-pushdown', 'Extensión de tríceps en polea', 'external', [5], [], [4], 'elbow_extension', I, 0, F],
  [60, 'rope-pushdown', 'Extensión de tríceps con cuerda', 'external', [5], [], [4], 'elbow_extension', I, 0, P],
  [61, 'overhead-triceps-extension', 'Extensión de tríceps sobre la cabeza', 'external', [5], [], [2], 'elbow_extension', I, 0, F],
  [62, 'skull-crusher', 'Press francés', 'external', [5], [], [10, 8], 'elbow_extension', I, 0, P],
  [63, 'bench-dip', 'Fondos en banco', 'bodyweight', [5], [1, 3], [8], 'vertical_push', C, 0, P],
  [64, 'triceps-kickback', 'Patada de tríceps', 'external', [5], [], [2], 'elbow_extension', I, 1, P],
  [65, 'cable-overhead-triceps-extension', 'Extensión de tríceps en polea sobre la cabeza', 'external', [5], [], [4], 'elbow_extension', I, 0, P],

  // --- Antebrazos ---
  [66, 'wrist-curl', 'Curl de muñeca', 'external', [6], [], [1, 2], 'wrist', I, 0, P],
  [67, 'reverse-curl', 'Curl invertido', 'external', [6, 4], [], [1, 10], 'elbow_flexion', I, 0, P],

  // --- Cuádriceps y pierna ---
  [68, 'front-squat', 'Sentadilla frontal', 'external', [8], [10, 7], [1], 'squat', C, 0, P],
  [69, 'goblet-squat', 'Sentadilla goblet', 'external', [8, 10], [7], [2, 6], 'squat', C, 0, F],
  [70, 'hack-squat', 'Sentadilla hack', 'external', [8], [10], [3], 'squat', C, 0, P],
  [71, 'smith-squat', 'Sentadilla en Smith', 'external', [8, 10], [9], [9], 'squat', C, 0, P],
  [72, 'leg-extension', 'Extensión de cuádriceps', 'external', [8], [], [3], 'knee_extension', I, 0, F],
  [73, 'bulgarian-split-squat', 'Sentadilla búlgara', 'external', [8, 10], [9, 15], [2, 8], 'lunge', C, 1, F],
  [74, 'walking-lunge', 'Zancadas caminando', 'external', [8, 10], [9, 15], [2], 'lunge', C, 1, F],
  [75, 'reverse-lunge', 'Zancada hacia atrás', 'external', [8, 10], [9], [2], 'lunge', C, 1, P],
  [76, 'step-up', 'Subidas al cajón', 'external', [8, 10], [9], [15, 2], 'lunge', C, 1, P],
  [77, 'bodyweight-squat', 'Sentadilla con peso corporal', 'bodyweight', [8, 10], [], [5], 'squat', C, 0, F],
  [78, 'pistol-squat', 'Sentadilla a una pierna (pistol)', 'bodyweight', [8, 10], [7], [5], 'squat', C, 1, P],

  // --- Isquiotibiales y glúteos ---
  [79, 'sumo-deadlift', 'Peso muerto sumo', 'external', [10, 9, 15], [2, 8], [1], 'hinge', C, 0, P],
  [80, 'trap-bar-deadlift', 'Peso muerto con barra hexagonal', 'external', [10, 8, 9], [2, 13], [12], 'hinge', C, 0, P],
  [81, 'dumbbell-romanian-deadlift', 'Peso muerto rumano con mancuernas', 'external', [9], [10], [2], 'hinge', C, 0, F],
  [82, 'single-leg-romanian-deadlift', 'Peso muerto rumano a una pierna', 'external', [9, 10], [7], [2], 'hinge', C, 1, P],
  [83, 'good-morning', 'Buenos días con barra', 'external', [9], [14, 10], [1], 'hinge', C, 0, P],
  [84, 'lying-leg-curl', 'Curl femoral acostado', 'external', [9], [11], [3], 'knee_flexion', I, 0, F],
  [85, 'seated-leg-curl', 'Curl femoral sentado', 'external', [9], [], [3], 'knee_flexion', I, 0, F],
  [86, 'nordic-curl', 'Curl nórdico', 'bodyweight', [9], [], [5], 'knee_flexion', I, 0, P],
  [87, 'hip-thrust', 'Hip thrust con barra', 'external', [10], [9], [1, 8], 'hip_extension', C, 0, F],
  [88, 'glute-bridge', 'Puente de glúteo', 'bodyweight', [10], [9], [5], 'hip_extension', I, 0, F],
  [89, 'cable-kickback', 'Patada de glúteo en polea', 'external', [10], [9], [4], 'hip_extension', I, 1, P],
  [90, 'hip-abduction-machine', 'Abducción de cadera en máquina', 'external', [16, 10], [], [3], 'hip_abduction', I, 0, F],
  [91, 'hip-adduction-machine', 'Aducción de cadera en máquina', 'external', [15], [], [3], 'hip_adduction', I, 0, P],
  [92, 'kettlebell-swing', 'Kettlebell swing', 'external', [10, 9], [14, 7], [6], 'power', C, 0, P],

  // --- Pantorrillas ---
  [93, 'standing-calf-raise', 'Elevación de pantorrillas de pie', 'external', [11], [], [3], 'calf_raise', I, 0, F],
  [94, 'seated-calf-raise', 'Elevación de pantorrillas sentado', 'external', [11], [], [3], 'calf_raise', I, 0, P],
  [95, 'leg-press-calf-raise', 'Pantorrillas en prensa', 'external', [11], [], [3], 'calf_raise', I, 0, P],

  // --- Core y transporte ---
  [96, 'side-plank', 'Plancha lateral', 'time', [7], [16], [5], 'core_anti_extension', I, 1, P],
  [97, 'dead-bug', 'Dead bug', 'bodyweight', [7], [], [5], 'core_anti_extension', I, 0, F],
  [98, 'crunch', 'Crunch abdominal', 'bodyweight', [7], [], [5], 'core_flexion', I, 0, F],
  [99, 'hanging-leg-raise', 'Elevación de piernas colgado', 'bodyweight', [7], [6], [7], 'core_flexion', I, 0, P],
  [100, 'cable-crunch', 'Crunch en polea', 'external', [7], [], [4], 'core_flexion', I, 0, P],
  [101, 'ab-wheel-rollout', 'Rueda abdominal', 'bodyweight', [7], [2, 3], [16], 'core_anti_extension', I, 0, P],
  [102, 'russian-twist', 'Giros rusos', 'external', [7], [], [14, 5], 'core_rotation', I, 0, P],
  [103, 'pallof-press', 'Press Pallof', 'external', [7], [], [4, 11], 'core_rotation', I, 1, P],
  [104, 'farmers-carry', 'Caminata del granjero', 'external', [6, 13], [7, 10], [2, 6], 'carry', C, 0, P],
  [105, 'hollow-hold', 'Hollow hold', 'time', [7], [], [5], 'core_anti_extension', I, 0, P],

  // --- 0.7.0 · Motor híbrido: cardio, funcional y movilidad ---
  // Cardio (modality 'cardio'): se registran con tiempo y/o distancia; no cuentan como series de fuerza.
  [106, 'row-erg', 'Remo ergómetro', 'time', [12], [2, 8], [17], 'locomotion', C, 0, F, 'cardio'],
  [107, 'bike-erg', 'Bicicleta fija / air bike', 'time', [8], [10, 11], [18], 'locomotion', C, 0, F, 'cardio'],
  [108, 'run', 'Correr (pista o caminadora)', 'time', [8], [9, 10, 11], [19], 'locomotion', C, 0, F, 'cardio'],
  [109, 'swim-freestyle', 'Natación (libre)', 'time', [12], [2, 3], [20], 'locomotion', C, 0, F, 'cardio'],
  [110, 'swim-drills', 'Natación técnica (drills)', 'time', [12], [3], [20], 'locomotion', C, 0, F, 'cardio'],
  [111, 'walk', 'Caminata', 'time', [12], [], [], 'locomotion', C, 0, F, 'cardio'],
  [112, 'jump-rope', 'Saltar la cuerda', 'time', [11], [12], [21], 'locomotion', C, 0, F, 'cardio'],
  [113, 'ski-erg', 'SkiErg', 'time', [2], [5, 7], [22], 'locomotion', C, 0, P, 'cardio'],
  // Funcional (fuerza): sí cuentan como series.
  [114, 'wall-ball', 'Wall ball', 'external', [8, 3], [10], [14], 'power', C, 0, F],
  [115, 'burpee', 'Burpees', 'bodyweight', [12], [1, 8], [5], 'power', C, 0, F],
  [116, 'box-jump', 'Salto al cajón', 'bodyweight', [8], [10, 11], [15], 'power', C, 0, P],
  [117, 'thruster', 'Thruster', 'external', [8, 3], [10, 5], [1, 2], 'power', C, 0, P],
  // Movilidad: por tiempo, sin volumen.
  [118, 'mobility', 'Movilidad', 'time', [12], [], [], 'mobility', I, 0, F],

  // --- 0.7.0 · Estaciones de Hyrox ---
  [119, 'sled-push', 'Empuje de trineo', 'external', [8, 10], [11, 3], [23], 'power', C, 0, P],
  [120, 'sled-pull', 'Arrastre de trineo', 'external', [2, 9], [6, 10], [23], 'horizontal_pull', C, 0, P],
  [121, 'burpee-broad-jump', 'Burpee con salto largo', 'bodyweight', [12], [8, 10, 1], [5], 'power', C, 0, P],
  [122, 'sandbag-lunge', 'Zancadas con sandbag', 'external', [8, 10], [7, 9], [24], 'lunge', C, 0, P],
  // --- 10-nov: peso corporal y core por tiempo (pruebas reales de Gabo) ---
  [123, 'mountain-climber', 'Escaladores', 'bodyweight', [7], [12, 3], [5], 'core_anti_extension', C, 0, F],
  [124, 'jumping-jack', 'Jumping jacks', 'bodyweight', [12], [11], [5], 'power', C, 0, F],
  [125, 'bodyweight-lunge', 'Zancadas sin peso', 'bodyweight', [8, 10], [9], [5], 'lunge', C, 0, F],
  [126, 'jump-squat', 'Sentadilla con salto', 'bodyweight', [8, 10], [11], [5], 'power', C, 0, F],
  [127, 'wall-sit', 'Sentadilla isométrica en pared', 'time', [8], [10], [5], 'squat', I, 0, F],
  [128, 'diamond-push-up', 'Lagartijas diamante', 'bodyweight', [5, 1], [3], [5], 'horizontal_push', C, 0, P],
  [129, 'pike-push-up', 'Lagartijas pike', 'bodyweight', [3], [5], [5], 'vertical_push', C, 0, P],
  [130, 'incline-push-up', 'Lagartijas inclinadas', 'bodyweight', [1], [3, 5], [5, 8], 'horizontal_push', C, 0, F],
  [131, 'superman', 'Superman', 'bodyweight', [14], [10], [5], 'hip_extension', I, 0, F],
  [132, 'bicycle-crunch', 'Crunch bicicleta', 'bodyweight', [7], [], [5], 'core_rotation', I, 0, F],
  [133, 'lying-leg-raise', 'Elevación de piernas acostado', 'bodyweight', [7], [], [5], 'core_flexion', I, 0, F],
  [134, 'v-up', 'V-ups', 'bodyweight', [7], [], [5], 'core_flexion', I, 0, P],
  [135, 'flutter-kicks', 'Patadas de tijera', 'time', [7], [], [5], 'core_flexion', I, 0, F],
  [136, 'bear-crawl', 'Caminata de oso', 'time', [12], [3, 7], [5], 'carry', C, 0, P],
  [137, 'single-leg-glute-bridge', 'Puente de glúteo a una pierna', 'bodyweight', [10], [9], [5], 'hip_extension', I, 1, P],
  [138, 'bodyweight-calf-raise', 'Elevación de pantorrillas sin peso', 'bodyweight', [11], [], [5], 'calf_raise', I, 0, F],
  [139, 'plank-shoulder-tap', 'Plancha con toque de hombro', 'bodyweight', [7], [3], [5], 'core_anti_extension', I, 0, P],
  [140, 'l-sit', 'L-sit', 'time', [7], [5], [5], 'core_flexion', I, 0, P],
];
