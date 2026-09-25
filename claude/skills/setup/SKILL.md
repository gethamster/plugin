---
name: setup
description: Install the Hamster CLI, sign in, and sync the plan into this repo. Use when the user says Install Hamster, first-run setup, or when ship/plan-hamster/resume-hamster report SETUP_NEEDED.
---

# Setup

Make this workspace ready: Hamster CLI on PATH, user signed in, plan on disk in this repo's `.hamster/`.

Talking to Hamster uses the Hamster MCP tools when the client has them; `hamster chat` is the same ask path over the CLI. This skill is only for installing the CLI and getting the local plan.

## Readiness check

Run the bundled gate. Set `SKILL_DIR` to the absolute path of the directory holding the SKILL.md you just read — the shell's working directory is the user's project, not this skill — and keep the whole command on one line with its statements `;`-separated, because some clients flatten a fenced block into a single line before running it. The `else` branch is the same gate inline, for clients that expose no readable path to the installed package. Neither branch installs, opens a browser, or calls curl.

Unix:

```bash
SKILL_DIR="<absolute path of the directory containing this SKILL.md>"; if [ -f "$SKILL_DIR/scripts/ensure-ready.sh" ]; then bash "$SKILL_DIR/scripts/ensure-ready.sh"; else export PATH="$HOME/.hamster/bin:$PATH"; if command -v hamster >/dev/null 2>&1 && { status_err="$(hamster --no-tui status 2>&1)"; printf '%s' "$status_err" | grep -q "Logged in" || { printf '%s\n' "$status_err" >&2; false; }; } && sync_err="$(hamster sync 2>&1)"; then echo READY; else [ -n "${sync_err:-}" ] && printf '%s\n' "$sync_err" >&2; echo SETUP_NEEDED; exit 1; fi; fi
```

Windows:

```powershell
$SkillDir = "<absolute path of the directory containing this SKILL.md>"; if (Test-Path "$SkillDir\scripts\ensure-ready.ps1") { pwsh "$SkillDir\scripts\ensure-ready.ps1" } else { $env:PATH = "$env:USERPROFILE\.hamster\bin;" + $env:PATH; if (Get-Command hamster -ErrorAction SilentlyContinue) { $status = & hamster --no-tui status 2>&1 | Out-String; if ($LASTEXITCODE -eq 0 -and $status -cmatch "Logged in") { $syncOut = & hamster sync 2>&1; if ($LASTEXITCODE -eq 0) { "READY" } else { [Console]::Error.WriteLine(($syncOut | Out-String).TrimEnd()); "SETUP_NEEDED"; exit 1 } } else { [Console]::Error.WriteLine($status.TrimEnd()); "SETUP_NEEDED"; exit 1 } } else { "SETUP_NEEDED"; exit 1 } }
```

- Prints `READY` — the CLI is installed, you are signed in, and `hamster sync` succeeded. Stop.
- Prints `SETUP_NEEDED` — if this is Codex on macOS and `hamster` is already on `PATH`, re-run only this readiness command with elevated permission. The default workspace sandbox cannot read Keychain credentials, and an extra directory grant does not change that. If the elevated check prints `READY`, stop. Only if it still prints `SETUP_NEEDED`, continue below.

## Install the CLI

If `hamster` is not on PATH (also look in `~/.hamster/bin`), run the bundled installer, with `SKILL_DIR` set as above:

```bash
SKILL_DIR="<absolute path of the directory containing this SKILL.md>"; bash "$SKILL_DIR/scripts/install-hamster-cli.sh"
```

It downloads the latest `hamster` release for this OS and architecture from GitHub, refuses to install unless the archive matches its published SHA256, and installs to `~/.hamster/bin`. It also edits shell and CLI config, so tell the user before running it: in whichever of `~/.zshrc` and `~/.bashrc` exist (creating the login shell's) it adds `~/.hamster/bin` to PATH and a `ham` alias and comments out stale task-master aliases; it removes an old `/usr/local/bin/hamster` if it can; and it sets `api_url` in `~/.hamster/config.yaml` to `https://tryhamster.com`, replacing any existing `api_url`. Pass every `[WARN]` line on to the user; each one names a fix to make by hand. If the script exits non-zero, report its `[ERROR]` line, which ends with the manual install steps when the download failed, and stop. If the script is not readable, or this is Windows, ask the user to download the binary for their platform from https://github.com/gethamster/plugin/releases/latest into `~/.hamster/bin`, then continue.

Then put `~/.hamster/bin` on PATH for this session.

## Sign in

```bash
hamster auth login
```

This opens a browser. Wait until it finishes. Do not paste tokens into chat.

## Init and sync

```bash
hamster init
```

`init` may ask the user to pick an account and runs the first sync.

Re-run the readiness check — it runs the sync that pulls the plan. If it still prints `SETUP_NEEDED`, report what failed and stop.

## Finish

When the check prints `READY`, confirm this repo now has `.hamster/`. If the client has the Hamster MCP server and the user has not signed in to it yet, point them to their client's sign-in; the client owns it, never handle their credentials:

- Claude Code: open `/mcp` and select `plugin:hamster:hamster`.
- Codex: run `codex mcp login hamster` in a terminal.
- Copilot CLI: `/mcp auth hamster`.
- Grok Build: open `/mcps`, select `hamster`, and press `i`.
- Cursor: follow Cursor's Hamster sign-in prompt.
- Antigravity: in the CLI, open `/mcp`, select `hamster_hamster`, then Authenticate; in the app, select Authenticate on `hamster_hamster` under Settings → Customizations → Installed MCP Servers.
- Pi has no MCP; Hamster runs through the CLI.

If the client has no Hamster MCP server, as in a skills-only install from Codex's Plugins Directory, `ask-hamster` still works through the CLI. To add the Hamster tools, tell the user to add `https://tryhamster.com/mcp` as a remote MCP connector and sign in through OAuth; in Codex that is `codex mcp add hamster --url https://tryhamster.com/mcp`, then `codex mcp login hamster`.

Then tell the user they can ask Hamster about this repo with the `ask-hamster` skill and ship a brief with `ship`.
