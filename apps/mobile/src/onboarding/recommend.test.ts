import { parseBody, recommendProgram, sportsFor } from './recommend';

test('recomendación según meta, días y acceso', () => {
  expect(recommendProgram({ goal: 'hybrid', days: 6, access: ['gym', 'pool'] }).slug).toBe('hybrid-athlete-1-0');
  expect(recommendProgram({ goal: 'hybrid', days: 5, access: ['gym', 'run'] }).slug).toBe('corredor-hibrido');
  expect(recommendProgram({ goal: 'hybrid', days: 3, access: ['gym', 'pool'] }).slug).toBe('hibrido-3-dias');
  expect(recommendProgram({ goal: 'endurance', days: 6, access: ['gym', 'pool'] }).slug).toBe('hybrid-athlete-1-0');
  expect(recommendProgram({ goal: 'hyrox', days: 4, access: ['gym'] })).toMatchObject({ slug: 'hyrox-prep', reason: expect.stringContaining('quitando el rodaje') });
  expect(recommendProgram({ goal: 'health', days: 4, access: ['gym'] }).slug).toBe('hibrido-3-dias');
  expect(recommendProgram({ goal: 'strength', days: 5, access: ['gym'] }).slug).toBeNull();
});

test('disciplinas del perfil y datos del cuerpo', () => {
  expect(sportsFor({ goal: 'hybrid', access: ['gym', 'pool'] })).toEqual(['strength', 'functional_fitness', 'swimming']);
  expect(sportsFor({ goal: 'hyrox', access: ['gym'] })).toEqual(['strength', 'functional_fitness', 'running']);
  expect(parseBody({ heightCm: '175', weightKg: '78,5' })).toEqual({ ok: true, heightCm: 175, weightKg: 78.5 });
  expect(parseBody({ heightCm: '', weightKg: '' })).toEqual({ ok: true, heightCm: null, weightKg: null });
  expect(parseBody({ heightCm: '1.75', weightKg: '' })).toMatchObject({ ok: false });
});
