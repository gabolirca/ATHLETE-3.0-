import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { AccountContextValue } from './AccountProvider';

const mockRouter = { push: jest.fn(), back: jest.fn() };
let mockAccount: AccountContextValue;
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('./AccountProvider', () => ({ useAccount: () => mockAccount }));

import LoginScreen from '../../app/account/login';
import { AccountCard } from './AccountCard';

function account(patch: Partial<AccountContextValue> = {}): AccountContextValue {
  return {
    available: true, unavailableReason: null, auth: { status: 'signed_out', reason: 'none' }, link: 'none',
    sync: { status: null, syncing: false, error: null },
    requestCode: jest.fn().mockResolvedValue(null), verifyCode: jest.fn().mockResolvedValue(null),
    signOut: jest.fn().mockResolvedValue(undefined), syncNow: jest.fn().mockResolvedValue(undefined),
    ...patch,
  };
}
const signedIn = { status: 'signed_in' as const, user: { id: '0190f0f0-0000-7000-8000-0000000000a1', email: 'gabo@test.mx', emailConfirmed: true }, expiresAt: '2026-11-06T00:00:00.000Z' };

beforeEach(() => { jest.clearAllMocks(); mockAccount = account(); });

describe('Login', () => {
  test('correo → código → verificar → vuelve atrás', async () => {
    const view = await render(<LoginScreen />);
    await fireEvent.changeText(view.getByLabelText('Correo electrónico'), 'Gabo@Test.mx');
    await fireEvent.press(view.getByText('Enviarme un código'));
    await waitFor(() => expect(view.getByLabelText('Código')).toBeTruthy());
    expect(mockAccount.requestCode).toHaveBeenCalledWith('Gabo@Test.mx');
    await fireEvent.changeText(view.getByLabelText('Código'), '123456');
    await fireEvent.press(view.getByText('Verificar e iniciar sesión'));
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(mockAccount.verifyCode).toHaveBeenCalledWith('Gabo@Test.mx', '123456');
  });

  test('el campo de correo no usa autocorrector ni corrector ortográfico (pisaban lo escrito en iOS)', async () => {
    const view = await render(<LoginScreen />);
    const input = view.getByLabelText('Correo electrónico');
    expect(input.props).toMatchObject({ autoCorrect: false, spellCheck: false, autoCapitalize: 'none', keyboardType: 'email-address' });
    expect(input.props.textContentType).toBeUndefined();
    await fireEvent.changeText(input, 'gabolirca6@gmail.com');
    expect(view.getByDisplayValue('gabolirca6@gmail.com')).toBeTruthy();
  });

  test('si el código es incorrecto muestra el error y no sale', async () => {
    mockAccount = account({ verifyCode: jest.fn().mockResolvedValue('El código es incorrecto o ya venció. Pide uno nuevo.') });
    const view = await render(<LoginScreen />);
    await fireEvent.changeText(view.getByLabelText('Correo electrónico'), 'gabo@test.mx');
    await fireEvent.press(view.getByText('Enviarme un código'));
    await waitFor(() => expect(view.getByLabelText('Código')).toBeTruthy());
    await fireEvent.changeText(view.getByLabelText('Código'), '000000');
    await fireEvent.press(view.getByText('Verificar e iniciar sesión'));
    await waitFor(() => expect(view.getByText('El código es incorrecto o ya venció. Pide uno nuevo.')).toBeTruthy());
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  test('si no se pudo enviar el código se queda en el paso del correo con el error', async () => {
    mockAccount = account({ requestCode: jest.fn().mockResolvedValue('Ya te enviamos un código. Espera un minuto antes de pedir otro.') });
    const view = await render(<LoginScreen />);
    await fireEvent.changeText(view.getByLabelText('Correo electrónico'), 'gabo@test.mx');
    await fireEvent.press(view.getByText('Enviarme un código'));
    await waitFor(() => expect(view.getByText(/Espera un minuto/)).toBeTruthy());
    expect(view.queryByLabelText('Código')).toBeNull();
  });
});

describe('Tarjeta de cuenta', () => {
  test('sin nube configurada: modo local', async () => {
    mockAccount = account({ available: false });
    const view = await render(<AccountCard />);
    expect(view.getByText('Modo local')).toBeTruthy();
  });

  test('sin sesión: invita a iniciar sesión', async () => {
    const view = await render(<AccountCard />);
    await fireEvent.press(view.getByText('Iniciar sesión o crear cuenta'));
    expect(mockRouter.push).toHaveBeenCalledWith('/account/login');
  });

  test('con sesión vinculada: muestra pendientes y sincroniza', async () => {
    mockAccount = account({ auth: signedIn, link: 'linked', sync: { status: { pendingCount: 3, conflictCount: 0, rejectedCount: 0, lastPushAt: null, lastPullAt: null, online: true }, syncing: false, error: null } });
    const view = await render(<AccountCard />);
    expect(view.getByText('gabo@test.mx')).toBeTruthy();
    expect(view.getByText(/3 cambio\(s\) pendiente\(s\)/)).toBeTruthy();
    await fireEvent.press(view.getByText('Sincronizar ahora'));
    expect(mockAccount.syncNow).toHaveBeenCalled();
  });

  test('dispositivo de otra cuenta: avisa y no ofrece sincronizar', async () => {
    mockAccount = account({ auth: signedIn, link: 'other-account' });
    const view = await render(<AccountCard />);
    expect(view.getByText(/otra cuenta/)).toBeTruthy();
    expect(view.queryByText('Sincronizar ahora')).toBeNull();
  });

  test('cerrar sesión pide confirmación', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => { buttons?.find((b) => b.style === 'destructive')?.onPress?.(); });
    mockAccount = account({ auth: signedIn, link: 'linked' });
    const view = await render(<AccountCard />);
    await fireEvent.press(view.getByText('Cerrar sesión'));
    expect(alert).toHaveBeenCalled();
    expect(mockAccount.signOut).toHaveBeenCalled();
  });
});
