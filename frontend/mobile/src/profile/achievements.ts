/** Logros del perfil: se calculan con tus datos reales, nada inventado. */
export type Achievement = { key: string; title: string; detail: string; icon: string; done: boolean };

export type AchievementInput = {
  workouts: number; cardio: number; bestStreak: number; weeksCompleted: number; records: number; benchmarks: number;
};

export function achievements(i: AchievementInput): Achievement[] {
  const total = i.workouts + i.cardio;
  return [
    { key: 'first', title: 'Primer entrenamiento', detail: 'Registraste tu primera sesión', icon: 'flag', done: total >= 1 },
    { key: 'ten', title: '10 sesiones', detail: `${Math.min(total, 10)} de 10`, icon: 'barbell', done: total >= 10 },
    { key: 'fifty', title: '50 sesiones', detail: `${Math.min(total, 50)} de 50`, icon: 'medal', done: total >= 50 },
    { key: 'hundred', title: '100 sesiones', detail: `${Math.min(total, 100)} de 100`, icon: 'trophy', done: total >= 100 },
    { key: 'streak7', title: 'Racha de 7 días', detail: `Tu mejor: ${i.bestStreak}`, icon: 'flash', done: i.bestStreak >= 7 },
    { key: 'streak30', title: 'Racha de 30 días', detail: `Tu mejor: ${i.bestStreak}`, icon: 'flame', done: i.bestStreak >= 30 },
    { key: 'weeks4', title: '4 semanas cumplidas', detail: 'Programa al 80 % o más, 4 seguidas', icon: 'calendar', done: i.weeksCompleted >= 4 },
    { key: 'record', title: 'Primer récord', detail: 'Superaste tu mejor marca', icon: 'trending-up', done: i.records >= 1 },
    { key: 'hybrid', title: 'Atleta híbrido', detail: 'Fuerza y cardio registrados', icon: 'git-merge', done: i.workouts >= 1 && i.cardio >= 1 },
    { key: 'wod', title: 'Primer WOD', detail: 'Registraste un AMRAP, EMOM o For time', icon: 'stopwatch', done: i.benchmarks >= 1 },
  ];
}
