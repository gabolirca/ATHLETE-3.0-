import type { ProgramTemplate } from './types';

/** Híbrido 3 días: para empezar o con poco tiempo. 2 de fuerza de cuerpo completo y 1 funcional con cardio. */
export const HYBRID_3_DAYS: ProgramTemplate = {
  slug: 'hibrido-3-dias',
  name: 'Híbrido 3 días',
  summary: '2 días de fuerza de cuerpo completo y 1 funcional con cardio. Ideal para empezar o con poco tiempo.',
  notes: [
    'Deja al menos un día de descanso entre sesiones (por ejemplo lunes, miércoles y viernes).',
    'Fuerza a RPE 7–8: termina cada serie con 2 o 3 repeticiones en reserva.',
    'Cuando completes el rango alto de reps en todas las series, sube un poco el peso.',
  ],
  sessions: [
    {
      name: 'Cuerpo completo A', weekday: 1, modality: 'strength', targetRpe: 7.5, targetDurationMinutes: 60,
      blocks: [{ name: 'Fuerza', kind: 'strength', format: 'sets', exercises: [
        { slug: 'back-squat', sets: 3, repsMin: 6, repsMax: 8, restSeconds: 150 },
        { slug: 'bench-press', sets: 3, repsMin: 6, repsMax: 8, restSeconds: 150 },
        { slug: 'barbell-row', sets: 3, repsMin: 8, repsMax: 10, restSeconds: 120 },
        { slug: 'romanian-deadlift', sets: 2, repsMin: 10, repsMax: 10, restSeconds: 120 },
        { slug: 'plank', sets: 3, durationSeconds: 40, restSeconds: 60 },
      ] }],
    },
    {
      name: 'Funcional + cardio', weekday: 3, modality: 'conditioning', targetRpe: 7, targetDurationMinutes: 50,
      blocks: [
        { name: 'A · Calentamiento', kind: 'warmup', format: 'continuous', exercises: [{ slug: 'row-erg', durationSeconds: 300 }, { slug: 'mobility', durationSeconds: 300 }] },
        { name: 'B · Circuito', kind: 'conditioning', format: 'rounds', rounds: 4, restSeconds: 60, targetRpe: 7, exercises: [
          { slug: 'kettlebell-swing', repsMin: 15, repsMax: 15 }, { slug: 'goblet-squat', repsMin: 10, repsMax: 10 },
          { slug: 'push-up', repsMin: 10, repsMax: 10 }, { slug: 'row-erg', distanceMeters: 250 },
        ] },
        { name: 'C · Zona 2', kind: 'cardio', format: 'continuous', targetRpe: 5, notes: 'Ritmo en el que puedas platicar', exercises: [{ slug: 'bike-erg', durationSeconds: 900 }] },
      ],
    },
    {
      name: 'Cuerpo completo B', weekday: 5, modality: 'strength', targetRpe: 7.5, targetDurationMinutes: 60,
      blocks: [{ name: 'Fuerza', kind: 'strength', format: 'sets', exercises: [
        { slug: 'deadlift', sets: 3, repsMin: 5, repsMax: 5, restSeconds: 180 },
        { slug: 'overhead-press', sets: 3, repsMin: 6, repsMax: 8, restSeconds: 120 },
        { slug: 'pull-up', sets: 3, repsMin: 6, repsMax: 10, restSeconds: 120, notes: 'Si no salen, usa la máquina asistida' },
        { slug: 'walking-lunge', sets: 2, repsMin: 10, repsMax: 10, perSide: true, restSeconds: 90 },
        { slug: 'dead-bug', sets: 3, repsMin: 12, repsMax: 12, restSeconds: 45 },
      ] }],
    },
  ],
};

