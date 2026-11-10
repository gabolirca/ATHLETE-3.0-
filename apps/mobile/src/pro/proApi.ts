import type { NutritionPlanMeal } from '@athlete/contracts';
import { getCloud } from '@/account/cloud';

/**
 * Modo nutriólogo: RPC `athlete3.pro_*` (migración 20261111000100). Requieren sesión y red.
 * El plan asignado se escribe en las filas del cliente y le llega por su sincronización normal.
 */
export type ProStatus = { isNutritionist: boolean; professional: { linkId: string; name: string; since: string } | null };
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

async function call<T>(fn: string, args?: Record<string, unknown>, notFound?: string): Promise<T> {
  const cloud = getCloud();
  if (!cloud) throw new ProError('La nube no está configurada en esta compilación.');
  let res: { data: unknown; error: { message?: string; code?: string } | null };
  try {
    res = await cloud.supabase.rpc(fn, args);
  } catch (cause) {
    throw new ProError(proErrorMessage(cause as { message?: string }, notFound));
  }
  if (res.error) throw new ProError(proErrorMessage(res.error, notFound));
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
  acceptInvite: (code: string) => call<{ linkId: string; name: string }>('pro_accept_invite', { p_code: code.trim().toUpperCase() },
    'El código no es válido, ya se usó o venció. Pídele uno nuevo a tu nutriólogo.'),
  endLink: (linkId: string) => call<void>('pro_end_link', { p_link_id: linkId }),
  listClients: () => call<ProClient[]>('pro_list_clients'),
  getClientPlan: (clientId: string) => call<ClientPlan | null>('pro_get_client_plan', { p_client_id: clientId }, 'Esta persona ya no es tu cliente.'),
  assignPlan: (clientId: string, plan: AssignPlanInput) =>
    call<{ planId: string }>('pro_assign_plan', { p_client_id: clientId, p_plan: plan }, 'Esta persona ya no es tu cliente.'),
};
