import type { Exercise } from '@/data/trainingTypes';
import { machineAlternatives } from './busyMachine';
import { splitSharedTargets } from './sharedTargets';

const ex = (id: string, name: string, pattern: string, muscle: string, equipment: string[]): Exercise => ({
  id, name, muscleGroup: muscle, equipment: equipment.join(', ') || null, origin: 'sample', equipmentList: equipment, movementPattern: pattern,
  modality: 'strength', muscleRoles: { primary: [{ slug: muscle, name: muscle }], secondary: [] },
});
const prensa = ex('1', 'Prensa de pierna', 'squat', 'cuadriceps', ['Máquina de prensa']);
const catalog = [
  prensa,
  ex('2', 'Prensa unilateral', 'squat', 'cuadriceps', ['Máquina de prensa']),
  ex('3', 'Sentadilla goblet', 'squat', 'cuadriceps', ['Mancuerna']),
  ex('4', 'Hack squat', 'squat', 'cuadriceps', ['Máquina hack']),
  ex('5', 'Extensión de cuádriceps', 'knee_extension', 'cuadriceps', ['Máquina de extensión']),
  ex('6', 'Press banca', 'horizontal_push', 'pecho', ['Barra']),
];

test('máquina ocupada: primero variantes en otro equipo, la misma máquina al final y nada de otro músculo', () => {
  const names = machineAlternatives(prensa, catalog).map((e) => e.name);
  expect(names).toEqual(['Hack squat', 'Sentadilla goblet', 'Extensión de cuádriceps', 'Prensa unilateral']);
  expect(names).not.toContain('Press banca');
});

test('ejercicio del plan cambiado a medias: el original se queda con lo hecho y la variante con lo que falta', () => {
  const done = { isWarmup: false, reps: 8, durationSeconds: null, distanceMeters: null };
  const items = [{ setsTarget: 4, sets: [done] }, { setsTarget: 4, sets: [] }, { setsTarget: 3, sets: [] }];
  expect(splitSharedTargets(items, ['p1', 'p1', 'p2']).map((e) => e.setsTarget)).toEqual([1, 3, 3]);
});
