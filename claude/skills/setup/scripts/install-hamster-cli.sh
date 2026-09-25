#!/usr/bin/env bash
# Install the Hamster CLI into ~/.hamster/bin. No sudo.
#
# The readable copy of https://tryhamster.com/cli/install that the setup skill
# runs, so the plugin never pipes a downloaded script into a shell. It downloads
# the latest release archive from github.com/gethamster/plugin, refuses to
# install unless the archive matches the SHA256 published next to it, and then
# does what the hosted installer does: put ~/.hamster/bin on PATH in ~/.zshrc
# and ~/.bashrc, retire stale task-master aliases, add the `ham` alias, and
# point the CLI at https://tryhamster.com.
#
# Deliberate differences from the hosted script, to keep when carrying its
# changes over: the checksum is required (the hosted script skips a missing
# one); there are no VERSION or HAMSTER_INSTALL_DIR overrides; indented stale
# aliases are commented out too; a config.yaml that can't be read, or a binary
# that won't run, stops the install with the reason; an alias that can't be
# rewritten is reported with the fix to make by hand; and a failed download,
# checksum mismatch, or unexpected archive ends with the manual install steps.
#
# The SHA-256 of the hosted script this copy mirrors. Update it when carrying
# the hosted script's changes over:
# hosted-installer-sha256: 4771367e627ba757b01e5e40374d5745da2cd93591b2e1bec737766f13c3ef7a
set -euo pipefail

REPO="gethamster/plugin"
INSTALL_DIR="$HOME/.hamster/bin"
BINARY="hamster"
LEGACY_BINARY="/usr/local/bin/hamster"

info() { printf '[INFO] %s\n' "$1"; }
warn() { printf '[WARN] %s\n' "$1" >&2; }
fail() { printf '[ERROR] %s\n' "$1" >&2; exit 1; }

case "$(uname -s)" in
  Darwin) os="darwin" ;;
  Linux) os="linux" ;;
  *) fail "Unsupported OS: $(uname -s). Download a binary from https://github.com/${REPO}/releases/latest" ;;
esac

case "$(uname -m)" in
  x86_64) arch="amd64" ;;
  arm64 | aarch64) arch="arm64" ;;
  *) fail "Unsupported architecture: $(uname -m). Download a binary from https://github.com/${REPO}/releases/latest" ;;
esac

archive="hamster-${os}-${arch}.tar.gz"
url="https://github.com/${REPO}/releases/latest/download/${archive}"
# A failed download, a checksum that doesn't match, or an archive laid out
# differently ends with the manual steps rather than a dead end.
manual="Install it by hand instead: download ${archive} and ${archive}.sha256 from https://github.com/${REPO}/releases/latest, check that they match, and put the hamster binary from the archive in ${INSTALL_DIR}."

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

info "Downloading $url"
curl -fsSL "$url" -o "$work/$archive" || fail "Failed to download $url. $manual"
curl -fsSL "$url.sha256" -o "$work/$archive.sha256" || fail "Failed to download the checksum at $url.sha256. $manual"

if command -v sha256sum >/dev/null 2>&1; then
  actual="$(sha256sum "$work/$archive" | awk '{print $1}')"
elif command -v shasum >/dev/null 2>&1; then
  actual="$(shasum -a 256 "$work/$archive" | awk '{print $1}')"
else
  fail "No sha256sum or shasum found, so the download cannot be verified."
fi
expected="$(awk '{print $1}' "$work/$archive.sha256")"
[ -n "$expected" ] && [ "$expected" = "$actual" ] || fail "Checksum mismatch: expected ${expected:-nothing}, got $actual. $manual"
info "Checksum verified"

tar -xzf "$work/$archive" -C "$work" || fail "Failed to extract $archive. $manual"
[ -f "$work/$BINARY" ] || fail "$archive does not contain $BINARY. $manual"

