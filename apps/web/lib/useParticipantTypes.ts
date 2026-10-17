'use client';

import { z } from 'zod';
import { participantTypeSchema } from '@harvestgo/shared';
import { useApi } from './useApi';

const answer = z.object({ participantTypes: z.array(participantTypeSchema) });

/** The participant types printed on the ATI form (Farmers, Farm Youth, ...). */
export function useParticipantTypes() {
  return useApi('/participant-types', answer);
}