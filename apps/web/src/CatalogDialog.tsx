import type { Dispatch, SetStateAction, SyntheticEvent } from "react";

type CatalogDraft = {
  title?: string;
  type?: string;
  series?: string;
  season?: number | string;
  episode?: number | string;
  release?: string;
  runtime?: number | string;
  state?: string;
  rating?: number | string;
  order?: number | string;
  why?: string;
};
type CatalogDialogState = {
  mode: "create" | "edit" | "delete";
  draft: CatalogDraft;
};
type CatalogDialogProps = {
  dialog: CatalogDialogState;
  setDialog: Dispatch<SetStateAction<CatalogDialogState | undefined>>;
  notify: (message: string) => void;
};

export default function CatalogDialog({
  dialog,
  setDialog,
  notify,
}: CatalogDialogProps) {
  const { mode, draft } = dialog;
  const update = (field: keyof CatalogDraft, value: string | number) =>
    setDialog({ ...dialog, draft: { ...draft, [field]: value } });
  const close = () => setDialog(undefined);
  const unavailable = (event?: SyntheticEvent) => {
    event?.preventDefault();
    notify(
      `${mode === "create" ? "Add" : mode === "edit" ? "Edit" : "Delete"} watchable · Not Implemented`,
    );
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
          <span className="eyebrow">Delete catalog record</span>
          <h2 id="delete-title">Delete {draft.title}?</h2>
          <p>
            Catalog deletion is visible for design parity but is not connected
            to an authoritative API yet.
          </p>
          <div className="modalFootnote">Not Implemented</div>
          <div className="modalActions">
            <button onClick={close}>Cancel</button>
            <button className="danger" onClick={unavailable}>
              Delete watchable
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
        onSubmit={unavailable}
        aria-modal="true"
        aria-labelledby="catalog-dialog-title"
      >
        <div className="modalHeader">
          <div>
            <span className="eyebrow">
              {mode === "create" ? "New catalog record" : "Edit catalog record"}
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
          >
            ×
          </button>
        </div>
        <div className="catalogForm">
          <label className="span2">
            Title
            <input
              value={draft.title}
              onChange={(e) => update("title", e.target.value)}
            />
          </label>
          <label>
            Type
            <select
              value={draft.type}
              onChange={(e) => update("type", e.target.value)}
            >
              {["Episode", "Short", "Special", "Movie"].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label>
            Series
            <input
              value={draft.series}
              onChange={(e) => update("series", e.target.value)}
            />
          </label>
          {draft.type === "Episode" && (
            <>
              <label>
                Season
                <input
                  type="number"
                  min="0"
                  value={draft.season ?? 1}
                  onChange={(e) => update("season", e.target.value)}
                />
              </label>
              <label>
                Episode
                <input
                  type="number"
                  min="0"
                  value={draft.episode ?? 1}
                  onChange={(e) => update("episode", e.target.value)}
                />
              </label>
            </>
          )}
          <label>
            Release date
            <input
              type="date"
              value={draft.release || ""}
              onChange={(e) => update("release", e.target.value)}
            />
          </label>
          <label>
            Runtime (minutes)
            <input
              type="number"
              min="1"
              value={draft.runtime || 30}
              onChange={(e) => update("runtime", e.target.value)}
            />
          </label>
          <label>
            State
            <select
              value={draft.state}
              onChange={(e) => update("state", e.target.value)}
            >
              <option>Not Started</option>
              <option>In Progress</option>
              <option>Watched</option>
            </select>
          </label>
          <label>
            Rating (0–10)
            <input
              type="number"
              min="0"
              max="10"
              value={draft.rating ?? ""}
              onChange={(e) => update("rating", e.target.value)}
            />
          </label>
          <label>
            Display order
            <input
              type="number"
              min="0"
              value={draft.order ?? 0}
              onChange={(e) => update("order", e.target.value)}
            />
          </label>
          <label className="span2">
            Why included
            <textarea
              value={draft.why || ""}
              onChange={(e) => update("why", e.target.value)}
            />
          </label>
        </div>
        <div className="modalFootnote">
          Not Implemented · awaiting Catalog mutation API
        </div>
        <div className="modalActions">
          <button type="button" onClick={close}>
            Cancel
          </button>
          <button className="primary" type="submit">
            {mode === "create" ? "Add watchable" : "Save changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
