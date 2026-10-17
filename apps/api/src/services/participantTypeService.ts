import { z } from 'zod';
import { participantTypeSchema, type ParticipantType } from '@harvestgo/shared';
import type { AuthContext } from '../types.js';
import { throwDbError } from '../utils/dbErrors.js';

/** The participant types printed on the ATI form (only the ones switched on). */
export async function listParticipantTypes(actor: AuthContext): Promise<ParticipantType[]> {
  const { data, error } = await actor.db
    .from('participant_types')
    .select('id, name')
    .eq('is_active', true)
    .order('sort_order');
  if (error) throwDbError(error, 'Participant types');
  return z.array(participantTypeSchema).parse(data);
}