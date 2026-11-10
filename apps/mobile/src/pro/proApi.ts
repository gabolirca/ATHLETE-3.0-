import type { NutritionPlanMeal } from '@athlete/contracts';
import { getCloud } from '@/account/cloud';

/**
 * Modo nutriólogo: RPC `athlete3.pro_*` (migración 20261111000100). Requieren sesión y red.
 * El plan asignado se escribe en las filas del cliente y le llega por su sincronización normal.
 */
export type ProLink = { linkId: string; name: string; since: string };
/** `professional` = nutriólogo (alcance nutrición); `coach` = coach (alcance entrenamiento). */
export type ProStatus = { isNutritionist: boolean; isCoach?: boolean; professional: ProLink | null; coach?: ProLink | null };
export type ProClient = {
  linkId: string; clientId: string; name: string; email: string | null; since: string;
  plan: { name: string; effectiveFrom: string; source: 'self' | 'assigned' } | null;
};
export type ClientPlan = {
  id: string; effectiveFrom: string; name: string; meals: NutritionPlanMeal[]; notes: string | null;
  source: 'self' | 'assigned'; assignedByName: string | null; updatedAt: string;
};
export type AssignPlanInput = {
  effectiveFrom: string; name: string; meals: NutritionPlanMeal[]; notes: string | null;
  energyKcal: number; proteinG: number; carbsG: number; fatG: number;
};

export class ProError extends Error {}

const BY_CODE: Record<string, string> = {
  FORBIDDEN: 'Tu cuenta no tiene activado el modo nutriólogo.',
  NOT_FOUND: 'No se encontró. Revisa el dato e intenta de nuevo.',
  VALIDATION_FAILED: 'Los datos no son válidos.',
  RATE_LIMITED: 'Demasiados intentos. Espera un momento.',
  UNAUTHENTICATED: 'Inicia sesión en tu cuenta (Perfil → Cuenta) para usar esta función.',
};

export function proErrorMessage(error: { message?: string; code?: string } | null | undefined, notFound?: string): string {
  const msg = error?.message ?? '';
  const code = /ATHLETE:([A-Z_]+)/.exec(msg)?.[1];
  if (code === 'NOT_FOUND' && notFound) return notFound;
  if (code && BY_CODE[code]) return BY_CODE[code]!;
  if (error?.code === '23514') return 'El plan tiene datos no válidos.';
  if (/JWT|not authenticated|401/i.test(msg)) return BY_CODE.UNAUTHENTICATED!;
  if (/fetch|network|Failed to/i.test(msg)) return 'Sin conexión. Intenta cuando tengas red.';
  return 'No se pudo completar. Intenta de nuevo.';
}

async function call<T>(fn: string, args?: Record<string, unknown>, notFound?: string, invalid?: string): Promise<T> {
  const cloud = getCloud();
  if (!cloud) throw new ProError('La nube no está configurada en esta compilación.');
  let res: { data: unknown; error: { message?: string; code?: string } | null };
  try {
    res = await cloud.supabase.rpc(fn, args);
  } catch (cause) {
    throw new ProError(proErrorMessage(cause as { message?: string }, notFound));
  }
  if (res.error) {
    if (invalid && /ATHLETE:VALIDATION_FAILED/.test(res.error.message ?? '')) throw new ProError(invalid);
    throw new ProError(proErrorMessage(res.error, notFound));
  }
  return res.data as T;
}

/** null si no hay nube o no hay sesión (sin error: la pantalla simplemente no muestra el modo). */
export async function fetchProStatus(): Promise<ProStatus | null> {
  const cloud = getCloud();
  if (!cloud) return null;
  try {
    const { data } = await cloud.supabase.auth.getSession();
    if (!data.session) return null;
  } catch { return null; }
  return call<ProStatus>('pro_status');
}

