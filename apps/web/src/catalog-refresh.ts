export type CatalogFilters = { search?: string; type?: string };

export function createLatestCatalogRequest<T>(
  load: (filters: CatalogFilters) => Promise<T>,
  apply: (result: T) => void,
) {
  let latestRequest = 0;

  return async (filters: CatalogFilters): Promise<void> => {
    const request = ++latestRequest;
    try {
      const result = await load(filters);
      if (request === latestRequest) apply(result);
    } catch (cause) {
      if (request === latestRequest) throw cause;
    }
  };
}
