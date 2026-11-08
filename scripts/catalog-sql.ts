/**
 * Genera el SQL del catálogo global a partir de la fuente única `packages/data/src/catalog/catalog-data.ts`.
 *
 *   node --experimental-strip-types scripts/catalog-sql.ts > /tmp/catalogo.sql
 *
 * El resultado es idempotente y solo agrega o corrige:
 *  - inserta músculos, equipo y ejercicios que falten (por id);
 *  - actualiza nombre y rasgos de los ejercicios globales cuyo valor difiera.
 * Pégalo dentro de una migración nueva (las migraciones ya aplicadas no se editan).
 */
import { EQUIPMENT, EXERCISES, MUSCLE_GROUPS } from '../packages/data/src/catalog/catalog-data.ts';

const mg = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const eq = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ex = (n: number) => `30000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const uuids = (ids: readonly number[], f: (n: number) => string) => `'{${ids.map(f).join(',')}}'`;

const out: string[] = [];
out.push('-- Generado por scripts/catalog-sql.ts desde catalog-data.ts. No editar a mano.');
out.push('insert into athlete3.muscle_groups (id, slug, name) values');
out.push(MUSCLE_GROUPS.map(([n, slug, name]) => `  ('${mg(n)}', ${q(slug)}, ${q(name)})`).join(',\n') + '\non conflict (id) do nothing;');
out.push('insert into athlete3.equipment (id, slug, name) values');
out.push(EQUIPMENT.map(([n, slug, name]) => `  ('${eq(n)}', ${q(slug)}, ${q(name)})`).join(',\n') + '\non conflict (id) do nothing;');

out.push(`insert into athlete3.exercises (id, slug, name, modality, load_type, primary_muscle_group_ids, secondary_muscle_group_ids, equipment_ids,
  movement_pattern, mechanics, is_unilateral, access_tier) values`);
out.push(EXERCISES.map(([n, slug, name, loadType, primary, secondary, equipment, pattern, mechanics, unilateral, tier]) =>
  `  ('${ex(n)}', ${q(slug)}, ${q(name)}, 'strength', '${loadType}', ${uuids(primary, mg)}, ${uuids(secondary, mg)}, ${uuids(equipment, eq)}, '${pattern}', '${mechanics}', ${unilateral === 1}, '${tier}')`,
).join(',\n') + '\non conflict (id) do nothing;');

out.push('-- Rasgos de los ejercicios que ya existían (solo si difieren).');
out.push(`update athlete3.exercises e set movement_pattern = v.pattern, mechanics = v.mechanics, is_unilateral = v.unilateral, access_tier = v.tier
from (values
${EXERCISES.map(([n, , , , , , , pattern, mechanics, unilateral, tier]) => `  ('${ex(n)}'::uuid, '${pattern}', '${mechanics}', ${unilateral === 1}, '${tier}')`).join(',\n')}
) as v (id, pattern, mechanics, unilateral, tier)
where e.id = v.id and e.user_id is null
  and (e.movement_pattern is distinct from v.pattern or e.mechanics is distinct from v.mechanics
       or e.is_unilateral is distinct from v.unilateral or e.access_tier is distinct from v.tier);`);

process.stdout.write(out.join('\n') + '\n');
