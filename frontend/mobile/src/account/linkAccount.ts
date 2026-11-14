import type { OpenedAthleteData } from '@athlete/data';

export type LinkOutcome =
  | { kind: 'linked'; data: OpenedAthleteData }          // primera vez: los datos locales pasan a la cuenta
  | { kind: 'already-linked'; data: OpenedAthleteData }  // el dispositivo ya pertenece a esta cuenta
  | { kind: 'other-account'; data: OpenedAthleteData };  // pertenece a otra cuenta: no se mezcla nada

/**
 * Tras iniciar sesión: vincula los datos locales a la cuenta solo si el dispositivo aún no tiene cuenta.
 * Si ya pertenece a OTRA cuenta no hace nada: mezclar datos de dos personas sería peor que no sincronizar
 * (multicuenta: pendiente de diseño).
 */
export async function linkAccountIfNeeded(data: OpenedAthleteData, accountUserId: string): Promise<LinkOutcome> {
  const linked = data.identity.accountUserId;
  const account = accountUserId.toLowerCase();
  if (linked === account) return { kind: 'already-linked', data };
  if (linked !== null) return { kind: 'other-account', data };
  return { kind: 'linked', data: await data.adoptLocalData(account) };
}
