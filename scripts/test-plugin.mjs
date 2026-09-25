#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, cp, lstat, mkdir, mkdtemp, readdir, readFile, rm, stat, symlink, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Scripts are spawned by these fixed relative paths from a known cwd (a
// fixture copy, or the checkout for the setup scripts), never by an absolute
// path built from where the checkout happens to live.
const VALIDATOR = "scripts/validate-plugin.mjs";
const BUNDLE_BUILDER = "scripts/build-codex-skills-bundle.mjs";
const SYNC_ADAPTERS = "scripts/sync-adapters.mjs";
const READY_SCRIPT = "skills/setup/scripts/ensure-ready.sh";
const INSTALLER_SCRIPT = "skills/setup/scripts/install-hamster-cli.sh";

const PACKAGE_ENTRIES = [
  "plugin.json",
  "LICENSE",
  "mcp.json",
  ".mcp.json",
  "mcp_config.json",
  ".cursor-plugin",
  ".claude-plugin",
  ".codex-plugin",
  ".agents",
  "skills",
  "agents",
  "assets",
  "scripts",
  "claude",
  ".github/plugin",
];

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
  const manifestPath = path.join(cwd, ".codex-plugin", "plugin.json");
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
  const version = JSON.parse(await readFile(path.join(cwd, "plugin.json"), "utf8")).version;
  return { result, zipPath: path.join(outDir, `hamster-codex-skills-only-${version}.zip`) };
}

async function zipEntries(zipPath) {
  const listing = await run("unzip", ["-Z1", zipPath]);
  assert.equal(listing.code, 0, listing.stderr);
  return listing.stdout.split("\n").filter(Boolean);
}

test("ENOENT on plugin.json is reported as missing", async () => {
  const cwd = await makeTemp("hamster-plugin-missing-");
  await copyPackage(cwd);
  await unlink(path.join(cwd, "plugin.json"));

  const result = await runValidator(cwd);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /Root plugin\.json is missing:/);
  assert.doesNotMatch(result.stderr, /Root plugin\.json could not be read/);
});

test("non-ENOENT on plugin.json is reported as could not be read", async () => {
  const cwd = await makeTemp("hamster-plugin-unread-");
  await copyPackage(cwd);
  await unlink(path.join(cwd, "plugin.json"));
  await mkdir(path.join(cwd, "plugin.json"));

  const result = await runValidator(cwd);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /Root plugin\.json could not be read \(/);
  assert.doesNotMatch(result.stderr, /Root plugin\.json is missing:/);
});

test("a non-semver root version fails validation", async () => {
  const cwd = await makeTemp("hamster-plugin-version-");
  await copyPackage(cwd);
  const manifestPath = path.join(cwd, "plugin.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.version = "3.4";
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const result = await runValidator(cwd);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /Root plugin\.json "version" must be semver-like, got "3\.4"/);
});

test("a skill edit not synced into claude/ fails validation", async () => {
  const cwd = await makeTemp("hamster-plugin-claude-drift-");
  await copyPackage(cwd);
  const skillPath = path.join(cwd, "skills", "qa", "SKILL.md");
  await writeFile(skillPath, `${await readFile(skillPath, "utf8")}\nEdited at the root only.\n`);
  await writeFile(path.join(cwd, "claude", "skills", "qa", "notes.md"), "Only in claude/.\n");

  const result = await runValidator(cwd);
  assert.notEqual(result.code, 0);
  assert.match(
    result.stderr,
    /claude\/skills\/qa\/SKILL\.md differs from skills\/qa\/SKILL\.md \(content\)\. claude\/ is generated: make the change in skills\/qa\/SKILL\.md/
  );
  assert.match(result.stderr, /claude\/skills\/qa\/notes\.md has no source at the repository root/);
});

