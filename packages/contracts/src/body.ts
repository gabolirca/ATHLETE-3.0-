import { z } from 'zod';
import { DataSource, IsoDateTime, LengthUnit, LocalDate, MassUnit, Notes, SyncedRecord, TimeZone } from './common';

/**
 * Seguimiento corporal (especificación §6.6): cada medición conserva fecha, procedencia y unidad.
 * Se almacena el valor canónico (kg / cm) **y** la unidad en que se introdujo, para poder
 * mostrar el dato tal como se registró sin pérdida relevante.
 */
export const BodyWeight = SyncedRecord.extend({
  measuredAt: IsoDateTime,
  timeZone: TimeZone,
  localDate: LocalDate,
  weightKg: z.number().min(20).max(400),
  inputUnit: MassUnit,
  source: DataSource,
  notes: Notes.nullable(),
});
export type BodyWeight = z.infer<typeof BodyWeight>;

export const BodySite = z.enum([
  'neck',
  'shoulders',
  'chest',
  'waist',
  'abdomen',
  'hips',
  'left_arm',
  'right_arm',
  'left_forearm',
  'right_forearm',
  'left_thigh',
  'right_thigh',
  'left_calf',
  'right_calf',
]);
export type BodySite = z.infer<typeof BodySite>;

export const BodyMeasurement = SyncedRecord.extend({
  measuredAt: IsoDateTime,
  timeZone: TimeZone,
  localDate: LocalDate,
  site: BodySite,
  valueCm: z.number().positive().max(300),
  inputUnit: LengthUnit,
  source: DataSource,
  notes: Notes.nullable(),
});
export type BodyMeasurement = z.infer<typeof BodyMeasurement>;

/** El valor se introduce en `inputUnit`; el repositorio lo normaliza con `@athlete/domain/units`. */
export const LogBodyWeightInput = z.object({
  id: BodyWeight.shape.id,
  measuredAt: IsoDateTime,
  timeZone: TimeZone,
  value: z.number().positive(),
  inputUnit: MassUnit,
  source: DataSource.default('manual'),
  notes: Notes.nullable().default(null),
});
export type LogBodyWeightInput = z.input<typeof LogBodyWeightInput>;

export const LogBodyMeasurementInput = z.object({
  id: BodyMeasurement.shape.id,
  measuredAt: IsoDateTime,
  timeZone: TimeZone,
  site: BodySite,
  value: z.number().positive(),
  inputUnit: LengthUnit,
  source: DataSource.default('manual'),
  notes: Notes.nullable().default(null),
});
export type LogBodyMeasurementInput = z.input<typeof LogBodyMeasurementInput>;

// Fotografías corporales: fuera de este borrador. Requieren bucket privado en Storage,
// políticas por usuario y consentimiento explícito (especificación §11) — ver ADR-0003 §Pendientes.
