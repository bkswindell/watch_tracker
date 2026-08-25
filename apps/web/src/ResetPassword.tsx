import { useState, type FormEvent } from "react";

import { api } from "./api";

export const PASSWORD_RESET_POLICY =
  "Use 15 to 1024 characters. Passwords must not contain NUL bytes.";

export function ResetPassword({
  token,
  onSucceeded,
  onCompleted,
}: {
  token: string;
  onSucceeded: () => void;
  onCompleted: () => void;
}) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [complete, setComplete] = useState(false);

  // A fragment is intentionally never sent to the server, but a direct visit
  // without the exact one-time token should not render a form that can make a
  // pointless request. Keep this message generic so it reveals no token state.
  if (!token)
    return (
      <div className="authShell">
        <div className="authCard">
          <div className="logo">WT</div>
          <span className="eyebrow">Password recovery</span>
          <h1>Password reset unavailable</h1>
          <p>
            This password reset link cannot be used. Request a new link from the
            host administrator.
          </p>
          <button className="primary" onClick={onCompleted}>
            Return to sign in
          </button>
        </div>
      </div>
    );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    // Match the server policy before sending an attempt. This avoids consuming
    // one of the token's bounded failed-submission attempts for a value the UI
    // already knows cannot be accepted (including a programmatic overlength
    // value that bypasses the input's maxLength attribute).
    if (
      password.length < 15 ||
      password.length > 1024 ||
      password.includes("\0")
    ) {
      setError(PASSWORD_RESET_POLICY);
      return;
    }
    if (password !== confirmation) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      await api.completePasswordReset(token, password);
      setPassword("");
      setConfirmation("");
      setComplete(true);
      // Keep the fragment-derived token in memory after a generic failure so
      // the owner can retry a policy-valid password or a transient request.
      // Discard it immediately once the server confirms atomic consumption.
      onSucceeded();
    } catch {
      // The API intentionally uses one failure response for every token state.
      setError("Password reset could not be completed.");
    } finally {
      setPassword("");
      setConfirmation("");
      setBusy(false);
    }
  }

  if (complete)
    return (
      <div className="authShell">
        <div className="authCard">
          <div className="logo">WT</div>
          <span className="eyebrow">Password recovery</span>
          <h1>Password updated</h1>
          <p>Your administrator password was changed. Sign in to continue.</p>
          <button className="primary" onClick={onCompleted}>
            Continue to sign in
          </button>
        </div>
      </div>
    );

  return (
    <div className="authShell">
      <div className="authCard">
        <div className="logo">WT</div>
        <span className="eyebrow">Password recovery</span>
        <h1>Choose a new password</h1>
        <p>{PASSWORD_RESET_POLICY}</p>
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
        <form onSubmit={submit}>
          <label htmlFor="reset-password">New administrator password</label>
          <input
            id="reset-password"
            type="password"
            autoComplete="new-password"
            minLength={15}
            maxLength={1024}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          <label htmlFor="reset-password-confirm">Confirm new password</label>
          <input
            id="reset-password-confirm"
            type="password"
            autoComplete="new-password"
            minLength={15}
            maxLength={1024}
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            required
          />
          <button className="primary" disabled={busy}>
            {busy ? "Updating password…" : "Update password"}
          </button>
        </form>
      </div>
    </div>
  );
}
