/** Logros del perfil: se calculan con tus datos reales, nada inventado. */
export type Achievement = { key: string; title: string; detail: string; icon: string; tone: AchievementTone; done: boolean };
/** 'blue' es el rojo de la marca. */
export type AchievementTone = 'blue' | 'green' | 'amber' | 'cyan' | 'purple';
/** Íconos de MaterialCommunityIcons, todos de gimnasio. */

export type AchievementInput = {
  workouts: number; cardio: number; bestStreak: number; weeksCompleted: number; records: number;
};

export function achievements(i: AchievementInput): Achievement[] {
  const total = i.workouts + i.cardio;
  return [
    { key: 'first', title: 'Primer entrenamiento', detail: 'Registraste tu primera sesión', icon: 'weight-lifter', tone: 'blue', done: total >= 1 },
    { key: 'ten', title: '10 sesiones', detail: `${Math.min(total, 10)} de 10`, icon: 'dumbbell', tone: 'blue', done: total >= 10 },
    { key: 'fifty', title: '50 sesiones', detail: `${Math.min(total, 50)} de 50`, icon: 'weight-kilogram', tone: 'purple', done: total >= 50 },
    { key: 'hundred', title: '100 sesiones', detail: `${Math.min(total, 100)} de 100`, icon: 'trophy-variant', tone: 'amber', done: total >= 100 },
    { key: 'streak7', title: 'Racha de 7 días', detail: `Tu mejor: ${i.bestStreak}`, icon: 'fire', tone: 'blue', done: i.bestStreak >= 7 },
    { key: 'streak30', title: 'Racha de 30 días', detail: `Tu mejor: ${i.bestStreak}`, icon: 'fire-circle', tone: 'blue', done: i.bestStreak >= 30 },
    { key: 'weeks4', title: '4 semanas seguidas', detail: 'Entrenaste 4 semanas sin fallar', icon: 'calendar-check', tone: 'green', done: i.weeksCompleted >= 4 },
    { key: 'record', title: 'Primer récord', detail: 'Superaste tu mejor marca', icon: 'arm-flex', tone: 'amber', done: i.records >= 1 },
    { key: 'complete', title: 'Fuerza y cardio', detail: 'Registraste los dos', icon: 'run-fast', tone: 'cyan', done: i.workouts >= 1 && i.cardio >= 1 },
  ];
}
