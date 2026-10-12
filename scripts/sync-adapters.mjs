#!/usr/bin/env node

/**
 * Generate plugins/hamster/agents/*.md as native-agent projections over the
 * canonical skill-local prompt bodies under
 * plugins/hamster/skills/ship/references/agents/, and the root
 * .grok-plugin/plugin.json and package.json from plugins/hamster/plugin.json.
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

  await syncRootManifests({ check, errors, written });

  return { errors, written };
}

// `grok plugin install gethamster/plugin` reads a manifest at the source root
// and never follows a marketplace catalog. This root manifest points Grok into
// plugins/hamster, so the published command and existing installs keep
// working. `agents` must stay a directory string, since Grok loads no agents
// from an array of files.
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
      agents: "./plugins/hamster/agents",
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
    const rendered = `${JSON.stringify(render(source), null, 2)}\n`;
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
        continue;
      }
      if (existing.replace(/\r\n/g, "\n") !== rendered) {
        errors.push(
          `${target} is out of sync with ${path.relative(repoRoot, sourcePath)}. Run \`node scripts/sync-adapters.mjs\`.`
        );
      }
      continue;
    }

    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, rendered, "utf8");
    written.push(target);
  }
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
