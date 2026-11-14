test('tema claro: se lee al cargar y cambia fondos y texto', () => {
  jest.isolateModules(() => {
    jest.doMock('expo-secure-store', () => ({ getItem: () => 'light' }));
    const { colors, themeMode } = require('./colors');
    expect(themeMode).toBe('light');
    expect(colors.surface).toBe('#FFFFFF');
    expect(colors.text).toBe('#0E1320');
  });
});

test('sin preferencia (o si falla la lectura) queda el tema oscuro', () => {
  jest.isolateModules(() => {
    jest.doMock('expo-secure-store', () => ({ getItem: () => { throw new Error('x'); } }));
    const { colors, themeMode } = require('./colors');
    expect(themeMode).toBe('dark');
    expect(colors.text).toBe('#F4F6FA');
  });
});
