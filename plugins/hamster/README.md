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

## Example prompts

Run `/hamster:setup` first. These prompts work against any Hamster workspace that has at least one brief with tasks.

1. **Set up the repository.** `/hamster:setup` offers to install the Hamster CLI if it is missing and installs it after you confirm, opens your browser to sign in, and syncs your workspace's briefs and tasks into `.hamster/`. It finishes when the readiness check prints `READY`.
2. **Ask about your workspace.** `/hamster:ask-hamster Which briefs are in progress in this workspace, and what is blocking them?` Hamster answers from your workspace's briefs, tasks, and initiatives, with links back to Hamster Studio.
3. **Plan a brief before building it.** `/hamster:plan-hamster` lists the briefs synced into `.hamster/`. Pick one, and it shows the brief's tasks as a dependency graph grouped into parallel waves. It changes no code and no task status.
4. **Ship a brief.** `/hamster:ship <brief URL or slug>` shows the same wave plan and waits for you to confirm. It then creates a branch, implements each wave, runs your project's checks, reviews the changes, and commits. It pushes or opens a pull request only if you ask.
5. **Review your branch.** `/hamster:review-hamster` reviews the current branch against the default branch. It reports issues that block shipping first, then advisory findings.

## What the plugin runs, sends, and fetches

- **Hosted MCP server.** The plugin registers `https://tryhamster.com/mcp` as a remote HTTP MCP server. You sign in through Claude Code's own OAuth flow; the plugin never reads or passes an MCP token or key. Requests you make through the Hamster tools, and the workspace data they return, travel between Claude Code and Hamster.
- **Hamster CLI.** When the `hamster` command is missing, the `setup` skill asks, then downloads and runs the Hamster CLI installer from https://tryhamster.com/cli/install.
- **CLI commands.** Skills run `hamster auth login` (opens your browser to sign in), `hamster init` and `hamster sync` (write the plan to `.hamster/` in your repository), `hamster status`, `hamster chat` (sends your question to Hamster when MCP tools are unavailable), and `hamster task status` or `hamster brief status` (update status in Hamster Studio while `ship` runs). The bundled `ensure-ready` scripts only check that the CLI is installed and signed in, then run `hamster sync`. `hamster sync` also writes `.claude/skills/hamster-project-context/SKILL.md`, a guide to the synced files that the CLI fills in from a built-in template with your team name, the last sync time, and file counts.
- **Background sync.** `ship` and `resume-hamster` keep the plan current during a run with `hamster sync --watch` in the background. They reuse a watcher already running for this repository, found with `pgrep` and `lsof`, and stop only a watcher they started.
- **Team check.** `ship`, `plan-hamster`, and `resume-hamster` read `HAMSTER_ACCOUNT_ID`, if it is set, and compare it with the account in `.hamster/.state.json` on your machine; it is not sent anywhere. If the team doesn't match, they ask which team you mean and then run `hamster team switch --account-id <id>`, which clears the previous team's synced plan and syncs the new one.
- **Git and GitHub.** `ship` and `resume-hamster` create a branch and commit in your repository. They push and open a pull request with `gh` only when you ask. `retro` reads merged pull requests with `gh pr list`, `qa` reads the branch's recent CI results with `gh run list`, and `qa`, `review-hamster`, and `ship` read the default branch with `gh repo view`.

Nothing runs automatically when a session starts: the plugin has no hooks.

## Troubleshooting

- **A skill prints `SETUP_NEEDED`.** Run `/hamster:setup`. It offers to install the CLI if it is missing, signs you in, and syncs. If it still prints `SETUP_NEEDED`, it shows the error from `hamster status` or `hamster sync`.
- **`hamster: command not found` after setup.** The installer puts the CLI in `~/.hamster/bin` and adds that folder to PATH in your shell profile. Open a new terminal, or run `export PATH="$HOME/.hamster/bin:$PATH"`.
- **Hamster tools are missing or ask you to sign in.** Open `/mcp`, select `plugin:hamster:hamster`, and authenticate. Until you do, `/hamster:ask-hamster` uses `hamster chat` when the CLI is signed in.
- **"This repository's Hamster team isn't available to this MCP sign-in."** Your MCP sign-in and this repository's `.hamster/` belong to different teams. Run `hamster init --force` in the repository to pick the team again, or sign in to the Hamster MCP server as the user who belongs to this repository's team.
- **A skill prints `ACCOUNT_UNRESOLVED`.** Run `hamster sync` in the repository. If the message says the team doesn't match, switch with `hamster team switch --account-id <team UUID>`, then run `hamster sync` again.
- **`ship` stops on a merge conflict.** It never resolves conflicts itself. Resolve them, commit, and run `/hamster:resume-hamster` to continue from the wave where it stopped.

## Support

- **Help and bug reports:** email [support@tryhamster.com](mailto:support@tryhamster.com), read the [docs](https://tryhamster.com/docs), or open an issue at [github.com/gethamster/plugin/issues](https://github.com/gethamster/plugin/issues).
- **Security concerns:** email [support@tryhamster.com](mailto:support@tryhamster.com) instead of opening a public issue.
- **Privacy questions:** email [privacy@tryhamster.com](mailto:privacy@tryhamster.com). The [Privacy Policy](https://tryhamster.com/privacy-policy) explains what Hamster collects, how it uses the data, and how long it keeps it.

## License

MIT for the plugin files. Prebuilt `hamster` binaries are provided under Hamster's [Commercial Terms](https://tryhamster.com/terms-of-service).
