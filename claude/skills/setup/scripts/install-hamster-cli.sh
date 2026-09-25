#!/usr/bin/env bash
# Install the Hamster CLI. No sudo.
#
# This is the Hamster CLI installer. https://tryhamster.com/cli/install
# redirects to this file on the main branch, and the plugin's setup skill runs
# it directly, so both install paths run the same script:
#
#   curl -fsSL https://tryhamster.com/cli/install | bash
#
# That redirect names this exact path, so moving or renaming the file breaks
# the install URL.
#
# It downloads a release archive from github.com/gethamster/plugin, refuses to
# install unless the archive matches the SHA-256 published next to it, installs
# the binary with an atomic rename, puts ~/.hamster/bin on PATH in ~/.zshrc and
# ~/.bashrc, retires stale task-master aliases, adds the `ham` alias, and points
# the CLI at Hamster in ~/.hamster/config.yaml.
#
# Environment overrides:
#   HAMSTER_VERSION      Release tag to install, e.g. v1.68.0. Default: the
#                        latest release. VERSION is read too, for older callers.
#   HAMSTER_INSTALL_DIR  Where to put the binary. Default: ~/.hamster/bin. A
#                        custom directory is not added to PATH for you.
#   HAMSTER_URL          The Hamster server the CLI talks to, written to
#                        api_url. Default: https://tryhamster.com.
#
# Every failure stops with an [ERROR] line that gives the reason. Shell and
# cleanup edits the installer can't make (a line in ~/.zshrc or ~/.bashrc, a
# stale task-master alias, a legacy binary in /usr/local/bin) are a [WARN] with
# the fix to make by hand, and the install continues. A failed download, a
# checksum mismatch, or an unexpected archive also gives the manual install
# steps.
set -euo pipefail

REPO="gethamster/plugin"
DEFAULT_INSTALL_DIR="$HOME/.hamster/bin"
INSTALL_DIR="${HAMSTER_INSTALL_DIR:-$DEFAULT_INSTALL_DIR}"
RELEASE="${HAMSTER_VERSION:-${VERSION:-latest}}"
if [ -n "${HAMSTER_VERSION:-}" ]; then
  release_source="HAMSTER_VERSION"
elif [ -n "${VERSION:-}" ]; then
  release_source="VERSION"
fi
API_URL="${HAMSTER_URL:-https://tryhamster.com}"
BINARY="hamster"
LEGACY_BINARY="/usr/local/bin/hamster"

info() { printf '[INFO] %s\n' "$1"; }
warn() { printf '[WARN] %s\n' "$1" >&2; }
fail() { printf '[ERROR] %s\n' "$1" >&2; exit 1; }

# api_url is written into YAML inside double quotes, so allow only a plain
# http(s) URL.
case "$API_URL" in
  http://?* | https://?*) ;;
  *) fail "HAMSTER_URL must be an http:// or https:// URL with a host, like https://tryhamster.com, got: ${API_URL:-nothing}" ;;
esac
case "$API_URL" in
  *[[:space:]\"\\]*) fail "HAMSTER_URL must not contain spaces, quotes, or backslashes, got: $API_URL" ;;
esac

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
missing_release=""
if [ "$RELEASE" = "latest" ]; then
  release_page="https://github.com/${REPO}/releases/latest"
  url="https://github.com/${REPO}/releases/latest/download/${archive}"
else
  # A pinned release that doesn't exist, or a VERSION set for something else,
  # should be named, not sent to a tag page that is itself a 404.
  info "Installing release $RELEASE, set by $release_source"
  release_page="https://github.com/${REPO}/releases"
  missing_release=" If release $RELEASE doesn't exist, fix or unset $release_source (tags look like v1.68.0)."
  url="https://github.com/${REPO}/releases/download/${RELEASE}/${archive}"
fi
# A failed download, a checksum that doesn't match, or an archive laid out
# differently ends with the manual steps rather than a dead end.
manual="Install it by hand instead: download ${archive} and ${archive}.sha256 from ${release_page}, check that they match, and put the hamster binary from the archive in ${INSTALL_DIR}."

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

info "Downloading $url"
curl -fsSL "$url" -o "$work/$archive" || fail "Failed to download $url.${missing_release} $manual"
curl -fsSL "$url.sha256" -o "$work/$archive.sha256" || fail "Failed to download the checksum at $url.sha256.${missing_release} $manual"

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
mkdir -p "$INSTALL_DIR" || fail "Could not create $INSTALL_DIR (the reason is above). Fix that path, or set HAMSTER_INSTALL_DIR to a directory you own."
cannot_install="Could not write to $INSTALL_DIR (the reason is above). Free space there or make it writable, or set HAMSTER_INSTALL_DIR to a directory you own."
mv -f "$work/$BINARY" "$INSTALL_DIR/.$BINARY.new" || fail "$cannot_install"
chmod +x "$INSTALL_DIR/.$BINARY.new" || fail "$cannot_install"
mv -f "$INSTALL_DIR/.$BINARY.new" "$INSTALL_DIR/$BINARY" || fail "$cannot_install"
info "Installed $INSTALL_DIR/$BINARY"

# A root-installed binary from the old sudo installer would shadow this one for
# shells that resolve /usr/local/bin first.
if [ "$INSTALL_DIR/$BINARY" != "$LEGACY_BINARY" ] && [ -e "$LEGACY_BINARY" ]; then
  if rm -f "$LEGACY_BINARY" 2>/dev/null; then
    info "Removed legacy binary at $LEGACY_BINARY"
  else
    warn "Legacy install found at $LEGACY_BINARY. Remove it with: sudo rm $LEGACY_BINARY"
  fi
fi

# Older task-master installs aliased hamster and ham to task-master, which would
# shadow the binary just installed. Comment those out, add `ham` for hamster,
# and put the default install dir on PATH, in both rc files so switching shells
# works.
path_updated=false
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
    if printf "alias ham='hamster'\n" 2>/dev/null >>"$rc"; then
      info "Added 'ham' alias in $rc"
    else
      warn "Could not write $rc. Add alias ham='hamster' to it by hand."
    fi
  fi
  if [ "$INSTALL_DIR" = "$DEFAULT_INSTALL_DIR" ] && ! grep -qF '.hamster/bin' "$rc"; then
    # shellcheck disable=SC2016 # $HOME and $PATH expand when the rc file runs.
    if printf '\n# Added by the Hamster CLI installer\nexport PATH="$HOME/.hamster/bin:$PATH"\n' 2>/dev/null >>"$rc"; then
      info "Added $INSTALL_DIR to PATH in $rc"
      path_updated=true
    else
      warn "Could not write $rc. Add export PATH=\"\$HOME/.hamster/bin:\$PATH\" to it by hand."
    fi
  fi
}

