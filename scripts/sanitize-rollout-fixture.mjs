#!/usr/bin/env node

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { parseArgs } from "node:util";

import {
  defaultCodexHome,
  findRolloutPathByThreadId,
  listSessions,
  redactString,
  safeJsonParse,
} from "./codex-chat-export-lib.mjs";

const SYNTHETIC_THREAD_ID = "01900000-0000-7000-8000-000000000001";
const SYNTHETIC_TIMESTAMP = "2026-01-01T00:00:00.000Z";
const SYNTHETIC_CWD = "C:\\codex-chat-export\\fixture";

function usageText() {
  return [
    "Codex Rollout Fixture Sanitizer",
    "",
    "Usage:",
    "  node scripts/sanitize-rollout-fixture.mjs --input ROLLOUT.jsonl --output fixture.jsonl",
    "  node scripts/sanitize-rollout-fixture.mjs --last --output fixture.jsonl",
    "  node scripts/sanitize-rollout-fixture.mjs --id THREAD_ID --output fixture.jsonl",
    "",
    "Options:",
    "  --input FILE             Source rollout JSONL file",
    "  --output FILE            Sanitized fixture output path",
    "  --home PATH              Override Codex home for --last or --id",
    "  --last                   Use the most recently updated session",
    "  --id THREAD_ID           Use a specific Codex thread id",
    "  --include-archived       Allow archived sessions when resolving --last or --id",
    "  --help                   Show this help text",
  ].join("\n");
}

function syntheticTimestamp(lineNumber) {
  const date = new Date(SYNTHETIC_TIMESTAMP);
  date.setSeconds(date.getSeconds() + Math.max(0, lineNumber - 1));
  return date.toISOString();
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value ?? "",
  );
}

function shouldPreserveStringKey(key) {
  return new Set([
    "type",
    "role",
    "phase",
    "source",
    "model_provider",
    "cli_version",
    "status",
    "format",
    "name",
    "tool_name",
  ]).has(key);
}

function sanitizeJsonString(value, context) {
  const trimmed = value.trim();
  if (!trimmed || !/^[{[]/.test(trimmed)) {
    return null;
  }

  const parsed = safeJsonParse(trimmed);
  if (!parsed) {
    return null;
  }
  return JSON.stringify(sanitizeValue(parsed, context));
}

function sanitizeString(value, context) {
  const key = context.key ?? "";
  if (isUuid(value)) {
    return SYNTHETIC_THREAD_ID;
  }
  if (key === "timestamp" || key.endsWith("_at") || key.endsWith("At")) {
    return syntheticTimestamp(context.lineNumber);
  }
  if (key === "cwd" || key === "workdir" || key === "workspace") {
    return SYNTHETIC_CWD;
  }
  if (key === "id" && context.parentKey === "payload") {
    return SYNTHETIC_THREAD_ID;
  }
  if (key === "call_id" || key === "callId") {
    return `call_fixture_${context.lineNumber}`;
  }
  if (shouldPreserveStringKey(key)) {
    return redactString(value, {
      codexHome: context.codexHome,
      homeDir: context.homeDir,
      workspace: context.workspace,
    });
  }
  if (value.includes("<user_message>")) {
    return "<user_message>\n[sanitized user message]";
  }

  const sanitizedJson = sanitizeJsonString(value, context);
  if (sanitizedJson) {
    return sanitizedJson;
  }

  return `[sanitized ${key || "text"}]`;
}

function sanitizeObjectKey(key, context) {
  const redacted = redactString(key, {
    codexHome: context.codexHome,
    homeDir: context.homeDir,
    workspace: context.workspace,
  });
  const looksLikePath = /[A-Za-z]:\\|\\|\/|\.codex|\.jsonl|\.mjs|\.md|\.yml|\.yaml|\.json/i.test(key);
  if (looksLikePath || redacted !== key) {
    return `sanitized_key_${context.entryIndex + 1}`;
  }
  return key;
}

function sanitizeValue(value, context = {}) {
  if (typeof value === "string") {
    return sanitizeString(value, context);
  }
  if (Array.isArray(value)) {
    return value.map((item, index) =>
      sanitizeValue(item, {
        ...context,
        key: String(index),
        parentKey: context.key,
      }),
    );
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue], entryIndex) => {
        const nestedContext = {
          ...context,
          key,
          parentKey: context.key,
          entryIndex,
        };
        return [
          sanitizeObjectKey(key, nestedContext),
          sanitizeValue(nestedValue, nestedContext),
        ];
      }),
    );
  }
  return value;
}

async function resolveInputPath(options) {
  if (options.input) {
    return path.resolve(options.input);
  }

  const codexHome = path.resolve(options.home ?? defaultCodexHome());
  if (options.id) {
    const rolloutPath = await findRolloutPathByThreadId(codexHome, options.id, {
      includeArchived: options.includeArchived,
    });
    if (!rolloutPath) {
      throw new Error(`Could not locate rollout for thread id ${options.id}.`);
    }
    return rolloutPath;
  }

  if (options.last) {
    const sessions = await listSessions(codexHome, {
      includeArchived: options.includeArchived,
    });
    if (sessions.length === 0) {
      throw new Error("No Codex sessions found.");
    }
    return sessions[0].rolloutPath;
  }

  throw new Error("No input provided. Use --input FILE, --last, or --id THREAD_ID.");
}

async function sanitizeRolloutFile(inputPath, outputPath, options = {}) {
  await fsp.mkdir(path.dirname(outputPath), { recursive: true });
  const input = fs.createReadStream(inputPath, { encoding: "utf8" });
  const output = fs.createWriteStream(outputPath, { encoding: "utf8" });
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  let lineNumber = 0;

  for await (const line of rl) {
    lineNumber += 1;
    if (!line.trim()) {
      continue;
    }

    const parsed = safeJsonParse(line);
    if (!parsed) {
      output.write(`{sanitized malformed jsonl line ${lineNumber}\n`);
      continue;
    }

    const sanitized = sanitizeValue(parsed, {
      lineNumber,
      codexHome: options.codexHome,
      homeDir: options.homeDir,
      workspace: options.workspace,
    });
    output.write(`${JSON.stringify(sanitized)}\n`);
  }

  rl.close();
  input.destroy();
  await new Promise((resolve, reject) => {
    output.once("error", reject);
    output.end(resolve);
  });
}

async function main() {
  const { values } = parseArgs({
    options: {
      help: { type: "boolean", default: false },
      input: { type: "string" },
      output: { type: "string" },
      home: { type: "string" },
      last: { type: "boolean", default: false },
      id: { type: "string" },
      "include-archived": { type: "boolean", default: false },
    },
  });

  if (values.help) {
    process.stdout.write(`${usageText()}\n`);
    return;
  }

  if (!values.output) {
    throw new Error("Missing --output FILE.");
  }

  const inputPath = await resolveInputPath({
    input: values.input,
    home: values.home,
    last: values.last,
    id: values.id,
    includeArchived: Boolean(values["include-archived"]),
  });
  const outputPath = path.resolve(values.output);
  const codexHome = path.resolve(values.home ?? defaultCodexHome());

  await sanitizeRolloutFile(inputPath, outputPath, {
    codexHome,
    homeDir: process.env.USERPROFILE ?? process.env.HOME,
    workspace: process.cwd(),
  });

  process.stdout.write(`${outputPath}\n`);
}

main().catch((error) => {
  process.stderr.write(`sanitize-rollout-fixture: ${error.message}\n`);
  process.exitCode = 1;
});
