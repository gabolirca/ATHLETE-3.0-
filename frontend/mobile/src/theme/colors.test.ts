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

test('cambiar de tema al momento: los colores y los estilos «themed» se actualizan sin reiniciar', async () => {
  await jest.isolateModulesAsync(async () => {
    const store = new Map<string, string>();
    jest.doMock('expo-secure-store', () => ({ getItem: () => null, setItemAsync: async (k: string, v: string) => { store.set(k, v); } }));
    const { colors, themed, setThemeMode, onThemeChange, themeVersion } = require('./colors');
    const s = themed(() => ({ card: { backgroundColor: colors.surface } }));
    expect(s.card.backgroundColor).toBe('#11151D');
    const seen: string[] = [];
    onThemeChange((m: string) => seen.push(m));
    await setThemeMode('light');
    expect(colors.surface).toBe('#FFFFFF');
    expect(s.card.backgroundColor).toBe('#FFFFFF');
    expect(seen).toEqual(['light']);
    expect(themeVersion()).toBe(1);
    expect(store.get('athlete3.theme')).toBe('light');
  });
});
