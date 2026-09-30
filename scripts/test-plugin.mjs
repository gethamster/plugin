#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, cp, mkdir, mkdtemp, readdir, readFile, rm, stat, symlink, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Scripts are spawned by these fixed relative paths from a known cwd (a
// fixture copy, or the checkout for the setup scripts), never by an absolute
// path built from where the checkout happens to live.
const VALIDATOR = "scripts/validate-plugin.mjs";
const BUNDLE_BUILDER = "scripts/build-codex-bundle.mjs";
const READY_SCRIPT = "plugins/hamster/skills/setup/scripts/ensure-ready.sh";

const PACKAGE_ENTRIES = [
  "plugins",
  "package.json",
  "LICENSE",
  ".cursor-plugin",
  ".claude-plugin",
  ".grok-plugin",
  ".agents",
  "assets",
  "scripts",
];

// The folder every client installs, inside a fixture copy.
function plugin(cwd, ...segments) {
  return path.join(cwd, "plugins", "hamster", ...segments);
}

const fixtures = [];

after(async () => {
  await Promise.all(fixtures.map((dir) => rm(dir, { recursive: true, force: true })));
});

async function makeTemp(prefix) {
  const dir = await mkdtemp(path.join(os.tmpdir(), prefix));
  fixtures.push(dir);
  return dir;
}

