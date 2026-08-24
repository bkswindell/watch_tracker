#!/usr/bin/env bash
set -Eeuo pipefail

# Keep the generated credential out of stdout/stderr. Compose uses the same
# default path when INITIAL_ADMIN_PASSWORD_FILE is not explicitly configured.
password_file=${INITIAL_ADMIN_PASSWORD_FILE:-./.secrets/initial_admin_password}
if [[ -z "$password_file" || "$password_file" == */ ]]; then
  printf 'INITIAL_ADMIN_PASSWORD_FILE must name a file\n' >&2
  exit 1
fi

parent=${password_file%/*}
if [[ "$parent" == "$password_file" ]]; then
  parent=.
fi

if [[ ! -e "$parent" ]]; then
  (umask 077 && mkdir -p -- "$parent")
fi

check_private_parent() {
  [[ -d "$parent" && ! -L "$parent" ]] || {
    printf 'password parent is not a directory\n' >&2
    exit 1
  }
  local owner mode
  owner=$(stat -c '%u' -- "$parent")
  mode=$(stat -c '%a' -- "$parent")
  [[ "$owner" == "$(id -u)" && "$mode" == "700" ]] || {
    printf 'password parent has unsafe owner or permissions\n' >&2
    exit 1
  }
}

check_private_parent

if [[ -L "$password_file" || ( -e "$password_file" && ! -f "$password_file" ) ]]; then
  printf 'password file is not a regular file\n' >&2
  exit 1
fi

if [[ -e "$password_file" ]]; then
  mode=$(stat -c '%a' -- "$password_file")
  owner=$(stat -c '%u' -- "$password_file")
  [[ "$owner" == "$(id -u)" && "$mode" == "600" ]] || {
    printf 'password file has unsafe owner or permissions\n' >&2
    exit 1
  }
  [[ -s "$password_file" ]] && exit 0
fi

command -v openssl >/dev/null 2>&1 || {
  printf 'openssl is required for strong randomness\n' >&2
  exit 1
}

temporary=$(mktemp "$parent/.initial_admin_password.XXXXXX")
trap 'rm -f -- "$temporary"' EXIT
chmod 600 -- "$temporary"
if ! openssl rand -base64 48 >"$temporary"; then
  printf 'strong random password generation failed\n' >&2
  exit 1
fi
[[ $(wc -c <"$temporary") -ge 60 ]] || {
  printf 'strong random password generation returned insufficient data\n' >&2
  exit 1
}

if [[ -e "$password_file" ]]; then
  # Replace a pre-existing empty file with an atomic rename after rechecking
  # its type, ownership, mode, and emptiness. Never repair an unsafe file.
  [[ -f "$password_file" && ! -L "$password_file" ]] || {
    printf 'password file is not a regular file\n' >&2
    exit 1
  }
  mode=$(stat -c '%a' -- "$password_file")
  owner=$(stat -c '%u' -- "$password_file")
  [[ "$owner" == "$(id -u)" && "$mode" == "600" && ! -s "$password_file" ]] || {
    printf 'password file changed before safe replacement\n' >&2
    exit 1
  }
  mv -T -- "$temporary" "$password_file"
else
  # Link instead of rename so a concurrent creator cannot be overwritten.
  if ! ln -- "$temporary" "$password_file" 2>/dev/null; then
    [[ -f "$password_file" ]] || {
      printf 'password file could not be created safely\n' >&2
      exit 1
    }
    mode=$(stat -c '%a' -- "$password_file")
    owner=$(stat -c '%u' -- "$password_file")
    [[ "$owner" == "$(id -u)" && "$mode" == "600" && -s "$password_file" ]] || {
      printf 'concurrent password file has unsafe owner, permissions, or contents\n' >&2
      exit 1
    }
  fi
fi
