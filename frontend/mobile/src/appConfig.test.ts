/**
 * Guardas de configuración nativa que protegen la integridad de los datos locales.
 * Ver docs/architecture/android-backup.md y docs/contracts/contrato-seleccion-almacen.md §3.7.
 */
import appJson from '../app.json';

test('Android no respalda la base cifrada sin su clave (allowBackup: false)', () => {
  expect(appJson.expo.android.allowBackup).toBe(false);
});

test('la base local se compila con SQLCipher', () => {
  const sqlite = appJson.expo.plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === 'expo-sqlite');
  expect(sqlite).toEqual(['expo-sqlite', expect.objectContaining({ useSQLCipher: true })]);
});
