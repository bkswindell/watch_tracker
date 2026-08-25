export const CATALOG_ADDITION_TYPES = [
  "movie",
  "episode",
  "special",
  "short",
  "lantern-signal",
] as const;

export type CatalogAdditionType = (typeof CATALOG_ADDITION_TYPES)[number];

export interface CatalogAdditionInput {
  slug: string;
  title: string;
  type: CatalogAdditionType;
  summary: string;
  releaseDate: string;
  runtime: number;
  series: string;
  aliases: string[];
  why: string;
  posterUrl?: string;
}

export interface CatalogAddition extends CatalogAdditionInput {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export interface ContractValidation<T> {
  value?: T;
  message?: string;
}

const EXACT_INPUT_KEYS = new Set([
  "slug",
  "title",
  "type",
  "summary",
  "releaseDate",
  "runtime",
  "series",
  "aliases",
  "why",
  "posterUrl",
]);
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const APPROVED_POSTER =
  /^https:\/\/(?:image\.tmdb\.org|media\.themoviedb\.org)\//;

function text(
  value: unknown,
  name: string,
  maximum: number,
): ContractValidation<string> {
  if (typeof value !== "string") return { message: `${name} must be a string` };
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= maximum
    ? { value: normalized }
    : { message: `${name} must contain 1 to ${maximum} characters` };
}

function validCalendarDate(value: string): boolean {
  if (!DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
  );
}

export function parseCatalogAdditionInput(
  input: unknown,
): ContractValidation<CatalogAdditionInput> {
  if (!input || typeof input !== "object" || Array.isArray(input))
    return { message: "request body must be an object" };
  const record = input as Record<string, unknown>;
  if (Object.keys(record).some((key) => !EXACT_INPUT_KEYS.has(key)))
    return { message: "request body contains an unknown field" };

  const slug = text(record.slug, "slug", 160);
  if (!slug.value || !SLUG.test(slug.value))
    return { message: slug.message ?? "slug must use lowercase kebab-case" };
  const title = text(record.title, "title", 500);
  if (!title.value) return { message: title.message ?? "title is invalid" };
  if (
    typeof record.type !== "string" ||
    !CATALOG_ADDITION_TYPES.includes(record.type as CatalogAdditionType)
  )
    return { message: "type is not an accepted Catalog type" };
  const summary = text(record.summary, "summary", 10_000);
  if (!summary.value)
    return { message: summary.message ?? "summary is invalid" };
  if (
    typeof record.releaseDate !== "string" ||
    !validCalendarDate(record.releaseDate)
  )
    return { message: "releaseDate must be a valid YYYY-MM-DD date" };
  if (
    typeof record.runtime !== "number" ||
    !Number.isInteger(record.runtime) ||
    record.runtime < 1 ||
    record.runtime > 10_080
  )
    return { message: "runtime must be an integer from 1 to 10080" };
  const series = text(record.series, "series", 500);
  if (!series.value) return { message: series.message ?? "series is invalid" };
  if (!Array.isArray(record.aliases) || record.aliases.length > 20)
    return { message: "aliases must be an array with at most 20 entries" };
  const aliases: string[] = [];
  for (const candidate of record.aliases) {
    const alias = text(candidate, "alias", 160);
    if (!alias.value) return { message: alias.message ?? "alias is invalid" };
    if (aliases.includes(alias.value))
      return { message: "aliases must be unique" };
    aliases.push(alias.value);
  }
  const why = text(record.why, "why", 1_000);
  if (!why.value) return { message: why.message ?? "why is invalid" };
  const posterUrl = record.posterUrl;
  if (
    posterUrl !== undefined &&
    (typeof posterUrl !== "string" || !APPROVED_POSTER.test(posterUrl))
  )
    return { message: "posterUrl must use an approved HTTPS media host" };

  return {
    value: {
      slug: slug.value,
      title: title.value,
      type: record.type as CatalogAdditionType,
      summary: summary.value,
      releaseDate: record.releaseDate,
      runtime: record.runtime,
      series: series.value,
      aliases,
      why: why.value,
      ...(typeof posterUrl === "string" ? { posterUrl } : {}),
    },
  };
}

export function isCatalogAdditionId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
