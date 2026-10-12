#!/usr/bin/env node

/**
 * Generate plugins/hamster/agents/*.md as native-agent projections over the
 * canonical skill-local prompt bodies under
 * plugins/hamster/skills/ship/references/agents/, the root
 * .grok-plugin/plugin.json from plugins/hamster/plugin.json, and the Gemini
 * extension at the root: gemini-extension.json, skills/, and agents/.
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
const agentsDir = path.join(pluginDir, "agents");

// Descriptions stay single-line: cursor.directory and validate-plugin.mjs read
// frontmatter line by line, so a `|` block scalar is listed as a literal pipe.
const AGENTS = [
  {
    id: "task-executor",
    model: "opus",
    color: "blue",
    description:
      "Implements all subtasks of a single parent Hamster Studio task (HAM-XXX). Reads the parent and all its subtask files from .hamster/, loads project context (project skills, blueprints, methods), discovers relevant codebase context just-in-time, implements all subtasks sequentially in one session, updates task statuses, and reports all changes. Execution-only with leeway: tasks are pre-generated upstream and trusted by default, but stale references are adapted (and documented), and genuine plan defects are escalated as PLAN_ISSUE rather than blindly implemented. Does NOT run project validation — that is handled by the orchestrator after all parallel executors complete.",
  },
  {
    id: "wave-reviewer",
    model: "sonnet",
    color: "green",
    description:
      "Reviews and simplifies the cumulative code changes of one execution wave (one or more parent tasks). Phase 1 reviews the full wave diff for convention compliance, quality, security, and completeness — producing a per-parent PASS or NEEDS_FIXES verdict. Because it sees the whole wave, it also catches cross-parent integration issues that per-task review would miss. For parents that pass, Phase 2 applies surgical simplification while preserving all functionality. Runs once per wave, after all parallel task-executors complete and validation/tests pass.",
  },
];

// Gemini CLI validates agent frontmatter strictly: it rejects `color`, and it
// would send `model` to Gemini as a model name, so its variant leaves out both.
function renderAgent({ id, model, color, description }, body, { gemini = false } = {}) {
  const normalizedBody = body.replace(/\r\n/g, "\n").replace(/\s+$/g, "") + "\n";
  return [
    "---",
    `name: ${id}`,
    // Double-quoted: a plain scalar cannot hold ": " or " #", and Claude Code
    // parses this frontmatter as real YAML. JSON string syntax is valid YAML.
    `description: ${JSON.stringify(description)}`,
    ...(gemini ? [] : [`model: ${model}`, `color: ${color}`]),
    "---",
    "",
    normalizedBody,
  ].join("\n");
}

function digest(text) {
  return createHash("sha256").update(text).digest("hex");
}

export async function syncAdapters({ check = false } = {}) {
  const errors = [];
  const written = [];
  const removed = [];

  // Runs first so a write never lands through a link into plugins/hamster.
  await syncGeminiAgentsDir({ check, errors, removed });

  for (const agent of AGENTS) {
    const sourcePath = path.join(repoRoot, pluginDir, "skills", "ship", "references", "agents", `${agent.id}.md`);

    if (/[\r\n]/.test(agent.description)) {
      errors.push(`Agent ${agent.id}: description must be single-line; a newline breaks the generated frontmatter.`);
      continue;
    }

    let body;
    try {
      body = await fs.readFile(sourcePath, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") {
        errors.push(`Missing canonical agent body: ${path.relative(repoRoot, sourcePath)}`);
      } else {
        errors.push(
          `Could not read canonical agent body ${path.relative(repoRoot, sourcePath)}: ${error.message}`
        );
      }
      continue;
    }

    await syncGeneratedFile({
      check,
      errors,
      written,
      target: path.join(agentsDir, `${agent.id}.md`),
      rendered: renderAgent(agent, body),
      source: path.relative(repoRoot, sourcePath),
    });
    await syncGeneratedFile({
      check,
      errors,
      written,
      target: path.join(GEMINI_AGENTS_DIR, `${agent.id}.md`),
      rendered: renderAgent(agent, body, { gemini: true }),
      source: path.relative(repoRoot, sourcePath),
    });
  }

  await syncGrokRootManifest({ check, errors, written });
  await syncGeminiExtension({ check, errors, written });
  await syncGeminiSkills({ check, errors, written });

  return { errors, written, removed };
}

// `grok plugin install gethamster/plugin` reads a manifest at the source root
// and never follows a marketplace catalog. This root manifest points Grok into
// plugins/hamster, so the published command and existing installs keep
// working. Its name, version, and description come from the plugin's own
// plugin.json; `agents` must stay a directory string, since Grok loads no
// agents from an array of files.
export const GROK_ROOT_MANIFEST = path.join(".grok-plugin", "plugin.json");

async function syncGrokRootManifest({ check, errors, written }) {
  const sourcePath = path.join(repoRoot, pluginDir, "plugin.json");
  let source;
  try {
    source = JSON.parse(await fs.readFile(sourcePath, "utf8"));
  } catch (error) {
    errors.push(`Could not read ${path.relative(repoRoot, sourcePath)} to render ${GROK_ROOT_MANIFEST}: ${error.message}`);
    return;
  }

  const rendered = `${JSON.stringify(
    {
      name: source.name,
      version: source.version,
      description: source.description,
      skills: "./plugins/hamster/skills",
      agents: "./plugins/hamster/agents",
      mcpServers: "./plugins/hamster/.mcp.json",
    },
    null,
    2
  )}\n`;

  const targetPath = path.join(repoRoot, GROK_ROOT_MANIFEST);
  if (check) {
    let existing;
    try {
      existing = await fs.readFile(targetPath, "utf8");
    } catch (error) {
      errors.push(
        error.code === "ENOENT"
          ? `Generated ${GROK_ROOT_MANIFEST} is missing. Run \`node scripts/sync-adapters.mjs\`.`
          : `Could not read ${GROK_ROOT_MANIFEST}: ${error.message}`
      );
      return;
    }
    if (existing.replace(/\r\n/g, "\n") !== rendered) {
      errors.push(
        `${GROK_ROOT_MANIFEST} is out of sync with ${path.relative(repoRoot, sourcePath)}. Run \`node scripts/sync-adapters.mjs\`.`
      );
    }
    return;
  }

  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, rendered, "utf8");
  written.push(GROK_ROOT_MANIFEST);
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
// at its root, and Gemini loads skills/ and agents/ only from beside that file.
// agy also installs a root that holds gemini-extension.json, from the same
// skills/ and agents/. These are generated copies of plugins/hamster, which
// stays the source every other client installs.
export const GEMINI_EXTENSION_MANIFEST = "gemini-extension.json";
export const GEMINI_SKILLS_DIR = "skills";
export const GEMINI_AGENTS_DIR = "agents";

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

// Gemini and agy load every file in the root agents/, so it is a real
// directory that holds only the generated agents. A missing directory is left
// to the agent loop, which reports or writes each file.
async function syncGeminiAgentsDir({ check, errors, removed }) {
  const dirPath = path.join(repoRoot, GEMINI_AGENTS_DIR);
  let entries;
  try {
    if (!(await isRealDirectory(dirPath))) {
      if (check) {
        errors.push(`${GEMINI_AGENTS_DIR}/ must be a generated directory, not a link. Run \`node scripts/sync-adapters.mjs\`.`);
      } else {
        await fs.rm(dirPath, { force: true });
        removed.push(GEMINI_AGENTS_DIR);
      }
      return;
    }
    entries = await fs.readdir(dirPath);
  } catch (error) {
    if (error.code === "ENOENT") {
      return;
    }
    throw error;
  }

  const expected = new Set(AGENTS.map((agent) => `${agent.id}.md`));
  for (const name of entries.filter((entry) => !expected.has(entry))) {
    const stray = path.join(GEMINI_AGENTS_DIR, name);
    if (check) {
      errors.push(`${stray} is not a generated agent. Run \`node scripts/sync-adapters.mjs\`.`);
    } else {
      await fs.rm(path.join(repoRoot, stray), { recursive: true, force: true });
      removed.push(stray);
    }
  }
}

async function main() {
  const check = process.argv.includes("--check");
  const { errors, written, removed } = await syncAdapters({ check });

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

  for (const file of removed) {
    console.log(`Removed ${file}`);
  }
  for (const file of written) {
    console.log(`Wrote ${file}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
