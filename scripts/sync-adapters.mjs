#!/usr/bin/env node

/**
 * Generate plugins/hamster/agents/*.md as native-agent projections over the
 * canonical skill-local prompt bodies under
 * plugins/hamster/skills/ship/references/agents/, and the root
 * .grok-plugin/plugin.json from plugins/hamster/plugin.json.
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

function renderAgent({ id, model, color, description }, body) {
  const normalizedBody = body.replace(/\r\n/g, "\n").replace(/\s+$/g, "") + "\n";
  return [
    "---",
    `name: ${id}`,
    // Double-quoted: a plain scalar cannot hold ": " or " #", and Claude Code
    // parses this frontmatter as real YAML. JSON string syntax is valid YAML.
    `description: ${JSON.stringify(description)}`,
    `model: ${model}`,
    `color: ${color}`,
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

    const rendered = renderAgent(agent, body);

    const targetPath = path.join(repoRoot, agentsDir, `${agent.id}.md`);
    if (check) {
      let existing;
      try {
        existing = await fs.readFile(targetPath, "utf8");
      } catch (error) {
        if (error.code === "ENOENT") {
          errors.push(
            `Generated agent missing: ${path.relative(repoRoot, targetPath)}. Run \`node scripts/sync-adapters.mjs\`.`
          );
        } else {
          errors.push(`Could not read generated agent ${path.relative(repoRoot, targetPath)}: ${error.message}`);
        }
        continue;
      }

      if (digest(existing.replace(/\r\n/g, "\n")) !== digest(rendered)) {
        errors.push(
          `${path.relative(repoRoot, targetPath)} is out of sync with ${path.relative(repoRoot, sourcePath)}. Run \`node scripts/sync-adapters.mjs\`.`
        );
      }
      continue;
    }

    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, rendered, "utf8");
    written.push(path.relative(repoRoot, targetPath));
  }

  await syncGrokRootManifest({ check, errors, written });

  return { errors, written };
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