export const proApi = {
  status: () => call<ProStatus>('pro_status'),
  createInvite: () => call<{ code: string; expiresAt: string }>('pro_create_invite'),
  acceptInvite: (code: string) => call<{ linkId: string; name: string; scope?: 'nutrition' | 'training' }>('pro_accept_invite', { p_code: code.trim().toUpperCase() },
    'El código no es válido, ya se usó o venció. Pídele uno nuevo a tu nutriólogo.'),
  endLink: (linkId: string) => call<void>('pro_end_link', { p_link_id: linkId }),
  listClients: () => call<ProClient[]>('pro_list_clients'),
  getClientPlan: (clientId: string) => call<ClientPlan | null>('pro_get_client_plan', { p_client_id: clientId }, 'Esta persona ya no es tu cliente.'),
  assignPlan: (clientId: string, plan: AssignPlanInput) =>
    call<{ planId: string }>('pro_assign_plan', { p_client_id: clientId, p_plan: plan }, 'Esta persona ya no es tu cliente.'),
};

// ---------------- Modo coach (0.9.0) ----------------
export type CoachClient = {
  linkId: string; clientId: string; name: string; email: string | null; since: string;
  lastSessionDate: string | null; sessionsLast7Days: number; assignedPlans: number;
};
export type CoachSummary = {
  fromDate: string;
  plannedPerWeek: number | null;
  sessions: Array<{ id: string; localDate: string; title: string; planName: string | null; minutes: number | null; sessionRpe: number | null; workingSets: number; volumeKg: number }>;
  cardio: Array<{ id: string; localDate: string; activity: string; minutes: number; distanceM: number | null; rpe: number | null }>;
  weeks: Array<{ weekStart: string; done: number }>;
  topLifts: Array<{ exercise: string; e1rmKg: number; bestWeightKg: number }>;
};
export type CoachClientPlan = { id: string; name: string; kind: 'routine' | 'program'; status: string; updatedAt: string; assignedByMe: boolean; assignedByName: string | null; days: number };
export type CoachCommentRow = { id: string; targetType: 'general' | 'session' | 'plan'; targetId: string | null; body: string; createdAt: string };

const NOT_CLIENT = 'Esta persona ya no es tu atleta.';
export const coachApi = {
  createInvite: () => call<{ code: string; expiresAt: string }>('coach_create_invite'),
  listClients: () => call<CoachClient[]>('coach_list_clients'),
  summary: (clientId: string, days = 28) => call<CoachSummary>('coach_client_summary', { p_client_id: clientId, p_days: days }, NOT_CLIENT),
  clientPlans: (clientId: string) => call<CoachClientPlan[]>('coach_list_client_plans', { p_client_id: clientId }, NOT_CLIENT),
  assignPlan: (clientId: string, planId: string) => call<{ planId: string }>('coach_assign_plan', { p_client_id: clientId, p_plan_id: planId },
    'No encontramos ese programa en tu cuenta. Sincroniza (Perfil → Cuenta) e intenta de nuevo.',
    'Ese programa usa ejercicios personalizados o no tiene días. Usa ejercicios del catálogo para poder asignarlo.'),
  removePlan: (clientId: string, planId: string) => call<void>('coach_remove_plan', { p_client_id: clientId, p_plan_id: planId }, 'Ese programa ya no está.'),
  addComment: (clientId: string, targetType: 'general' | 'session' | 'plan', targetId: string | null, body: string) =>
    call<{ id: string }>('coach_add_comment', { p_client_id: clientId, p_target_type: targetType, p_target_id: targetId, p_body: body }, NOT_CLIENT,
      'El comentario debe tener de 1 a 1000 caracteres.'),
  listComments: (clientId: string) => call<CoachCommentRow[]>('coach_list_comments', { p_client_id: clientId }, NOT_CLIENT),
  deleteComment: (id: string) => call<void>('coach_delete_comment', { p_comment_id: id }, 'Ese comentario ya no existe.'),
  endLink: (linkId: string) => call<void>('pro_end_link', { p_link_id: linkId }, 'Ese vínculo ya terminó.'),
};
