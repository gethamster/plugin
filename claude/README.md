# Hamster for Claude Code

Hamster is an AI-native product planning workspace. This plugin connects Claude Code to Hamster's hosted MCP server and adds eight skills for turning Hamster Studio briefs into shipped code: `setup`, `ask-hamster`, `ship`, `plan-hamster`, `resume-hamster`, `review-hamster`, `qa`, and `retro`, plus two execution workers, `task-executor` and `wave-reviewer`, that `ship` runs in parallel waves.

[Privacy Policy](https://tryhamster.com/privacy-policy) · [Terms of Service](https://tryhamster.com/terms-of-service) · [Docs](https://tryhamster.com/docs) · [Source](https://github.com/gethamster/plugin)

## Install

```text
/plugin marketplace add gethamster/plugin
/plugin install hamster@hamster-plugins
```

Then run `/hamster:setup`, and sign in to the MCP server from `/mcp` by selecting `plugin:hamster:hamster`.

## Skills

| Skill | What it does |
|-------|--------------|
| `/hamster:setup` | Installs the Hamster CLI if it is missing, signs you in, and syncs the plan into this repository's `.hamster/` folder |
| `/hamster:ask-hamster` | Answers questions about your workspace's briefs, tasks, plans, and decisions, and performs workspace actions you ask for |
| `/hamster:ship` | Executes a brief: branches, implements its tasks in parallel waves, validates, reviews, and commits. Opens a pull request only when you ask |
| `/hamster:plan-hamster` | Read-only analysis of a brief, with optional founder or architecture review |
| `/hamster:resume-hamster` | Resumes an interrupted `ship` run |
| `/hamster:review-hamster` | Two-pass code review of the current branch |
| `/hamster:qa` | Runs the project's tests and checks in diff, full, quick, or regression mode |
| `/hamster:retro` | Engineering retrospective from git history |

## What the plugin runs, sends, and fetches

- **Hosted MCP server.** The plugin registers `https://tryhamster.com/mcp` as a remote HTTP MCP server. You sign in through Claude Code's own OAuth flow; the plugin does not read or pass any token, key, or environment variable. Requests you make through the Hamster tools, and the workspace data they return, travel between Claude Code and Hamster.
- **Hamster CLI.** The `setup` skill runs the bundled `skills/setup/scripts/install-hamster-cli.sh` only when the `hamster` command is missing. The script downloads the latest `hamster` release archive for your OS and architecture from GitHub Releases for gethamster/plugin, refuses to install unless it matches the SHA256 published beside it, and installs the binary to `~/.hamster/bin`. It then adds that directory to PATH and a `ham` alias in `~/.zshrc` and `~/.bashrc`, comments out stale task-master aliases there, removes an old `/usr/local/bin/hamster` if it can, and records `api_url: "https://tryhamster.com"` in `~/.hamster/config.yaml`.
- **CLI commands.** Skills run `hamster auth login` (opens your browser to sign in), `hamster init` and `hamster sync` (write the plan to `.hamster/` in your repository), `hamster status`, `hamster chat` (sends your question to Hamster when MCP tools are unavailable), and `hamster task status` or `hamster brief status` (update status in Hamster Studio while `ship` runs). The bundled `ensure-ready` scripts only check that the CLI is installed and signed in, then run `hamster sync`.
- **Git and GitHub.** `ship` creates a branch and commits in your repository. It pushes and opens a pull request with `gh` only when you ask it to. `qa` may read the branch's recent CI results with `gh run list`.

Nothing runs automatically when a session starts: the plugin has no hooks.

## License

MIT for the plugin files. Prebuilt `hamster` binaries are provided under Hamster's [Commercial Terms](https://tryhamster.com/terms-of-service).
