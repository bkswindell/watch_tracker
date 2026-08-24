export const FEEDBACK_NOTE_MAX_LENGTH = 4_000;

export interface WatchableFeedbackInput {
  rating: number | null;
  favorite: boolean;
  wouldRewatch: boolean;
  note: string | null;
}

export interface WatchableFeedback extends WatchableFeedbackInput {
  updatedAt: string;
}

export interface WatchableFeedbackResponse {
  eligible: boolean;
  feedback: WatchableFeedback | null;
}

export function parseWatchableFeedbackInput(input: unknown): {
  value?: WatchableFeedbackInput;
  message?: string;
} {
  if (typeof input !== "object" || input === null || Array.isArray(input))
    return { message: "Feedback must be an object" };
  const record = input as Record<string, unknown>;
  const accepted = new Set(["rating", "favorite", "wouldRewatch", "note"]);
  if (Object.keys(record).some((key) => !accepted.has(key)))
    return { message: "Feedback contains an unknown field" };
  const rating = record.rating;
  if (!(
    rating === null ||
    (typeof rating === "number" &&
      Number.isFinite(rating) &&
      rating >= 0.5 &&
      rating <= 5 &&
      Number.isInteger(rating * 2))
  ))
    return { message: "rating must be null or a half-step from 0.5 through 5" };
  if (typeof record.favorite !== "boolean")
    return { message: "favorite must be a boolean" };
  if (typeof record.wouldRewatch !== "boolean")
    return { message: "wouldRewatch must be a boolean" };
  if (!(record.note === null || typeof record.note === "string"))
    return { message: "note must be null or a string" };
  const note = typeof record.note === "string" ? record.note.trim() : null;
  if (note && note.length > FEEDBACK_NOTE_MAX_LENGTH)
    return {
      message: `note must not exceed ${FEEDBACK_NOTE_MAX_LENGTH} characters`,
    };
  return {
    value: {
      rating: rating as number | null,
      favorite: record.favorite,
      wouldRewatch: record.wouldRewatch,
      note: note || null,
    },
  };
}
