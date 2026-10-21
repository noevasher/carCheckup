import { CatalogMakesQuery, CatalogModelsQuery } from '@car-checkup/shared/schemas';
import { Router } from 'express';
import { z } from 'zod';
import { parseInput } from '../../middleware/validate';
import { searchMakes, searchModels } from './catalog.service';

const MakeParams = z.object({ makeId: z.uuid() });

export const catalogRouter = Router();

catalogRouter.get('/catalog/makes', async (req, res) => {
  const { q } = parseInput(CatalogMakesQuery, req.query);
  res.json({ items: await searchMakes(q) });
});

catalogRouter.get('/catalog/makes/:makeId/models', async (req, res) => {
  const { makeId } = parseInput(MakeParams, req.params);
  const { q } = parseInput(CatalogModelsQuery, req.query);
  res.json({ items: await searchModels(makeId, q) });
});
