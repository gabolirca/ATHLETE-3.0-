import { localDateOfDevice } from '@/lib/localDate';

export type WeekDay = { label: string; localDate: string; done: boolean; today: boolean };
const LABELS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

/** Lunes a domingo de la semana de `today`, marcando los días con entrenamiento. */
export function weekDays(doneLocalDates: readonly string[], today: Date): WeekDay[] {
  const done = new Set(doneLocalDates);
  const mondayOffset = (today.getDay() + 6) % 7;
  const todayKey = localDateOfDevice(today);
  return LABELS.map((label, i) => {
    const localDate = localDateOfDevice(new Date(today.getFullYear(), today.getMonth(), today.getDate() - mondayOffset + i));
    return { label, localDate, done: done.has(localDate), today: localDate === todayKey };
  });
}
