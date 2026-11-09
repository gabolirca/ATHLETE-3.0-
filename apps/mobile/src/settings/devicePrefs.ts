import { useCallback, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';

/**
 * Preferencias de ESTE teléfono (no se sincronizan): cómo se comporta la app en el gym.
 *  - strictRest: el descanso se muestra en pantalla completa y no se puede saltar.
 */
const STRICT_REST_KEY = 'athlete3.pref.strict-rest';

export async function getStrictRest(): Promise<boolean> {
  try { return (await SecureStore.getItemAsync(STRICT_REST_KEY)) === '1'; } catch { return false; }
}

export async function setStrictRest(value: boolean): Promise<void> {
  await SecureStore.setItemAsync(STRICT_REST_KEY, value ? '1' : '0');
}

export function useStrictRest(): [boolean, (value: boolean) => void] {
  const [value, setValue] = useState(false);
  useEffect(() => { void getStrictRest().then(setValue); }, []);
  const update = useCallback((next: boolean) => { setValue(next); void setStrictRest(next).catch(() => undefined); }, []);
  return [value, update];
}

/** El asistente de bienvenida ya se mostró en este teléfono (se completó o se saltó). */
const ONBOARDING_KEY = 'athlete3.onboarding.v1';
export async function getOnboardingDone(): Promise<boolean> {
  try { return (await SecureStore.getItemAsync(ONBOARDING_KEY)) === '1'; } catch { return true; }
}
export async function setOnboardingDone(done = true): Promise<void> {
  await SecureStore.setItemAsync(ONBOARDING_KEY, done ? '1' : '0');
}
