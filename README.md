# Supabuild

**Connect your agent to Supabuild.** One plugin: ask the Discovery agent, read your team's knowledge, and follow delivery threads over remote MCP.

Supabuild is a team workspace where agents turn conversation into delivered software. A Discovery agent works in the team's persistent workspace: it researches, drafts and proposes team knowledge, and starts delivery threads. Team knowledge is the team's decisions, scopes, methods and goals, each marked accepted, proposed or historical; only a person accepts a proposal, in the web app. Each delivery thread runs coding agents in an isolated sandbox against a connected project and carries the work from clarified requirements to committed changes, validation, a preview, and a verified deployment.

This plugin registers Supabuild's remote MCP server (Streamable HTTP) and adds a sign-in skill. You sign in with OAuth in your client; the plugin never handles tokens, and each connection is scoped to one project you choose.

## Install

Installation differs by client. If you use more than one, install the plugin separately for each one.

### Cursor

1. Customize → Add Marketplace → Import from GitHub.
2. Paste `https://github.com/gethamster/plugin` at User scope and select Import.
3. Open the Personal tab and select Add next to Supabuild.

On Enterprise, an admin must allow marketplace imports. Once the plugin is on the Cursor marketplace, `/add-plugin hamster` works too:

```text
/add-plugin hamster
```

Grok Bot is not a separate package. It uses the same Cursor account and plugin library, so the Cursor install above is the Grok Bot install. Do not run `/add-plugin` in the Grok Bot chat. If Grok Bot shows "Complete GitHub auth to sync installed plugins", complete GitHub auth when Grok Bot asks.

To sign in to the MCP server, follow Cursor's sign-in prompt for the `hamster` server.

### Claude Code

```text
/plugin marketplace add gethamster/plugin
/plugin install hamster@hamster-plugins
```

To sign in to the MCP server, open `/mcp`, select `plugin:hamster:hamster`, and authenticate.

### Codex CLI

```text
codex plugin marketplace add gethamster/plugin
codex plugin add hamster@hamster-plugins
```

You can also launch `codex`, run `/plugins`, and install `hamster@hamster-plugins`.

To sign in to the MCP server, run `codex mcp login hamster`.

### Codex Plugins Directory

The listing in OpenAI's Plugins Directory, used by Codex and ChatGPT, is a zip of this same plugin produced by `node scripts/build-codex-bundle.mjs`: the Codex manifest, the remote MCP connector in `.mcp.json`, the skills, and the listing images. CI builds it on every push and uploads it as a workflow artifact, and the artifact download is the zip to upload to the directory.

### Antigravity

From a clone of this repository:

```text
agy plugin install ./plugins/hamster
```

Or from GitHub:

```text
agy plugin install https://github.com/gethamster/plugin/plugins/hamster
```

Both install `plugins/hamster`, the folder every other client installs. The bare repository URL also works; agy then imports the root as a Gemini CLI extension, and running the command above replaces that install in place.

In the Antigravity app (2.15 or newer), authenticate `hamster_hamster` under Settings → Customizations → Installed MCP Servers. In the CLI, open `/mcp`, select `hamster_hamster`, then Authenticate. The plugin registers that server itself, so a manual `hamster` entry in `mcp_config.json` would add a second copy of every tool.

