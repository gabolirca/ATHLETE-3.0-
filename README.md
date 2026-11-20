# ATHLETE · Entrenamiento híbrido

App móvil (iOS y Android) para atletas híbridos: fuerza, funcional, carrera y natación en un mismo programa, con
nutrición propia (plan calculado, carga de tu plan por raciones SMAE y comida por foto con IA). Hecha por **LIRCA**.

## Estructura
- `frontend/mobile` — app Expo (React Native).
- `shared/` — contratos (`contracts`), lógica pura (`domain`) y datos/sync (`data`).
- `backend/supabase` — migraciones, Edge Functions (`analizar-comida`) y pruebas de base.

## Comandos
```bash
npm install
npm test                                   # contratos, dominio, datos y app
cd frontend/mobile && npx expo run:ios --device --configuration Release
```

## Relación con Mundo Fit
Mundo Fit (repo aparte) nació de este código. Sus mejoras generales se traen aquí adaptadas a ATHLETE; lo propio del
gimnasio (sedes, membresías, recepción, roles, chat, coach y nutriólogo) no va en ATHLETE.