# Stage next to the destination and rename, so the swap is atomic and lands on
# a fresh inode: macOS kills an executable whose inode was rewritten in place.
mkdir -p "$INSTALL_DIR"
mv -f "$work/$BINARY" "$INSTALL_DIR/.$BINARY.new"
chmod +x "$INSTALL_DIR/.$BINARY.new"
mv -f "$INSTALL_DIR/.$BINARY.new" "$INSTALL_DIR/$BINARY"
info "Installed $INSTALL_DIR/$BINARY"

# A root-installed binary from the old sudo installer would shadow this one for
# shells that resolve /usr/local/bin first.
if [ -e "$LEGACY_BINARY" ]; then
  if rm -f "$LEGACY_BINARY" 2>/dev/null; then
    info "Removed legacy binary at $LEGACY_BINARY"
  else
    warn "Legacy install found at $LEGACY_BINARY. Remove it with: sudo rm $LEGACY_BINARY"
  fi
fi

# Older task-master installs aliased hamster and ham to task-master, which would
# shadow the binary just installed. Comment those out, add `ham` for hamster,
# and put the install dir on PATH, in both rc files so switching shells works.
update_rc() {
  local rc="$1"
  [ -f "$rc" ] || return 0
  local stale
  for stale in "alias hamster='task-master'" "alias ham='task-master'"; do
    # Indented aliases count too; lines already commented out do not.
    grep -qE "^[[:space:]]*${stale}" "$rc" || continue
    if ! sed -i.hamster-bak -E "s|^([[:space:]]*)(${stale})|\\1# \\2  # commented out — hamster/ham now owned by Hamster CLI|" "$rc"; then
      warn "Could not update $rc. Remove $stale from it by hand."
    elif cmp -s "$rc" "$rc.hamster-bak"; then
      warn "Found $stale in $rc but could not comment it out. Remove it by hand."
    else
      info "Commented out stale task-master alias in $rc"
    fi
    rm -f "$rc.hamster-bak"
  done
  if ! grep -qF "alias ham='hamster'" "$rc"; then
    printf "alias ham='hamster'\n" >>"$rc"
    info "Added 'ham' alias in $rc"
  fi
  if ! grep -qF '.hamster/bin' "$rc"; then
    # shellcheck disable=SC2016 # $HOME and $PATH expand when the rc file runs.
    printf '\n# Added by the Hamster CLI installer\nexport PATH="$HOME/.hamster/bin:$PATH"\n' >>"$rc"
    info "Added $INSTALL_DIR to PATH in $rc"
  fi
}

# Make sure the login shell's rc file exists so the PATH entry has somewhere to land.
case "${SHELL:-}" in
  */zsh) touch "$HOME/.zshrc" ;;
  */bash) touch "$HOME/.bashrc" ;;
esac
update_rc "$HOME/.zshrc"
update_rc "$HOME/.bashrc"

version_err="$work/version.err"
code=0
version="$("$INSTALL_DIR/$BINARY" --version 2>"$version_err")" || code=$?
if [ "$code" -ne 0 ]; then
  # A macOS code-signing kill or a loader abort prints nothing, so name the
  # exit status or signal as well as whatever the binary printed.
  reason="$(cat "$version_err")"
  reason="${reason:-$version}"
  if [ "$code" -gt 128 ]; then
    how="killed by signal $((code - 128))"
  else
    how="exit status $code"
  fi
  fail "Installed $INSTALL_DIR/$BINARY but it failed to run ($how)${reason:+: $reason}"
fi

config="$HOME/.hamster/config.yaml"
if [ -f "$config" ]; then
  # grep exits 1 when every line was api_url, which is fine; anything above 1
  # means config.yaml could not be read, so leave it untouched.
  status=0
  grep -v '^api_url:' "$config" >"$config.tmp" || status=$?
  if [ "$status" -gt 1 ]; then
    rm -f "$config.tmp"
    fail "Could not read $config, so it was left unchanged. Set api_url: \"https://tryhamster.com\" in it by hand."
  fi
  mv "$config.tmp" "$config"
fi
printf 'api_url: "https://tryhamster.com"\n' >>"$config"

info "Hamster CLI installed: $version"