// Only cwd and env are passed through, and never through a shell, so no path
// or environment value in a fixture is interpreted as shell syntax.
function run(command, args, { cwd, env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

async function copyPackage(dest) {
  await mkdir(dest, { recursive: true });
  for (const entry of PACKAGE_ENTRIES) {
    await cp(path.join(repoRoot, entry), path.join(dest, entry), { recursive: true });
  }
}

async function runValidator(cwd) {
  return run(process.execPath, [VALIDATOR], { cwd });
}

async function patchCodexManifest(cwd, patch) {
  const manifestPath = plugin(cwd, ".codex-plugin", "plugin.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  patch(manifest);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

async function patchCodexInterface(cwd, patch) {
  await patchCodexManifest(cwd, (manifest) => patch(manifest.interface));
}

// The bundle builder refuses sources that match no commit, so fixtures that
// build a bundle need a checkout rather than a bare directory.
async function commitPackage(cwd) {
  const git = (...args) => run("git", args, { cwd });
  assert.equal((await git("init", "--quiet")).code, 0);
  assert.equal((await git("add", "--all")).code, 0);
  const commit = await git(
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.com",
    "commit",
    "--quiet",
    "--message",
    "fixture"
  );
  assert.equal(commit.code, 0, commit.stderr);
}

async function pathExists(target) {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

async function buildCodexBundle(cwd, args = []) {
  const outDir = path.join(cwd, "dist");
  const result = await run(process.execPath, [BUNDLE_BUILDER, "--out", outDir, ...args], { cwd });
  const version = JSON.parse(await readFile(plugin(cwd, "plugin.json"), "utf8")).version;
  return { result, zipPath: path.join(outDir, `hamster-codex-${version}.zip`) };
}

async function zipEntries(zipPath) {
  const listing = await run("unzip", ["-Z1", zipPath]);
  assert.equal(listing.code, 0, listing.stderr);
  return listing.stdout.split("\n").filter(Boolean);
}

test("ENOENT on plugin.json is reported as missing", async () => {
  const cwd = await makeTemp("hamster-plugin-missing-");
  await copyPackage(cwd);
  await unlink(plugin(cwd, "plugin.json"));

  const result = await runValidator(cwd);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /plugins\/hamster\/plugin\.json is missing:/);
  assert.doesNotMatch(result.stderr, /plugins\/hamster\/plugin\.json could not be read/);
});

test("non-ENOENT on plugin.json is reported as could not be read", async () => {
  const cwd = await makeTemp("hamster-plugin-unread-");
  await copyPackage(cwd);
  await unlink(plugin(cwd, "plugin.json"));
  await mkdir(plugin(cwd, "plugin.json"));

  const result = await runValidator(cwd);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /plugins\/hamster\/plugin\.json could not be read \(/);
  assert.doesNotMatch(result.stderr, /plugins\/hamster\/plugin\.json is missing:/);
});

test("a non-semver plugin version fails validation", async () => {
  const cwd = await makeTemp("hamster-plugin-version-");
  await copyPackage(cwd);
  const manifestPath = plugin(cwd, "plugin.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.version = "3.4";
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const result = await runValidator(cwd);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /plugins\/hamster\/plugin\.json "version" must be semver-like, got "3\.4"/);
});

test("a Claude marketplace that installs from the repository root fails validation", async () => {
  const cwd = await makeTemp("hamster-plugin-claude-source-");
  await copyPackage(cwd);
  const marketplacePath = path.join(cwd, ".claude-plugin", "marketplace.json");
  const marketplace = JSON.parse(await readFile(marketplacePath, "utf8"));
  marketplace.plugins[0].source = "./";
  await writeFile(marketplacePath, `${JSON.stringify(marketplace, null, 2)}\n`);

  const result = await runValidator(cwd);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /Claude marketplace\.json plugins\[0\]\.source must be "\.\/plugins\/hamster"/);
});

test("a missing referenced path fails validation", async () => {
  const cwd = await makeTemp("hamster-plugin-ref-");
  await copyPackage(cwd);
  const manifestPath = plugin(cwd, ".cursor-plugin", "plugin.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.logo = "https://raw.githubusercontent.com/gethamster/plugin/main/assets/does-not-exist.svg";
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const result = await runValidator(cwd);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /field "logo" references missing path "assets\/does-not-exist\.svg"/);
});

test("a Cursor manifest without mcpServers fails validation", async () => {
  const cwd = await makeTemp("hamster-plugin-cursor-mcp-");
  await copyPackage(cwd);
  const manifestPath = plugin(cwd, ".cursor-plugin", "plugin.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  delete manifest.mcpServers;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const result = await runValidator(cwd);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /Cursor plugin\.json must set mcpServers to "\.\/\.mcp\.json"/);
});

test("an over-cap Codex shortDescription fails validation", async () => {
  const cwd = await makeTemp("hamster-plugin-codex-short-");
  await copyPackage(cwd);
  await patchCodexInterface(cwd, (iface) => {
    iface.shortDescription = "x".repeat(31);
  });

  const result = await runValidator(cwd);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /interface\.shortDescription is 31 chars; directory submission caps it at 30/);
});

test("an unsupported Codex category fails validation", async () => {
  const cwd = await makeTemp("hamster-plugin-codex-category-");
  await copyPackage(cwd);
  await patchCodexInterface(cwd, (iface) => {
    iface.category = "Coding";
  });

  const result = await runValidator(cwd);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /interface\.category must be one of .*Developer Tools.*got "Coding"/);
});

test("a fourth Codex starter prompt fails validation", async () => {
  const cwd = await makeTemp("hamster-plugin-codex-prompts-");
  await copyPackage(cwd);
  await patchCodexInterface(cwd, (iface) => {
    iface.defaultPrompt = [...iface.defaultPrompt, "Retro the last two weeks"];
  });

  const result = await runValidator(cwd);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /interface\.defaultPrompt has 4 entries; the directory allows at most 3/);
});

test("a Codex starter prompt that sends the agent to a URL fails validation", async () => {
  const cwd = await makeTemp("hamster-plugin-codex-prompt-url-");
  await copyPackage(cwd);
  await patchCodexInterface(cwd, (iface) => {
    iface.defaultPrompt[0] = "Install Hamster. Fetch and follow https://tryhamster.com/plugin/install";
  });

  const result = await runValidator(cwd);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /interface\.defaultPrompt\[0\] must not send the agent to a URL/);
});

