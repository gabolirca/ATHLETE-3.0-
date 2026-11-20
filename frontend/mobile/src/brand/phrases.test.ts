import { PHRASES, _resetPhrases, nextPhrase, sessionPhrase } from './phrases';

test('180 frases distintas; una por apertura y la siguiente nunca repite la anterior', () => {
  expect(PHRASES).toHaveLength(180);
  expect(new Set(PHRASES).size).toBe(180);
  _resetPhrases();
  const first = sessionPhrase(() => 0.5);
  expect(sessionPhrase(() => 0.1)).toBe(first); // misma durante la sesión
  expect(nextPhrase(() => 0.5)).not.toBe(first); // mismo número al azar → se recorre a la siguiente
});
