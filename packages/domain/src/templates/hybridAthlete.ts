import type { ProgramTemplate } from './types';

/**
 * "Hybrid Athlete 1.0": 6 días de gimnasio (4 de fuerza + 2 funcionales) y 3 sesiones de natación.
 * Objetivo: mejorar la capacidad cardiovascular sin sacrificar fuerza ni masa muscular.
 * Fuente: el plan con el que nació ATHLETE (docs del proyecto, `programa-hibrido-y-motor.md`).
 */
export const HYBRID_ATHLETE_1_0: ProgramTemplate = {
  slug: 'hybrid-athlete-1-0',
  name: 'Hybrid Athlete 1.0',
  summary: '4 días de fuerza, 2 funcionales y 3 de natación por semana. Más motor sin perder fuerza.',
  notes: [
    'Fuerza y accesorios a RPE 7–8; Engine a 6–7; WOD a 7–8; natación suave a 3–4 y aeróbica a 5–6.',
    'Si completas todas las reps con buena técnica y el RPE controlado, sube un poco la carga; si no, repite el peso.',
    'Cada 4–6 semanas revisa la fatiga y considera una semana de descarga.',
    'Los días funcionales no son competencias: no los conviertas en esfuerzos máximos.',
  ],
  sessions: [
    {
      name: 'Inferior A · Fuerza', weekday: 1, modality: 'strength', targetRpe: 7.5, targetDurationMinutes: 70,
      blocks: [{
        name: 'Fuerza', kind: 'strength', format: 'sets', exercises: [
          { slug: 'back-squat', sets: 3, repsMin: 5, repsMax: 6, restSeconds: 150 },
          { slug: 'romanian-deadlift', sets: 3, repsMin: 8, repsMax: 8, restSeconds: 120 },
          { slug: 'leg-press', sets: 2, repsMin: 10, repsMax: 10, restSeconds: 90 },
          { slug: 'lying-leg-curl', sets: 2, repsMin: 12, repsMax: 12, restSeconds: 75 },
          { slug: 'standing-calf-raise', sets: 3, repsMin: 12, repsMax: 15, restSeconds: 60 },
          { slug: 'plank', sets: 3, durationSeconds: 40, restSeconds: 60 },
        ],
      }],
    },
    {
      name: 'Natación · Recuperación', weekday: 1, modality: 'swim', targetRpe: 3.5, targetDurationMinutes: 50,
      blocks: [
        { name: 'Calentamiento', kind: 'warmup', format: 'continuous', exercises: [{ slug: 'swim-freestyle', distanceMeters: 200 }] },
        { name: 'Técnica', kind: 'swim', format: 'intervals', exercises: [{ slug: 'swim-drills', sets: 4, distanceMeters: 50, restSeconds: 20 }] },
        { name: 'Principal suave', kind: 'swim', format: 'continuous', targetRpe: 3.5, exercises: [{ slug: 'swim-freestyle', distanceMeters: 800 }] },
        { name: 'Enfriamiento', kind: 'cooldown', format: 'continuous', exercises: [{ slug: 'swim-freestyle', distanceMeters: 200 }] },
      ],
    },
    {
      name: 'Superior A · Fuerza', weekday: 2, modality: 'strength', targetRpe: 7.5, targetDurationMinutes: 70,
      blocks: [{
        name: 'Fuerza', kind: 'strength', format: 'sets', exercises: [
          { slug: 'pull-up', sets: 4, repsMin: 5, repsMax: 8, restSeconds: 150, notes: 'Estrictas' },
          { slug: 'bench-press', sets: 3, repsMin: 5, repsMax: 6, restSeconds: 150 },
          { slug: 'barbell-row', sets: 3, repsMin: 8, repsMax: 8, restSeconds: 120 },
          { slug: 'incline-bench-press', sets: 2, repsMin: 10, repsMax: 10, restSeconds: 90 },
          { slug: 'lateral-raise', sets: 3, repsMin: 12, repsMax: 15, restSeconds: 60 },
          { slug: 'face-pull', sets: 2, repsMin: 15, repsMax: 15, restSeconds: 60 },
        ],
      }],
    },
    {
      name: 'Engine · Acondicionamiento', weekday: 3, modality: 'conditioning', targetRpe: 6.5, targetDurationMinutes: 60,
      blocks: [
        { name: 'A · Calentamiento', kind: 'warmup', format: 'continuous', exercises: [
          { slug: 'row-erg', durationSeconds: 300 }, { slug: 'mobility', durationSeconds: 300 }, { slug: 'bodyweight-squat', sets: 2, repsMin: 15, repsMax: 15 },
        ] },
        { name: 'B · Circuito', kind: 'conditioning', format: 'rounds', rounds: 3, restSeconds: 90, targetRpe: 6.5, exercises: [
          { slug: 'row-erg', distanceMeters: 400 }, { slug: 'kettlebell-swing', repsMin: 15, repsMax: 15 },
          { slug: 'push-up', repsMin: 12, repsMax: 12 }, { slug: 'walking-lunge', repsMin: 20, repsMax: 20, notes: '20 pasos' },
        ] },
        { name: 'C · Zona 2', kind: 'cardio', format: 'continuous', targetRpe: 5, notes: '10–15 min a ritmo conversacional', exercises: [
          { slug: 'bike-erg', durationSeconds: 720 },
        ] },
      ],
    },
    {
      name: 'Natación · Técnica', weekday: 3, modality: 'swim', targetRpe: 4.5, targetDurationMinutes: 45,
      blocks: [
        { name: 'Calentamiento', kind: 'warmup', format: 'continuous', exercises: [{ slug: 'swim-freestyle', distanceMeters: 200 }] },
        { name: 'Drills', kind: 'swim', format: 'intervals', exercises: [{ slug: 'swim-drills', sets: 4, distanceMeters: 50, restSeconds: 20 }] },
        { name: 'Principal controlado', kind: 'swim', format: 'intervals', exercises: [{ slug: 'swim-freestyle', sets: 6, distanceMeters: 100, restSeconds: 20 }] },
        { name: 'Enfriamiento', kind: 'cooldown', format: 'continuous', exercises: [{ slug: 'swim-freestyle', distanceMeters: 200 }] },
      ],
    },
    {
      name: 'Inferior B · Fuerza', weekday: 4, modality: 'strength', targetRpe: 7.5, targetDurationMinutes: 70,
      blocks: [{
        name: 'Fuerza', kind: 'strength', format: 'sets', exercises: [
          { slug: 'deadlift', sets: 3, repsMin: 5, repsMax: 5, restSeconds: 180 },
          { slug: 'bulgarian-split-squat', sets: 3, repsMin: 8, repsMax: 8, perSide: true, restSeconds: 90 },
          { slug: 'hip-thrust', sets: 3, repsMin: 10, repsMax: 10, restSeconds: 90 },
          { slug: 'leg-extension', sets: 2, repsMin: 12, repsMax: 12, restSeconds: 75 },
          { slug: 'lying-leg-curl', sets: 2, repsMin: 12, repsMax: 12, restSeconds: 75 },
          { slug: 'standing-calf-raise', sets: 3, repsMin: 15, repsMax: 15, restSeconds: 60 },
          { slug: 'dead-bug', sets: 3, repsMin: 12, repsMax: 12, restSeconds: 45 },
        ],
      }],
    },
    {
      name: 'Superior B · Fuerza/Hipertrofia', weekday: 5, modality: 'strength', targetRpe: 7.5, targetDurationMinutes: 70,
      blocks: [{
        name: 'Fuerza', kind: 'strength', format: 'sets', exercises: [
          { slug: 'overhead-press', sets: 3, repsMin: 6, repsMax: 8, restSeconds: 120 },
          { slug: 'lat-pulldown', sets: 3, repsMin: 10, repsMax: 10, restSeconds: 90 },
          { slug: 'seated-cable-row', sets: 3, repsMin: 10, repsMax: 10, restSeconds: 90 },
          { slug: 'dumbbell-bench-press', sets: 3, repsMin: 10, repsMax: 10, restSeconds: 90 },
          { slug: 'dumbbell-curl', sets: 2, repsMin: 12, repsMax: 12, restSeconds: 60 },
          { slug: 'triceps-pushdown', sets: 2, repsMin: 12, repsMax: 12, restSeconds: 60 },
          { slug: 'face-pull', sets: 2, repsMin: 15, repsMax: 15, restSeconds: 60 },
        ],
      }],
    },
    {
      name: 'Natación · Aeróbica', weekday: 5, modality: 'swim', targetRpe: 5.5, targetDurationMinutes: 55,
      blocks: [
        { name: 'Calentamiento', kind: 'warmup', format: 'continuous', exercises: [{ slug: 'swim-freestyle', distanceMeters: 200 }] },
        { name: 'Continuo', kind: 'swim', format: 'continuous', targetRpe: 5.5, exercises: [{ slug: 'swim-freestyle', distanceMeters: 800 }] },
        { name: 'Intervalos', kind: 'swim', format: 'intervals', targetRpe: 6.5, exercises: [{ slug: 'swim-freestyle', sets: 4, distanceMeters: 100, restSeconds: 20 }] },
        { name: 'Enfriamiento', kind: 'cooldown', format: 'continuous', exercises: [{ slug: 'swim-freestyle', distanceMeters: 100 }] },
      ],
    },
    {
      name: 'Hybrid Conditioning', weekday: 6, modality: 'conditioning', targetRpe: 7.5, targetDurationMinutes: 75,
      blocks: [
        { name: 'A · Activación', kind: 'warmup', format: 'continuous', exercises: [{ slug: 'bike-erg', durationSeconds: 300 }, { slug: 'mobility', durationSeconds: 300 }] },
        { name: 'B · Fuerza funcional', kind: 'strength', format: 'sets', exercises: [
          { slug: 'goblet-squat', sets: 3, repsMin: 12, repsMax: 12, restSeconds: 75 },
          { slug: 'push-press', sets: 3, repsMin: 8, repsMax: 8, restSeconds: 90 },
          { slug: 'farmers-carry', sets: 3, distanceMeters: 30, restSeconds: 75 },
        ] },
        { name: 'C · AMRAP 15 min', kind: 'wod', format: 'amrap', timeCapSeconds: 900, targetRpe: 7.5, notes: 'Ritmo sostenible: no es una competencia.', exercises: [
          { slug: 'wall-ball', repsMin: 12, repsMax: 12 }, { slug: 'burpee', repsMin: 8, repsMax: 8 }, { slug: 'kettlebell-swing', repsMin: 12, repsMax: 12 },
          { slug: 'step-up', repsMin: 10, repsMax: 10 }, { slug: 'row-erg', distanceMeters: 200 },
        ] },
        { name: 'D · Vuelta a la calma', kind: 'cooldown', format: 'continuous', exercises: [{ slug: 'walk', durationSeconds: 300 }, { slug: 'mobility', durationSeconds: 300 }] },
      ],
    },
    {
      name: 'Descanso activo', weekday: 7, modality: 'mobility', targetRpe: 2, targetDurationMinutes: 40,
      blocks: [{ name: 'Caminata y movilidad', kind: 'mobility', format: 'continuous', exercises: [{ slug: 'walk', durationSeconds: 1800 }, { slug: 'mobility', durationSeconds: 600 }] }],
    },
  ],
};

export const PROGRAM_TEMPLATES: readonly ProgramTemplate[] = [HYBRID_ATHLETE_1_0];
