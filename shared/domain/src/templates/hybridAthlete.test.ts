import { describe, expect, it } from 'vitest';
import { CreateTrainingBlockInput } from '@athlete/contracts';
import { HYBRID_ATHLETE_1_0 } from './hybridAthlete';
import { plannedDistanceMeters } from './types';

describe('Hybrid Athlete 1.0', () => {
  const t = HYBRID_ATHLETE_1_0;
  it('6 días de gimnasio, 3 de natación y descanso activo el domingo', () => {
    expect(t.sessions.filter((s) => s.modality === 'strength')).toHaveLength(4);
    expect(t.sessions.filter((s) => s.modality === 'conditioning')).toHaveLength(2);
    expect(t.sessions.filter((s) => s.modality === 'swim').map((s) => s.weekday)).toEqual([1, 3, 5]);
    expect(t.sessions.find((s) => s.weekday === 7)?.modality).toBe('mobility');
  });
  it('metros de natación como el plan original (1,400 / 1,200 / 1,500)', () => {
    expect(t.sessions.filter((s) => s.modality === 'swim').map(plannedDistanceMeters)).toEqual([1400, 1200, 1500]);
  });
  it('cada bloque es válido para el contrato (AMRAP con duración, etc.)', () => {
    for (const s of t.sessions) for (const [i, b] of s.blocks.entries()) {
      const parsed = CreateTrainingBlockInput.safeParse({
        id: '00000000-0000-7000-8000-000000000001', trainingDayId: '00000000-0000-7000-8000-000000000002', position: i, name: b.name, kind: b.kind,
        format: b.format, rounds: b.rounds ?? null, timeCapSeconds: b.timeCapSeconds ?? null, restSeconds: b.restSeconds ?? null, targetRpe: b.targetRpe ?? null, notes: b.notes ?? null,
      });
      expect(parsed.success, `${s.name} / ${b.name}`).toBe(true);
    }
  });
});

describe('todas las plantillas', () => {
  it('slugs únicos, días válidos y bloques válidos para el contrato', async () => {
    const { PROGRAM_TEMPLATES } = await import('./hybridAthlete');
    expect(PROGRAM_TEMPLATES.map((t) => t.slug)).toEqual(['hybrid-athlete-1-0', 'hibrido-3-dias', 'corredor-hibrido', 'hyrox-prep']);
    for (const t of PROGRAM_TEMPLATES) for (const s of t.sessions) {
      expect(s.weekday >= 1 && s.weekday <= 7, `${t.slug}/${s.name}`).toBe(true);
      for (const [i, b] of s.blocks.entries()) {
        const parsed = CreateTrainingBlockInput.safeParse({
          id: '00000000-0000-7000-8000-000000000001', trainingDayId: '00000000-0000-7000-8000-000000000002', position: i, name: b.name, kind: b.kind,
          format: b.format, rounds: b.rounds ?? null, timeCapSeconds: b.timeCapSeconds ?? null, restSeconds: b.restSeconds ?? null, targetRpe: b.targetRpe ?? null, notes: b.notes ?? null,
        });
        expect(parsed.success, `${t.slug}/${s.name}/${b.name}`).toBe(true);
      }
    }
  });
  it('corredor: 3 fuerza y 3 carrera; Hyrox: las 8 estaciones', async () => {
    const { HYBRID_RUNNER, HYROX_PREP } = await import('./moreTemplates');
    expect(HYBRID_RUNNER.sessions.filter((s) => s.modality === 'run')).toHaveLength(3);
    expect(HYBRID_RUNNER.sessions.filter((s) => s.modality === 'strength')).toHaveLength(3);
    const stations = new Set(HYROX_PREP.sessions.flatMap((s) => s.blocks.flatMap((b) => b.exercises.map((e) => e.slug))));
    for (const slug of ['ski-erg', 'sled-push', 'sled-pull', 'burpee-broad-jump', 'row-erg', 'farmers-carry', 'sandbag-lunge', 'wall-ball']) expect(stations.has(slug), slug).toBe(true);
  });
});
