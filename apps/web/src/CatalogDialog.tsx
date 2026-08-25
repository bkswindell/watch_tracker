import type { Dispatch, FormEvent, SetStateAction } from "react";

export type CatalogDraft = {
  additionId?: string;
  title: string;
  slug: string;
  type: string;
  series: string;
  release: string;
  runtime: number | string;
  summary: string;
  aliases: string;
  why: string;
  personal?: boolean;
};
export type CatalogDialogState = {
  mode: "create" | "edit" | "delete";
  draft: CatalogDraft;
};
type CatalogDialogProps = {
  dialog: CatalogDialogState;
  setDialog: Dispatch<SetStateAction<CatalogDialogState | undefined>>;
  onSubmit: (dialog: CatalogDialogState) => Promise<void>;
  busy: boolean;
  error?: string;
};

export default function CatalogDialog({
  dialog,
  setDialog,
  onSubmit,
  busy,
  error,
}: CatalogDialogProps) {
  const { mode, draft } = dialog;
  const update = (field: keyof CatalogDraft, value: string | number) =>
    setDialog({ ...dialog, draft: { ...draft, [field]: value } });
  const close = () => setDialog(undefined);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    await onSubmit(dialog);
  };

  if (mode === "delete")
    return (
      <div
        className="modalBackdrop"
        role="presentation"
        onMouseDown={(event) => event.target === event.currentTarget && close()}
      >
        <section
          className="catalogModal confirmModal"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="delete-title"
        >
          <span className="eyebrow">Delete personal catalog record</span>
          <h2 id="delete-title">Delete {draft.title}?</h2>
          <p>
            This removes your personal addition from this workspace. Canon Pack
            records are immutable and cannot be deleted here.
          </p>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="modalActions">
            <button onClick={close} disabled={busy}>
              Cancel
            </button>
            <button
              className="danger"
              onClick={() => void onSubmit(dialog)}
              disabled={busy}
            >
              {busy ? "Deleting…" : "Delete watchable"}
            </button>
          </div>
        </section>
      </div>
    );

  return (
    <div
      className="modalBackdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && close()}
    >
      <form
        className="catalogModal"
        onSubmit={submit}
        aria-modal="true"
        aria-labelledby="catalog-dialog-title"
      >
        <div className="modalHeader">
          <div>
            <span className="eyebrow">
              {mode === "create"
                ? "New personal catalog record"
                : "Edit personal catalog record"}
            </span>
            <h2 id="catalog-dialog-title">
              {mode === "create" ? "Add watchable" : `Edit ${draft.title}`}
            </h2>
          </div>
          <button
            type="button"
            className="iconButton"
            aria-label="Close"
            onClick={close}
            disabled={busy}
          >
            ×
          </button>
        </div>
        <div className="catalogForm">
          <label className="span2">
            Title
            <input
              required
              maxLength={500}
              value={draft.title}
              onChange={(e) => update("title", e.target.value)}
            />
          </label>
          <label className="span2">
            Slug
            <input
              required
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              maxLength={160}
              value={draft.slug}
              onChange={(e) => update("slug", e.target.value)}
            />
          </label>
          <label>
            Type
            <select
              value={draft.type}
              onChange={(e) => update("type", e.target.value)}
            >
              {[
                ["episode", "Episode"],
                ["short", "Short"],
                ["special", "Special"],
                ["movie", "Movie"],
                ["lantern-signal", "Lantern signal"],
              ].map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Series
            <input
              required
              maxLength={500}
              value={draft.series}
              onChange={(e) => update("series", e.target.value)}
            />
          </label>
          <label>
            Release date
            <input
              required
              type="date"
              value={draft.release}
              onChange={(e) => update("release", e.target.value)}
            />
          </label>
          <label>
            Runtime (minutes)
            <input
              required
              type="number"
              min="1"
              max="10080"
              value={draft.runtime}
              onChange={(e) => update("runtime", e.target.value)}
            />
          </label>
          <label className="span2">
            Summary
            <textarea
              required
              maxLength={10000}
              value={draft.summary}
              onChange={(e) => update("summary", e.target.value)}
            />
          </label>
          <label className="span2">
            Aliases (comma-separated)
            <input
              maxLength={3200}
              value={draft.aliases}
              onChange={(e) => update("aliases", e.target.value)}
            />
          </label>
          <label className="span2">
            Why included
            <textarea
              required
              maxLength={1000}
              value={draft.why}
              onChange={(e) => update("why", e.target.value)}
            />
          </label>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="modalActions">
          <button type="button" onClick={close} disabled={busy}>
            Cancel
          </button>
          <button className="primary" type="submit" disabled={busy}>
            {busy
              ? "Saving…"
              : mode === "create"
                ? "Add watchable"
                : "Save changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
