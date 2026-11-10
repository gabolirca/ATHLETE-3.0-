import { z } from 'zod';
import { SyncedRecord, Uuid } from './common';

/**
 * Comentario del coach para su atleta (contratos 0.9.0). Es una fila del atleta que solo escribe su coach
 * (RPC `coach_add_comment`); el atleta la recibe por sync y no puede crearla ni editarla.
 */
export const CoachCommentTarget = z.enum(['general', 'session', 'plan']);
export type CoachCommentTarget = z.infer<typeof CoachCommentTarget>;

export const CoachComment = SyncedRecord.extend({
  authorId: Uuid.nullable(),
  authorName: z.string().min(1).max(80),
  targetType: CoachCommentTarget,
  targetId: Uuid.nullable(),
  body: z.string().min(1).max(1000),
});
export type CoachComment = z.infer<typeof CoachComment>;
