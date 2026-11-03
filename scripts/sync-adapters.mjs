#!/usr/bin/env node

/**
 * Generate the root .grok-plugin/plugin.json and package.json from
 * plugins/hamster/plugin.json, and the Gemini extension at the root:
 * gemini-extension.json and skills/.
 *
 * Usage:
 *   node scripts/sync-adapters.mjs          # write generated files
 *   node scripts/sync-adapters.mjs --check  # fail if generated files drift
 */

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = process.cwd();
const pluginDir = path.join("plugins", "hamster");

function digest(text) {
  return createHash("sha256").update(text).digest("hex");
}

export async function syncAdapters({ check = false } = {}) {
  const errors = [];
  const written = [];

  await syncRootManifests({ check, errors, written });
  await syncGeminiExtension({ check, errors, written });
  await syncGeminiSkills({ check, errors, written });

  return { errors, written };
}

// `grok plugin install gethamster/plugin` reads a manifest at the source root
// and never follows a marketplace catalog. This root manifest points Grok into
// plugins/hamster, so the published command and existing installs keep
// working.
export const GROK_ROOT_MANIFEST = path.join(".grok-plugin", "plugin.json");

// Pi installs a git repository from its root, and the same package.json is the
// npm package Pi's catalog lists: the catalog picks up npm packages with the
// pi-package keyword. `files` ships only the skills; npm adds README.md,
// LICENSE, and package.json on its own.
const PI_PACKAGE_MANIFEST = "package.json";
const PI_PACKAGE_NAME = "@tryhamster/pi";
const PI_SKILLS = "plugins/hamster/skills";

// Each root manifest is rendered from the plugin's own plugin.json, so a plugin
// bump moves every client together. `fields` lists what each one copies from
// it; a missing field fails the sync instead of writing a manifest without it.
// The Pi package sets its own npm name.
const ROOT_MANIFESTS = [
  {
    target: GROK_ROOT_MANIFEST,
    fields: ["name", "version", "description"],
    render: (source) => ({
      name: source.name,
      version: source.version,
      description: source.description,
      skills: "./plugins/hamster/skills",
      mcpServers: "./plugins/hamster/.mcp.json",
    }),
  },
  {
    target: PI_PACKAGE_MANIFEST,
    fields: ["version", "description", "keywords", "homepage", "repository", "license", "author"],
    render: (source) => ({
      name: PI_PACKAGE_NAME,
      version: source.version,
      description: source.description,
      keywords: ["pi-package", ...source.keywords],
      homepage: source.homepage,
      repository: { type: "git", url: `git+${source.repository}.git` },
      license: source.license,
      author: source.author,
      files: [PI_SKILLS],
      pi: { skills: [`./${PI_SKILLS}`] },
      publishConfig: { access: "public" },
    }),
  },
];

async function syncRootManifests({ check, errors, written }) {
  const sourcePath = path.join(repoRoot, pluginDir, "plugin.json");
  let source;
  try {
    source = JSON.parse(await fs.readFile(sourcePath, "utf8"));
  } catch (error) {
    errors.push(`Could not read ${path.relative(repoRoot, sourcePath)} to render the root manifests: ${error.message}`);
    return;
  }

  for (const { target, fields, render } of ROOT_MANIFESTS) {
    const missing = fields.filter((field) => source?.[field] == null || source[field] === "");
    if (missing.length > 0) {
      errors.push(`${path.relative(repoRoot, sourcePath)} must set ${missing.join(", ")} to render ${target}.`);
      continue;
    }
    if (fields.includes("keywords") && !Array.isArray(source.keywords)) {
      errors.push(`${path.relative(repoRoot, sourcePath)} keywords must be an array to render ${target}.`);
      continue;
    }
    await syncGeneratedFile({
      check,
      errors,
      written,
      target,
      rendered: `${JSON.stringify(render(source), null, 2)}\n`,
      source: path.relative(repoRoot, sourcePath),
    });
  }
}

// Writes one generated text file, or with `check` reports it missing or stale.
async function syncGeneratedFile({ check, errors, written, target, rendered, source }) {
  const targetPath = path.join(repoRoot, target);
  if (check) {
    let existing;
    try {
      existing = await fs.readFile(targetPath, "utf8");
    } catch (error) {
      errors.push(
        error.code === "ENOENT"
          ? `Generated ${target} is missing. Run \`node scripts/sync-adapters.mjs\`.`
          : `Could not read ${target}: ${error.message}`
      );
      return;
    }
    if (digest(existing.replace(/\r\n/g, "\n")) !== digest(rendered)) {
      errors.push(`${target} is out of sync with ${source}. Run \`node scripts/sync-adapters.mjs\`.`);
    }
    return;
  }

  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, rendered, "utf8");
  written.push(target);
}