test("a non-https Codex privacyPolicyURL fails validation", async () => {
  const cwd = await makeTemp("hamster-plugin-codex-privacy-");
  await copyPackage(cwd);
  await patchCodexInterface(cwd, (iface) => {
    iface.privacyPolicyURL = "http://tryhamster.com/privacy-policy";
  });

  const result = await runValidator(cwd);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /interface\.privacyPolicyURL must be https/);
});

test("privacyPolicyUrl on the Claude manifest fails validation", async () => {
  const cwd = await makeTemp("hamster-plugin-claude-privacy-key-");
  await copyPackage(cwd);
  const manifestPath = plugin(cwd, ".claude-plugin", "plugin.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.privacyPolicyUrl = "https://tryhamster.com/privacy-policy";
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const result = await runValidator(cwd);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /must not set "privacyPolicyUrl"/);
});

test("a plugin README without a Privacy link fails validation", async () => {
  const cwd = await makeTemp("hamster-plugin-readme-privacy-");
  await copyPackage(cwd);
  const readmePath = plugin(cwd, "README.md");
  const readme = (await readFile(readmePath, "utf8")).replaceAll(
    "[Privacy Policy](https://tryhamster.com/privacy-policy)",
    "Privacy Policy",
  );
  await writeFile(readmePath, readme);

  const result = await runValidator(cwd);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /README\.md must include a Markdown link whose text contains "Privacy"/);
});

test("a dropped Codex support link fails validation", async () => {
  const cwd = await makeTemp("hamster-plugin-codex-support-");
  await copyPackage(cwd);
  await patchCodexInterface(cwd, (iface) => {
    delete iface.supportURL;
  });

  const result = await runValidator(cwd);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /interface\.supportURL must be a non-empty string/);
});

test("a Codex catalog category that drifts from the manifest fails validation", async () => {
  const cwd = await makeTemp("hamster-plugin-codex-catalog-");
  await copyPackage(cwd);
  const catalogPath = path.join(cwd, ".agents", "plugins", "marketplace.json");
  const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
  catalog.plugins[0].category = "Productivity";
  await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);

  const result = await runValidator(cwd);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /category "Productivity" does not match \.codex-plugin\/plugin\.json interface\.category "Developer Tools"/);
});

test("a plugin description that drifts from its siblings fails validation", async () => {
  const cwd = await makeTemp("hamster-plugin-description-drift-");
  await copyPackage(cwd);
  await patchCodexManifest(cwd, (manifest) => {
    manifest.description = `${manifest.description} Ask Hamster over hosted MCP.`;
  });

  const result = await runValidator(cwd);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /Plugin descriptions have drifted across manifests/);
});

test("a plugin manifest left at the repository root fails validation", async () => {
  const cwd = await makeTemp("hamster-plugin-root-manifest-");
  await copyPackage(cwd);
  // agy installs 0 skills, and still reports [ok], when the root has one.
  await cp(plugin(cwd, "plugin.json"), path.join(cwd, "plugin.json"));
  await cp(plugin(cwd, "skills"), path.join(cwd, "skills"), { recursive: true });

  const result = await runValidator(cwd);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /plugin\.json must not exist at the repository root/);
  assert.match(result.stderr, /skills must not exist at the repository root/);
});