# Make sure the login shell's rc file exists so the PATH entry has somewhere to land.
case "${SHELL:-}" in
  */zsh) rc_file="$HOME/.zshrc" ;;
  */bash) rc_file="$HOME/.bashrc" ;;
  *) rc_file="" ;;
esac
# Only create a missing file: touching one that is read-only, such as a
# home-manager symlink into the nix store, would fail for no reason.
if [ -n "$rc_file" ] && [ ! -e "$rc_file" ] && ! touch "$rc_file" 2>/dev/null; then
  warn "Could not create $rc_file. Add $INSTALL_DIR to PATH in your shell's startup file by hand."
fi
update_rc "$HOME/.zshrc"
update_rc "$HOME/.bashrc"
# A login shell other than bash or zsh (fish, nushell) reads neither file, so
# say so rather than finish with hamster off PATH.
if [ -z "$rc_file" ] && [ "$INSTALL_DIR" = "$DEFAULT_INSTALL_DIR" ]; then
  warn "Your login shell (${SHELL:-unknown}) doesn't read ~/.zshrc or ~/.bashrc. Add $INSTALL_DIR to PATH in its startup file by hand (fish: fish_add_path $INSTALL_DIR)."
fi
if [ "$INSTALL_DIR" != "$DEFAULT_INSTALL_DIR" ]; then
  warn "Custom install dir: make sure $INSTALL_DIR is on your PATH."
fi

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

config_dir="$HOME/.hamster"
config="$config_dir/config.yaml"
cannot_write="Could not write $config (the reason is above), so the CLI is installed but not pointed at Hamster. Fix that, or set api_url: \"$API_URL\" in $config by hand."
mkdir -p "$config_dir" || fail "Could not create $config_dir (the reason is above), so the CLI is installed but not pointed at Hamster. Fix that path, then set api_url: \"$API_URL\" in $config by hand."
if [ -f "$config" ]; then
  # A failed redirect also exits 1, like grep with no lines left, so check
  # that the temp file can be written before trusting grep's status.
  : >"$config.tmp" || fail "$cannot_write"
  # grep exits 1 when every line was api_url, which is fine; anything above 1
  # means config.yaml could not be read, so leave it untouched.
  status=0
  grep -v '^api_url:' "$config" >"$config.tmp" || status=$?
  if [ "$status" -gt 1 ]; then
    rm -f "$config.tmp"
    fail "Could not read $config, so it was left unchanged. Set api_url: \"$API_URL\" in it by hand."
  fi
  mv "$config.tmp" "$config" || fail "$cannot_write"
fi
printf 'api_url: "%s"\n' "$API_URL" >>"$config" || fail "$cannot_write"

info "Hamster CLI installed: $version"
info "Configured API URL: $API_URL"
if [ "$path_updated" = true ]; then
  info "Restart your shell (or run: source ~/.zshrc) to pick up the PATH change."
fi
cat <<'EOF'

Next: add the Hamster plugin in your editor.
  Claude Code  /plugin marketplace add gethamster/plugin
               /plugin install hamster@hamster-plugins
  Codex        codex plugin marketplace add gethamster/plugin
               codex plugin add hamster@hamster-plugins
  Cursor       Customize > Add Marketplace > Import from GitHub > https://github.com/gethamster/plugin
  Antigravity  agy plugin install https://github.com/gethamster/plugin

To keep the plan on disk in a git repo:
  hamster auth login    # sign in to Hamster
  hamster init          # write this repo's .hamster/ plan
  hamster sync          # refresh it
EOF
