#!/usr/bin/env node

/**
 * Stage and zip the plugin package uploaded to OpenAI's Plugins Directory.
 *
 * The bundle is the Codex manifest from plugins/hamster, its .mcp.json (the
 * hosted Hamster MCP server), the skills tree, and the license. The listing
 * images come from the root assets/. plugins/hamster also carries those same
 * three PNGs for a marketplace install; this zip copies the root assets/ once
 * and does not also copy plugins/hamster/assets, so the archive does not
 * contain the same image twice.
 *
 * The directory can't add an MCP server to a plugin first uploaded without one,
 * so the connector ships in the first upload.
 *
 * Usage:
 *   node scripts/build-codex-bundle.mjs                 # dist/
 *   node scripts/build-codex-bundle.mjs --out build     # custom output
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const pluginDir = path.join(repoRoot, "plugins", "hamster");

// The directory listing's images, added to the staged manifest only.
const LISTING_IMAGES = {
  composerIcon: "./assets/icon.png",
  logo: "./assets/logo.png",
  logoDark: "./assets/logo-dark.png",
};

// https://developers.openai.com/plugins/deploy/submission: ZIPs with app references
// or lifecycle hooks can't be submitted.
const EXCLUDED_MANIFEST_KEYS = ["apps", "hooks"];

// .mcp.json is the one MCP config Codex reads. mcp_config.json and server.json
// are this repo's other MCP dialects for other clients, and mcp.json is the
// portable format's, which would make a second, competing declaration.
const FORBIDDEN_FILENAMES = new Set(["mcp.json", "mcp_config.json", ".app.json", "server.json", "hooks.json"]);
const MCP_CONFIG = ".mcp.json";

// zip writes DOS timestamps, which have no timezone and 2-second granularity, so
// staged files are normalized to a fixed instant and zipped under TZ=UTC. Modes
// are pinned too, because the external-attributes field carries the unix mode
// and -X does not normalize it. Without all three the bytes depend on the
// machine, not the commit.
const FIXED_MTIME = new Date("2020-01-01T00:00:00Z");

function parseArgs(argv) {
  const options = { out: "dist" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--out") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("--out requires a directory path.");
      }
      options.out = value;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

async function readJsonFile(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`${filePath} contains invalid JSON: ${error.message}`);
  }
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

// Whole-tree, the way np, npm version, and release-it gate a release: a build
// reads the manifest, the skills, the assets, the license, the version, and the
// validator, and a per-path allowlist of that set is one more thing to keep in
// step with what the build actually touches. Only the build's own output is
// excused, so the guard does not depend on .gitignore naming whichever --out ran.
function requireCleanCheckout(outDir) {
  const pathspec = ["."];
  const relativeOut = path.relative(repoRoot, outDir);
  if (relativeOut && !relativeOut.startsWith("..") && !path.isAbsolute(relativeOut)) {
    pathspec.push(`:(exclude)${relativeOut}`, `:(exclude,glob)${relativeOut}/**`);
  }

  let status;
  try {
    status = execFileSync("git", ["status", "--porcelain", "--", ...pathspec], {
      cwd: repoRoot,
      encoding: "utf8",
    });
  } catch (error) {
    throw new Error(
      `The bundle is built from a git checkout so the artifact maps to a commit; git status failed: ${error.message}`
    );
  }

  if (status.trim()) {
    throw new Error(
      `Commit or stash your changes first; otherwise the artifact matches no commit:\n${status.trimEnd()}`
    );
  }
}

async function listSkillNames() {
  const skillsDir = path.join(pluginDir, "skills");
  const entries = await fs.readdir(skillsDir, { withFileTypes: true });
  const names = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  if (names.length === 0) {
    throw new Error("plugins/hamster/skills/ has no skill directories; the directory rejects a bundle with no skill.");
  }

  return names;
}

async function stageBundle(stagingDir, skillNames) {
  await fs.rm(stagingDir, { recursive: true, force: true });
  await fs.mkdir(path.join(stagingDir, ".codex-plugin"), { recursive: true });

  const manifest = await readJsonFile(path.join(pluginDir, ".codex-plugin", "plugin.json"));
  for (const key of EXCLUDED_MANIFEST_KEYS) {
    delete manifest[key];
  }
  Object.assign(manifest.interface, LISTING_IMAGES);
  await fs.writeFile(
    path.join(stagingDir, ".codex-plugin", "plugin.json"),
    `${JSON.stringify(manifest, null, 2)}\n`
  );

  for (const name of skillNames) {
    await fs.cp(path.join(pluginDir, "skills", name), path.join(stagingDir, "skills", name), {
      recursive: true,
      dereference: true,
    });
  }

  // One assets/ tree, from the repository root. plugins/hamster/assets/ is the
  // marketplace copy of the three PNGs; copying it too would archive them twice.
  await fs.cp(path.join(repoRoot, "assets"), path.join(stagingDir, "assets"), {
    recursive: true,
    dereference: true,
  });
  const pluginAssets = path.join(pluginDir, "assets");
  if (await pathExists(pluginAssets)) {
    for (const name of await fs.readdir(pluginAssets)) {
      if (!(await pathExists(path.join(stagingDir, "assets", name)))) {
        throw new Error(
          `${name} is in plugins/hamster/assets but missing from the staged root assets/. The bundle copies root assets/ once.`
        );
      }
    }
  }
  await fs.cp(path.join(pluginDir, MCP_CONFIG), path.join(stagingDir, MCP_CONFIG));
  await fs.cp(path.join(repoRoot, "LICENSE"), path.join(stagingDir, "LICENSE"));
}

async function walkFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(full)));
    } else {
      files.push(full);
    }
  }
  return files;
}

// Reads the manifest back off disk: the point is to check the bytes that ship,
// not the object the staging step just deleted keys from.
async function verifyStaging(stagingDir, skillNames) {
  for (const name of skillNames) {
    const skillFile = path.join(stagingDir, "skills", name, "SKILL.md");
    if (!(await pathExists(skillFile))) {
      throw new Error(`Staged skill has no SKILL.md: ${skillFile}`);
    }
  }

  const manifest = await readJsonFile(path.join(stagingDir, ".codex-plugin", "plugin.json"));

  for (const key of EXCLUDED_MANIFEST_KEYS) {
    if (manifest[key] !== undefined) {
      throw new Error(`The bundle manifest must not declare ${key}.`);
    }
  }

  if (manifest.mcpServers !== `./${MCP_CONFIG}`) {
    throw new Error(`The bundle manifest must set mcpServers to "./${MCP_CONFIG}".`);
  }
  // The directory connects one MCP server per plugin.
  const servers = Object.keys((await readJsonFile(path.join(stagingDir, MCP_CONFIG))).mcpServers ?? {});
  if (servers.length !== 1) {
    throw new Error(`${MCP_CONFIG} must declare exactly one MCP server, found ${servers.length}.`);
  }

  for (const field of Object.keys(LISTING_IMAGES)) {
    const value = manifest.interface?.[field];
    if (value === undefined) {
      throw new Error(`The bundle manifest has no interface.${field}.`);
    }
    const resolved = path.resolve(stagingDir, value);
    const relative = path.relative(stagingDir, resolved);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error(`interface.${field} resolves outside the bundle: ${value}`);
    }
    if (!(await pathExists(resolved))) {
      throw new Error(`interface.${field} is missing from the bundle: ${resolved}`);
    }
  }

  for (const file of await walkFiles(stagingDir)) {
    if (FORBIDDEN_FILENAMES.has(path.basename(file))) {
      throw new Error(`The bundle must not carry hooks, app configuration, or a second MCP configuration: ${file}`);
    }
  }
}

async function normalizeStaging(stagingDir) {
  const files = await walkFiles(stagingDir);
  for (const file of files) {
    const { mode } = await fs.stat(file);
    await fs.chmod(file, mode & 0o111 ? 0o755 : 0o644);
    await fs.utimes(file, FIXED_MTIME, FIXED_MTIME);
  }
  // -@ archives exactly the paths it is given, so directory entries never reach
  // the zip and their timestamps cannot affect it.
  return files.map((file) => path.relative(stagingDir, file)).sort();
}

function writeZip(stagingDir, zipPath, members) {
  try {
    // -X drops uid/gid and extended attributes; -@ takes the sorted member list
    // on stdin; TZ=UTC fixes how the normalized mtimes land in DOS timestamps,
    // which carry no timezone of their own. The plugin root sits at the archive
    // root, one of the two layouts plugin_root_ambiguous accepts.
    execFileSync("zip", ["-X", "-q", "-@", zipPath], {
      cwd: stagingDir,
      input: `${members.join("\n")}\n`,
      env: { ...process.env, TZ: "UTC" },
    });
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error("The zip binary is required; install it (macOS ships it, Debian: apt-get install zip).");
    }
    throw error;
  }
}

// zip warns and continues on a file it cannot read, so the shipped member list
// is checked against the staged one rather than assumed. obra/superpowers greps
// its archive listing for source-only paths; an allowlist is available here, so
// this compares the whole set instead.
async function verifyArchive(zipPath, members) {
  const listing = execFileSync("unzip", ["-Z1", zipPath], { encoding: "utf8" });
  const shipped = listing
    .split("\n")
    .map((line) => line.replace(/\/$/, ""))
    .filter(Boolean)
    .sort();

  const missing = members.filter((member) => !shipped.includes(member));
  const extra = shipped.filter((member) => !members.includes(member));
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      `The archive does not match what was staged. Missing: ${missing.join(", ") || "none"}. Unexpected: ${extra.join(", ") || "none"}.`
    );
  }

  return createHash("sha256").update(await fs.readFile(zipPath)).digest("hex");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  // The staged manifest is the repo manifest minus the excluded keys, so
  // validating the checkout covers every listing rule the portal enforces on the
  // artifact — this also runs when the bundle is built by hand off a tag, with
  // no CI ahead of it.
  execFileSync(process.execPath, [path.join(repoRoot, "scripts", "validate-plugin.mjs")], {
    cwd: repoRoot,
    stdio: "inherit",
  });

  const outDir = path.resolve(repoRoot, options.out);
  requireCleanCheckout(outDir);

  const { version } = await readJsonFile(path.join(pluginDir, "plugin.json"));
  if (!version) {
    throw new Error("plugins/hamster/plugin.json has no version.");
  }

  const stagingDir = path.join(outDir, "codex-plugin");
  const skillNames = await listSkillNames();

  await stageBundle(stagingDir, skillNames);
  await verifyStaging(stagingDir, skillNames);
  const members = await normalizeStaging(stagingDir);

  const zipPath = path.join(outDir, `hamster-codex-${version}.zip`);
  await fs.rm(zipPath, { force: true });
  writeZip(stagingDir, zipPath, members);

  const checksum = await verifyArchive(zipPath, members);

  console.log(`Wrote ${path.relative(repoRoot, zipPath)}`);
  console.log(`Entries: ${members.length}`);
  console.log(`SHA-256: ${checksum}`);
  console.log(`Skills: ${skillNames.join(", ")}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