/** Corredor híbrido: 3 días de fuerza y 3 de carrera (series, rodaje y tirada larga). */
export const HYBRID_RUNNER: ProgramTemplate = {
  slug: 'corredor-hibrido',
  name: 'Corredor híbrido',
  summary: '3 días de fuerza y 3 de carrera: series, rodaje suave y tirada larga. Corre más rápido sin perder músculo.',
  notes: [
    'Cerca del 80 % de tus kilómetros deben ser suaves (puedes platicar). Solo las series son intensas.',
    'Sube la tirada larga como máximo un 10 % por semana.',
    'Haz la fuerza de pierna lejos de las series (al menos 24 h antes).',
  ],
  sessions: [
    {
      name: 'Fuerza · Inferior', weekday: 1, modality: 'strength', targetRpe: 7.5, targetDurationMinutes: 55,
      blocks: [{ name: 'Fuerza', kind: 'strength', format: 'sets', exercises: [
        { slug: 'back-squat', sets: 3, repsMin: 5, repsMax: 5, restSeconds: 150 },
        { slug: 'romanian-deadlift', sets: 3, repsMin: 8, repsMax: 8, restSeconds: 120 },
        { slug: 'bulgarian-split-squat', sets: 3, repsMin: 8, repsMax: 8, perSide: true, restSeconds: 90 },
        { slug: 'standing-calf-raise', sets: 3, repsMin: 15, repsMax: 15, restSeconds: 60 },
        { slug: 'side-plank', sets: 3, durationSeconds: 30, perSide: true, restSeconds: 45 },
      ] }],
    },
    {
      name: 'Carrera · Series', weekday: 2, modality: 'run', targetRpe: 8, targetDurationMinutes: 45,
      blocks: [
        { name: 'Calentamiento', kind: 'warmup', format: 'continuous', exercises: [{ slug: 'run', distanceMeters: 1500 }] },
        { name: 'Series', kind: 'cardio', format: 'intervals', targetRpe: 8, exercises: [{ slug: 'run', sets: 6, distanceMeters: 400, restSeconds: 90, notes: 'Trotando suave entre series' }] },
        { name: 'Enfriamiento', kind: 'cooldown', format: 'continuous', exercises: [{ slug: 'run', distanceMeters: 1000 }] },
      ],
    },
    {
      name: 'Fuerza · Superior', weekday: 3, modality: 'strength', targetRpe: 7.5, targetDurationMinutes: 50,
      blocks: [{ name: 'Fuerza', kind: 'strength', format: 'sets', exercises: [
        { slug: 'bench-press', sets: 3, repsMin: 6, repsMax: 6, restSeconds: 150 },
        { slug: 'pull-up', sets: 3, repsMin: 6, repsMax: 8, restSeconds: 120 },
        { slug: 'overhead-press', sets: 3, repsMin: 8, repsMax: 8, restSeconds: 120 },
        { slug: 'one-arm-dumbbell-row', sets: 3, repsMin: 10, repsMax: 10, perSide: true, restSeconds: 90 },
        { slug: 'face-pull', sets: 2, repsMin: 15, repsMax: 15, restSeconds: 60 },
      ] }],
    },
    {
      name: 'Carrera · Rodaje suave', weekday: 4, modality: 'run', targetRpe: 4, targetDurationMinutes: 40,
      blocks: [{ name: 'Rodaje', kind: 'cardio', format: 'continuous', targetRpe: 4, exercises: [{ slug: 'run', distanceMeters: 6000 }] }],
    },
    {
      name: 'Fuerza · Cuerpo completo', weekday: 5, modality: 'strength', targetRpe: 7.5, targetDurationMinutes: 50,
      blocks: [{ name: 'Fuerza', kind: 'strength', format: 'sets', exercises: [
        { slug: 'deadlift', sets: 3, repsMin: 5, repsMax: 5, restSeconds: 180 },
        { slug: 'hip-thrust', sets: 3, repsMin: 10, repsMax: 10, restSeconds: 90 },
        { slug: 'push-press', sets: 3, repsMin: 6, repsMax: 6, restSeconds: 120 },
        { slug: 'farmers-carry', sets: 3, distanceMeters: 30, restSeconds: 75 },
        { slug: 'dead-bug', sets: 3, repsMin: 12, repsMax: 12, restSeconds: 45 },
      ] }],
    },
    {
      name: 'Carrera · Tirada larga', weekday: 6, modality: 'run', targetRpe: 5, targetDurationMinutes: 75,
      blocks: [{ name: 'Tirada larga', kind: 'cardio', format: 'continuous', targetRpe: 5, notes: 'Suave y constante', exercises: [{ slug: 'run', distanceMeters: 12000 }] }],
    },
  ],
};

/**
 * Hyrox Prep: carrera + las 8 estaciones de Hyrox (SkiErg, trineo, burpee con salto, remo, granjero, sandbag, wall balls).
 * Fuerza, intervalos, técnica de estaciones, rodaje y una media simulación cada semana.
 */
