#!/usr/bin/env node

/**
 * Stage and zip the skills-only package uploaded to Codex's Plugins Directory.
 *
 * A skills-only submission excludes MCP, app, and screenshot configuration, so
 * the bundle carries the Codex manifest stripped of those keys alongside the
 * skills tree, the listing assets, and the license. The repository itself keeps
 * its full CLI + MCP + skills shape for every GitHub and marketplace install.
 *
 * Usage:
 *   node scripts/build-codex-skills-bundle.mjs                 # dist/
 *   node scripts/build-codex-skills-bundle.mjs --out build     # custom output
 */

import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();

// https://developers.openai.com/plugins/deploy/submission-errors names each
// exclusion a skills-only upload is rejected for: mcp_configuration_excluded
// (mcpServers), app_configuration_excluded (apps), and
// screenshot_configuration_excluded (interface.screenshots).
const EXCLUDED_MANIFEST_KEYS = ["mcpServers", "apps"];
const EXCLUDED_INTERFACE_KEYS = ["screenshots"];

// The same rules exclude .mcp.json, mcp.json, and .app.json by name.
// mcp_config.json and server.json are this repo's remaining MCP dialects, which
// the portal does not name but which carry the same endpoint.
const FORBIDDEN_FILENAMES = new Set([
  ".mcp.json",
  "mcp.json",
  "mcp_config.json",
  ".app.json",
  "server.json",
]);

// Paths the bundle is built from. A build reads these and nothing else, so a
// clean checkout of them is what makes the artifact traceable to a commit.
const SOURCE_PATHS = [".codex-plugin/plugin.json", "skills", "assets", "LICENSE"];

// zip stores DOS timestamps, so staged files are normalized to a fixed date and
// fed in sorted order; two builds of one tree then produce identical bytes.
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

function requireCleanSources() {
  let status;
  try {
    status = execFileSync("git", ["status", "--porcelain", "--", ...SOURCE_PATHS], {
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
      `Commit or stash the bundle sources first; otherwise the artifact matches no commit:\n${status.trimEnd()}`
    );
  }
}

async function listSkillNames() {
  const skillsDir = path.join(repoRoot, "skills");
  const entries = await fs.readdir(skillsDir, { withFileTypes: true });
  const names = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  if (names.length === 0) {
    throw new Error("skills/ has no skill directories; the directory rejects a bundle with no skill.");
  }

  return names;
}

async function stageBundle(stagingDir, skillNames) {
  await fs.rm(stagingDir, { recursive: true, force: true });
  await fs.mkdir(path.join(stagingDir, ".codex-plugin"), { recursive: true });

  const manifest = await readJsonFile(path.join(repoRoot, ".codex-plugin", "plugin.json"));
  for (const key of EXCLUDED_MANIFEST_KEYS) {
    delete manifest[key];
  }
  for (const key of EXCLUDED_INTERFACE_KEYS) {
    delete manifest.interface?.[key];
  }
  await fs.writeFile(
    path.join(stagingDir, ".codex-plugin", "plugin.json"),
    `${JSON.stringify(manifest, null, 2)}\n`
  );

  for (const name of skillNames) {
    await fs.cp(path.join(repoRoot, "skills", name), path.join(stagingDir, "skills", name), {
      recursive: true,
      dereference: true,
    });
  }

  await fs.cp(path.join(repoRoot, "assets"), path.join(stagingDir, "assets"), {
    recursive: true,
    dereference: true,
  });
  await fs.cp(path.join(repoRoot, "LICENSE"), path.join(stagingDir, "LICENSE"));

  return manifest;
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

async function verifyStaging(stagingDir, manifest, skillNames) {
  for (const name of skillNames) {
    const skillFile = path.join(stagingDir, "skills", name, "SKILL.md");
    if (!(await pathExists(skillFile))) {
      throw new Error(`Staged skill has no SKILL.md: ${skillFile}`);
    }
  }

  for (const key of EXCLUDED_MANIFEST_KEYS) {
    if (manifest[key] !== undefined) {
      throw new Error(`A skills-only bundle must not declare ${key}.`);
    }
  }
  for (const key of EXCLUDED_INTERFACE_KEYS) {
    if (manifest.interface?.[key] !== undefined) {
      throw new Error(`A skills-only bundle must not declare interface.${key}.`);
    }
  }

  for (const field of ["logo", "logoDark", "composerIcon"]) {
    const value = manifest.interface?.[field];
    if (value === undefined) {
      continue;
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
      throw new Error(`A skills-only bundle must not carry MCP or app configuration: ${file}`);
    }
  }

  if (manifest.author?.name !== manifest.interface?.developerName) {
    throw new Error(
      `author.name (${JSON.stringify(manifest.author?.name)}) must equal interface.developerName (${JSON.stringify(manifest.interface?.developerName)}).`
    );
  }
}

async function normalizeTimes(stagingDir) {
  const files = await walkFiles(stagingDir);
  const dirs = new Set();
  for (const file of files) {
    await fs.utimes(file, FIXED_MTIME, FIXED_MTIME);
    for (let dir = path.dirname(file); dir.startsWith(stagingDir); dir = path.dirname(dir)) {
      dirs.add(dir);
    }
  }
  for (const dir of [...dirs].sort().reverse()) {
    await fs.utimes(dir, FIXED_MTIME, FIXED_MTIME);
  }
  return files.map((file) => path.relative(stagingDir, file)).sort();
}

function writeZip(stagingDir, zipPath, members) {
  try {
    // -X drops uid/gid and extended attributes; -@ takes the sorted member list
    // on stdin. The plugin root sits at the archive root, one of the two layouts
    // plugin_root_ambiguous accepts.
    execFileSync("zip", ["-X", "-q", "-@", zipPath], {
      cwd: stagingDir,
      input: `${members.join("\n")}\n`,
    });
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error("The zip binary is required; install it (macOS ships it, Debian: apt-get install zip).");
    }
    throw error;
  }
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

  requireCleanSources();

  const { version } = await readJsonFile(path.join(repoRoot, "plugin.json"));
  if (!version) {
    throw new Error("Root plugin.json has no version.");
  }

  const outDir = path.resolve(repoRoot, options.out);
  const stagingDir = path.join(outDir, "codex-skills-only");
  const skillNames = await listSkillNames();

  const manifest = await stageBundle(stagingDir, skillNames);
  await verifyStaging(stagingDir, manifest, skillNames);
  const members = await normalizeTimes(stagingDir);

  const zipPath = path.join(outDir, `hamster-codex-skills-only-${version}.zip`);
  await fs.rm(zipPath, { force: true });
  writeZip(stagingDir, zipPath, members);

  console.log(`Wrote ${path.relative(repoRoot, zipPath)}`);
  console.log(`Skills: ${skillNames.join(", ")}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