test("symlinks inside claude/ fail validation, dangling or not, and are never followed", async () => {
  const cwd = await makeTemp("hamster-plugin-claude-link-");
  await copyPackage(cwd);
  await unlink(path.join(cwd, "claude", ".mcp.json"));
  await symlink("../.mcp.json", path.join(cwd, "claude", ".mcp.json"));
  await unlink(path.join(cwd, "claude", "LICENSE"));
  await symlink("../NOPE", path.join(cwd, "claude", "LICENSE"));

  const result = await runValidator(cwd);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /claude\/\.mcp\.json is a symbolic link; claude\/ must hold regular files/);
  assert.match(result.stderr, /claude\/LICENSE is a symbolic link; claude\/ must hold regular files/);
  assert.doesNotMatch(result.stderr, /ENOENT/);
});

test("a drift in a generated agent names the skill-local body to edit", async () => {
  const cwd = await makeTemp("hamster-plugin-claude-agent-");
  await copyPackage(cwd);
  const agentPath = path.join(cwd, "claude", "agents", "task-executor.md");
  await writeFile(agentPath, `${await readFile(agentPath, "utf8")}\nEdited in claude/ only.\n`);

  const result = await runValidator(cwd);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /make the change in skills\/ship\/references\/agents\/task-executor\.md/);
});

test("a symlinked directory under a root source is named, not a bare EISDIR", async () => {
  const cwd = await makeTemp("hamster-plugin-source-link-");
  await copyPackage(cwd);
  await symlink("../qa", path.join(cwd, "skills", "setup", "qa-link"));

  const result = await runValidator(cwd);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /skills\/setup\/qa-link is a symbolic link to a directory/);
});

test("a claude/ copy that loses its executable bit fails validation", async () => {
  const cwd = await makeTemp("hamster-plugin-claude-mode-");
  await copyPackage(cwd);
  await chmod(path.join(cwd, "claude", "skills", "setup", "scripts", "install-hamster-cli.sh"), 0o644);

  const result = await runValidator(cwd);
  assert.notEqual(result.code, 0);
  assert.match(
    result.stderr,
    /claude\/skills\/setup\/scripts\/install-hamster-cli\.sh differs from skills\/setup\/scripts\/install-hamster-cli\.sh \(executable bit\)/
  );
});

test("syncing never deletes a symlinked claude/README.md, which it cannot regenerate", async () => {
  const cwd = await makeTemp("hamster-plugin-claude-readme-link-");
  await copyPackage(cwd);
  await unlink(path.join(cwd, "claude", "README.md"));
  await symlink("../README.md", path.join(cwd, "claude", "README.md"));
  const skillPath = path.join(cwd, "skills", "qa", "SKILL.md");
  await writeFile(skillPath, `${await readFile(skillPath, "utf8")}\nEdited at the root only.\n`);

  const sync = await run(process.execPath, [SYNC_ADAPTERS], { cwd });
  assert.equal(sync.code, 1);
  assert.match(sync.stderr, /claude\/README\.md is a symbolic link; replace it with a regular file/);
  assert.equal((await lstat(path.join(cwd, "claude", "README.md"))).isSymbolicLink(), true);
  // What the sync already changed is reported even though it then fails.
  assert.match(sync.stdout, /Wrote claude\/skills\/qa\/SKILL\.md/);
});

test("syncing claude/ copies edits, drops orphans and links, and keeps its README", async () => {
  const cwd = await makeTemp("hamster-plugin-claude-sync-");
  await copyPackage(cwd);
  const readmePath = path.join(cwd, "claude", "README.md");
  const readme = await readFile(readmePath);
  const skillPath = path.join(cwd, "skills", "qa", "SKILL.md");
  await writeFile(skillPath, `${await readFile(skillPath, "utf8")}\nEdited at the root only.\n`);
  await writeFile(path.join(cwd, "claude", "skills", "qa", "notes.md"), "Only in claude/.\n");
  await unlink(path.join(cwd, "claude", "LICENSE"));
  await symlink("../LICENSE", path.join(cwd, "claude", "LICENSE"));

  const sync = await run(process.execPath, [SYNC_ADAPTERS], { cwd });
  assert.equal(sync.code, 0, sync.stderr);
  assert.deepEqual(await readFile(readmePath), readme);
  assert.deepEqual(await readFile(path.join(cwd, "claude", "skills", "qa", "SKILL.md")), await readFile(skillPath));
  assert.equal(await pathExists(path.join(cwd, "claude", "skills", "qa", "notes.md")), false);
  assert.equal((await lstat(path.join(cwd, "claude", "LICENSE"))).isFile(), true);

  const check = await run(process.execPath, [SYNC_ADAPTERS, "--check"], { cwd });
  assert.equal(check.code, 0, check.stderr);
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
  assert.match(result.stderr, /Claude marketplace\.json plugins\[0\]\.source must be "\.\/claude"/);
});

