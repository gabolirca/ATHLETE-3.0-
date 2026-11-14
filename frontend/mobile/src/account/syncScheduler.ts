/**
 * Sincronización automática, sin botones (el patrón de Diario Gym, adaptado a React Native):
 *  - tras un cambio local: espera 3 s desde el ÚLTIMO cambio y sincroniza (varios cambios seguidos = una sync);
 *  - al volver a primer plano: sincroniza ya, aunque no haya pendientes (descarga cambios de otros dispositivos);
 *  - al salir a segundo plano: intenta sincronizar en ese momento (iOS da unos segundos);
 *  - sin conexión o con error: los datos siguen guardados en el teléfono y se reintenta con espera creciente
 *    (15 s, 30 s, 1 min… hasta 5 min) mientras queden pendientes.
 * Nunca hay dos sincronizaciones a la vez.
 */
export type SyncOutcome = 'ok' | 'offline' | 'error' | 'skipped';

export type SyncSchedulerDeps = {
  sync: () => Promise<SyncOutcome>;
  hasPending: () => Promise<boolean>;
};

export type SyncSchedulerOptions = { debounceMs: number; retryBaseMs: number; retryMaxMs: number };
export const DEFAULT_SCHEDULER_OPTIONS: SyncSchedulerOptions = { debounceMs: 3_000, retryBaseMs: 15_000, retryMaxMs: 300_000 };

export class SyncScheduler {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private enabled = false;
  private running = false;
  private rerun: { force: boolean } | null = null;
  private failures = 0;

  constructor(private readonly deps: SyncSchedulerDeps, private readonly options: SyncSchedulerOptions = DEFAULT_SCHEDULER_OPTIONS) {}

  /** Solo sincroniza con sesión iniciada y datos vinculados a la cuenta. */
  setEnabled(enabled: boolean) {
    if (enabled === this.enabled) return;
    this.enabled = enabled;
    this.clear();
    if (enabled) { this.failures = 0; this.schedule(0, true); }
  }

  /** Hubo un cambio local (serie, sesión, cardio…). */
  notifyChange() { this.schedule(this.options.debounceMs, false); }

  onForeground() { this.failures = 0; this.schedule(0, true); }

  onBackground() { this.clear(); void this.run(false); }

  /** Estado de reintentos (para pruebas y diagnóstico). */
  get consecutiveFailures() { return this.failures; }

  dispose() { this.enabled = false; this.clear(); }

  private clear() {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule(delayMs: number, force: boolean) {
    if (!this.enabled) return;
    this.clear();
    this.timer = setTimeout(() => { this.timer = null; void this.run(force); }, delayMs);
  }

  private async run(force: boolean): Promise<void> {
    if (!this.enabled) return;
    if (this.running) { this.rerun = { force: force || Boolean(this.rerun?.force) }; return; }
    this.running = true;
    try {
      if (!force && !(await this.deps.hasPending().catch(() => false))) return;
      const outcome = await this.deps.sync().catch((): SyncOutcome => 'error');
      if (outcome === 'ok') {
        this.failures = 0;
      } else if (outcome === 'offline' || outcome === 'error') {
        this.failures += 1;
        if (await this.deps.hasPending().catch(() => true)) {
          const delay = Math.min(this.options.retryBaseMs * 2 ** (this.failures - 1), this.options.retryMaxMs);
          this.schedule(delay, false);
        }
      }
    } finally {
      this.running = false;
      if (this.rerun) {
        const { force: again } = this.rerun;
        this.rerun = null;
        this.schedule(this.options.debounceMs, again);
      }
    }
  }
}
