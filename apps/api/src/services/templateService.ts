import { z } from 'zod';
import {
  OFFICIAL_TEMPLATE_CONFIG, OFFICIAL_TEMPLATE_NAME, reportTemplateConfigSchema, type ReportTemplateRecord,
} from '@harvestgo/shared';
import type { AuthContext } from '../types.js';
import { throwDbError } from '../utils/dbErrors.js';
import { HttpError } from '../utils/errors.js';

const row = z.object({
  id: z.string(),
  name: z.string(),
  version: z.number(),
  is_active: z.boolean(),
  config: z.unknown(),
  created_at: z.string(),
});

/** Reads a saved template and checks it is still valid (a bad one is refused, never used). */
export function toTemplate(raw: unknown): ReportTemplateRecord {
  const r = row.parse(raw);
  const config = reportTemplateConfigSchema.safeParse(r.config);
  if (!config.success) {
    throw new HttpError(422, 'TEMPLATE_INVALID', 'The saved report template is not valid. Ask the General Manager to set up the official template again.');
  }
  return { id: r.id, name: r.name, version: r.version, isActive: r.is_active, config: config.data, createdAt: r.created_at };
}

/** The template used for new reports (only one is active at a time), or null if none is set up yet. */
export async function getActiveTemplate(actor: AuthContext): Promise<ReportTemplateRecord | null> {
  const { data, error } = await actor.db
    .from('report_templates')
    .select('id, name, version, is_active, config, created_at')
    .eq('is_active', true)
    .maybeSingle();
  if (error) throwDbError(error, 'Report template');
  return data ? toTemplate(data) : null;
}

/** Saves the official ATI layout as the newest version and makes it the active one. General Manager only. */
export async function installOfficialTemplate(actor: AuthContext): Promise<ReportTemplateRecord> {
  const { error } = await actor.db.rpc('install_report_template', {
    p_name: OFFICIAL_TEMPLATE_NAME,
    p_config: OFFICIAL_TEMPLATE_CONFIG,
  });
  if (error) {
    if (error.code === '42501') throw new HttpError(403, 'FORBIDDEN', 'Only the General Manager can set up the report template.');
    throwDbError(error, 'Report template');
  }
  const active = await getActiveTemplate(actor);
  if (!active) throw new HttpError(409, 'NO_TEMPLATE', 'The template could not be activated.');
  return active;
}