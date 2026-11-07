import { LogCardioSessionInput } from '@athlete/contracts';
import { EMPTY_FORM, describeCardio, parseCardioForm, parseNumber, type CardioFormValues, type UnitSystem } from './cardioForm';

const now = new Date('2026-11-05T18:00:00');
const ctx: { now: Date; unitSystem: UnitSystem; timeZone: string } = { now, unitSystem: 'metric', timeZone: 'America/Mexico_City' };
const form = (patch: Partial<CardioFormValues>): CardioFormValues => ({ ...EMPTY_FORM, ...patch });

function draftOf(values: CardioFormValues, context = ctx) {
  const r = parseCardioForm(values, context);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.draft;
}

describe('parseNumber', () => {
  test('acepta coma o punto decimal; vacío es null; texto es NaN', () => {
    expect(parseNumber('5,25')).toBe(5.25);
    expect(parseNumber(' 10.5 ')).toBe(10.5);
    expect(parseNumber('')).toBeNull();
    expect(parseNumber('5 km')).toBeNaN();
    expect(parseNumber('-3')).toBeNaN();
  });
});

describe('parseCardioForm', () => {
  test('carrera de hoy terminada ahora: el inicio es ahora menos la duración; pasa el contrato', () => {
    const draft = draftOf(form({ activity: 'run', minutes: '30', seconds: '15', distance: '5,2', rpe: 7, avgHeartRate: '150', maxHeartRate: '172' }));
    expect(draft.durationSeconds).toBe(1815);
    expect(draft.distanceMeters).toBe(5200);
    expect(new Date(draft.startedAt).getTime()).toBe(now.getTime() - 1815 * 1000);
    expect(draft).toMatchObject({ rpe: 7, avgHeartRateBpm: 150, maxHeartRateBpm: 172, swim: null, notes: null, rounds: null });
    expect(LogCardioSessionInput.safeParse({ ...draft, id: '0190f0f0-0000-7000-8000-000000000001' }).success).toBe(true);
  });

  test('sistema imperial: la distancia se escribe en millas y se guarda en metros', () => {
    const draft = draftOf(form({ minutes: '40', distance: '3.1' }), { ...ctx, unitSystem: 'imperial' });
    expect(draft.distanceMeters).toBe(4988.97);
  });

  test('campos opcionales vacíos se guardan como null, nunca como cero', () => {
    const draft = draftOf(form({ activity: 'walk', minutes: '20' }));
    expect(draft).toMatchObject({ distanceMeters: null, rpe: null, avgHeartRateBpm: null, maxHeartRateBpm: null });
  });

  test('un día pasado exige hora de inicio; con hora, el inicio es ese día a esa hora', () => {
    const missing = parseCardioForm(form({ date: '2026-11-04', minutes: '45' }), ctx);
    expect(missing.ok).toBe(false);
    expect(!missing.ok && missing.errors.startTime).toMatch(/hora/);
    const draft = draftOf(form({ date: '2026-11-04', startTime: '07:30', minutes: '45' }));
    const started = new Date(draft.startedAt);
    expect([started.getDate(), started.getHours(), started.getMinutes()]).toEqual([4, 7, 30]);
    const older = new Date(draftOf(form({ date: '2026-10-28', startTime: '06:00', minutes: '30' })).startedAt);
    expect([older.getMonth(), older.getDate()]).toEqual([9, 28]);
  });

  test('no se registran días futuros', () => {
    const r = parseCardioForm(form({ date: '2026-11-06', startTime: '07:00', minutes: '10' }), ctx);
    expect(!r.ok && r.errors.startTime).toBe('No puedes registrar días futuros.');
  });

  test('una hora de inicio en el futuro se rechaza', () => {
    const r = parseCardioForm(form({ startTime: '23:00', minutes: '10' }), ctx);
    expect(!r.ok && r.errors.startTime).toBe('Esa hora todavía no llega hoy. Si fue ayer, cambia el día.');
  });

  test('duración obligatoria, minutos y segundos menores a 60, máximo 24 h', () => {
    expect(parseCardioForm(form({}), ctx)).toMatchObject({ ok: false, errors: { minutes: expect.stringMatching(/obligatoria/) } });
    expect(parseCardioForm(form({ minutes: '75' }), ctx).ok).toBe(false);
    expect(parseCardioForm(form({ hours: '25' }), ctx).ok).toBe(false);
    expect(parseCardioForm(form({ minutes: '1.5' }), ctx).ok).toBe(false);
  });

  test('frecuencia cardiaca: rango 25–250 y media ≤ máxima', () => {
    expect(parseCardioForm(form({ minutes: '10', avgHeartRate: '300' }), ctx)).toMatchObject({ ok: false, errors: { avgHeartRate: expect.any(String) } });
    expect(parseCardioForm(form({ minutes: '10', avgHeartRate: '170', maxHeartRate: '160' }), ctx)).toMatchObject({ ok: false, errors: { avgHeartRate: expect.stringMatching(/mayor/) } });
  });

  test('natación en alberca: guarda largos y largo de alberca; la distancia en metros es opcional', () => {
    const draft = draftOf(form({ activity: 'swim', minutes: '30', laps: '40', poolLength: '25', stroke: 'freestyle' }));
    expect(draft.swim).toEqual({ poolType: 'pool', poolLengthMeters: 25, laps: 40, stroke: 'freestyle' });
    expect(draft.distanceMeters).toBeNull();
    expect(draftOf(form({ activity: 'swim', minutes: '30', distance: '1500' })).distanceMeters).toBe(1500);
  });

  test('natación en aguas abiertas no guarda alberca ni largos', () => {
    const draft = draftOf(form({ activity: 'swim', minutes: '20', openWater: true, laps: '12' }));
    expect(draft.swim).toEqual({ poolType: 'open_water', poolLengthMeters: null, laps: null, stroke: null });
  });

  test('los detalles de natación nunca se guardan en otras actividades', () => {
    expect(draftOf(form({ activity: 'run', minutes: '20', laps: '12' })).swim).toBeNull();
  });

  test('circuito: sin distancia, con rondas', () => {
    const draft = draftOf(form({ activity: 'circuit', minutes: '25', rounds: '5', distance: '3' }));
    expect(draft).toMatchObject({ distanceMeters: null, rounds: 5 });
  });

  test('las notas vacías son null y se recortan', () => {
    expect(draftOf(form({ minutes: '10', notes: '   ' })).notes).toBeNull();
    expect(draftOf(form({ minutes: '10', notes: '  buen ritmo ' })).notes).toBe('buen ritmo');
  });
});

