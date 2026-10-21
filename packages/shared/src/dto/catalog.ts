import type { CatalogMake, CatalogModel } from '../generated/prisma/browser';

export type CatalogMakeDto = Pick<CatalogMake, 'id' | 'name'>;
export type CatalogModelDto = Pick<CatalogModel, 'id' | 'makeId' | 'name'>;

export interface CatalogListDto<T> {
  items: T[];
}
