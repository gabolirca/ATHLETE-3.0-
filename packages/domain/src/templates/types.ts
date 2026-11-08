import type { BlockFormat, BlockKind, SessionModality } from '@athlete/contracts';

/**
 * Plantilla de programa: datos puros que la app convierte en plan + días + bloques + ejercicios del usuario.
 * Los ejercicios se nombran por `slug` del catálogo global (ids estables en `CATALOG_EXERCISE_ID`).
 */
export type TemplateExercise = {
  slug: string;
  sets?: number;
  repsMin?: number;
  repsMax?: number;
  durationSeconds?: number;
  distanceMeters?: number;
  restSeconds?: number;
  perSide?: boolean;
  targetRpe?: number;
  notes?: string;
};
export type TemplateBlock = {
  name: string;
  kind: BlockKind;
  format: BlockFormat;
  rounds?: number;
  timeCapSeconds?: number;
  restSeconds?: number;
  targetRpe?: number;
  notes?: string;
  exercises: TemplateExercise[];
};
export type TemplateSession = {
  name: string;
  /** 1 = lunes … 7 = domingo. */
  weekday: number;
  modality: SessionModality;
  targetRpe?: number;
  targetDurationMinutes?: number;
  notes?: string;
  blocks: TemplateBlock[];
};
export type ProgramTemplate = { slug: string; name: string; summary: string; notes: string[]; sessions: TemplateSession[] };

/** Metros planeados de una sesión (suma de distancia × series), útil para natación y carrera. */
export function plannedDistanceMeters(session: TemplateSession): number {
  return session.blocks.flatMap((b) => b.exercises.map((e) => (e.distanceMeters ?? 0) * (e.sets ?? 1) * (b.format === 'rounds' ? b.rounds ?? 1 : 1)))
    .reduce((a, b) => a + b, 0);
}
