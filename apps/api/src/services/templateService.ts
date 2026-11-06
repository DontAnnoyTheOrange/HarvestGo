import { z } from 'zod';
import {
  OFFICIAL_TEMPLATE_CONFIG, OFFICIAL_TEMPLATE_NAME, reportTemplateDocumentSchema, reportTemplateVersionSchema,
  type ReportTemplateDocument, type ReportTemplateRecord,
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
  const config = reportTemplateVersionSchema.safeParse(r.config);
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

/** Reads the General Manager's shared v2 draft without exposing it to other roles. */
export async function getTemplateDraft(actor: AuthContext): Promise<{ document: ReportTemplateDocument; updatedAt: string } | null> {
  const { data, error } = await actor.db
    .from('report_template_drafts')
    .select('config, updated_at')
    .eq('draft_key', 'active')
    .maybeSingle();
  if (error) throwDbError(error, 'Report template draft');
  if (!data) return null;

  const parsed = reportTemplateDocumentSchema.safeParse(data.config);
  if (!parsed.success || typeof data.updated_at !== 'string') {
    throw new HttpError(422, 'TEMPLATE_INVALID', 'The saved report draft is invalid. Create a new draft before continuing.');
  }
  return { document: parsed.data, updatedAt: data.updated_at };
}

/** Persists the in-progress v2 document separately from immutable published versions. */
export async function saveTemplateDraft(actor: AuthContext, rawDocument: unknown): Promise<{ document: ReportTemplateDocument; updatedAt: string }> {
  const parsed = reportTemplateDocumentSchema.safeParse(rawDocument);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new HttpError(422, 'TEMPLATE_INVALID', issue ? `Template draft is invalid: ${issue.message}` : 'The template draft is invalid.');
  }
  const { data, error } = await actor.db
    .from('report_template_drafts')
    .upsert({
      draft_key: 'active',
      config: parsed.data,
      updated_by: actor.userId,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'draft_key' })
    .select('config, updated_at')
    .single();
  if (error) throwDbError(error, 'Report template draft');
  const saved = reportTemplateDocumentSchema.safeParse(data?.config);
  if (!saved.success || typeof data?.updated_at !== 'string') {
    throw new HttpError(503, 'DRAFT_SAVE_FAILED', 'The draft was saved but could not be verified. Reload the page before continuing.');
  }
  return { document: saved.data, updatedAt: data.updated_at };
}

/** Removes the shared draft after the General Manager discards it. */
export async function deleteTemplateDraft(actor: AuthContext): Promise<void> {
  const { error } = await actor.db.from('report_template_drafts').delete().eq('draft_key', 'active');
  if (error) throwDbError(error, 'Report template draft');
}

/** Validates a template config and stores it as a new version, making it active. General Manager only. */
export async function saveTemplateConfig(actor: AuthContext, rawConfig: unknown): Promise<ReportTemplateRecord> {
  const parsed = reportTemplateVersionSchema.safeParse(rawConfig);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new HttpError(422, 'TEMPLATE_INVALID', issue ? `Template is invalid: ${issue.message}` : 'The template settings are invalid.');
  }

  const name = parsed.data.schemaVersion === 2 ? parsed.data.name : OFFICIAL_TEMPLATE_NAME;
  const { error } = await actor.db.rpc('install_report_template', {
    p_name: name,
    p_config: parsed.data,
  });
  if (error) {
    if (error.code === '42501') throw new HttpError(403, 'FORBIDDEN', 'Only the General Manager can set up the report template.');
    throwDbError(error, 'Report template');
  }

  const active = await getActiveTemplate(actor);
  if (!active) throw new HttpError(409, 'NO_TEMPLATE', 'The template could not be activated.');
  return active;
}

/** Saves the official ATI layout as the newest version and makes it the active one. General Manager only. */
export async function installOfficialTemplate(actor: AuthContext): Promise<ReportTemplateRecord> {
  return saveTemplateConfig(actor, OFFICIAL_TEMPLATE_CONFIG);
}