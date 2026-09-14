#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, cp, mkdir, mkdtemp, readdir, readFile, rm, stat, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const validatorPath = path.join(repoRoot, "scripts", "validate-plugin.mjs");
const bundleBuilderPath = path.join(repoRoot, "scripts", "build-codex-skills-bundle.mjs");
const readyScript = path.join(repoRoot, "skills", "setup", "scripts", "ensure-ready.sh");

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

function run(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      ...options,
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
  return run(process.execPath, [validatorPath], { cwd });
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
  const result = await run(process.execPath, [bundleBuilderPath, "--out", outDir, ...args], { cwd });
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

test("two builds of one checkout produce byte-identical archives", async () => {
  const cwd = await makeTemp("hamster-plugin-bundle-repeat-");
  await copyPackage(cwd);
  await commitPackage(cwd);

  const first = await buildCodexBundle(cwd);
  assert.equal(first.result.code, 0, first.result.stderr);
  const firstDigest = createHash("sha256").update(await readFile(first.zipPath)).digest("hex");

  const second = await buildCodexBundle(cwd);
  assert.equal(second.result.code, 0, second.result.stderr);
  const secondDigest = createHash("sha256").update(await readFile(second.zipPath)).digest("hex");

  assert.equal(firstDigest, secondDigest);
});

test("an uncommitted bundle source stops the build", async () => {
  const cwd = await makeTemp("hamster-plugin-bundle-dirty-");
  await copyPackage(cwd);
  await commitPackage(cwd);
  const skillPath = path.join(cwd, "skills", "ship", "SKILL.md");
  await writeFile(skillPath, `${await readFile(skillPath, "utf8")}\nUncommitted line.\n`);

  const { result, zipPath } = await buildCodexBundle(cwd);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /Commit or stash the bundle sources first/);
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

  const result = await run("bash", [readyScript], {
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
