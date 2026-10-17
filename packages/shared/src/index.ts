import { z } from 'zod';

/** The two kinds of people who can log in (SRS section 1.3.1). */
export const ROLES = ['general_manager', 'administrative_staff'] as const;
export const roleSchema = z.enum(ROLES);
export type Role = z.infer<typeof roleSchema>;

export const ROLE_LABELS: Record<Role, string> = {
  general_manager: 'General Manager',
  administrative_staff: 'Administrative Staff',
};

/** Names of the two login cookies (set by the server, unreadable by page scripts). */
export const ACCESS_COOKIE = 'hg_access';
export const REFRESH_COOKIE = 'hg_refresh';

/** Every request that CHANGES data must carry this header (blocks forged cross-site requests). */
export const CSRF_HEADER = 'x-requested-with';
export const CSRF_VALUE = 'harvestgo';

/** What the server answers when asked "are you alive?" */
export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.string(),
  time: z.string(),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: 'Enter a valid email address.' }).max(254));

/** Login form rules. Used by the screen (for quick help) AND the server (for safety). */
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, { error: 'Enter your password.' }).max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;

/** The logged-in person, as the website is allowed to see them. */
export const sessionUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  fullName: z.string(),
  role: roleSchema,
});
export type SessionUser = z.infer<typeof sessionUserSchema>;

/** Every error from the server has this shape. */
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.string(), z.array(z.string())).optional(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

// ---------------- User management (General Manager only) ----------------

/** New passwords. Max 72 because bcrypt only reads the first 72 characters. */
export const passwordSchema = z
  .string()
  .min(10, { error: 'Use at least 10 characters.' })
  .max(72, { error: 'Use at most 72 characters.' })
  .regex(/[A-Za-z]/, { error: 'Include at least one letter.' })
  .regex(/[0-9]/, { error: 'Include at least one number.' });

export const fullNameSchema = z
  .string()
  .trim()
  .min(2, { error: 'Enter the full name (at least 2 letters).' })
  .max(100, { error: 'Name is too long.' });

export const createUserSchema = z.object({
  fullName: fullNameSchema,
  email: emailSchema,
  role: roleSchema,
  password: passwordSchema,
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z
  .object({
    fullName: fullNameSchema.optional(),
    role: roleSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { error: 'Nothing to change.' });
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const resetPasswordSchema = z.object({ password: passwordSchema });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/** One row of the user list. */
export const managedUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  fullName: z.string(),
  role: roleSchema,
  isActive: z.boolean(),
});
export type ManagedUser = z.infer<typeof managedUserSchema>;

export * from './farm.js';
export * from './finance.js';
export * from './activities.js';