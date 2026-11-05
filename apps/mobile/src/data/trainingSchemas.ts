import { z } from 'zod';
import { Rir, Sports } from '@athlete/contracts';

// These view models adapt form fields; shared domain ranges stay canonical in @athlete/contracts.
export const RoutineInputSchema = z.object({
  name: z.string().trim().min(2, 'Escribe un nombre de al menos 2 caracteres').max(60, 'Máximo 60 caracteres'),
  exercises: z.array(z.object({
    exerciseId: z.string().min(1),
    sets: z.number().int().min(1).max(12),
    reps: z.number().int().min(1).max(200),
    restSeconds: z.number().int().min(0).max(900),
    targetRir: Rir.nullable().optional(),
  })).min(1, 'Agrega al menos un ejercicio'),
});

export const LoggedSetSchema = z.object({
  weightKg: z.number().finite().min(0).max(1500).nullable(),
  reps: z.number().int().min(1).max(200).nullable(),
  rir: Rir.nullable(),
  isWarmup: z.boolean(),
});

export const BodyMeasurementSchema = z.object({
  type: z.enum(['weight_kg', 'waist_cm', 'chest_cm', 'hip_cm']),
  value: z.number().finite().positive().max(500),
  measuredAt: z.string().datetime(),
});

export const LocalAthletePreferencesSchema = z.object({
  displayName: z.string().trim().max(60),
  unitSystem: z.enum(['metric', 'imperial']),
  preferredSport: z.enum(['strength', 'hybrid', 'running', 'swimming']),
  sports: Sports.optional(),
  timezone: z.string().min(1).max(80),
});

export type RoutineInput = z.infer<typeof RoutineInputSchema>;
export type LoggedSetInput = z.infer<typeof LoggedSetSchema>;
export type BodyMeasurementInput = z.infer<typeof BodyMeasurementSchema>;
export type LocalAthletePreferencesInput = z.infer<typeof LocalAthletePreferencesSchema>;