// The Gemini CLI extensions gallery lists a repository with gemini-extension.json
// at its root, and Gemini loads skills/ only from beside that file. agy also
// installs a root that holds gemini-extension.json, from the same skills/.
// These are generated copies of plugins/hamster, which stays the source every
// other client installs.
export const GEMINI_EXTENSION_MANIFEST = "gemini-extension.json";
export const GEMINI_SKILLS_DIR = "skills";

async function syncGeminiExtension({ check, errors, written }) {
  const manifestPath = path.join(pluginDir, "plugin.json");
  const mcpPath = path.join(pluginDir, ".mcp.json");
  let source;
  let mcp;
  try {
    source = JSON.parse(await fs.readFile(path.join(repoRoot, manifestPath), "utf8"));
    mcp = JSON.parse(await fs.readFile(path.join(repoRoot, mcpPath), "utf8"));
  } catch (error) {
    errors.push(`Could not read ${manifestPath} and ${mcpPath} to render ${GEMINI_EXTENSION_MANIFEST}: ${error.message}`);
    return;
  }

  const url = mcp.mcpServers?.hamster?.url;
  if (typeof url !== "string") {
    errors.push(`${mcpPath} must define mcpServers.hamster.url to render ${GEMINI_EXTENSION_MANIFEST}.`);
    return;
  }

  await syncGeneratedFile({
    check,
    errors,
    written,
    target: GEMINI_EXTENSION_MANIFEST,
    rendered: `${JSON.stringify(
      {
        name: source.name,
        version: source.version,
        description: source.description,
        mcpServers: { hamster: { httpUrl: url } },
      },
      null,
      2
    )}\n`,
    source: `${manifestPath} and ${mcpPath}`,
  });
}

// Maps each regular file under `dir` to the digest of its bytes and its
// executable bit, keyed by its path relative to `dir`. Anything else, such as a
// symbolic link, goes in `others` so a link to the source cannot pass as a copy.
async function readTree(dir, base = dir, files = new Map(), others = []) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    const relative = path.relative(base, entryPath);
    if (entry.isDirectory()) {
      await readTree(entryPath, base, files, others);
    } else if (entry.isFile()) {
      const [bytes, info] = await Promise.all([fs.readFile(entryPath), fs.stat(entryPath)]);
      files.set(relative, { digest: digest(bytes), executable: (info.mode & 0o111) !== 0 });
    } else {
      others.push(relative);
    }
  }
  return { files, others };
}

async function syncGeminiSkills({ check, errors, written }) {
  const sourceDir = path.join(pluginDir, "skills");
  const targetPath = path.join(repoRoot, GEMINI_SKILLS_DIR);

  if (!check) {
    await fs.rm(targetPath, { recursive: true, force: true });
    await fs.cp(path.join(repoRoot, sourceDir), targetPath, { recursive: true });
    written.push(`${GEMINI_SKILLS_DIR}/`);
    return;
  }

  let target;
  try {
    if (!(await isRealDirectory(targetPath))) {
      errors.push(`${GEMINI_SKILLS_DIR}/ must be a generated directory, not a link. Run \`node scripts/sync-adapters.mjs\`.`);
      return;
    }
    target = await readTree(targetPath);
  } catch (error) {
    errors.push(
      error.code === "ENOENT"
        ? `Generated ${GEMINI_SKILLS_DIR}/ is missing. Run \`node scripts/sync-adapters.mjs\`.`
        : `Could not read ${GEMINI_SKILLS_DIR}/: ${error.message}`
    );
    return;
  }
  const source = await readTree(path.join(repoRoot, sourceDir));

  const drifted = new Set(target.others);
  for (const [relative, file] of source.files) {
    const copy = target.files.get(relative);
    if (!copy || copy.digest !== file.digest || copy.executable !== file.executable) {
      drifted.add(relative);
    }
  }
  for (const relative of target.files.keys()) {
    if (!source.files.has(relative)) {
      drifted.add(relative);
    }
  }
  for (const relative of [...drifted].sort()) {
    errors.push(
      `${path.join(GEMINI_SKILLS_DIR, relative)} is out of sync with ${sourceDir}/. Run \`node scripts/sync-adapters.mjs\`.`
    );
  }
}

// readdir follows a symbolic link, so only lstat tells a generated directory
// from a link to the source. Throws ENOENT when the path is missing.
async function isRealDirectory(targetPath) {
  return (await fs.lstat(targetPath)).isDirectory();
}

async function main() {
  const check = process.argv.includes("--check");
  const { errors, written } = await syncAdapters({ check });

  if (errors.length > 0) {
    console.error(check ? "Adapter check failed:" : "Adapter sync failed:");
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  if (check) {
    console.log("Adapter check passed.");
    return;
  }

  for (const file of written) {
    console.log(`Wrote ${file}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
