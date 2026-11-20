import { LoggedSetSchema, RoutineInputSchema } from './trainingSchemas';

describe('training form validation', () => {
  test('requires a named routine with at least one valid exercise and numeric targets', () => {
    expect(RoutineInputSchema.safeParse({ name: 'A', exercises: [] }).success).toBe(false);
    expect(RoutineInputSchema.safeParse({ name: 'Torso A', exercises: [{ exerciseId: 'bench', sets: 3, reps: 8, restSeconds: 90 }] }).success).toBe(true);
    expect(RoutineInputSchema.safeParse({ name: 'Torso A', exercises: [{ exerciseId: 'bench', sets: 99, reps: 8, restSeconds: 90 }] }).success).toBe(false);
  });

  test('keeps RIR optional and rejects out-of-range set values', () => {
    expect(LoggedSetSchema.safeParse({ weightKg: 60, reps: 8, rir: null, isWarmup: false }).success).toBe(true);
    expect(LoggedSetSchema.safeParse({ weightKg: -4, reps: 8, rir: 2, isWarmup: false }).success).toBe(false);
    expect(LoggedSetSchema.safeParse({ weightKg: 60, reps: 8, rir: 11, isWarmup: false }).success).toBe(false);
  });
});
