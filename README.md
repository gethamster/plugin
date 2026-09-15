# Hamster

**Install Hamster.** One plugin. Talk through hosted MCP or the CLI. Keep the plan on disk, then ship from it.

This is the Hamster product: Agent Plugins skills on every supported client, hosted MCP on every client that installs from GitHub or a marketplace, plus generated native execution workers on Claude Code where that client registers them. The CLI is how the plan stays in this repo. It is not a second install.

## Install

Installation differs by client. If you use more than one, install Hamster separately for each one.

### Cursor

1. Customize → Add Marketplace → Import from GitHub.
2. Paste `https://github.com/gethamster/plugin` and select Import.
3. Open the Hamster marketplace tab and select Add.

On Enterprise, an admin must allow marketplace imports. Once Hamster is on the Cursor marketplace, `/add-plugin hamster` works too:

```text
/add-plugin hamster
```

Grok Bot is not a separate Hamster package. It uses the same Cursor account and plugin library, so the Cursor install above is the Grok Bot install. Do not run `/add-plugin` in the Grok Bot chat.

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

The Hamster listing in Codex's Plugins Directory is a skills-only build of this same skills tree, produced by `node scripts/build-codex-skills-bundle.mjs`. A directory install carries the skills and nothing else, so it does not register the hosted MCP connector: Ask Hamster answers through `hamster chat` there unless you add the connector yourself, as described in [Advanced: hosted MCP without the plugin](#advanced-hosted-mcp-without-the-plugin). The GitHub and marketplace installs above are unaffected and keep the connector.

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

## After install

1. **Talk** — hosted MCP at `https://tryhamster.com/mcp`, or `hamster chat` when MCP tools are unavailable and the CLI is signed in. Your client owns the Hamster sign-in.
2. **Plan on disk** — say Install Hamster, or run ship. The setup skill installs the CLI if needed, runs `hamster auth login`, and syncs the plan.
3. **Ship** — execute the brief already on disk. Nothing runs automatically on session start.

## Skills

Claude Code lists these as `/hamster:<skill>`. Cursor lists them as `/<skill>`. The table uses the Claude form.

| Skill | Persona | Description |
|-------|---------|-------------|
| `/hamster:setup` | — | Install the CLI, sign in, and sync the plan into this repo |
| `/hamster:ask-hamster [request]` | Workspace Copilot | Connect current code with workspace priorities, blockers, blueprints, or related work (hosted MCP when the client has it; `hamster chat` otherwise) |
| `/hamster:ship [slug-or-url]` | Release Engineer | Ship a brief: merge base, implement in parallel, test, review, bisectable commits, PR |
| `/hamster:plan-hamster [slug-or-url]` | Tech Lead + CEO/Eng modes | Analyze brief with optional founder or architecture review |
| `/hamster:resume-hamster [slug]` | — | Resume interrupted execution from where you left off |
| `/hamster:review-hamster` | Staff Engineer | Paranoid two-pass code review (CRITICAL then INFORMATIONAL) |
| `/hamster:qa [mode]` | QA Lead | Systematic testing: diff-aware, full, quick, regression |
| `/hamster:retro [days]` | Eng Manager | Engineering retrospective with metrics, trends, team analysis |

Four skills carry a `-hamster` suffix because Cursor invokes plugin skills as a bare `/skill-name`, and `ask`, `plan`, and `resume` are Cursor's own concepts — `cursor-agent --mode` takes `plan` and `ask`, `--resume` selects a session — so short names compete with them there. `review` is renamed with that family so Cursor's command list stays one convention. Claude Code namespaces plugin skills as `/<plugin>:<skill>` and they cannot conflict, so on Claude the suffix is redundant and you type `/hamster:ask-hamster`. One skills tree serves every client, so that is the cost of being unambiguous on Cursor. `ship`, `qa`, `retro`, and `setup` shadow nothing and stay short.

#### `/hamster:setup`

The readiness path. Noninteractive check first (`ensure-ready`). If the CLI is installed and you are signed in, it runs `hamster sync` to refresh the plan. Otherwise it installs the CLI, opens login, and inits/syncs — only when you asked.

#### `/hamster:ask-hamster`

The direct gateway to Hamster's connected workspace context. Uses the Hamster MCP tools when the client has them; otherwise `hamster chat` is the same ask path over the CLI. Explicit requests can also perform supported workspace actions:

```
/hamster:ask-hamster I'm modifying auth middleware in apps/web/app/api/. What does our blueprint say about third-party integrations?
/hamster:ask-hamster I prototyped rate limiting in apps/api/middleware/rate-limit.ts. Create a brief for this work.
```

Follow-up questions continue the same Hamster conversation when they depend on the previous response.

#### `/hamster:ship`

The main orchestrator. Accepts a brief slug, UUID, or Hamster Studio URL:

```
/hamster:ship user-authentication
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

Resumes an interrupted execution. Auto-detects the brief from the git branch name (`feature/ham-{id}-{slug}`), in-progress tasks, or a provided argument.

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

Canonical worker protocols live in `skills/ship/references/agents/`. Root `agents/task-executor.md` and `agents/wave-reviewer.md` are generated Claude Code native adapters (registration + model metadata) over those bodies — run `node scripts/sync-adapters.mjs` after editing the canonical files; CI checks drift. Ship prefers the registered native agent when the client exposes it (Claude Code does), otherwise launches a generic subagent and injects the matching canonical body, otherwise runs the same protocol inline. On the generic path, prefer the strongest available coding model for task-executor and a mid-tier model for wave-reviewer when the client can pin one; otherwise inherit. Wave scheduling, branch creation, commits, and PR creation stay inline.

Every skill directory is self-contained: no SKILL.md reads a sibling skill's files, because clients are free to install or load one skill on its own. Each skill is `SKILL.md` plus optional `scripts/` and `references/`; longer procedures live in `references/` so the skill body stays within client size limits (Codex reads the first 8,000 bytes). Shared material — readiness scripts under each skill's `scripts/`, and protocols under `references/` that plan-hamster and resume-hamster re-enter — is duplicated into every skill that needs it, and `scripts/validate-plugin.mjs` hashes every copy and fails the build if they drift apart. Root `scripts/` is maintainer tooling (`sync-adapters.mjs`, `validate-plugin.mjs`); it is not part of the installed skill surface.

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

- **Branch**: `feature/ham-{lowest-id}-{brief-slug}`
- **Parent task commits**: `feat(ham-123): concise description` (split by concern for bisectability)
- **Simplification commits**: `refactor(ham-123): simplify description`
- **Review fix commits**: `fix(ham-123): address review findings`
- **QA fix commits**: `fix(qa): test-file — description`
- **PR**: Created on request (not auto-created), targets detected default branch

---

## Advanced: CLI binary

Use this only when you want the `hamster` binary without a plugin client.

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

## Advanced: hosted MCP without the plugin

Use this only when you want the hosted MCP tools in a client without installing the plugin. Add `https://tryhamster.com/mcp` as a remote MCP connector and sign in through OAuth; see the [MCP server docs](https://tryhamster.com/docs/hamster-studio/mcp) for setup, the tool list, and client registration. Skills, slash commands, the CLI, and `/ship` come with the plugin.

---

## License

MIT. Copyright Hamster Studio. The MIT grant covers the plugin package and source files in this repository; prebuilt `hamster` binaries distributed through GitHub Releases are provided under Hamster's [Commercial Terms](https://tryhamster.com/terms-of-service).
