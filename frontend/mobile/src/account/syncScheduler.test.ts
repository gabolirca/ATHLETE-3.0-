import { SyncScheduler, type SyncOutcome } from './syncScheduler';

const OPTIONS = { debounceMs: 3_000, retryBaseMs: 15_000, retryMaxMs: 60_000 };

function setup(outcomes: SyncOutcome[] = [], pending = { value: true }) {
  const calls: number[] = [];
  const sync = jest.fn(async () => { calls.push(Date.now()); return outcomes.shift() ?? 'ok'; });
  const hasPending = jest.fn(async () => pending.value);
  const scheduler = new SyncScheduler({ sync, hasPending }, OPTIONS);
  return { scheduler, sync, hasPending, pending };
}

async function advance(ms: number) { await jest.advanceTimersByTimeAsync(ms); }

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('SyncScheduler', () => {
  test('no sincroniza mientras no haya sesión vinculada', async () => {
    const { scheduler, sync } = setup();
    scheduler.notifyChange();
    scheduler.onForeground();
    await advance(10_000);
    expect(sync).not.toHaveBeenCalled();
  });

  test('al activarse sincroniza enseguida (primera subida tras vincular)', async () => {
    const { scheduler, sync } = setup();
    scheduler.setEnabled(true);
    await advance(0);
    expect(sync).toHaveBeenCalledTimes(1);
  });

  test('varios cambios seguidos producen una sola sincronización, 3 s después del último', async () => {
    const { scheduler, sync } = setup();
    scheduler.setEnabled(true);
    await advance(0);
    sync.mockClear();
    scheduler.notifyChange();
    await advance(2_000);
    scheduler.notifyChange();
    await advance(2_000);
    scheduler.notifyChange();
    await advance(2_999);
    expect(sync).not.toHaveBeenCalled();
    await advance(1);
    expect(sync).toHaveBeenCalledTimes(1);
  });

  test('sin conexión reintenta con espera creciente y con tope', async () => {
    const { scheduler, sync } = setup(['ok', 'offline', 'offline', 'offline', 'offline', 'ok']);
    scheduler.setEnabled(true);
    await advance(0);                 // ok (inicial)
    scheduler.notifyChange();
    await advance(3_000);             // offline #1 → espera 15 s
    expect(sync).toHaveBeenCalledTimes(2);
    await advance(15_000);            // offline #2 → espera 30 s
    expect(sync).toHaveBeenCalledTimes(3);
    await advance(29_999);
    expect(sync).toHaveBeenCalledTimes(3);
    await advance(1);                 // offline #3 → espera 60 s (tope)
    expect(sync).toHaveBeenCalledTimes(4);
    await advance(60_000);            // offline #4 → sigue en 60 s
    expect(sync).toHaveBeenCalledTimes(5);
    expect(scheduler.consecutiveFailures).toBe(4);
    await advance(60_000);            // ok → se reinicia
    expect(sync).toHaveBeenCalledTimes(6);
    expect(scheduler.consecutiveFailures).toBe(0);
    await advance(600_000);
    expect(sync).toHaveBeenCalledTimes(6);
  });

  test('no reintenta si ya no queda nada pendiente', async () => {
    const pending = { value: true };
    const { scheduler, sync } = setup(['ok', 'error'], pending);
    scheduler.setEnabled(true);
    await advance(0);
    scheduler.notifyChange();
    pending.value = true;
    await advance(3_000);
    expect(sync).toHaveBeenCalledTimes(2);
    pending.value = false;
    await advance(600_000);
    expect(sync).toHaveBeenCalledTimes(2);
  });

  test('un cambio sin pendientes reales no llama al servidor', async () => {
    const { scheduler, sync, pending } = setup();
    scheduler.setEnabled(true);
    await advance(0);
    sync.mockClear();
    pending.value = false;
    scheduler.notifyChange();
    await advance(3_000);
    expect(sync).not.toHaveBeenCalled();
  });

  test('volver a primer plano sincroniza siempre (descarga cambios de otros dispositivos) y reinicia la espera', async () => {
    const { scheduler, sync, pending } = setup(['ok', 'offline']);
    scheduler.setEnabled(true);
    await advance(0);
    scheduler.notifyChange();
    await advance(3_000);
    expect(scheduler.consecutiveFailures).toBe(1);
    pending.value = false;
    scheduler.onForeground();
    await advance(0);
    expect(sync).toHaveBeenCalledTimes(3);
    expect(scheduler.consecutiveFailures).toBe(0);
  });

  test('al irse a segundo plano sube lo pendiente de inmediato, sin esperar los 3 s', async () => {
    const { scheduler, sync } = setup();
    scheduler.setEnabled(true);
    await advance(0);
    sync.mockClear();
    scheduler.notifyChange();
    scheduler.onBackground();
    await advance(0);
    expect(sync).toHaveBeenCalledTimes(1);
    await advance(10_000);
    expect(sync).toHaveBeenCalledTimes(1);
  });

  test('nunca hay dos sincronizaciones a la vez; un cambio durante la sync se atiende después', async () => {
    let release!: () => void;
    let active = 0; let maxActive = 0;
    const sync = jest.fn(() => new Promise<SyncOutcome>((resolve) => {
      active += 1; maxActive = Math.max(maxActive, active);
      release = () => { active -= 1; resolve('ok'); };
    }));
    const scheduler = new SyncScheduler({ sync, hasPending: async () => true }, OPTIONS);
    scheduler.setEnabled(true);
    await advance(0);
    expect(sync).toHaveBeenCalledTimes(1);
    scheduler.onBackground();
    scheduler.onForeground();
    await advance(0);
    expect(sync).toHaveBeenCalledTimes(1);
    release();
    await advance(3_000);
    expect(sync).toHaveBeenCalledTimes(2);
    release();
    await advance(0);
    expect(maxActive).toBe(1);
  });

  test('al cerrar sesión se cancelan los reintentos', async () => {
    const { scheduler, sync } = setup(['offline']);
    scheduler.setEnabled(true);
    await advance(0);
    scheduler.setEnabled(false);
    await advance(600_000);
    expect(sync).toHaveBeenCalledTimes(1);
  });

  test('una sync que lanza excepción cuenta como error y se reintenta', async () => {
    const sync = jest.fn<Promise<SyncOutcome>, []>().mockRejectedValueOnce(new Error('boom')).mockResolvedValue('ok');
    const scheduler = new SyncScheduler({ sync, hasPending: async () => true }, OPTIONS);
    scheduler.setEnabled(true);
    await advance(0);
    expect(scheduler.consecutiveFailures).toBe(1);
    await advance(15_000);
    expect(sync).toHaveBeenCalledTimes(2);
    expect(scheduler.consecutiveFailures).toBe(0);
  });
});
