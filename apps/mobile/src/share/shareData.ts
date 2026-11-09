import { formatDuration, isEffectiveSet, weeklySetsByMuscle, type SessionScore } from '@athlete/domain';
import type { CardioEntry, Exercise, Program, ProgramWeekStatus, WorkoutBlock, WorkoutDetail } from '@/data/trainingTypes';
import { activityLabel, describeCardio, type UnitSystem } from '@/cardio/cardioForm';
import { formatBlock, formatPrescription } from '@/program/format';
import { blockResultText, clock } from '@/workout/blocks';
import { workoutScore } from '@/workout/coach';

/**
 * Datos de las tarjetas para compartir (tipo Strava). Una sesión de gym no tiene mapa: su "huella" es la calificación y los
 * músculos (fuerza), el resultado del WOD (funcional), los metros y el ritmo (cardio) o la semana por colores (híbrido).
 */
export const SHARE_COLORS = { strength: '#1769FF', conditioning: '#F5B841', swim: '#3CC8E6', run: '#55D6A2', mobility: '#9B7BFF', muscles: ['#1769FF', '#55D6A2', '#F5B841', '#9B7BFF'] } as const;

const date = (iso: string) => new Date(iso).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });
const setLike = (s: { isWarmup: boolean; reps: number | null; weightKg: number | null }) =>
  ({ setType: s.isWarmup ? 'warmup' as const : 'working' as const, reps: s.reps, weightKg: s.weightKg, completedAt: s.reps !== null ? 'x' : null, deletedAt: null });

export type SessionCardData = {
  title: string; date: string; score: SessionScore | null; durationMin: number | null; load: number | null; sets: number;
  volumeKg: number; record: string | null; muscles: Array<{ name: string; sets: number; color: string }>;
};

export function sessionCard(detail: WorkoutDetail, catalog: ReadonlyMap<string, Exercise>): SessionCardData {
  const effective = detail.exercises.flatMap((e) => e.sets.map(setLike).filter(isEffectiveSet).map((s) => ({ ...s, e })));
  const volumeKg = effective.reduce((n, s) => n + (s.weightKg ?? 0) * (s.reps ?? 0), 0);
  const roles = (id: string) => { const r = catalog.get(id)?.muscleRoles; return r ? { primary: r.primary.map((m) => m.slug), secondary: r.secondary.map((m) => m.slug) } : undefined; };
  const names = new Map<string, string>();
  for (const e of catalog.values()) for (const m of [...(e.muscleRoles?.primary ?? []), ...(e.muscleRoles?.secondary ?? [])]) names.set(m.slug, m.name);
  const bySlug = weeklySetsByMuscle([{ exercises: detail.exercises.map((e) => ({ exerciseId: e.exerciseId, sets: e.sets.map(setLike) })) }], roles);
  const muscles = [...bySlug.entries()].filter(([slug]) => slug !== 'full-body').sort((a, b) => b[1] - a[1]).slice(0, 4)
    .map(([slug, sets], i) => ({ name: names.get(slug) ?? slug, sets, color: SHARE_COLORS.muscles[i]! }));
  const rec = detail.exercises.flatMap((e) => (e.newRecords ?? []).map((r) => ({ r, e }))).find(({ r }) => r.kind === 'max_weight') ?? detail.exercises.flatMap((e) => (e.newRecords ?? []).map((r) => ({ r, e })))[0];
  const minutes = detail.workout.durationMinutes;
  return {
    title: detail.dayName ?? 'Entrenamiento', date: date(detail.workout.startedAt), score: workoutScore(detail), durationMin: minutes,
    load: detail.sessionRpe && minutes ? Math.round(detail.sessionRpe * minutes) : null, sets: effective.length, volumeKg: Math.round(volumeKg),
    record: rec ? `${rec.e.exerciseName} ${rec.r.weightKg ?? ''} kg × ${rec.r.reps ?? ''}`.replace(/\s+/g, ' ').trim() : null, muscles,
  };
}

/** Bloque del que se presume: el último AMRAP / por tiempo / rondas con resultado. */
export function featuredBlock(detail: WorkoutDetail): WorkoutBlock | null {
  return [...(detail.blocks ?? [])].reverse().find((b) => b.result && ['amrap', 'for_time', 'rounds', 'emom'].includes(b.format)) ?? null;
}

export type WodCardData = {
  title: string; date: string; blockLabel: string; big: string; unit: string; recipe: string[]; delta: string | null;
  rpe: number | null; durationMin: number | null; load: number | null;
};

/** "AMRAP 15 min" (sin repetir si el nombre ya lo dice) o "Finisher · Por tiempo". */
export function blockLabel(block: WorkoutBlock): string {
  const name = block.name.replace(/^[A-Z] · /, '');
  const format = formatBlock(block).split(' · RPE')[0]!;
  return name.toLowerCase().includes(format.toLowerCase()) ? name : `${name} · ${format}`;
}