export const HYROX_PREP: ProgramTemplate = {
  slug: 'hyrox-prep',
  name: 'Hyrox Prep',
  summary: 'Fuerza, carrera y las 8 estaciones de Hyrox, con una media simulación cada semana.',
  notes: [
    'Hyrox son 8 km de carrera con una estación después de cada kilómetro. Entrena a correr cansado.',
    'Alterna la media simulación: una semana las 4 primeras estaciones y la siguiente las 4 últimas.',
    'Los pesos del trineo y los wall balls dependen de tu categoría: ajústalos en cada ejercicio.',
  ],
  sessions: [
    {
      name: 'Fuerza Hyrox', weekday: 1, modality: 'strength', targetRpe: 7.5, targetDurationMinutes: 60,
      blocks: [{ name: 'Fuerza', kind: 'strength', format: 'sets', exercises: [
        { slug: 'back-squat', sets: 4, repsMin: 5, repsMax: 5, restSeconds: 150 },
        { slug: 'deadlift', sets: 3, repsMin: 5, repsMax: 5, restSeconds: 180 },
        { slug: 'overhead-press', sets: 3, repsMin: 6, repsMax: 6, restSeconds: 120 },
        { slug: 'pull-up', sets: 3, repsMin: 8, repsMax: 8, restSeconds: 120 },
        { slug: 'farmers-carry', sets: 4, distanceMeters: 50, restSeconds: 90 },
      ] }],
    },
    {
      name: 'Carrera · Intervalos', weekday: 2, modality: 'run', targetRpe: 8, targetDurationMinutes: 50,
      blocks: [
        { name: 'Calentamiento', kind: 'warmup', format: 'continuous', exercises: [{ slug: 'run', distanceMeters: 1500 }] },
        { name: 'Intervalos', kind: 'cardio', format: 'intervals', targetRpe: 8, exercises: [{ slug: 'run', sets: 5, distanceMeters: 1000, restSeconds: 90, notes: 'A ritmo de carrera Hyrox' }] },
        { name: 'Enfriamiento', kind: 'cooldown', format: 'continuous', exercises: [{ slug: 'run', distanceMeters: 1000 }] },
      ],
    },
    {
      name: 'Estaciones · Técnica', weekday: 3, modality: 'conditioning', targetRpe: 7, targetDurationMinutes: 60,
      blocks: [
        { name: 'A · Calentamiento', kind: 'warmup', format: 'continuous', exercises: [{ slug: 'row-erg', distanceMeters: 500 }, { slug: 'mobility', durationSeconds: 300 }] },
        { name: 'B · Estaciones 1–4', kind: 'conditioning', format: 'rounds', rounds: 3, restSeconds: 120, targetRpe: 7, exercises: [
          { slug: 'ski-erg', distanceMeters: 500 }, { slug: 'sled-push', distanceMeters: 25 }, { slug: 'sled-pull', distanceMeters: 25 }, { slug: 'burpee-broad-jump', distanceMeters: 20 },
        ] },
        { name: 'C · Estaciones 5–8', kind: 'conditioning', format: 'rounds', rounds: 3, restSeconds: 120, targetRpe: 7, exercises: [
          { slug: 'row-erg', distanceMeters: 500 }, { slug: 'farmers-carry', distanceMeters: 100 }, { slug: 'sandbag-lunge', distanceMeters: 50 }, { slug: 'wall-ball', repsMin: 25, repsMax: 25 },
        ] },
      ],
    },
    {
      name: 'Carrera · Rodaje', weekday: 4, modality: 'run', targetRpe: 4, targetDurationMinutes: 50,
      blocks: [{ name: 'Rodaje', kind: 'cardio', format: 'continuous', targetRpe: 4, exercises: [{ slug: 'run', distanceMeters: 8000 }] }],
    },
    {
      name: 'Media simulación Hyrox', weekday: 6, modality: 'conditioning', targetRpe: 8.5, targetDurationMinutes: 60,
      blocks: [
        { name: 'A · Calentamiento', kind: 'warmup', format: 'continuous', exercises: [{ slug: 'run', distanceMeters: 1000 }, { slug: 'mobility', durationSeconds: 300 }] },
        { name: 'B · 4 km + 4 estaciones', kind: 'wod', format: 'for_time', timeCapSeconds: 3600, targetRpe: 8.5, notes: 'Corre 1 km antes de cada estación. Registra tu tiempo total.', exercises: [
          { slug: 'run', distanceMeters: 1000 }, { slug: 'ski-erg', distanceMeters: 1000 },
          { slug: 'run', distanceMeters: 1000 }, { slug: 'sled-push', distanceMeters: 50 },
          { slug: 'run', distanceMeters: 1000 }, { slug: 'sled-pull', distanceMeters: 50 },
          { slug: 'run', distanceMeters: 1000 }, { slug: 'burpee-broad-jump', distanceMeters: 80 },
        ] },
      ],
    },
    {
      name: 'Movilidad', weekday: 7, modality: 'mobility', targetRpe: 2, targetDurationMinutes: 30,
      blocks: [{ name: 'Movilidad y caminata', kind: 'mobility', format: 'continuous', exercises: [{ slug: 'walk', durationSeconds: 1200 }, { slug: 'mobility', durationSeconds: 600 }] }],
    },
  ],
};
