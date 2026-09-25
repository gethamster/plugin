#!/usr/bin/env node

/**
 * Generate root agents/*.md as Claude Code native-agent projections over the
 * canonical skill-local prompt bodies under skills/ship/references/agents/,
 * then mirror what Claude Code loads into claude/, the plugin folder submitted
 * to the Claude plugin directory.
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

// The Claude plugin directory reads and scans only the submitted plugin folder,
// and skips symbolic links, so claude/ holds regular-file copies of exactly what
// Claude Code loads. The repo's maintainer scripts, CI, listing images, and other
// clients' manifests stay out of it. The root keeps the source of truth.
const CLAUDE_PACKAGE_DIR = "claude";
const CLAUDE_PACKAGE_SOURCES = [".claude-plugin/plugin.json", ".mcp.json", "LICENSE", "agents", "skills"];
// Written for the directory listing, not copied from the root.
const CLAUDE_PACKAGE_OWN_FILES = new Set(["README.md"]);

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
    const sourcePath = path.join(
      repoRoot,
      "skills",
      "ship",
      "references",
      "agents",
      `${agent.id}.md`
    );
    const targetPath = path.join(repoRoot, "agents", `${agent.id}.md`);

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
          errors.push(
            `Could not read generated agent ${path.relative(repoRoot, targetPath)}: ${error.message}`
          );
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

  const removed = [];
  await syncClaudePackage({ check, errors, written, removed });
  return { errors, written, removed };
}

async function listFiles(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  let stat;
  try {
    stat = await fs.lstat(absolutePath);
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
  if (!stat.isDirectory()) {
    return [relativePath];
  }
  const files = [];
  for (const entry of await fs.readdir(absolutePath)) {
    files.push(...(await listFiles(path.join(relativePath, entry))));
  }
  return files;
}

async function syncClaudePackage({ check, errors, written, removed }) {
  // Each root file lands at the same relative path inside claude/.
  const expected = new Set();
  for (const source of CLAUDE_PACKAGE_SOURCES) {
    const files = await listFiles(source);
    if (files.length === 0) {
      errors.push(`Claude package source is missing: ${source}.`);
    }
    for (const file of files) {
      expected.add(file);
    }
  }

  const present = new Set(
    (await listFiles(CLAUDE_PACKAGE_DIR)).map((file) => path.relative(CLAUDE_PACKAGE_DIR, file))
  );
  const rerun = "Run `node scripts/sync-adapters.mjs`.";

  for (const own of CLAUDE_PACKAGE_OWN_FILES) {
    if (!present.has(own)) {
      errors.push(`${path.join(CLAUDE_PACKAGE_DIR, own)} is missing; it is written by hand, not generated.`);
    }
  }

  for (const file of present) {
    if (expected.has(file) || CLAUDE_PACKAGE_OWN_FILES.has(file)) {
      continue;
    }
    const target = path.join(CLAUDE_PACKAGE_DIR, file);
    if (check) {
      errors.push(`${target} has no source at the repository root. ${rerun}`);
    } else {
      await fs.rm(path.join(repoRoot, target));
      removed.push(target);
    }
  }

  for (const file of expected) {
    const target = path.join(CLAUDE_PACKAGE_DIR, file);
    const sourceBytes = await fs.readFile(path.join(repoRoot, file));
    let targetBytes = null;
    if (present.has(file)) {
      targetBytes = await fs.readFile(path.join(repoRoot, target));
    }
    if (targetBytes !== null && sourceBytes.equals(targetBytes)) {
      continue;
    }
    if (check) {
      errors.push(
        targetBytes === null ? `${target} is missing. ${rerun}` : `${target} is out of sync with ${file}. ${rerun}`
      );
      continue;
    }
    await fs.mkdir(path.dirname(path.join(repoRoot, target)), { recursive: true });
    await fs.copyFile(path.join(repoRoot, file), path.join(repoRoot, target));
    written.push(target);
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

  for (const file of written) {
    console.log(`Wrote ${file}`);
  }
  for (const file of removed) {
    console.log(`Removed ${file}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