describe('describeCardio', () => {
  test('carrera: ritmo por km o por milla', () => {
    expect(describeCardio({ activity: 'run', durationSeconds: 1500, distanceMeters: 5000, swim: null }, 'metric'))
      .toEqual({ label: 'Correr', duration: '25:00', distance: '5.00 km', pace: '5:00 /km' });
    expect(describeCardio({ activity: 'run', durationSeconds: 1500, distanceMeters: 5000, swim: null }, 'imperial'))
      .toMatchObject({ distance: '3.11 mi', pace: '8:03 /mi' });
  });

  test('bici: velocidad; natación: ritmo por 100 m derivado de largos', () => {
    expect(describeCardio({ activity: 'bike', durationSeconds: 3600, distanceMeters: 30000, swim: null }, 'metric').pace).toBe('30.0 km/h');
    expect(describeCardio({ activity: 'swim', durationSeconds: 1200, distanceMeters: null, swim: { poolType: 'pool', poolLengthMeters: 25, laps: 40, stroke: null } }, 'metric'))
      .toMatchObject({ distance: '1000 m', pace: '2:00 /100 m' });
  });

  test('sin distancia no hay ritmo inventado', () => {
    expect(describeCardio({ activity: 'circuit', durationSeconds: 900, distanceMeters: null, swim: null }, 'metric'))
      .toEqual({ label: 'Circuito', duration: '15:00', distance: null, pace: null });
  });
});