Using GitHub Copilot CLI, Gemini CLI, Grok Build, OpenCode, or Pi? See [More install options](#more-install-options).

## More install options

### GitHub Copilot CLI

```text
copilot plugin marketplace add gethamster/plugin
copilot plugin install hamster@hamster-plugins
```

To sign in to the MCP server, run `/mcp auth hamster`.

### Gemini CLI

```text
gemini extensions install https://github.com/gethamster/plugin
```

To sign in to the MCP server, run `/mcp auth hamster`.

### Grok Build

```text
grok plugin install gethamster/plugin --trust
```

To sign in to the MCP server, open `/mcps`, select hamster, and press `i`.

### OpenCode

OpenCode takes the skills and the MCP server in two steps. Run these in your project folder:

```text
npx skills add gethamster/plugin --agent opencode
opencode mcp add hamster --url https://supabuild.invalid/mcp
```

Add `--global` to `npx skills add` to install into `~/.agents/skills/` instead of the current project (`opencode mcp add --url` needs OpenCode 1.17.0 or later).

To sign in to the MCP server, run `opencode mcp auth hamster`.

### Pi

```text
pi install npm:@tryhamster/pi
```

To track the repository instead of npm releases, run `pi install git:github.com/gethamster/plugin`.

The Pi package installs the skills only. To connect the MCP server, add it and sign in:

```text
pi mcp add hamster --url https://supabuild.invalid/mcp
pi mcp login hamster
```

## Signing in

- **OAuth in your client.** Each client above runs the sign-in itself: the browser opens Supabuild's sign-in page, you choose the project, and the client stores the token. The plugin never reads or passes it.
- **One project per connection.** A connection reaches only the project you chose when signing in. To work in another project, clear the sign-in for the `hamster` server in your client and sign in again.
- **No refresh tokens.** When the token expires, calls fail with an authorization error. Sign in again with the same step for your client.

The `sign-in` skill walks through the same steps for whichever client you're in.

## Skills

Claude Code and Copilot CLI list these as `/hamster:<skill>`. Cursor and Grok Build list them as `/<skill>`, and Pi as `/skill:<skill>`. In OpenCode, ask for one by name, or in OpenCode 2 mention it as `@sign-in`. The table uses the Claude form.

| Skill | Description |
|-------|-------------|
| `/hamster:sign-in` | Connect the client to the Supabuild MCP server with OAuth, scope it to one project, and sign in again when the token expires |

## Maintaining the plugin

Cursor invokes plugin skills as a bare `/skill-name`, and `ask`, `plan`, and `resume` are Cursor's own concepts (`cursor-agent --mode` takes `plan` and `ask`, `--resume` selects a session), so skill names avoid those bare words. Claude Code namespaces plugin skills as `/<plugin>:<skill>`, so they can't conflict there. One skills tree serves every client.

Every skill directory is self-contained: no SKILL.md reads a sibling skill's files, because clients are free to install or load one skill on its own. Each skill is `SKILL.md` plus optional `scripts/` and `references/`; longer procedures live in `references/` so the skill body stays within client size limits (Codex reads the first 8,000 bytes). Shared material is duplicated into every skill that needs it, and `scripts/validate-plugin.mjs` hashes every copy and fails the build if they drift apart. Root `scripts/` is maintainer tooling (`sync-adapters.mjs`, `validate-plugin.mjs`, `build-codex-bundle.mjs`); it is not part of the installed plugin.

`plugins/hamster/` is the plugin: every client installs this one folder, except Gemini CLI, which installs the generated copy at the root described below. It is the folder submitted to the Claude plugin directory, which scans only the folder it is given. It holds each client's manifest (`.claude-plugin/`, `.codex-plugin/`, `.cursor-plugin/`, and the `plugin.json` Antigravity reads), `.mcp.json` and the `mcp_config.json` Antigravity reads, `skills/`, and its own `README.md`, which lists what the plugin runs, sends, and fetches, so update it when that changes. The repository root keeps the marketplace catalogs that point at `./plugins/hamster` (`.claude-plugin/`, which Copilot CLI also reads, `.cursor-plugin/`, and `.agents/plugins/`), the root `package.json` whose `pi.skills` points Pi at the same skills, the generated Gemini extension, and maintainer tooling, CI, and listing images. `validate-plugin.mjs` fails if any other plugin manifest or MCP config appears at the root, because Antigravity installs the root when given the bare repository URL and would pick it up, and it fails on any symbolic link or image inside `plugins/hamster/` except `.claude-plugin/icon.svg`, the Claude plugin directory's listing icon, which must stay a self-contained SVG with no raster, script, or external reference, and the three Codex listing PNGs in `assets/`, which must match the root `assets/` copies byte for byte. `build-codex-bundle.mjs` packs the root `assets/` into the OpenAI Plugins Directory zip. The Cursor logo is a URL to the root `assets/logo.svg`. That `plugin.json` must not declare the Agent Plugins `$schema`: with it, Copilot CLI reads agents only from `com.github.copilot/agents/`.

Besides the generated `gemini-extension.json`, the one plugin manifest at the root is `.grok-plugin/plugin.json`. Grok Build's `plugin install <repo>` reads a manifest at the repository root and doesn't follow a marketplace catalog, so this file points its `skills` and `mcpServers` into `plugins/hamster/`. It keeps `grok plugin install gethamster/plugin --trust` working and lets existing Grok installs update onto this layout. `sync-adapters.mjs` writes its name, version, and description from `plugins/hamster/plugin.json`, and `validate-plugin.mjs` checks that each path resolves and that no other `<client>-plugin/plugin.json` appears at the root. Antigravity and Pi don't read `.grok-plugin/`, and the Claude plugin directory scans only `plugins/hamster/`.

**Don't edit the root `skills/` or `gemini-extension.json`.** They are the Gemini CLI extension, and `sync-adapters.mjs` generates them from `plugins/hamster/`: `skills/` is an exact copy, and `gemini-extension.json` takes its name, version, and description from `plugins/hamster/plugin.json` and the MCP URL from `plugins/hamster/.mcp.json`. The Gemini CLI extensions gallery lists repositories with that manifest at the root, and Gemini loads skills only from beside it. Given the bare repository URL, Antigravity installs the same root and gets the same skills and MCP server. Edit `plugins/hamster/`, run `node scripts/sync-adapters.mjs`, and commit both; `--check` and the validator fail when the root copies drift.

The root `package.json` is the Pi package. Pi installs a git repository from its root, so its `pi.skills` points Pi into `plugins/hamster/skills`, and the same file is the public npm package `@tryhamster/pi`. It carries the `pi-package` keyword, which is how Pi's package catalog finds npm packages, and its `files` ships only the skills; npm adds this README, `LICENSE`, and `package.json`. `sync-adapters.mjs` writes it from `plugins/hamster/plugin.json`, so a plugin bump is a new npm version, and `validate-plugin.mjs` fails if it drifts, turns private, loses the keyword, or stops shipping the skills. To publish a release, run `npm pack --dry-run` to check the file list, then `npm publish --access public` from the repository root.

**Editing shared material is a multi-file edit.** The first path in each group below is the source of truth; the rest are copies that must stay byte-identical. Change the source, copy it over the others, then run the validator — it names the exact `cp` commands when a group has drifted.

| Source of truth | Copies |
|---|---|
| `LICENSE` | `plugins/hamster/LICENSE` |

---

## Advanced: MCP without the plugin

Use this only when you want the Supabuild tools in a client without installing the plugin. Add `https://supabuild.invalid/mcp` as a remote MCP server and sign in through your client's OAuth flow. The sign-in skill comes with the plugin.

---

## License

MIT. Copyright Wheel Go Fast, Inc. See the [Privacy Policy](https://tryhamster.com/privacy-policy) for how your data is handled.
