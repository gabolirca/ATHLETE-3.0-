import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTrainingRepository } from '@/data/MobileTrainingContext';
import type { Program, ProgramDay, ProgramWeekStatus } from '@/data/trainingTypes';
import { cardioActivityFor } from './format';

/** Programa activo del usuario (el primero) y lo hecho esta semana. Se recarga al volver a la pantalla. */
export function useProgram() {
  const repository = useTrainingRepository();
  const [program, setProgram] = useState<Program | null>(null);
  const [status, setStatus] = useState<ProgramWeekStatus>({});
  const [loaded, setLoaded] = useState(false);
  const refresh = useCallback(async () => {
    if (!repository) return;
    try {
      const [first] = await repository.listPrograms();
      setProgram(first ?? null);
      setStatus(first ? await repository.programWeekStatus(first.id) : {});
    } catch { setProgram(null); }
    finally { setLoaded(true); }
  }, [repository]);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  return { program, status, loaded, refresh };
}

/** Empieza (o retoma) un día del programa: nado/carrera abren el registro de cardio con el plan; lo demás, la sesión por bloques. */
export function useStartDay() {
  const router = useRouter();
  const repository = useTrainingRepository();
  return useCallback(async (day: ProgramDay, done?: { workoutId?: string; cardioId?: string }) => {
    if (done?.cardioId) { router.push(`/cardio/${done.cardioId}`); return; }
    if (done?.workoutId) { router.push(`/workout/${done.workoutId}`); return; }
    if (cardioActivityFor(day.modality)) { router.push(`/program/pool/${day.id}`); return; }
    if (!repository) return;
    try {
      const id = await repository.startProgramDay(day.id);
      router.push(`/workout/${id}`);
    } catch (error) {
      if (error instanceof Error && error.message === 'ACTIVE_WORKOUT_EXISTS') {
        const overview = await repository.getOverview().catch(() => null);
        Alert.alert('Tienes otra sesión en curso', 'Termínala antes de empezar esta.', [
          { text: 'Cancelar', style: 'cancel' },
          ...(overview?.latestWorkout?.state === 'active' ? [{ text: 'Ir a la sesión', onPress: () => router.push(`/workout/${overview.latestWorkout!.id}`) }] : []),
        ]);
      } else Alert.alert('No pudimos empezar la sesión', 'Intenta de nuevo.');
    }
  }, [repository, router]);
}
