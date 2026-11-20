import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

/**
 * Aviso de fin de descanso con el sonido del sistema (ATHLETE aún no tiene un sonido propio).
 * Solo local (sin servidor ni token push).
 * - Con la pantalla apagada o la app en segundo plano: notificación con sonido y vibración.
 * - Con la app abierta: solo el sonido (el temporizador ya está en pantalla, no hace falta el banner).
 *   Antes en primer plano no sonaba nada: solo una vibración corta que se perdía en el gym.
 */
/** Sonido del aviso: el del sistema. Para uno propio, agrégalo en app.json (expo-notifications → sounds) y pon aquí su nombre. */
export const APP_SOUND = 'default';
const ANDROID_CHANNEL = 'descanso';
const REST_KIND = 'rest-end';

let scheduledId: string | null = null;
let permission: 'unknown' | 'granted' | 'denied' = 'unknown';
let handlerSet = false;
let channelReady = false;

/** Qué hacer con una notificación que llega con la app abierta: el fin de descanso suena; lo demás, nada. */
export function foregroundBehavior(data: Record<string, unknown> | undefined) {
  const rest = data?.kind === REST_KIND;
  return { shouldShowBanner: false, shouldShowList: false, shouldPlaySound: rest, shouldSetBadge: false };
}

function setHandler() {
  if (handlerSet) return;
  handlerSet = true;
  try {
    Notifications.setNotificationHandler({
      handleNotification: async (n) => foregroundBehavior(n.request.content.data as Record<string, unknown> | undefined),
    });
  } catch { /* sin módulo nativo (pruebas): no pasa nada */ }
}

/** Android 8+: el sonido va en el canal, no en la notificación. */
async function ensureChannel() {
  if (channelReady || Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL, {
      name: 'Fin del descanso',
      importance: Notifications.AndroidImportance.HIGH,
      ...(APP_SOUND === 'default' ? {} : { sound: APP_SOUND }),
      vibrationPattern: [0, 300, 150, 300],
    });
    channelReady = true;
  } catch { /* sin canal: Android usa el sonido por defecto */ }
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
  await ensureChannel();
  const seconds = Math.round((endAt - Date.now()) / 1000);
  if (seconds < 2) return;
  try {
    scheduledId = await Notifications.scheduleNotificationAsync({
      content: { title: '¡A darle! Se acabó el descanso', body: label || 'Siguiente serie', sound: APP_SOUND, data: { kind: REST_KIND } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds, repeats: false, channelId: ANDROID_CHANNEL },
    });
  } catch { scheduledId = null; }
}

export async function cancelRestEnd(): Promise<void> {
  const id = scheduledId;
  scheduledId = null;
  if (!id) return;
  try { await Notifications.cancelScheduledNotificationAsync(id); } catch { /* ya se mostró o no existe */ }
}

/** Solo para pruebas. */
export function _resetRestNotificationForTesting() { scheduledId = null; permission = 'unknown'; handlerSet = false; channelReady = false; }