test("a Copilot marketplace version that drifts fails validation", async () => {
  const cwd = await makeTemp("hamster-plugin-copilot-version-");
  await copyPackage(cwd);
  const marketplacePath = path.join(cwd, ".github", "plugin", "marketplace.json");
  const marketplace = JSON.parse(await readFile(marketplacePath, "utf8"));
  marketplace.plugins[0].version = "0.0.1";
  await writeFile(marketplacePath, `${JSON.stringify(marketplace, null, 2)}\n`);

  const result = await runValidator(cwd);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /Copilot marketplace\.json plugins\[0\] version "0\.0\.1" does not match root/);
});

test("a missing referenced path fails validation", async () => {
  const cwd = await makeTemp("hamster-plugin-ref-");
  await copyPackage(cwd);
  const manifestPath = path.join(cwd, ".cursor-plugin", "plugin.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.logo = "assets/does-not-exist.svg";
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const result = await runValidator(cwd);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /field "logo" references missing path "assets\/does-not-exist\.svg"/);
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

test("a Codex image path without a ./ prefix fails validation", async () => {
  const cwd = await makeTemp("hamster-plugin-codex-prefix-");
  await copyPackage(cwd);
  await patchCodexInterface(cwd, (iface) => {
    iface.logo = "assets/logo.png";
  });

  const result = await runValidator(cwd);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /interface\.logo must start with "\.\/", got "assets\/logo\.png"/);
});

test("a missing Codex image file fails validation", async () => {
  const cwd = await makeTemp("hamster-plugin-codex-missing-");
  await copyPackage(cwd);
  await patchCodexInterface(cwd, (iface) => {
    iface.composerIcon = "./assets/does-not-exist.png";
  });

  const result = await runValidator(cwd);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /field "interface\.composerIcon" references missing path "\.\/assets\/does-not-exist\.png"/);
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

test("an empty Codex logoDark fails validation", async () => {
  const cwd = await makeTemp("hamster-plugin-codex-logodark-");
  await copyPackage(cwd);
  await patchCodexInterface(cwd, (iface) => {
    iface.logoDark = "";
  });

  const result = await runValidator(cwd);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /interface\.logoDark must be a non-empty path/);
});

test("a drifted duplicate fails validation", async () => {
  const cwd = await makeTemp("hamster-plugin-drift-");
  await copyPackage(cwd);
  const copyPath = path.join(cwd, "skills", "ship", "scripts", "ensure-ready.sh");
  await writeFile(copyPath, `${await readFile(copyPath, "utf8")}\n# drift\n`);

  const result = await runValidator(cwd);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /Duplicated copies have diverged and must stay byte-identical/);
});

test("the Codex bundle carries only skills, assets, and a stripped manifest", async () => {
  const cwd = await makeTemp("hamster-plugin-bundle-");
  await copyPackage(cwd);
  await patchCodexManifest(cwd, (manifest) => {
    manifest.apps = "./.app.json";
    manifest.interface.screenshots = ["./assets/logo.png"];
  });
  await commitPackage(cwd);

  const { result, zipPath } = await buildCodexBundle(cwd);
  assert.equal(result.code, 0, result.stderr);

  const entries = await zipEntries(zipPath);
  const skillDirs = (await readdir(path.join(cwd, "skills"), { withFileTypes: true })).filter((entry) =>
    entry.isDirectory()
  );
  for (const skill of skillDirs) {
    assert.ok(entries.includes(`skills/${skill.name}/SKILL.md`), `expected skills/${skill.name}/SKILL.md`);
  }
  for (const expected of [".codex-plugin/plugin.json", "assets/logo.png", "LICENSE"]) {
    assert.ok(entries.includes(expected), `expected ${expected} in ${entries.join(", ")}`);
  }
  for (const forbidden of ["plugin.json", "mcp.json", ".mcp.json", "mcp_config.json", "agents/task-executor.md"]) {
    assert.ok(!entries.includes(forbidden), `did not expect ${forbidden} in the bundle`);
  }

  const manifestDump = await run("unzip", ["-p", zipPath, ".codex-plugin/plugin.json"]);
  assert.equal(manifestDump.code, 0, manifestDump.stderr);
  const manifest = JSON.parse(manifestDump.stdout);
  assert.equal(Object.hasOwn(manifest, "mcpServers"), false);
  assert.equal(Object.hasOwn(manifest, "apps"), false);
  assert.equal(Object.hasOwn(manifest.interface, "screenshots"), false);
  assert.equal(manifest.interface.displayName, "Hamster");
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
    const version = JSON.parse(await readFile(path.join(cwd, "plugin.json"), "utf8")).version;
    const zipPath = path.join(cwd, "dist", `hamster-codex-skills-only-${version}.zip`);
    digests.push(createHash("sha256").update(await readFile(zipPath)).digest("hex"));
  }

  assert.equal(digests[0], digests[1]);
});

