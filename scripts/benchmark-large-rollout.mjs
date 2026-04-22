#!/usr/bin/env node

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { parseArgs } from "node:util";
import { promisify } from "node:util";
import { performance } from "node:perf_hooks";

const execFileAsync = promisify(execFile);
const THREAD_ID = "019d9522-100c-70f3-8a41-6e70be1b917f";
const CLI_PATH = path.resolve("scripts/codex-chat-export.mjs");

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function rolloutLine(value) {
  return `${JSON.stringify(value)}\n`;
}

function buildTurn(index) {
  const timestamp = new Date(Date.UTC(2026, 3, 16, 7, 13, index % 60)).toISOString();
  const prompt = `Synthetic user prompt ${index}: export this Codex session with enough content to simulate a long chat.`;
  const assistant = `Synthetic assistant response ${index}: completed the requested step and recorded relevant details.`;
  return [
    {
      type: "response_item",
      timestamp,
      payload: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: prompt }],
      },
    },
    {
      type: "event_msg",
      timestamp,
      payload: {
        type: "user_message",
        message: `<user_message>\n${prompt}`,
      },
    },
    {
      type: "response_item",
      timestamp,
      payload: {
        type: "reasoning",
        summary: [{ type: "summary_text", text: `Synthetic reasoning summary ${index}.` }],
      },
    },
    {
      type: "event_msg",
      timestamp,
      payload: {
        type: "agent_message",
        phase: "commentary",
        message: `Synthetic progress update ${index}.`,
      },
    },
    {
      type: "response_item",
      timestamp,
      payload: {
        type: "function_call",
        name: "exec_command",
        arguments: JSON.stringify({
          cmd: "echo benchmark",
          index,
          cwd: "C:\\benchmark\\codex-chat-export",
        }),
      },
    },
    {
      type: "response_item",
      timestamp,
      payload: {
        type: "function_call_output",
        call_id: `call_benchmark_${index}`,
        output: `Synthetic tool output ${index}\n${"x".repeat(180)}`,
      },
    },
    {
      type: "response_item",
      timestamp,
      payload: {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: assistant }],
      },
    },
  ];
}

async function createSyntheticHome(turns, options = {}) {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "codex-chat-export-benchmark-"));
  const rolloutDir = path.join(home, "sessions", "2026", "04", "16");
  const rolloutPath = path.join(
    rolloutDir,
    `rollout-2026-04-16T12-42-10-${THREAD_ID}.jsonl`,
  );
  await fs.mkdir(rolloutDir, { recursive: true });

  let content = "";
  content += rolloutLine({
    type: "session_meta",
    payload: {
      id: THREAD_ID,
      timestamp: "2026-04-16T07:12:10.775Z",
      cwd: "C:\\benchmark\\codex-chat-export",
      source: "cli",
      model_provider: "openai",
      cli_version: "benchmark",
    },
  });

  for (let index = 1; index <= turns; index += 1) {
    for (const line of buildTurn(index)) {
      content += rolloutLine(line);
    }
    if (
      options.malformedInterval > 0 &&
      index % options.malformedInterval === 0
    ) {
      content += `{malformed benchmark line ${index}\n`;
    }
  }

  content += rolloutLine({
    type: "event_msg",
    timestamp: "2026-04-16T08:00:00.000Z",
    payload: {
      type: "token_count",
      info: {
        total_token_usage: {
          input_tokens: turns * 40,
          output_tokens: turns * 20,
          total_tokens: turns * 60,
        },
      },
    },
  });

  await fs.writeFile(rolloutPath, content, "utf8");
  return {
    home,
    rolloutPath,
    threadId: THREAD_ID,
  };
}

async function timedRun(label, args, outputPath = null) {
  const started = performance.now();
  await execFileAsync(process.execPath, [CLI_PATH, ...args], {
    maxBuffer: 1024 * 1024 * 1024,
  });
  const elapsedMs = performance.now() - started;
  const bytes = outputPath ? (await fs.stat(outputPath)).size : null;
  return {
    label,
    elapsedMs,
    bytes,
  };
}

function formatBytes(bytes) {
  if (bytes === null) {
    return "-";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function printResults(turns, results) {
  process.stdout.write(`codex-chat-export benchmark (${turns} synthetic turns)\n\n`);
  process.stdout.write("| Scenario | Time | Output size |\n");
  process.stdout.write("| --- | ---: | ---: |\n");
  for (const result of results) {
    process.stdout.write(
      `| ${result.label} | ${result.elapsedMs.toFixed(1)} ms | ${formatBytes(result.bytes)} |\n`,
    );
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      turns: { type: "string", default: "1000" },
      "malformed-interval": { type: "string", default: "0" },
      keep: { type: "boolean", default: false },
    },
  });
  const turns = parsePositiveInteger(values.turns, 1000);
  const malformedInterval = parsePositiveInteger(values["malformed-interval"], 0);
  const fixture = await createSyntheticHome(turns, {
    malformedInterval,
  });
  const outputDir = path.join(fixture.home, "outputs");
  await fs.mkdir(outputDir, { recursive: true });

  const markdownPath = path.join(outputDir, "chat.md");
  const compactJsonPath = path.join(outputDir, "chat.compact.json");
  const fullJsonPath = path.join(outputDir, "chat.full.json");
  const bundlePath = path.join(outputDir, "bundle");

  const common = ["--home", fixture.home, "--id", fixture.threadId];
  const results = [];
  results.push(await timedRun("list", ["--home", fixture.home, "--list", "--limit", "5"]));
  results.push(await timedRun("markdown", [...common, "--output", markdownPath], markdownPath));
  results.push(
    await timedRun(
      "compact json",
      [...common, "--format", "json", "--no-raw", "--output", compactJsonPath],
      compactJsonPath,
    ),
  );
  results.push(
    await timedRun("full json", [...common, "--format", "json", "--output", fullJsonPath], fullJsonPath),
  );
  results.push(await timedRun("compact bundle", [...common, "--bundle", bundlePath, "--no-raw"]));
  results.push(await timedRun("schema validate", [...common, "--validate"]));

  printResults(turns, results);
  if (values.keep) {
    process.stdout.write(`\nFixture kept at: ${fixture.home}\n`);
  } else {
    await fs.rm(fixture.home, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`benchmark-large-rollout: ${error.message}\n`);
  process.exitCode = 1;
});
