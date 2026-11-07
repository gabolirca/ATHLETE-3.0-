# Aviso del plan nutricional provisional (BORRADOR)

> Borrador redactado durante el desarrollo, 7 de noviembre de 2026. **No es un texto legal revisado.**
> Antes del lanzamiento público debe revisarlo un abogado, junto con los Términos de uso y el Aviso de privacidad
> (LFPDPPP; los datos de salud y alimentación son datos personales sensibles).

**Versión en la app:** `nutricion-provisional-v1-2026-11-07`, en `apps/mobile/src/legal/nutritionDisclaimer.ts`.
Si cambia el texto, se sube la versión y la app vuelve a pedir la aceptación.

## Texto que acepta el usuario
1. El plan es una **estimación automática** con fórmulas generales (Mifflin-St Jeor). Es una sugerencia orientativa, no una prescripción.
2. **No** es un plan elaborado por un nutriólogo ni constituye consejo médico, diagnóstico ni tratamiento.
3. No debes usarlo si:
   - estás embarazada o en lactancia;
   - tienes una enfermedad (diabetes, renal, cardiaca…) o un trastorno de la conducta alimentaria;
   - tomas medicamentos que afecten tu alimentación.

   En esos casos, consulta antes a un profesional de la salud.
4. Solo para mayores de 18 años. La app no calcula planes para menores.
5. Eres responsable de las decisiones que tomes con esta información. Si tienes un plan de un nutriólogo, captúralo y úsalo en lugar de esta estimación.

Casilla: *"Entiendo que es una sugerencia y no un plan profesional"*. Botón: *Aceptar y continuar*.

## Salvaguardas en el cálculo
- **Solo adultos:** de 18 a 90 años.
- **Rangos razonables:** estatura de 120 a 230 cm y peso de 35 a 300 kg.
- **Piso de seguridad:** nunca sugiere menos de 1,200 kcal (mujer) ni 1,500 kcal (hombre) sin supervisión, y lo avisa en pantalla.
- **La meta lleva su origen** (`estimated`, `professional` o `manual`), y la app muestra "Plan provisional · sugerencia de la app".

## Pendiente
- **Registro de la aceptación:** hoy solo se guarda en el teléfono (versión y fecha, en el almacén seguro). Con los Términos de uso hay que llevarla al servidor, con versión, fecha y usuario, para tener constancia.
- **Términos de uso completos** y **Aviso de privacidad**, publicados en línea antes del lanzamiento. Se necesitan además para las tiendas.
