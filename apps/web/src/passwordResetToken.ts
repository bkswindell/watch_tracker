const RESET_TOKEN = /^[A-Za-z0-9_-]{43}$/;

/**
 * Accept only the exact fragment contract emitted by the host-admin recovery
 * command. The fragment never leaves the browser, and malformed or ambiguous
 * fragments deliberately become an invalid in-memory token for the generic
 * reset failure flow.
 */
export function passwordResetTokenFromFragment(fragment: string): string {
  const parameters = new URLSearchParams(
    fragment.startsWith("#") ? fragment.slice(1) : fragment,
  );
  const tokens = parameters.getAll("token");
  const keys = [...parameters.keys()];
  if (
    tokens.length !== 1 ||
    keys.length !== 1 ||
    keys[0] !== "token" ||
    !RESET_TOKEN.test(tokens[0] ?? "")
  ) {
    return "";
  }
  return tokens[0] ?? "";
}
