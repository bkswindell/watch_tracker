export const WATCH_TRACKER_API_SERVICE = "watch-tracker-api" as const;

export interface ApiHealthResponse {
  status: "ok";
  service: typeof WATCH_TRACKER_API_SERVICE;
  requestId: string;
}

export function isApiHealthResponse(
  value: unknown,
): value is ApiHealthResponse {
  if (typeof value !== "object" || value === null) return false;

  const health = value as Record<string, unknown>;
  return (
    health.status === "ok" &&
    health.service === WATCH_TRACKER_API_SERVICE &&
    typeof health.requestId === "string" &&
    health.requestId.length > 0
  );
}
