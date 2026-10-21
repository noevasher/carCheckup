import type { CatalogListDto, CatalogMakeDto, CatalogModelDto } from '@car-checkup/shared/dto';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api';
import { useDebouncedValue } from '../../lib/useDebouncedValue';

const DEBOUNCE_MS = 200;

export function useMakeSearch(q: string) {
  const term = useDebouncedValue(q.trim(), DEBOUNCE_MS);
  return useQuery({
    queryKey: ['catalog', 'makes', term],
    queryFn: ({ signal }) =>
      apiFetch<CatalogListDto<CatalogMakeDto>>(`/v1/catalog/makes?q=${encodeURIComponent(term)}`, { signal }),
    enabled: term.length > 0,
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
    select: (data) => data.items,
  });
}

export function useModelSearch(makeId: string | null, q: string) {
  const term = useDebouncedValue(q.trim(), DEBOUNCE_MS);
  return useQuery({
    queryKey: ['catalog', 'models', makeId, term],
    queryFn: ({ signal }) =>
      apiFetch<CatalogListDto<CatalogModelDto>>(
        `/v1/catalog/makes/${makeId ?? ''}/models?q=${encodeURIComponent(term)}`,
        { signal },
      ),
    enabled: makeId !== null,
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
    select: (data) => data.items,
  });
}
