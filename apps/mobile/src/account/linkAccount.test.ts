import type { OpenedAthleteData } from '@athlete/data';
import { linkAccountIfNeeded } from './linkAccount';

const ACCOUNT = '0190F0F0-0000-7000-8000-0000000000A1';
function fake(accountUserId: string | null) {
  const adopted = { identity: { localUserId: 'l', accountUserId: ACCOUNT.toLowerCase() } } as unknown as OpenedAthleteData;
  const data = { identity: { localUserId: 'l', accountUserId }, adoptLocalData: jest.fn().mockResolvedValue(adopted) } as unknown as OpenedAthleteData & { adoptLocalData: jest.Mock };
  return { data, adopted };
}

test('sin cuenta vinculada: adopta los datos locales para la cuenta', async () => {
  const { data, adopted } = fake(null);
  const r = await linkAccountIfNeeded(data, ACCOUNT);
  expect(r).toEqual({ kind: 'linked', data: adopted });
  expect(data.adoptLocalData).toHaveBeenCalledWith(ACCOUNT.toLowerCase());
});

test('ya vinculado a la misma cuenta: no hace nada', async () => {
  const { data } = fake(ACCOUNT.toLowerCase());
  expect((await linkAccountIfNeeded(data, ACCOUNT)).kind).toBe('already-linked');
  expect(data.adoptLocalData).not.toHaveBeenCalled();
});

test('vinculado a otra cuenta: no mezcla datos', async () => {
  const { data } = fake('0190f0f0-0000-7000-8000-0000000000b2');
  expect((await linkAccountIfNeeded(data, ACCOUNT)).kind).toBe('other-account');
  expect(data.adoptLocalData).not.toHaveBeenCalled();
});
