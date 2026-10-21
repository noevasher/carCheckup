import type { CatalogMakeDto, CatalogModelDto } from '@car-checkup/shared/dto';
import { notFound } from '../../lib/http-error';
import { prisma } from '../../lib/prisma';

const escapeLike = (q: string): string => q.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * Accent- and case-insensitive search; prefix matches rank before substring matches
 * (research R6). Backed by the trigram GIN indexes on f_unaccent(lower(name)).
 */
export async function searchMakes(q: string): Promise<CatalogMakeDto[]> {
  const term = escapeLike(q);
  return prisma.$queryRaw<CatalogMakeDto[]>`
    SELECT id, name
    FROM catalog_makes
    WHERE public.f_unaccent(lower(name)) LIKE '%' || public.f_unaccent(lower(${term})) || '%'
    ORDER BY (public.f_unaccent(lower(name)) LIKE public.f_unaccent(lower(${term})) || '%') DESC,
             name ASC
    LIMIT 10`;
}

export async function searchModels(makeId: string, q: string | undefined): Promise<CatalogModelDto[]> {
  const make = await prisma.catalogMake.findUnique({ where: { id: makeId }, select: { id: true } });
  if (make === null) throw notFound();
  const term = escapeLike(q ?? '');
  return prisma.$queryRaw<CatalogModelDto[]>`
    SELECT id, make_id AS "makeId", name
    FROM catalog_models
    WHERE make_id = ${makeId}::uuid
      AND public.f_unaccent(lower(name)) LIKE '%' || public.f_unaccent(lower(${term})) || '%'
    ORDER BY (public.f_unaccent(lower(name)) LIKE public.f_unaccent(lower(${term})) || '%') DESC,
             name ASC
    LIMIT 20`;
}