test("a Grok root manifest that drifts or stops pointing into plugins/hamster fails validation", async () => {
  const cwd = await makeTemp("hamster-plugin-grok-root-");
  await copyPackage(cwd);
  const manifestPath = path.join(cwd, ".grok-plugin", "plugin.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  // A release that bumps plugins/hamster but not this file, and an agents
  // array, which Grok reads as zero agents.
  manifest.version = "0.0.1";
  manifest.agents = ["./plugins/hamster/agents/task-executor.md"];
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await mkdir(path.join(cwd, ".gemini-plugin"), { recursive: true });
  await writeFile(path.join(cwd, ".gemini-plugin", "plugin.json"), "{}\n");

  const result = await runValidator(cwd);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /\.grok-plugin\/plugin\.json is out of sync with plugins\/hamster\/plugin\.json/);
  assert.match(result.stderr, /\.grok-plugin\/plugin\.json agents must be the directory path "\.\/plugins\/hamster\/agents"/);
  assert.match(result.stderr, /\.gemini-plugin\/plugin\.json must not exist at the repository root; only \.grok-plugin\/plugin\.json may/);

  const sync = await run(process.execPath, ["scripts/sync-adapters.mjs"], { cwd });
  assert.equal(sync.code, 0, sync.stderr);
  assert.equal(JSON.parse(await readFile(manifestPath, "utf8")).version, JSON.parse(await readFile(plugin(cwd, "plugin.json"), "utf8")).version);
});

test("a symlink or an image inside plugins/hamster fails validation", async () => {
  const cwd = await makeTemp("hamster-plugin-folder-files-");
  await copyPackage(cwd);
  await symlink("agents", plugin(cwd, "linked-agents"));
  await cp(path.join(cwd, "assets", "logo.png"), plugin(cwd, "skills", "setup", "logo.png"));

  const result = await runValidator(cwd);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /plugins\/hamster\/linked-agents is a symbolic link/);
  assert.match(result.stderr, /plugins\/hamster\/skills\/setup\/logo\.png is an image/);
});

test("images inside plugins/hamster fail except the Claude icon and the three Codex listing PNGs", async () => {
  const cwd = await makeTemp("hamster-plugin-icon-");
  await copyPackage(cwd);
  const iconPath = plugin(cwd, ".claude-plugin", "icon.svg");
  // The same SVG anywhere else in the plugin is still a bundled image.
  await cp(iconPath, plugin(cwd, "icon.svg"));
  await cp(iconPath, plugin(cwd, "skills", "setup", "icon.svg"));
  const icon = await readFile(iconPath, "utf8");
  await writeFile(iconPath, icon.replace("</svg>", '<image href="https://example.com/logo.png"/></svg>'));

  const result = await runValidator(cwd);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /plugins\/hamster\/icon\.svg is an image/);
  assert.match(result.stderr, /plugins\/hamster\/skills\/setup\/icon\.svg is an image/);
  assert.match(result.stderr, /plugins\/hamster\/\.claude-plugin\/icon\.svg must not contain <image>/);
  assert.match(result.stderr, /plugins\/hamster\/\.claude-plugin\/icon\.svg must not reference external resources/);
  assert.doesNotMatch(result.stderr, /\.claude-plugin\/icon\.svg is an image/);
  assert.doesNotMatch(result.stderr, /plugins\/hamster\/assets\/icon\.png is an image/);
  assert.doesNotMatch(result.stderr, /plugins\/hamster\/assets\/logo\.png is an image/);
  assert.doesNotMatch(result.stderr, /plugins\/hamster\/assets\/logo-dark\.png is an image/);
});

test("an Agent Plugins $schema in plugins/hamster/plugin.json fails validation", async () => {
  const cwd = await makeTemp("hamster-plugin-schema-");
  await copyPackage(cwd);
  // Copilot CLI then reads agents only from com.github.copilot/agents/.
  const manifestPath = plugin(cwd, "plugin.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  await writeFile(
    manifestPath,
    `${JSON.stringify({ $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", ...manifest }, null, 2)}\n`
  );

  const result = await runValidator(cwd);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /plugins\/hamster\/plugin\.json must not declare "\$schema"/);
});

test("the three Codex listing images inside plugins/hamster pass validation", async () => {
  const cwd = await makeTemp("hamster-plugin-codex-icons-");
  await copyPackage(cwd);

  const result = await runValidator(cwd);
  assert.equal(result.code, 0, result.stderr);
  const manifest = JSON.parse(await readFile(plugin(cwd, ".codex-plugin", "plugin.json"), "utf8"));
  assert.equal(manifest.interface.composerIcon, "./assets/icon.png");
  assert.equal(manifest.interface.logo, "./assets/logo.png");
  assert.equal(manifest.interface.logoDark, "./assets/logo-dark.png");
});

