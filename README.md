# Hamster

**Install Hamster.** One plugin. Talk through hosted MCP or the CLI. Keep the plan on disk, then ship from it.

This is the Hamster product: Agent Plugins skills on every supported client, hosted MCP on every client that supports MCP and installs from GitHub or a marketplace, plus generated native execution workers on Claude Code, GitHub Copilot CLI, and Grok Build. The CLI is how the plan stays in this repo. It is not a second install.

[Privacy Policy](https://tryhamster.com/privacy-policy) · [Terms of Service](https://tryhamster.com/terms-of-service) · [Docs](https://tryhamster.com/docs) · [Source](https://github.com/gethamster/plugin)

## Install

Installation differs by client. If you use more than one, install Hamster separately for each one.

### Cursor

1. Customize → Add Marketplace → Import from GitHub.
2. Paste `https://github.com/gethamster/plugin` at User scope and select Import.
3. Open the Personal tab and select Add next to Hamster.

On Enterprise, an admin must allow marketplace imports. Once Hamster is on the Cursor marketplace, `/add-plugin hamster` works too:

```text
/add-plugin hamster
```

Grok Bot is not a separate Hamster package. It uses the same Cursor account and plugin library, so the Cursor install above is the Grok Bot install. Do not run `/add-plugin` in the Grok Bot chat. If Grok Bot shows "Complete GitHub auth to sync installed plugins", complete GitHub auth when Grok Bot asks.

### Claude Code

```text
/plugin marketplace add gethamster/plugin
/plugin install hamster@hamster-plugins
```

### Codex CLI

```text
codex plugin marketplace add gethamster/plugin
codex plugin add hamster@hamster-plugins
```

You can also launch `codex`, run `/plugins`, and install `hamster@hamster-plugins`.

### Codex Plugins Directory

The Hamster listing in OpenAI's Plugins Directory, used by Codex and ChatGPT, is a zip of this same plugin produced by `node scripts/build-codex-bundle.mjs`: the Codex manifest, the hosted MCP connector in `.mcp.json`, the skills, and the listing images. CI builds it on every push and uploads it as a workflow artifact, and the artifact download is the zip to upload to the directory.

One section differs. The zip replaces the "Install the CLI" section of `skills/setup/SKILL.md` with `codex-directory/install-cli.md`: when the CLI is missing, setup asks you to install it yourself from [CLI binary](#advanced-cli-binary) instead of running the installer, then signs you in and syncs as usual.

Hamster connects to your workspace through the hosted MCP server. Coding skills require access to your repository and a shell.

### Antigravity

From this repository:

```text
agy plugin install .
```

Or from GitHub:

```text
agy plugin install https://github.com/gethamster/plugin
```

If Hamster 3.2 is already installed, uninstall it before you install 3.4. An in-place Antigravity install retains the four skill directories renamed in 3.4.

```text
agy plugin uninstall hamster
agy plugin install https://github.com/gethamster/plugin
```

In the Antigravity app (2.15 or newer), authenticate `hamster_hamster` under Settings → Customizations → Installed MCP Servers. The plugin registers that server itself, so a manual `hamster` entry in `mcp_config.json` would add a second copy of every tool.

Using GitHub Copilot CLI, Grok Build, Gemini CLI, or Pi? See [More install options](#more-install-options).

## More install options

### GitHub Copilot CLI

```text
copilot plugin marketplace add gethamster/plugin
copilot plugin install hamster@hamster-plugins
```

To sign in to the hosted MCP server, run `/mcp auth hamster`.

### Grok Build

```text
grok plugin install gethamster/plugin --trust
```

To sign in to the hosted MCP server, open `/mcps`, select hamster, and press `i`.

### Gemini CLI

```text
gemini extensions install https://github.com/gethamster/plugin
```

To sign in to the hosted MCP server, run `/mcp auth hamster`.

### Pi

```text
pi install git:github.com/gethamster/plugin
```

Pi has no MCP support, so Hamster runs through the CLI. Run `/skill:setup` to install it and sign in.

## After install

1. **Talk** — hosted MCP at `https://tryhamster.com/mcp`, or `hamster chat` when MCP tools are unavailable and the CLI is signed in. Your client owns the Hamster sign-in.
2. **Plan on disk** — say Install Hamster, or run ship. The setup skill installs the CLI if needed, runs `hamster auth login`, and syncs the plan.
3. **Ship** — execute the brief already on disk. Nothing runs automatically on session start.

## What the plugin runs, sends, and fetches

- **Hosted MCP server.** The plugin registers `https://tryhamster.com/mcp` as a remote HTTP MCP server. You sign in through your client's own OAuth flow; the plugin never reads or passes an MCP token or key. Requests you make through the Hamster tools, and the workspace data they return, travel between your client and Hamster.
- **Hamster CLI.** When the `hamster` command is missing, the `setup` skill downloads and runs the Hamster CLI installer from https://tryhamster.com/cli/install.
- **CLI commands.** Skills run `hamster auth login` (opens your browser to sign in), `hamster init` and `hamster sync` (write the plan to `.hamster/` in your repository), `hamster status`, `hamster chat` (sends your question to Hamster when MCP tools are unavailable), and `hamster task status` or `hamster brief status` (update status in Hamster Studio while `ship` runs). The bundled `ensure-ready` scripts only check that the CLI is installed and signed in, then run `hamster sync`. `hamster sync` also writes `.claude/skills/hamster-project-context/SKILL.md`, a guide to the synced files that the CLI fills in from a built-in template with your team name, the last sync time, and file counts.
- **Background sync.** `ship` and `resume-hamster` keep the plan current during a run with `hamster sync --watch` in the background. They reuse a watcher already running for this repository, found with `pgrep` and `lsof`, and stop only a watcher they started.
- **Team check.** `ship`, `plan-hamster`, and `resume-hamster` read `HAMSTER_ACCOUNT_ID`, if it is set, and compare it with the account in `.hamster/.state.json` on your machine; it is not sent anywhere. If the team doesn't match, they ask which team you mean and then run `hamster team switch --account-id <id>`, which clears the previous team's synced plan and syncs the new one.
- **Git and GitHub.** `ship` and `resume-hamster` create a branch and commit in your repository. They push and open a pull request with `gh` only when you ask. `retro` reads merged pull requests with `gh pr list`, `qa` reads the branch's recent CI results with `gh run list`, and `qa`, `review-hamster`, and `ship` read the default branch with `gh repo view`.

Nothing runs automatically when a session starts: the plugin has no hooks.

## Skills

Claude Code and Copilot CLI list these as `/hamster:<skill>`. Cursor and Grok Build list them as `/<skill>`, and Pi as `/skill:<skill>`. The table uses the Claude form.

| Skill | Persona | Description |
|-------|---------|-------------|
| `/hamster:setup` | — | Install the CLI, sign in, and sync the plan into this repo |
| `/hamster:ask-hamster [request]` | Workspace Copilot | Connect current code with workspace priorities, blockers, blueprints, or related work (hosted MCP when the client has it; `hamster chat` otherwise) |
| `/hamster:ship [brief]` | Release Engineer | Ship a brief: merge base, implement in parallel, test, review, bisectable commits, PR |
| `/hamster:plan-hamster [brief]` | Tech Lead + CEO/Eng modes | Analyze brief with optional founder or architecture review |
| `/hamster:resume-hamster [brief]` | — | Resume interrupted execution from where you left off |
| `/hamster:review-hamster` | Staff Engineer | Paranoid two-pass code review (CRITICAL then INFORMATIONAL) |
| `/hamster:qa [mode]` | QA Lead | Systematic testing: diff-aware, full, quick, regression |
| `/hamster:retro [days]` | Eng Manager | Engineering retrospective with metrics, trends, team analysis |

Four skills carry a `-hamster` suffix because Cursor invokes plugin skills as a bare `/skill-name`, and `ask`, `plan`, and `resume` are Cursor's own concepts — `cursor-agent --mode` takes `plan` and `ask`, `--resume` selects a session — so short names compete with them there. `review` is renamed with that family so Cursor's command list stays one convention. Claude Code namespaces plugin skills as `/<plugin>:<skill>` and they cannot conflict, so on Claude the suffix is redundant and you type `/hamster:ask-hamster`. One skills tree serves every client, so that is the cost of being unambiguous on Cursor. `ship`, `qa`, `retro`, and `setup` shadow nothing and stay short.

#### `/hamster:setup`

The readiness path. Noninteractive check first (`ensure-ready`). If the CLI is installed and you are signed in, it runs `hamster sync` to refresh the plan. Otherwise it installs the CLI, opens login, and inits/syncs — only when you asked.

#### `/hamster:ask-hamster`

The gateway for open-ended questions that need Hamster's judgment across the workspace, such as how the code you're changing relates to priorities, blueprints, or decisions. Asks through the `ask_hamster` MCP tool when the client has it; otherwise `hamster chat` is the same ask path over the CLI. Direct reads and writes go to the named Hamster MCP tools instead. For example:

```
/hamster:ask-hamster I'm modifying auth middleware in apps/web/app/api/. What does our blueprint say about third-party integrations?
/hamster:ask-hamster I prototyped rate limiting in apps/api/middleware/rate-limit.ts. Which brief or initiative should this work belong to?
```

Follow-up questions continue the same Hamster conversation when they depend on the previous response.

#### `/hamster:ship`

The main orchestrator. Ship, plan-hamster, and resume-hamster share brief selection: a slug, UUID, or Hamster Studio URL takes precedence, followed by an exact title or short title (the part before a subtitle separator). Names ignore case, a leading “the”, a trailing “brief”, and trailing punctuation. A unique match proceeds without a selection question; ambiguous or partial-only names require clarification.

```
/hamster:ship user-authentication
/hamster:ship the Checkout reliability brief.
/hamster:ship https://tryhamster.com/home/hamster/briefs/2de8d546-50ab-4dbd-a678-579ec8119f60
```

If no argument is given, presents an interactive picker of actionable briefs.

**Flow**: Readiness (setup/ensure-ready) → Setup (prereqs + live sync) → Brief selection → Inline wave scheduling (one confirmation) → Branch + merge base → Parallel wave execution (implement → validate + test → wave review → bisectable commits) → Final validation → Ask about PR creation

No plan generation or task elaboration occurs at any step — scheduling only organizes the pre-generated tasks into parallel waves.

#### `/hamster:plan-hamster`

Read-only analysis with optional deep review. Produces the execution plan without making changes.

```
/hamster:plan-hamster api-rate-limiting
```

After analysis, choose a review mode:
- **CEO Review (Founder Mode)** — 10-section deep dive from first principles
- **Eng Review (Architecture Mode)** — 4-section technical review with ASCII diagrams and test plan
- **Quick Analysis** — Just the plan

#### `/hamster:resume-hamster`

Resumes an interrupted execution. Auto-detects the brief from the git branch name (`feature/{key}-{id}-{slug}`), in-progress tasks, or a provided argument.

```
/hamster:resume-hamster
/hamster:resume-hamster user-authentication
```

#### `/hamster:review-hamster`

Paranoid two-pass code review for the current feature branch:
- **Pass 1 (CRITICAL)**: SQL safety, race conditions, auth boundaries, enum completeness, secrets
- **Pass 2 (INFORMATIONAL)**: Side effects, magic numbers, dead code, test gaps, type coercion, time safety
- Interactive resolution for critical findings with fix/acknowledge/false-positive options

```
/hamster:review-hamster
```

#### `/hamster:qa`

Systematic testing with 4 modes:

```
/hamster:qa diff        # Test only what changed (default on feature branches)
/hamster:qa full        # Full test suite with coverage
/hamster:qa quick       # 30-second lint + typecheck + smoke tests
/hamster:qa regression  # Changed files + dependents, flag new failures
```

Includes issue taxonomy (functional/type-safety/integration/performance/coverage-gap) and optional fix loop.

#### `/hamster:retro`

Engineering retrospective from git history:

```
/hamster:retro          # Last 7 days (default)
/hamster:retro 14       # Last 14 days
/hamster:retro 30       # Last 30 days
/hamster:retro 24h      # Last 24 hours
```

Produces: metrics table, hourly distribution, session analysis, hotspots, PR sizes, per-contributor deep dive with praise and growth suggestions, trends vs last retro, and a narrative summary.

### Execution workers

| Worker | Persona | Purpose |
|--------|---------|---------|
| **task-executor** | Senior Engineer | Implements one parent task + subtasks; loads project skills, blueprints, and methods |
| **wave-reviewer** | Staff Engineer | Reviews a whole wave's diff (per-parent verdicts + cross-parent integration checks), then simplifies |

Canonical worker protocols live in `skills/ship/references/agents/`. `agents/task-executor.md` and `agents/wave-reviewer.md` are generated native adapters (registration + model metadata) over those bodies, and every client with native agents registers them from that one folder — run `node scripts/sync-adapters.mjs` after editing the canonical files; CI checks drift. Ship prefers the registered native agent when the client exposes it (Claude Code, Copilot CLI, and Grok Build do), otherwise launches a generic subagent and injects the matching canonical body, otherwise runs the same protocol inline. On the generic path, prefer the strongest available coding model for task-executor and a mid-tier model for wave-reviewer when the client can pin one; otherwise inherit. Wave scheduling, branch creation, commits, and PR creation stay inline.

Executors implement unambiguous brief/spec authority over contradictory tasks and record resolved plan issues; only unresolved or unbuilt work blocks completion, and resumed PR updates retain earlier task and plan-feedback resolutions.

Every skill directory is self-contained: no SKILL.md reads a sibling skill's files, because clients are free to install or load one skill on its own. Each skill is `SKILL.md` plus optional `scripts/` and `references/`; longer procedures live in `references/` so the skill body stays within client size limits (Codex reads the first 8,000 bytes). Shared material — readiness scripts under each skill's `scripts/`, and protocols under `references/` that plan-hamster and resume-hamster re-enter — is duplicated into every skill that needs it, and `scripts/validate-plugin.mjs` hashes every copy and fails the build if they drift apart. Root `scripts/` is maintainer tooling (`sync-adapters.mjs`, `validate-plugin.mjs`, `build-codex-bundle.mjs`); no client loads it.

The repository root is the plugin. Every client installs it, Grok Build included, and it is the folder submitted to the Claude plugin directory, so this README lists what the plugin runs, sends, and fetches; update it when that changes. Beside `skills/` and `agents/` sit each client's manifest (`.claude-plugin/`, `.codex-plugin/`, `.cursor-plugin/`, `gemini-extension.json`, and the `plugin.json` Antigravity needs to register the MCP server, which must not declare the Agent Plugins `$schema` or Copilot CLI registers neither worker), the marketplace catalogs that point at `./`, `.mcp.json` and Antigravity's `mcp_config.json`, and `package.json`, whose `pi.skills` points Pi at `./skills`. `validate-plugin.mjs` fails on any symbolic link or image in `skills/`, `agents/`, or the client manifest folders except `.claude-plugin/icon.svg`, which must stay a self-contained SVG; the listing images live in `assets/`, which the Codex manifest references, the Cursor logo links by URL, and `build-codex-bundle.mjs` packs into the OpenAI Plugins Directory zip.

**Editing shared material is a multi-file edit.** The first path in each group below is the source of truth; the rest are copies that must stay byte-identical. Change the source, copy it over the others, then run the validator — it names the exact `cp` commands when a group has drifted.

| Source of truth | Copies |
|---|---|
| `skills/setup/scripts/ensure-ready.sh` | `ship`, `plan-hamster`, `resume-hamster` |
| `skills/setup/scripts/ensure-ready.ps1` | `ship`, `plan-hamster`, `resume-hamster` |
| `skills/ship/references/brief-selection.md` | `plan-hamster`, `resume-hamster` |
| `skills/ship/references/execution-loop.md` | `resume-hamster` |
| `skills/ship/references/agents/task-executor.md` | `resume-hamster` |
| `skills/ship/references/agents/wave-reviewer.md` | `resume-hamster` |

### Execution loop

For each wave of independent parent tasks (executed in parallel):

```
Wave N (parallel):
  [task-executor A] || [task-executor B] || [task-executor C]

Post-wave (orchestrator):
  Validation + test gate (one pass, stop on test failure)
  [wave-reviewer] — one worker for the whole wave
    (small low-risk waves: orchestrator reviews inline, no worker)
  Bisectable commits per parent (direct bash)
```

### Git conventions

- **Branch**: `feature/{key}-{lowest-id}-{brief-slug}`, where `{key}` is the task display ID's key, lowercased (`HAM-42` → `feature/ham-42-…`, `ACME-7` → `feature/acme-7-…`)
- **Parent task commits**: `feat({key}-123): concise description` (split by concern for bisectability)
- **Simplification commits**: `refactor({key}-123): simplify description`
- **Review fix commits**: `fix({key}-123): address review findings`
- **QA fix commits**: `fix(qa): test-file — description`
- **PR**: Created on request (not auto-created), targets detected default branch

---

## Advanced: CLI binary

Use this when you want the `hamster` binary without a plugin client. If setup from the Plugins Directory sent you here, run only the install line (or download a binary below and put it on your PATH), then go back to setup; it signs you in and syncs.

```bash
curl -fsSL https://tryhamster.com/cli/install | bash
hamster auth login
hamster init
hamster sync
```

Or download a binary from the [latest release](https://github.com/gethamster/plugin/releases/latest).

Supported platforms: macOS (`amd64`, `arm64`), Linux (`amd64`, `arm64`), Windows (`amd64`).

The plugin package and source files in this repository are licensed under MIT. Prebuilt `hamster` binaries distributed through GitHub Releases are provided under Hamster's [Commercial Terms](https://tryhamster.com/terms-of-service).

### CLI commands

| Command | Description |
|---------|-------------|
| `hamster auth login` | Authenticate via browser (OAuth 2.1 + PKCE) |
| `hamster auth logout` | Log out and clear stored credentials |
| `hamster init` | Initialize Hamster data and run first sync |
| `hamster sync` | One-time sync from Hamster Studio |
| `hamster sync --watch` | Continuous real-time sync via WebSocket |
| `hamster chat "<request>"` | Ask Hamster from the terminal (`--continue` for follow-ups); same ask path as hosted MCP when plugin tools are unavailable |
| `hamster status` | Show sync status and statistics (`hamster --no-tui status` for plain output, which is what the skills' readiness gate runs) |
| `hamster task status <id> <status>` | Update task status (`todo`, `in_progress`, `done`) |
| `hamster brief status <slug> <status>` | Update brief status |

### What gets synced

Skills read `.hamster/` in the current repo:

```
.hamster/
  .state.json      # Sync metadata (don't edit)
  {account}/
    briefs/
      {brief-slug}/
        brief.md     # The brief itself
        tasks/       # Parent tasks and subtasks
    blueprints/      # Architecture documents
    methods/         # Team conventions
```

Skills take the account directory name from `account_slug` in `.state.json`. `HAMSTER_ACCOUNT_ID` holds an account UUID, so when it is set the skills check it against `account_id` and stop rather than guess.

The hosted MCP tools work on one active team per user, which isn't tied to any repo. So before its first Hamster MCP call, and before each ask or change, `ask-hamster` calls `switch_account` with this repo's `account_slug` (your CLI team as of the last `hamster sync` here) and checks that the team it lands on has the same `account_id`. Otherwise a user in more than one team can get "not found" for tasks that exist. The server stores that choice per user, so switching also changes the team your other Hamster MCP clients use until they switch again. If the switch fails or lands on a different team, the skill stops and points you at `hamster init --force` or the right MCP sign-in. The other skills use the CLI, not Hamster MCP, so they don't switch.

## Advanced: hosted MCP without the plugin

Use this only when you want the hosted MCP tools in a client without installing the plugin. Add `https://tryhamster.com/mcp` as a remote MCP connector and sign in through OAuth; see the [MCP server docs](https://tryhamster.com/docs/hamster-studio/mcp) for setup, the tool list, and client registration. Skills, slash commands, the CLI, and `/ship` come with the plugin.

## Troubleshooting

- **A skill prints `SETUP_NEEDED`.** Run `/hamster:setup`. It installs the CLI if it is missing, signs you in, and syncs. If it still prints `SETUP_NEEDED`, it shows the error from `hamster status` or `hamster sync`.
- **`hamster: command not found` after setup.** The installer puts the CLI in `~/.hamster/bin` and adds that folder to PATH in your shell profile. Open a new terminal, or run `export PATH="$HOME/.hamster/bin:$PATH"`.
- **Hamster tools are missing or ask you to sign in.** Sign in to the hosted MCP server as your client's install section above describes (in Claude Code, open `/mcp`, select `plugin:hamster:hamster`, and authenticate). Until you do, `/hamster:ask-hamster` uses `hamster chat` when the CLI is signed in.
- **"This repository's Hamster team isn't available to this MCP sign-in."** Your MCP sign-in and this repository's `.hamster/` belong to different teams. Run `hamster init --force` in the repository to pick the team again, or sign in to the Hamster MCP server as the user who belongs to this repository's team.
- **A skill prints `ACCOUNT_UNRESOLVED`.** Run `hamster sync` in the repository. If the message says the team doesn't match, switch with `hamster team switch --account-id <team UUID>`, then run `hamster sync` again.
- **`ship` stops on a merge conflict.** It never resolves conflicts itself. Resolve them, commit, and run `/hamster:resume-hamster` to continue from the wave where it stopped.

## Support

- **Help and bug reports:** email [support@tryhamster.com](mailto:support@tryhamster.com), read the [docs](https://tryhamster.com/docs), or open an issue at [github.com/gethamster/plugin/issues](https://github.com/gethamster/plugin/issues).
- **Security concerns:** email [support@tryhamster.com](mailto:support@tryhamster.com) instead of opening a public issue.
- **Privacy questions:** email [privacy@tryhamster.com](mailto:privacy@tryhamster.com). The [Privacy Policy](https://tryhamster.com/privacy-policy) explains what Hamster collects, how it uses the data, and how long it keeps it.

---

## License

MIT. Copyright Wheel Go Fast, Inc. See Hamster's [Privacy Policy](https://tryhamster.com/privacy-policy) for how Hamster handles your data. The MIT grant covers the plugin package and source files in this repository; prebuilt `hamster` binaries distributed through GitHub Releases are provided under Hamster's [Commercial Terms](https://tryhamster.com/terms-of-service).