/** "6+4" (AMRAP), "12:34" (por tiempo) y la comparación con la vez anterior. */
export function wodCard(detail: WorkoutDetail, block: WorkoutBlock, previous: { roundsCompleted: number | null; extraReps: number | null; durationSeconds: number | null } | null): WodCardData {
  const r = block.result!;
  let big = blockResultText(block) ?? '—';
  let unit = '';
  let delta: string | null = null;
  if (block.format === 'amrap' && r.roundsCompleted !== null) {
    big = r.extraReps ? `${r.roundsCompleted}+${r.extraReps}` : String(r.roundsCompleted);
    unit = r.extraReps ? 'rondas + reps' : 'rondas';
    if (previous?.roundsCompleted != null) {
      const d = r.roundsCompleted - previous.roundsCompleted;
      delta = d > 0 ? `+${d} ${d === 1 ? 'ronda' : 'rondas'} vs la vez pasada` : d === 0 ? ((r.extraReps ?? 0) > (previous.extraReps ?? 0) ? `+${(r.extraReps ?? 0) - (previous.extraReps ?? 0)} reps vs la vez pasada` : 'Igual que la vez pasada') : null;
    }
  } else if (block.format === 'for_time' && r.durationSeconds) {
    big = clock(r.durationSeconds); unit = 'tiempo';
    if (previous?.durationSeconds) { const d = previous.durationSeconds - r.durationSeconds; delta = d > 0 ? `${clock(d)} más rápido que la vez pasada` : null; }
  } else unit = 'completadas';
  const recipe = detail.exercises.filter((e) => e.blockId === block.id).map((e) => {
    const p = formatPrescription({ sets: null, repsMin: e.repsTarget, repsMax: e.repsMax ?? e.repsTarget, durationSeconds: e.targetDurationSeconds ?? null, distanceMeters: e.targetDistanceMeters ?? null, perSide: e.perSide ?? false });
    return p ? `${p} ${e.exerciseName.toLowerCase()}` : e.exerciseName;
  });
  const minutes = detail.workout.durationMinutes;
  return {
    title: detail.dayName ?? 'Entrenamiento', date: date(detail.workout.startedAt), blockLabel: blockLabel(block),
    big, unit, recipe, delta, rpe: detail.sessionRpe ?? null, durationMin: minutes, load: detail.sessionRpe && minutes ? Math.round(detail.sessionRpe * minutes) : null,
  };
}

export type CardioCardData = { title: string; date: string; big: string; unit: string; stats: Array<[string, string]>; color: string };

export function cardioCard(entry: CardioEntry, unitSystem: UnitSystem): CardioCardData {
  const d = describeCardio(entry, unitSystem);
  const stats: Array<[string, string]> = [['tiempo', d.duration]];
  if (d.pace) stats.push([entry.activity === 'bike' ? 'velocidad' : 'ritmo', d.pace]);
  if (entry.rpe) stats.push(['RPE', String(entry.rpe)]);
  if (entry.rpe) stats.push(['carga', String(Math.round(entry.rpe * entry.durationSeconds / 60))]);
  const [value, unit] = d.distance ? d.distance.split(' ') : [formatDuration(entry.durationSeconds), 'min'];
  const color = entry.activity === 'swim' ? SHARE_COLORS.swim : entry.activity === 'circuit' || entry.activity === 'hybrid' ? SHARE_COLORS.conditioning : SHARE_COLORS.run;
  const title = entry.notes?.includes(' — ') ? entry.notes.split(' — ')[0]! : activityLabel(entry.activity);
  return { title, date: date(entry.startedAt), big: value!, unit: unit!, stats: d.distance ? stats : stats.slice(1), color };
}

export type WeekCardData = {
  programName: string; days: Array<{ label: string; bars: Array<{ color: string; done: boolean; height: number }> }>;
  done: number; planned: number; stats: Array<[string, string]>;
};

export function weekCard(program: Program, status: ProgramWeekStatus, extra: { swimMeters: number; runMeters: number; strengthSets: number; load: number }): WeekCardData {
  const days = [1, 2, 3, 4, 5, 6, 7].map((w) => ({
    label: 'LMMJVSD'[w - 1]!,
    bars: program.days.filter((d) => d.weekday === w).map((d) => ({
      color: d.modality === 'swim' ? SHARE_COLORS.swim : d.modality === 'run' || d.modality === 'bike' || d.modality === 'row' ? SHARE_COLORS.run
        : d.modality === 'conditioning' ? SHARE_COLORS.conditioning : d.modality === 'mobility' ? SHARE_COLORS.mobility : SHARE_COLORS.strength,
      done: Boolean(status[d.id] && !status[d.id]!.active), height: Math.max(12, Math.min(48, (d.targetDurationMinutes ?? 40) * 0.6)),
    })),
  }));
  const done = program.days.filter((d) => status[d.id] && !status[d.id]!.active).length;
  const stats: Array<[string, string]> = [['sesiones', `${done} / ${program.days.length}`]];
  if (extra.swimMeters) stats.push(['nadé', extra.swimMeters >= 1000 ? `${(extra.swimMeters / 1000).toFixed(1)} km` : `${extra.swimMeters} m`]);
  if (extra.runMeters) stats.push(['corrí', `${(extra.runMeters / 1000).toFixed(1)} km`]);
  if (extra.strengthSets) stats.push(['fuerza', `${extra.strengthSets} series`]);
  if (extra.load) stats.push(['carga', extra.load.toLocaleString('es-MX')]);
  return { programName: program.name, days, done, planned: program.days.length, stats: stats.slice(0, 4) };
}
