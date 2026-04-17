#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";

import {
  buildExportDocument,
  defaultCodexHome,
  findRolloutPathByThreadId,
  formatSessionRow,
  isUuid,
  listSessions,
  pickMatchingSession,
  renderMarkdown,
  renderText,
  usageText,
} from "./codex-chat-export-lib.mjs";

for (const stream of [process.stdout, process.stderr]) {
  stream.on("error", (error) => {
    if (error?.code === "EPIPE") {
      process.exit(0);
    }
    throw error;
  });
}

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function writeOutput(outputPath, content) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, content, "utf8");
}

function buildBundleManifest(document) {
  return {
    version: 1,
    exportedAt: document.exportedAt,
    thread: document.thread,
    stats: document.stats,
    source: document.source,
    files: [
      {
        path: "chat.md",
        format: "md",
        description: "Human-readable Markdown conversation export.",
      },
      {
        path: "chat.json",
        format: "json",
        description: "Full-fidelity structured export including raw rollout lines.",
      },
      {
        path: "manifest.json",
        format: "json",
        description: "Bundle metadata and file inventory.",
      },
    ],
  };
}

async function writeBundle(bundleDir, document, options) {
  await fs.mkdir(bundleDir, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(bundleDir, "chat.md"), `${renderMarkdown(document, options)}\n`, "utf8"),
    fs.writeFile(path.join(bundleDir, "chat.json"), `${JSON.stringify(document, null, 2)}\n`, "utf8"),
    fs.writeFile(
      path.join(bundleDir, "manifest.json"),
      `${JSON.stringify(buildBundleManifest(document), null, 2)}\n`,
      "utf8",
    ),
  ]);
}

async function resolveTargetSession(options) {
  if (options.current) {
    const threadId = process.env.CODEX_THREAD_ID;
    if (!threadId) {
      throw new Error("CODEX_THREAD_ID is not set in this shell.");
    }
    const rolloutPath = await findRolloutPathByThreadId(options.home, threadId, {
      includeArchived: options.includeArchived,
    });
    if (!rolloutPath) {
      throw new Error(`Could not locate rollout for current thread ${threadId}.`);
    }
    return { rolloutPath };
  }

  if (options.id) {
    const rolloutPath = await findRolloutPathByThreadId(options.home, options.id, {
      includeArchived: options.includeArchived,
    });
    if (!rolloutPath) {
      throw new Error(`Could not locate rollout for thread id ${options.id}.`);
    }
    return { rolloutPath };
  }

  const sessions = await listSessions(options.home, {
    includeArchived: options.includeArchived,
  });

  if (options.last) {
    if (sessions.length === 0) {
      throw new Error("No Codex sessions found.");
    }
    return { rolloutPath: sessions[0].rolloutPath };
  }

  if (options.match) {
    const matched = pickMatchingSession(sessions, options.match);
    if (!matched) {
      throw new Error(`Could not find a session matching "${options.match}".`);
    }
    return { rolloutPath: matched.rolloutPath };
  }

  throw new Error("No session selector provided. Use --last, --current, --id, or --match.");
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      help: { type: "boolean", default: false },
      home: { type: "string" },
      format: { type: "string", default: "md" },
      output: { type: "string" },
      bundle: { type: "string" },
      last: { type: "boolean", default: false },
      current: { type: "boolean", default: false },
      id: { type: "string" },
      match: { type: "string" },
      list: { type: "boolean", default: false },
      limit: { type: "string", default: "20" },
      "include-archived": { type: "boolean", default: false },
      "include-bootstrap": { type: "boolean", default: false },
    },
  });

  if (values.help) {
    process.stdout.write(`${usageText()}\n`);
    return;
  }

  const home = path.resolve(values.home ?? defaultCodexHome());
  const positionalQuery = positionals[0] ?? null;
  const format = String(values.format ?? "md").toLowerCase();
  if (!["md", "txt", "json"].includes(format)) {
    throw new Error(`Unsupported format "${format}". Use md, txt, or json.`);
  }

  const options = {
    home,
    format,
    output: values.output ? path.resolve(values.output) : null,
    bundle: values.bundle ? path.resolve(values.bundle) : null,
    last: Boolean(values.last),
    current: Boolean(values.current),
    id: values.id ? String(values.id).trim() : null,
    match: values.match ? String(values.match).trim() : null,
    list: Boolean(values.list),
    limit: parseInteger(values.limit, 20),
    includeArchived: Boolean(values["include-archived"]),
    includeBootstrap: Boolean(values["include-bootstrap"]),
  };

  if (options.output && options.bundle) {
    throw new Error("Use either --output FILE or --bundle DIR, not both.");
  }

  if (!options.id && !options.match && positionalQuery) {
    if (isUuid(positionalQuery)) {
      options.id = positionalQuery;
    } else {
      options.match = positionalQuery;
    }
  }

  if (options.list) {
    const sessions = await listSessions(home, {
      includeArchived: options.includeArchived,
    });
    const limited = sessions.slice(0, options.limit);
    process.stdout.write("updated_at\tstate\tthread_id\tname_or_preview\tcwd\n");
    for (const session of limited) {
      process.stdout.write(`${formatSessionRow(session)}\n`);
    }
    return;
  }

  const target = await resolveTargetSession(options);
  const document = await buildExportDocument(home, target.rolloutPath, {
    includeBootstrap: options.includeBootstrap,
  });

  if (options.bundle) {
    await writeBundle(options.bundle, document, options);
    process.stdout.write(`${options.bundle}\n`);
    return;
  }

  let content;
  if (format === "json") {
    content = `${JSON.stringify(document, null, 2)}\n`;
  } else if (format === "txt") {
    content = `${renderText(document, options)}\n`;
  } else {
    content = `${renderMarkdown(document, options)}\n`;
  }

  if (options.output) {
    await writeOutput(options.output, content);
    process.stdout.write(`${options.output}\n`);
    return;
  }

  process.stdout.write(content);
}

main().catch((error) => {
  process.stderr.write(`codex-chat-export: ${error.message}\n`);
  process.exitCode = 1;
});
