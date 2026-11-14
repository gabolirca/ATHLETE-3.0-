import * as Notifications from 'expo-notifications';

/**
 * Aviso local de fin de descanso: permite apagar la pantalla entre series. Solo local (sin servidor ni token push).
 * Con la app abierta no se muestra (ya está el temporizador en pantalla); con la pantalla apagada suena y vibra.
 */
let scheduledId: string | null = null;
let permission: 'unknown' | 'granted' | 'denied' = 'unknown';
let handlerSet = false;

function setHandler() {
  if (handlerSet) return;
  handlerSet = true;
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({ shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false, shouldSetBadge: false }),
    });
  } catch { /* sin módulo nativo (pruebas): no pasa nada */ }
}

async function ensurePermission(): Promise<boolean> {
  if (permission !== 'unknown') return permission === 'granted';
  try {
    const current = await Notifications.getPermissionsAsync();
    const status = current.granted ? current : await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } });
    permission = status.granted ? 'granted' : 'denied';
  } catch { permission = 'denied'; }
  return permission === 'granted';
}

export async function scheduleRestEnd(endAt: number, label: string): Promise<void> {
  setHandler();
  await cancelRestEnd();
  if (!(await ensurePermission())) return;
  const seconds = Math.round((endAt - Date.now()) / 1000);
  if (seconds < 2) return;
  try {
    scheduledId = await Notifications.scheduleNotificationAsync({
      content: { title: '¡A darle! Se acabó el descanso', body: label || 'Siguiente serie', sound: 'default' },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds, repeats: false },
    });
  } catch { scheduledId = null; }
}

export async function cancelRestEnd(): Promise<void> {
  const id = scheduledId;
  scheduledId = null;
  if (!id) return;
  try { await Notifications.cancelScheduledNotificationAsync(id); } catch { /* ya se mostró o no existe */ }
}
