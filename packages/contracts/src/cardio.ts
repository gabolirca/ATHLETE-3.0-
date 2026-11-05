import { z } from 'zod';
import { DataSource, IsoDateTime, LocalDate, Notes, SyncedRecord, TimeZone, Uuid } from './common';
import { Rpe } from './sets';

/** Actividades iniciales (especificación §6.5). */
export const CardioActivity = z.enum(['run', 'walk', 'swim', 'bike', 'row', 'circuit', 'hybrid']);
export type CardioActivity = z.infer<typeof CardioActivity>;

export const SwimStroke = z.enum(['freestyle', 'backstroke', 'breaststroke', 'butterfly', 'mixed']);
export type SwimStroke = z.infer<typeof SwimStroke>;

export const PoolType = z.enum(['pool', 'open_water']);
export type PoolType = z.infer<typeof PoolType>;

/** Detalle específico de natación; solo válido cuando `activity = 'swim'`. */
export const SwimDetails = z.object({
  poolType: PoolType,
  poolLengthMeters: z.number().positive().max(100).nullable(),
  laps: z.int().min(0).max(10_000).nullable(),
  stroke: SwimStroke.nullable(),
});
export type SwimDetails = z.infer<typeof SwimDetails>;

/**
 * Sesión cardiovascular. Separada de las series de fuerza (especificación §6.5).
 * Ritmo y velocidad **no se almacenan**: se derivan de duración y distancia en `@athlete/domain`.
 */
export const CardioSession = SyncedRecord.extend({
  activity: CardioActivity,
  trainingDayId: Uuid.nullable(),
  startedAt: IsoDateTime,
  timeZone: TimeZone,
  localDate: LocalDate,
  durationSeconds: z.int().min(1).max(86_400),
  distanceMeters: z.number().positive().max(1_000_000).nullable(),
  rounds: z.int().min(0).max(10_000).nullable(),
  reps: z.int().min(0).max(100_000).nullable(),
  rpe: Rpe.nullable(),
  avgHeartRateBpm: z.int().min(25).max(250).nullable(),
  maxHeartRateBpm: z.int().min(25).max(250).nullable(),
  swim: SwimDetails.nullable(),
  source: DataSource,
  notes: Notes.nullable(),
});
export type CardioSession = z.infer<typeof CardioSession>;

export const LogCardioSessionInput = z
  .object({
    id: Uuid,
    activity: CardioActivity,
    trainingDayId: Uuid.nullable().default(null),
    startedAt: IsoDateTime,
    timeZone: TimeZone,
    durationSeconds: CardioSession.shape.durationSeconds,
    distanceMeters: CardioSession.shape.distanceMeters.default(null),
    rounds: CardioSession.shape.rounds.default(null),
    reps: CardioSession.shape.reps.default(null),
    rpe: CardioSession.shape.rpe.default(null),
    avgHeartRateBpm: CardioSession.shape.avgHeartRateBpm.default(null),
    maxHeartRateBpm: CardioSession.shape.maxHeartRateBpm.default(null),
    swim: SwimDetails.nullable().default(null),
    source: DataSource.default('manual'),
    notes: Notes.nullable().default(null),
  })
  .refine((c) => c.activity === 'swim' || c.swim === null, {
    message: 'Los detalles de natación solo aplican a sesiones de natación',
    path: ['swim'],
  })
  .refine(
    (c) => c.avgHeartRateBpm === null || c.maxHeartRateBpm === null || c.avgHeartRateBpm <= c.maxHeartRateBpm,
    { message: 'La FC media no puede superar la máxima', path: ['avgHeartRateBpm'] },
  );
export type LogCardioSessionInput = z.input<typeof LogCardioSessionInput>;
