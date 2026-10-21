import { z } from 'zod';

export const CatalogMakesQuery = z.object({
  q: z.string().trim().min(1).max(60),
});
export type CatalogMakesQuery = z.infer<typeof CatalogMakesQuery>;

export const CatalogModelsQuery = z.object({
  q: z.string().trim().max(60).optional(),
});
export type CatalogModelsQuery = z.infer<typeof CatalogModelsQuery>;
