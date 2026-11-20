import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { AppInput } from './AppInput';
import { KEYBOARD_MARGIN, onInputFocus, revealScrollY } from './keyboardReveal';

describe('revealScrollY', () => {
  test('si el teclado tapa el campo, sube lo justo más el margen', () => {
    // Campo de 600 a 646; el teclado empieza en 500 → hay que subir 646 + 24 − 500 = 170.
    expect(revealScrollY({ inputTop: 600, inputHeight: 46, keyboardTop: 500, scrollY: 100 })).toBe(100 + 170);
  });
  test('si el campo ya se ve, no mueve nada', () => {
    expect(revealScrollY({ inputTop: 200, inputHeight: 46, keyboardTop: 500, scrollY: 0 })).toBeNull();
    expect(revealScrollY({ inputTop: 500 - 46 - KEYBOARD_MARGIN, inputHeight: 46, keyboardTop: 500, scrollY: 0 })).toBeNull();
  });
  test('un campo que quedó arriba de la vista se trae de vuelta', () => {
    expect(revealScrollY({ inputTop: -80, inputHeight: 46, keyboardTop: 500, scrollY: 300, viewportTop: 0 })).toBe(300 - 80 - KEYBOARD_MARGIN);
  });
});

test('AppInput avisa al enfocarse y conserva el onFocus propio', async () => {
  const listener = jest.fn();
  const own = jest.fn();
  const off = onInputFocus(listener);
  const screen = await render(<AppInput label="Peso" onFocus={own}/>);
  await fireEvent(screen.getByLabelText('Peso'), 'focus');
  expect(listener).toHaveBeenCalledTimes(1);
  expect(own).toHaveBeenCalledTimes(1);
  off();
});
