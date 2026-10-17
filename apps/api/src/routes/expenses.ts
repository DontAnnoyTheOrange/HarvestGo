import { Router } from 'express';
import { createExpenseSchema, listExpensesQuery, updateExpenseSchema } from '@harvestgo/shared';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { parseQuery, validateBody } from '../middleware/validate.js';
import { createExpense, deleteExpense, listExpenses, updateExpense } from '../services/expenseService.js';
import { parseUuid } from '../utils/ids.js';

export function createExpensesRouter() {
  const router = Router();
  router.use(requireAuth);

  router.get('/', async (req, res) => {
    res.json(await listExpenses(req.auth!, parseQuery(listExpensesQuery, req.query)));
  });

  router.post('/', validateBody(createExpenseSchema), async (req, res) => {
    res.status(201).json({ record: await createExpense(req.auth!, req.body) });
  });

  // PUT = send the whole record again (edit form)
  router.put('/:id', validateBody(updateExpenseSchema), async (req, res) => {
    res.json({ record: await updateExpense(req.auth!, parseUuid(req.params.id, 'Expense'), req.body) });
  });

  // Deleting is for the General Manager only (SRS 1.3.1).
  router.delete('/:id', requireRole('general_manager'), async (req, res) => {
    await deleteExpense(req.auth!, parseUuid(req.params.id, 'Expense'));
    res.json({ ok: true });
  });

  return router;
}