test("a Codex image other than the three listing PNGs fails validation", async () => {
  const cwd = await makeTemp("hamster-plugin-codex-image-");
  await copyPackage(cwd);
  await patchCodexInterface(cwd, (iface) => {
    iface.logo = "./assets/logo.svg";
    iface.screenshots = ["./assets/shot.png"];
  });
  await cp(path.join(cwd, "assets", "logo.svg"), plugin(cwd, "assets", "logo.svg"));
  const icon = plugin(cwd, "assets", "icon.png");
  await writeFile(icon, Buffer.concat([await readFile(icon), Buffer.from([0])]));

  const result = await runValidator(cwd);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /interface\.logo must be "\.\/assets\/logo\.png"/);
  assert.match(result.stderr, /interface\.screenshots must not be set/);
  assert.match(result.stderr, /plugins\/hamster\/assets\/logo\.svg is an image/);
  assert.match(result.stderr, /plugins\/hamster\/assets\/icon\.png must match root assets\/icon\.png byte for byte/);
});

test("a Pi manifest that stops pointing at plugins/hamster fails validation", async () => {
  const cwd = await makeTemp("hamster-plugin-pi-");
  await copyPackage(cwd);
  const manifestPath = path.join(cwd, "package.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.pi.skills = ["./skills"];
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const result = await runValidator(cwd);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /Root package\.json must set pi\.skills to \["\.\/plugins\/hamster\/skills"\]/);
});

test("a drifted duplicate fails validation", async () => {
  const cwd = await makeTemp("hamster-plugin-drift-");
  await copyPackage(cwd);
  const copyPath = plugin(cwd, "skills", "ship", "scripts", "ensure-ready.sh");
  await writeFile(copyPath, `${await readFile(copyPath, "utf8")}\n# drift\n`);

  const result = await runValidator(cwd);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /Duplicated copies have diverged and must stay byte-identical/);
});

test("the Codex bundle carries the manifest, the MCP server, skills, and assets", async () => {
  const cwd = await makeTemp("hamster-plugin-bundle-");
  await copyPackage(cwd);
  await patchCodexManifest(cwd, (manifest) => {
    manifest.apps = "./.app.json";
  });
  await commitPackage(cwd);

  const { result, zipPath } = await buildCodexBundle(cwd);
  assert.equal(result.code, 0, result.stderr);

  const entries = await zipEntries(zipPath);
  const skillDirs = (await readdir(plugin(cwd, "skills"), { withFileTypes: true })).filter((entry) =>
    entry.isDirectory()
  );
  for (const skill of skillDirs) {
    assert.ok(entries.includes(`skills/${skill.name}/SKILL.md`), `expected skills/${skill.name}/SKILL.md`);
  }
  for (const expected of [".codex-plugin/plugin.json", ".mcp.json", "assets/icon.png", "assets/logo.png", "assets/logo-dark.png", "LICENSE"]) {
    assert.ok(entries.includes(expected), `expected ${expected} in ${entries.join(", ")}`);
  }
  for (const forbidden of ["plugin.json", "mcp.json", "mcp_config.json", "agents/task-executor.md"]) {
    assert.ok(!entries.includes(forbidden), `did not expect ${forbidden} in the bundle`);
  }

  const manifestDump = await run("unzip", ["-p", zipPath, ".codex-plugin/plugin.json"]);
  assert.equal(manifestDump.code, 0, manifestDump.stderr);
  const manifest = JSON.parse(manifestDump.stdout);
  assert.equal(manifest.mcpServers, "./.mcp.json");
  assert.equal(Object.hasOwn(manifest, "apps"), false);
  const mcpDump = await run("unzip", ["-p", zipPath, ".mcp.json"]);
  assert.equal(mcpDump.code, 0, mcpDump.stderr);
  assert.equal(JSON.parse(mcpDump.stdout).mcpServers.hamster.url, "https://tryhamster.com/mcp");
  assert.equal(manifest.interface.displayName, "Hamster");
  // Root assets/ is copied once. plugins/hamster/assets/ is not archived beside it.
  assert.equal(manifest.interface.composerIcon, "./assets/icon.png");
  assert.equal(manifest.interface.logo, "./assets/logo.png");
  assert.equal(manifest.interface.logoDark, "./assets/logo-dark.png");
  for (const image of ["assets/icon.png", "assets/logo.png", "assets/logo-dark.png", "assets/logo.svg", "assets/logo-dark.svg"]) {
    assert.equal(entries.filter((entry) => entry === image).length, 1, image);
  }
  assert.equal(entries.some((entry) => entry.includes("plugins/hamster/assets/")), false);
  assert.equal(entries.filter((entry) => entry === "LICENSE" || entry.endsWith("/LICENSE")).length, 1);
});

