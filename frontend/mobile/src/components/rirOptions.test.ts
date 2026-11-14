import { rirLabel, rirOptions } from './rirOptions';

test('por defecto solo 0–4 y se puede desplegar', () => {
  expect(rirOptions({})).toEqual({ values: [0, 1, 2, 3, 4], canExpand: true, precise: false });
});

test('desplegado muestra 0–10 enteros y ya no se puede desplegar más', () => {
  expect(rirOptions({ expanded: true })).toEqual({ values: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], canExpand: false, precise: false });
});

test('objetivo bajo (≤4): ventana normal con el objetivo incluido', () => {
  expect(rirOptions({ targetRir: 2 }).values).toEqual([0, 1, 2, 3, 4]);
});

test('objetivo alto: ventana centrada en el objetivo', () => {
  expect(rirOptions({ targetRir: 6 }).values).toEqual([4, 5, 6, 7, 8]);
  expect(rirOptions({ targetRir: 10 }).values).toEqual([8, 9, 10]);
  expect(rirOptions({ targetRir: 10 }).canExpand).toBe(false);
});

test('objetivo con medio punto activa medios puntos', () => {
  expect(rirOptions({ targetRir: 1.5 })).toEqual({ values: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4], canExpand: true, precise: true });
});

test('un valor guardado fuera de la ventana sigue visible', () => {
  expect(rirOptions({ current: 7 }).values).toEqual([0, 1, 2, 3, 4, 7]);
  expect(rirOptions({ current: 2.5 }).precise).toBe(true);
});

test('un valor guardado inválido no se agrega como opción', () => {
  expect(rirOptions({ current: 12 }).values).toEqual([0, 1, 2, 3, 4]);
});

test('más precisión a petición del atleta', () => {
  expect(rirOptions({ precise: true }).values).toHaveLength(9);
});

test('etiquetas accesibles', () => {
  expect(rirLabel(0)).toBe('0 ninguna repetición más');
  expect(rirLabel(0.5)).toBe('0.5 media repetición más');
  expect(rirLabel(1)).toBe('1 repetición más');
  expect(rirLabel(2.5)).toBe('2.5 repeticiones más');
});
