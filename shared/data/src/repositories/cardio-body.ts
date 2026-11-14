import {
  LogBodyMeasurementInput,
  LogBodyWeightInput,
  LogCardioSessionInput,
  PageRequest,
  type BodyMeasurement,
  type BodyRepository,
  type BodySite,
  type BodyWeight,
  type CardioRepository,
  type CardioSession,
  type DateRange,
  type Page,
  type Result,
} from '@athlete/contracts';
import { localDateOf, toCm, toKg } from '@athlete/domain';
import { fail } from '../local/store';
import { Repository, decodeCursor, encodeCursor, guard, input } from './base';

function rangeWhere(column: string, range: DateRange): { sql: string; params: string[] } {
  const parts = ['deleted_at IS NULL'];
  const params: string[] = [];
  if (range.from) { parts.push(`${column} >= ?`); params.push(range.from); }
  if (range.to) { parts.push(`${column} <= ?`); params.push(range.to); }
  return { sql: parts.join(' AND '), params };
}

function cardioColumns(i: ReturnType<typeof LogCardioSessionInput.parse>) {
  return {
    activity: i.activity, training_day_id: i.trainingDayId, started_at: i.startedAt, time_zone: i.timeZone,
    local_date: localDateOf(i.startedAt, i.timeZone), duration_seconds: i.durationSeconds, distance_m: i.distanceMeters,
    rounds: i.rounds, reps: i.reps, rpe: i.rpe, avg_heart_rate_bpm: i.avgHeartRateBpm, max_heart_rate_bpm: i.maxHeartRateBpm,
    swim_pool_type: i.swim?.poolType ?? null, swim_pool_length_m: i.swim?.poolLengthMeters ?? null,
    swim_laps: i.swim?.laps ?? null, swim_stroke: i.swim?.stroke ?? null, source: i.source, notes: i.notes,
  };
}

export class LocalCardioRepository extends Repository implements CardioRepository {
  log(raw: LogCardioSessionInput): Promise<Result<CardioSession>> {
    return guard(() => this.store.db.transaction(async (tx) => {
      const i = input(LogCardioSessionInput, raw);
      if (await this.store.get('cardio_session', i.id, tx)) fail('DUPLICATE', 'La actividad ya existe.');
      return this.store.toContract<CardioSession>('cardio_session', await this.store.upsert('cardio_session', i.id, cardioColumns(i), tx));
    }));
  }

  update(id: string, raw: Partial<Omit<LogCardioSessionInput, 'id'>>): Promise<Result<CardioSession>> {
    return guard(() => this.store.db.transaction(async (tx) => {
      const row = await this.store.get('cardio_session', id, tx);
      if (!row || row.deleted_at) fail('NOT_FOUND', 'La actividad no existe.');
      const current = this.store.toContract<CardioSession>('cardio_session', row!);
      // Se revalida el registro completo resultante (reglas cruzadas: natación, FC media ≤ máxima).
      const merged = input(LogCardioSessionInput, { ...current, ...raw, id });
      return this.store.toContract<CardioSession>('cardio_session', await this.store.upsert('cardio_session', id, cardioColumns(merged), tx));
    }));
  }

  delete(id: string): Promise<Result<void>> {
    return guard(() => this.store.remove('cardio_session', id));
  }

  getById(id: string): Promise<Result<CardioSession>> {
    return guard(async () => {
      const row = await this.store.get('cardio_session', id);
      if (!row || row.deleted_at) fail('NOT_FOUND', 'La actividad no existe.');
      return this.store.toContract<CardioSession>('cardio_session', row!);
    });
  }

  list(range: DateRange, page?: PageRequest): Promise<Result<Page<CardioSession>>> {
    return guard(async () => {
      const p = input(PageRequest, page ?? {});
      const offset = decodeCursor(p.cursor);
      const w = rangeWhere('local_date', range);
      const rows = await this.store.select('cardio_session', `WHERE ${w.sql} ORDER BY local_date DESC, started_at DESC, id LIMIT ? OFFSET ?`, [...w.params, p.limit + 1, offset]);
      return {
        items: rows.slice(0, p.limit).map((r) => this.store.toContract<CardioSession>('cardio_session', r)),
        nextCursor: rows.length > p.limit ? encodeCursor(offset + p.limit) : null,
      };
    });
  }
}

export class LocalBodyRepository extends Repository implements BodyRepository {
  logWeight(raw: LogBodyWeightInput): Promise<Result<BodyWeight>> {
    return guard(() => this.store.db.transaction(async (tx) => {
      const i = input(LogBodyWeightInput, raw);
      if (await this.store.get('body_weight', i.id, tx)) fail('DUPLICATE', 'El registro ya existe.');
      const weightKg = toKg(i.value, i.inputUnit);
      if (weightKg < 20 || weightKg > 400) fail('VALIDATION_FAILED', 'Peso fuera de rango.', { details: { field: 'value' } });
      const row = await this.store.upsert('body_weight', i.id, {
        measured_at: i.measuredAt, time_zone: i.timeZone, local_date: localDateOf(i.measuredAt, i.timeZone),
        weight_kg: Math.round(weightKg * 1000) / 1000, input_unit: i.inputUnit, source: i.source, notes: i.notes,
      }, tx);
      return this.store.toContract<BodyWeight>('body_weight', row);
    }));
  }

  deleteWeight(id: string): Promise<Result<void>> {
    return guard(() => this.store.remove('body_weight', id));
  }

  listWeights(range: DateRange): Promise<Result<BodyWeight[]>> {
    return guard(async () => {
      const w = rangeWhere('local_date', range);
      return (await this.store.select('body_weight', `WHERE ${w.sql} ORDER BY measured_at`, w.params))
        .map((r) => this.store.toContract<BodyWeight>('body_weight', r));
    });
  }

  logMeasurement(raw: LogBodyMeasurementInput): Promise<Result<BodyMeasurement>> {
    return guard(() => this.store.db.transaction(async (tx) => {
      const i = input(LogBodyMeasurementInput, raw);
      if (await this.store.get('body_measurement', i.id, tx)) fail('DUPLICATE', 'El registro ya existe.');
      const valueCm = toCm(i.value, i.inputUnit);
      if (valueCm <= 0 || valueCm > 300) fail('VALIDATION_FAILED', 'Medida fuera de rango.', { details: { field: 'value' } });
      const row = await this.store.upsert('body_measurement', i.id, {
        measured_at: i.measuredAt, time_zone: i.timeZone, local_date: localDateOf(i.measuredAt, i.timeZone),
        site: i.site, value_cm: Math.round(valueCm * 100) / 100, input_unit: i.inputUnit, source: i.source, notes: i.notes,
      }, tx);
      return this.store.toContract<BodyMeasurement>('body_measurement', row);
    }));
  }

  deleteMeasurement(id: string): Promise<Result<void>> {
    return guard(() => this.store.remove('body_measurement', id));
  }

  listMeasurements(range: DateRange, site?: BodySite): Promise<Result<BodyMeasurement[]>> {
    return guard(async () => {
      const w = rangeWhere('local_date', range);
      const sql = site ? `${w.sql} AND site = ?` : w.sql;
      return (await this.store.select('body_measurement', `WHERE ${sql} ORDER BY measured_at`, site ? [...w.params, site] : w.params))
        .map((r) => this.store.toContract<BodyMeasurement>('body_measurement', r));
    });
  }
}
