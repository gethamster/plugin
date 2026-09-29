#!/usr/bin/env bash
# Noninteractive readiness gate. No download. No browser.
set -eu

export PATH="${HOME}/.hamster/bin:${PATH}"

if ! command -v hamster >/dev/null 2>&1; then
  printf '%s\n' "Install the Hamster CLI from https://tryhamster.com/docs/hamster-studio/cli/cli-authentication and re-run setup." >&2
  echo "SETUP_NEEDED"
  exit 1
fi

if ! status_out="$(hamster --no-tui status 2>&1)" || ! printf '%s\n' "$status_out" | grep -q "Logged in"; then
  printf '%s\n' "$status_out" >&2
  echo "SETUP_NEEDED"
  exit 1
fi

# stdout stays exactly READY or SETUP_NEEDED so the caller can parse it, but the
# reason status or sync failed goes to stderr instead of being discarded.
if ! sync_err="$(hamster sync 2>&1)"; then
  printf '%s\n' "$sync_err" >&2
  echo "SETUP_NEEDED"
  exit 1
fi

echo "READY"