test("archive bytes follow the checkout, not the machine building it", async () => {
  const cwd = await makeTemp("hamster-plugin-bundle-repeat-");
  await copyPackage(cwd);
  await commitPackage(cwd);

  // A reviewer rebuilding the branch to compare hashes runs under their own
  // umask and timezone, and zip records both unless the build pins them.
  const digests = [];
  for (const [umask, tz] of [[0o022, "UTC"], [0o002, "Asia/Tokyo"]]) {
    // A child inherits the umask in force when it is spawned.
    const previous = process.umask(umask);
    const pending = run(process.execPath, [BUNDLE_BUILDER, "--out", "dist"], { cwd, env: { ...process.env, TZ: tz } });
    process.umask(previous);
    const result = await pending;
    assert.equal(result.code, 0, result.stderr);
    const version = JSON.parse(await readFile(plugin(cwd, "plugin.json"), "utf8")).version;
    const zipPath = path.join(cwd, "dist", `hamster-codex-${version}.zip`);
    digests.push(createHash("sha256").update(await readFile(zipPath)).digest("hex"));
  }

  assert.equal(digests[0], digests[1]);
});

test("an uncommitted bundle source stops the build", async () => {
  const cwd = await makeTemp("hamster-plugin-bundle-dirty-");
  await copyPackage(cwd);
  await commitPackage(cwd);
  const skillPath = plugin(cwd, "skills", "ship", "SKILL.md");
  await writeFile(skillPath, `${await readFile(skillPath, "utf8")}\nUncommitted line.\n`);

  const { result, zipPath } = await buildCodexBundle(cwd);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /Commit or stash your changes first/);
  assert.match(result.stderr, /plugins\/hamster\/skills\/ship\/SKILL\.md/);
  assert.equal(await pathExists(zipPath), false);
});

test("failed hamster status prints to stderr and stdout stays SETUP_NEEDED", async () => {
  const home = await makeTemp("hamster-ready-home-");
  const bin = path.join(home, ".hamster", "bin");
  await mkdir(bin, { recursive: true });
  const hamster = path.join(bin, "hamster");
  await writeFile(
    hamster,
    `#!/usr/bin/env bash
if [[ "$1" == "--no-tui" && "$2" == "status" ]]; then
  echo "status failed: not logged in"
  exit 1
fi
echo "unexpected hamster invocation: $*"
exit 0
`
  );
  await chmod(hamster, 0o755);

  const result = await run("bash", [READY_SCRIPT], {
    cwd: repoRoot,
    env: {
      ...process.env,
      HOME: home,
      PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
    },
  });

  assert.equal(result.code, 1);
  assert.equal(result.stdout.trim(), "SETUP_NEEDED");
  assert.match(result.stderr, /status failed: not logged in/);
});
