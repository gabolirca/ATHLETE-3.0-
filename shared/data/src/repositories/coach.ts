import type { CoachComment, CoachCommentTarget, CoachRepository, Result } from '@athlete/contracts';
import { Repository, guard } from './base';

/** Comentarios del coach: llegan por sync y en la app del atleta son de solo lectura (0.9.0). */
export class LocalCoachRepository extends Repository implements CoachRepository {
  listComments(filter: { targetType?: CoachCommentTarget; targetId?: string } = {}): Promise<Result<CoachComment[]>> {
    return guard(async () => {
      const where = ['deleted_at IS NULL'];
      const params: string[] = [];
      if (filter.targetType) { where.push('target_type = ?'); params.push(filter.targetType); }
      if (filter.targetId) { where.push('target_id = ?'); params.push(filter.targetId); }
      const rows = await this.store.select('coach_comment', `WHERE ${where.join(' AND ')} ORDER BY created_at DESC, id LIMIT 200`, params);
      return rows.map((r) => this.store.toContract<CoachComment>('coach_comment', r));
    });
  }
}
