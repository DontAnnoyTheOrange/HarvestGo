import type { RequestHandler } from 'express';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { MAX_UPLOAD_BYTES, listDocumentsQuery, updateDocumentSchema, uploadFieldsSchema } from '@harvestgo/shared';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { parseQuery, validateBody } from '../middleware/validate.js';
import {
  createDocumentUrl, deleteDocument, listDocuments, updateDocument, uploadDocument,
} from '../services/documentService.js';
import { HttpError } from '../utils/errors.js';
import { sendError } from '../utils/http.js';
import { parseUuid } from '../utils/ids.js';

// The file is held in memory only while it is checked and shrunk, never written to the server's disk.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 10, fieldSize: 10 * 1024 },
});

/** Runs multer and turns its complaints into our normal error messages. */
const receiveFile: RequestHandler = (req, res, next) => {
  upload.single('file')(req, res, (err: unknown) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') return next(new HttpError(413, 'FILE_TOO_LARGE', 'That file is too large. The limit is 10 MB.'));
      return next(new HttpError(400, 'BAD_UPLOAD', 'The upload could not be understood. Please try again.'));
    }
    return next(err);
  });
};

export function createDocumentsRouter() {
  const router = Router();
  router.use(requireAuth);

  // A reasonable cap on uploads so one computer cannot flood the server.
  const uploadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 60,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) => sendError(res, 429, 'TOO_MANY_UPLOADS', 'Too many uploads. Please wait a few minutes.'),
  });

  router.get('/', async (req, res) => {
    res.json(await listDocuments(req.auth!, parseQuery(listDocumentsQuery, req.query)));
  });

  router.post('/', uploadLimiter, receiveFile, validateBody(uploadFieldsSchema), async (req, res) => {
    if (!req.file) throw new HttpError(400, 'NO_FILE', 'Choose a file to upload.');
    const record = await uploadDocument(req.auth!, { buffer: req.file.buffer, originalname: req.file.originalname }, req.body);
    res.status(201).json({ record });
  });

  router.get('/:id/url', async (req, res) => {
    res.json(await createDocumentUrl(req.auth!, parseUuid(req.params.id, 'Document')));
  });

  // Changes the description only. The file itself never changes.
  router.put('/:id', validateBody(updateDocumentSchema), async (req, res) => {
    res.json({ record: await updateDocument(req.auth!, parseUuid(req.params.id, 'Document'), req.body) });
  });

  // Deleting is for the General Manager only (SRS 1.3.1).
  router.delete('/:id', requireRole('general_manager'), async (req, res) => {
    await deleteDocument(req.auth!, parseUuid(req.params.id, 'Document'));
    res.json({ ok: true });
  });

  return router;
}