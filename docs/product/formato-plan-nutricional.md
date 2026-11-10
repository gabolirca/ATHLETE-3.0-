# Formato estándar para subir un plan nutricional (PROPUESTA)

Estado: niveles 1 y 2 (captura en la app) implementados en contratos 0.8.0; ver `modo-nutriologo.md`. Pendiente: importar CSV y adjuntar el archivo original.

## Objetivo
Que el plan de un nutriólogo, que suele llegar en PDF, foto o Excel, quede dentro de la app de forma **estructurada**, para:
- mostrar qué toca comer en cada tiempo;
- comparar lo registrado contra el plan (adherencia);
- que un nutriólogo, más adelante con el modo profesional, lo asigne directamente.

## Propuesta en 3 niveles
1. **Metas diarias.** Ya hecho: kcal, proteína, carbohidratos y grasa, desde una fecha.
2. **Plantilla estándar, para captura en la app o importación CSV:**
   - por tiempo de comida (desayuno, colación, comida, cena…), con hora sugerida;
   - en cada tiempo, raciones por **grupo del SMAE** (verduras, frutas, cereales, leguminosas, alimentos de origen animal, lácteos, aceites y grasas, azúcares) u opciones de platillo;
   - el formato de equivalentes del SMAE es el que usan muchos nutriólogos en México, así que es el estándar natural.
3. **Adjuntar el archivo original** (PDF o foto) como referencia.
   - Necesita Supabase Storage con RLS.
   - Podría ser función Pro.
   - La IA podría proponer la conversión a la plantilla, pero el usuario la confirma siempre.

## Plantilla CSV propuesta (nivel 2)
```csv
tiempo,hora,grupo_smae,raciones,nota
desayuno,08:00,cereales,2,
desayuno,08:00,origen_animal_bajo_grasa,2,huevo o queso panela
desayuno,08:00,frutas,1,
colacion,11:00,leguminosas,1,
comida,15:00,verduras,2,
...
```
- `grupo_smae`: lista cerrada de valores.
- `raciones`: número de 0 a 20, en pasos de 0.5.
- Se valida con Zod antes de guardar; las filas inválidas se muestran y no se importan.

## Decisiones abiertas
- ¿El nivel 2 va en el plan gratis o en Pro?
- ¿Guardamos el archivo original (nivel 3) o solo la versión estructurada?
- Plantilla descargable en la documentación en línea, cuando exista el sitio.