test("an uncommitted bundle source stops the build", async () => {
  const cwd = await makeTemp("hamster-plugin-bundle-dirty-");
  await copyPackage(cwd);
  await commitPackage(cwd);
  // Edit the claude/ mirror too, so validation passes and the dirty-tree gate is what stops the build.
  for (const root of [cwd, path.join(cwd, "claude")]) {
    const skillPath = path.join(root, "skills", "ship", "SKILL.md");
    await writeFile(skillPath, `${await readFile(skillPath, "utf8")}\nUncommitted line.\n`);
  }

  const { result, zipPath } = await buildCodexBundle(cwd);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /Commit or stash your changes first/);
  assert.match(result.stderr, /skills\/ship\/SKILL\.md/);
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


// Runs the real installer against a fake release: a stub `curl` serves a
// tarball and its checksum from `release/`, and a stub `rm` refuses the
// legacy /usr/local/bin/hamster path so a test can never delete a real binary.
async function runInstaller({ checksum = "match", config = null, rc = "", binary = "echo 'hamster version v0.0.0-test'", archive = true } = {}) {
  const root = await makeTemp("hamster-installer-");
  const home = path.join(root, "home");
  const stubs = path.join(root, "stubs");
  const release = path.join(root, "release");
  await mkdir(home, { recursive: true });
  await mkdir(stubs, { recursive: true });
  await mkdir(path.join(release, "pkg"), { recursive: true });

  await writeFile(path.join(release, "pkg", "hamster"), `#!/usr/bin/env bash\n${binary}\n`);
  await chmod(path.join(release, "pkg", "hamster"), 0o755);
  const tar = await run("tar", ["-czf", path.join(release, "archive.tar.gz"), "-C", path.join(release, "pkg"), "hamster"]);
  assert.equal(tar.code, 0, tar.stderr);
  const digest = createHash("sha256").update(await readFile(path.join(release, "archive.tar.gz"))).digest("hex");
  if (checksum === "match") {
    await writeFile(path.join(release, "archive.sha256"), `${digest}  archive.tar.gz\n`);
  } else if (checksum === "wrong") {
    await writeFile(path.join(release, "archive.sha256"), `${"0".repeat(64)}  archive.tar.gz\n`);
  } else if (checksum === "empty") {
    await writeFile(path.join(release, "archive.sha256"), "");
  }
  if (!archive) {
    await unlink(path.join(release, "archive.tar.gz"));
  }

  await writeFile(
    path.join(stubs, "curl"),
    `#!/usr/bin/env bash
url=""; out=""
while [ $# -gt 0 ]; do
  case "$1" in -o) out="$2"; shift 2 ;; -*) shift ;; *) url="$1"; shift ;; esac
done
case "$url" in
  *.sha256) src="${release}/archive.sha256" ;;
  *) src="${release}/archive.tar.gz" ;;
esac
[ -f "$src" ] || { echo "curl: (22) 404 $url" >&2; exit 22; }
cp "$src" "$out"
`
  );
  await writeFile(
    path.join(stubs, "rm"),
    `#!/usr/bin/env bash
for arg in "$@"; do [ "$arg" = /usr/local/bin/hamster ] && exit 1; done
exec /bin/rm "$@"
`
  );
  await chmod(path.join(stubs, "curl"), 0o755);
  await chmod(path.join(stubs, "rm"), 0o755);

  await writeFile(path.join(home, ".bashrc"), rc);
  const configPath = path.join(home, ".hamster", "config.yaml");
  if (config !== null) {
    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(configPath, config.text);
    await chmod(configPath, config.mode ?? 0o644);
  }

  const env = { ...process.env, HOME: home, SHELL: "/bin/bash", PATH: `${stubs}${path.delimiter}${process.env.PATH ?? ""}` };
  const invoke = () => run("bash", [INSTALLER_SCRIPT], { cwd: repoRoot, env });
  return { home, configPath, invoke, binary: path.join(home, ".hamster", "bin", "hamster") };
}

for (const checksum of ["wrong", "empty", "missing"]) {
  test(`the CLI installer refuses a ${checksum} checksum and installs nothing`, async () => {
    const { invoke, binary } = await runInstaller({ checksum });
    const result = await invoke();
    assert.equal(result.code, 1);
    assert.match(result.stderr, checksum === "missing" ? /Failed to download the checksum/ : /Checksum mismatch/);
    assert.match(result.stderr, /Install it by hand instead/);
    assert.equal(await pathExists(binary), false);
  });
}

test("a failed download ends with the manual install steps", async () => {
  const { invoke, binary } = await runInstaller({ archive: false });
  const result = await invoke();
  assert.equal(result.code, 1);
  assert.match(result.stderr, /Failed to download .*Install it by hand instead: download hamster-.*\.tar\.gz and hamster-.*\.tar\.gz\.sha256 from https:\/\/github\.com\/gethamster\/plugin\/releases\/latest/);
  assert.equal(await pathExists(binary), false);
});

test("a binary that dies silently is reported with its exit status or signal", async () => {
  for (const [script, expected] of [
    ["exit 3", /failed to run \(exit status 3\)$/m],
    ["kill -9 $$", /failed to run \(killed by signal 9\)$/m],
    ["echo 'libfoo missing' >&2; exit 127", /failed to run \(exit status 127\): libfoo missing$/m],
    ["echo 'bad cpu type'; exit 1", /failed to run \(exit status 1\): bad cpu type$/m],
  ]) {
    const { invoke } = await runInstaller({ binary: script });
    const result = await invoke();
    assert.equal(result.code, 1);
    assert.match(result.stderr, expected);
  }
});

test("the CLI installer verifies, installs, and edits shell and CLI config once", async () => {
  const { home, configPath, invoke, binary } = await runInstaller({
    config: { text: "profile: work\napi_url: http://old.example\n" },
    rc: "if true; then\n  alias hamster='task-master'\nfi\n",
  });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await invoke();
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /Checksum verified/);
  }

  assert.equal(await pathExists(binary), true);
  assert.equal(await readFile(configPath, "utf8"), 'profile: work\napi_url: "https://tryhamster.com"\n');
  const bashrc = await readFile(path.join(home, ".bashrc"), "utf8");
  assert.match(bashrc, /^ {2}# alias hamster='task-master'/m);
  assert.doesNotMatch(bashrc, /^\s*alias hamster='task-master'/m);
  assert.equal(bashrc.match(/\.hamster\/bin:\$PATH/g)?.length, 1);
  assert.equal(bashrc.match(/^alias ham='hamster'$/gm)?.length, 1);
});

test("the CLI installer stops without touching a config.yaml it cannot read", async (t) => {
  if (process.getuid?.() === 0) {
    t.skip("root can read a mode 000 file");
    return;
  }
  const { configPath, invoke } = await runInstaller({ config: { text: "profile: work\n", mode: 0o000 } });
  const result = await invoke();
  assert.equal(result.code, 1);
  assert.match(result.stderr, /Could not read .*config\.yaml, so it was left unchanged/);
  await chmod(configPath, 0o644);
  assert.equal(await readFile(configPath, "utf8"), "profile: work\n");
});
