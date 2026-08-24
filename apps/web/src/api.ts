export type ViewingState = "not-started" | "in-progress" | "watched";
export type CatalogRelationship = {
  type: string;
  direction: "requires" | "required-by";
  referencedWatchable: { id: string; slug: string; title: string };
  summary: string;
};
export type CatalogItem = {
  slug: string;
  title: string;
  type: string;
  summary: string;
  releaseOrder: number;
  state: ViewingState;
  relationships: CatalogRelationship[];
  [key: string]: unknown;
};
export type CatalogResponse = { items: CatalogItem[]; nextUp?: CatalogItem };
export type WorkspaceRelationship = {
  fromSlug: string;
  toSlug: string;
  type: string;
};
export type WorkspaceHistory = {
  historyId?: string;
  date?: string;
  title?: string;
  slug?: string;
  action?: string;
  duration?: number;
  rating?: number | null;
  completedAt?: string;
  [key: string]: unknown;
};
export type WorkspaceResponse = {
  items: CatalogItem[];
  relationships: WorkspaceRelationship[];
  targetSlug?: string;
  nextUp: CatalogItem[];
  history: WorkspaceHistory[];
  pack?: Record<string, unknown>;
};

type Method = "GET" | "POST";
export function requestOptions(
  method: Method,
  csrfToken?: string,
  body?: unknown,
): RequestInit {
  const options: RequestInit = { credentials: "same-origin" };
  if (method === "GET") return options;
  options.method = method;
  options.headers = {
    ...(body !== undefined ? { "content-type": "application/json" } : {}),
    ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
  };
  if (body !== undefined) options.body = JSON.stringify(body);
  return options;
}
async function call<T>(
  url: string,
  method: Method,
  csrfToken?: string,
  body?: unknown,
): Promise<{ data: T; response: Response }> {
  const response = await fetch(url, requestOptions(method, csrfToken, body));
  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => undefined);
    const message =
      typeof payload === "object" &&
      payload !== null &&
      "message" in payload &&
      typeof payload.message === "string"
        ? payload.message
        : `Request failed (${response.status})`;
    throw new Error(message);
  }
  const data =
    response.status === 204 ? (undefined as T) : ((await response.json()) as T);
  return { data, response };
}
export function recommendedNext<T extends { slug: string }>(
  items: T[],
  nextUp: { slug: string }[],
): T | undefined {
  const nextSlug = nextUp[0]?.slug;
  return items.find((item) => item.slug === nextSlug) ?? items[0];
}

export const api = {
  bootstrap: () =>
    call<{ setupRequired: boolean; authenticated: boolean; csrfToken: string }>(
      "/api/bootstrap",
      "GET",
    ),
  setup: (csrf: string) => call<void>("/api/setup", "POST", csrf),
  login: (password: string, csrf: string) =>
    call<void>("/api/login", "POST", csrf, { password }),
  importPack: (csrf: string) =>
    call<{ pack: { title: string; version: string } }>(
      "/api/import-lantern-vale",
      "POST",
      csrf,
    ),
  workspace: () => call<WorkspaceResponse>("/api/workspace", "GET"),
  catalog: (filters: { search?: string; type?: string } = {}) => {
    const params = new URLSearchParams();
    if (filters.search?.trim()) params.set("search", filters.search.trim());
    if (filters.type?.trim()) params.set("type", filters.type.trim());
    const query = params.toString();
    return call<CatalogResponse>(
      `/api/catalog${query ? `?${query}` : ""}`,
      "GET",
    );
  },
  item: (slug: string) =>
    call<CatalogItem>(`/api/catalog/${encodeURIComponent(slug)}`, "GET"),
  focus: (slug: string, csrf: string) =>
    call<{ nextUp?: CatalogItem }>("/api/focus", "POST", csrf, {
      targetSlug: slug,
    }),
  action: (
    slug: string,
    action: "start" | "complete" | "discard" | "repeat",
    csrf: string,
  ) =>
    call<CatalogItem>(
      `/api/catalog/${encodeURIComponent(slug)}/${action}`,
      "POST",
      csrf,
    ),
  csrfFromLogin: (response: Response) =>
    response.headers.get("x-csrf-token") ?? "",
};
