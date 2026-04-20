import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import {
  buildExportDocument,
  classifyResponseItems,
  deriveDisplayTitle,
  extractMessageText,
  extractReasoningText,
  formatStructuredValue,
  listSessions,
  parseTimestampUuidFromFilename,
  pickMatchingSession,
  redactExportDocument,
  redactString,
  renderMarkdown,
  stripUserMessagePrefix,
} from "./codex-chat-export-lib.mjs";

const execFileAsync = promisify(execFile);
const CLI_PATH = path.resolve("scripts/codex-chat-export.mjs");

function makeRolloutFilename(timestamp, threadId) {
  return `rollout-${timestamp}-${threadId}.jsonl`;
}

function buildSessionMeta({ threadId, timestamp, cwd = "C:\\fixture", archived = false }) {
  return {
    type: "session_meta",
    payload: {
      id: threadId,
      timestamp,
      cwd,
      source: archived ? "archive" : "cli",
      model_provider: "openai",
      cli_version: "0.1.0",
    },
  };
}

function buildFixtureLines(threadId, userPrompt, assistantText = "Done.", options = {}) {
  const ts = "2026-04-16T07:13:48.409Z";
  const commentaryTs = "2026-04-16T07:14:04.158Z";
  return [
    buildSessionMeta({
      threadId,
      timestamp: "2026-04-16T07:12:10.775Z",
      cwd: options.cwd,
      archived: options.archived,
    }),
    {
      type: "response_item",
      timestamp: ts,
      payload: {
        type: "message",
        role: "developer",
        content: [{ type: "input_text", text: "developer context" }],
      },
    },
    {
      type: "response_item",
      timestamp: ts,
      payload: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "AGENTS bootstrap" }],
      },
    },
    { type: "turn_context" },
    {
      type: "response_item",
      timestamp: ts,
      payload: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: userPrompt }],
      },
    },
    {
      type: "event_msg",
      timestamp: ts,
      payload: {
        type: "user_message",
        message: `<user_message>\n${userPrompt}`,
      },
    },
    {
      type: "response_item",
      timestamp: "2026-04-16T07:14:02.818Z",
      payload: {
        type: "reasoning",
        summary: [{ type: "summary_text", text: "Reasoning summary." }],
      },
    },
    {
      type: "event_msg",
      timestamp: commentaryTs,
      payload: {
        type: "agent_message",
        phase: "commentary",
        message: "Inspecting Codex storage.",
      },
    },
    {
      type: "response_item",
      timestamp: commentaryTs,
      payload: {
        type: "message",
        role: "assistant",
        phase: "commentary",
        content: [{ type: "output_text", text: "Inspecting Codex storage." }],
      },
    },
    {
      type: "response_item",
      timestamp: "2026-04-16T07:14:05.000Z",
      payload: {
        type: "function_call",
        name: "exec_command",
        arguments: JSON.stringify({
          cmd: "dir",
          cwd: options.cwd ?? "C:\\fixture",
          api_key: options.secret ?? "not-a-real-secret",
        }),
      },
    },
    {
      type: "response_item",
      timestamp: "2026-04-16T07:14:06.000Z",
      payload: {
        type: "function_call_output",
        call_id: "call_fixture",
        output: { ok: true, files: 3 },
      },
    },
    {
      type: "response_item",
      timestamp: "2026-04-16T07:14:08.000Z",
      payload: {
        type: "message",
        role: "assistant",
        content: [{
          type: "output_text",
          text: options.secret ? `${assistantText} token=${options.secret}` : assistantText,
        }],
      },
    },
    {
      type: "event_msg",
      timestamp: "2026-04-16T07:14:09.000Z",
      payload: {
        type: "token_count",
        info: {
          total_token_usage: {
            input_tokens: 10,
            output_tokens: 5,
            total_tokens: 15,
          },
        },
      },
    },
  ];
}

async function writeRollout(filePath, lines) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`, "utf8");
}

async function createFixtureHome() {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "codex-chat-export-"));
  const activeThreadId = "019d9522-100c-70f3-8a41-6e70be1b917f";
  const namedThreadId = "019d95c3-8bdd-72e0-b791-e6672696d242";
  const archivedThreadId = "019d880a-7e8a-7992-a46a-556fa96d12e5";

  await writeRollout(
    path.join(home, "sessions", "2026", "04", "16", makeRolloutFilename("2026-04-16T12-42-10", activeThreadId)),
    buildFixtureLines(activeThreadId, "Export my Codex chat cleanly.", "Assistant response.", {
      secret: "sk-proj-abcdefghijklmnopqrstuvwxyz1234567890",
    }),
  );
  await writeRollout(
    path.join(home, "sessions", "2026", "04", "15", makeRolloutFilename("2026-04-15T10-08-43", namedThreadId)),
    buildFixtureLines(namedThreadId, "Second fixture prompt.", "Named session response.", {
      cwd: "D:\\workspace\\fixture",
    }),
  );
  await writeRollout(
    path.join(home, "archived_sessions", makeRolloutFilename("2026-04-14T09-12-30", archivedThreadId)),
    buildFixtureLines(archivedThreadId, "Archived fixture prompt.", "Archived response.", {
      archived: true,
      cwd: "D:\\archive",
    }),
  );

  await fs.writeFile(
    path.join(home, "session_index.jsonl"),
    `${JSON.stringify({
      id: namedThreadId,
      thread_name: "Named Fixture Session",
      updated_at: "2026-04-15T10:08:52.699Z",
      text: "Named preview",
    })}\n`,
    "utf8",
  );

  return {
    home,
    activeThreadId,
    namedThreadId,
    archivedThreadId,
  };
}

test("parseTimestampUuidFromFilename parses rollout names", () => {
  const parsed = parseTimestampUuidFromFilename(
    "rollout-2026-04-16T12-42-10-019d9522-100c-70f3-8a41-6e70be1b917f.jsonl",
  );
  assert.ok(parsed);
  assert.equal(parsed.threadId, "019d9522-100c-70f3-8a41-6e70be1b917f");
  assert.equal(parsed.createdAt.toISOString(), "2026-04-16T12:42:10.000Z");
});

test("classifyResponseItems separates bootstrap user context from the real user turn", () => {
  const lines = [
    {
      type: "response_item",
      payload: {
        type: "message",
        role: "developer",
        content: [{ text: "developer context" }],
      },
    },
    {
      type: "response_item",
      payload: {
        type: "message",
        role: "user",
        content: [{ text: "AGENTS instructions" }],
      },
    },
    { type: "turn_context" },
    {
      type: "response_item",
      payload: {
        type: "message",
        role: "user",
        content: [{ text: "real question" }],
      },
    },
    {
      type: "event_msg",
      payload: {
        type: "user_message",
        message: "real question",
      },
    },
  ];

  const classified = classifyResponseItems(lines);
  assert.deepEqual([...classified.bootstrapMessageIndexes], [1]);
  assert.deepEqual([...classified.actualUserMessageIndexes], [3]);
});

test("extractMessageText keeps text parts and placeholders", () => {
  const text = extractMessageText([
    { type: "input_text", text: "hello" },
    { type: "input_image" },
    { type: "output_text", text: "world" },
  ]);
  assert.equal(text, "hello\n\n[Image]\n\nworld");
});

test("extractReasoningText joins summary blocks", () => {
  const text = extractReasoningText({
    summary: [
      { type: "summary_text", text: "first block" },
      { type: "summary_text", text: "second block" },
    ],
  });
  assert.equal(text, "first block\n\nsecond block");
});

test("stripUserMessagePrefix removes Codex user message wrapper", () => {
  assert.equal(
    stripUserMessagePrefix("noise <user_message>\nactual prompt"),
    "actual prompt",
  );
  assert.equal(stripUserMessagePrefix("plain prompt"), "plain prompt");
});

test("deriveDisplayTitle falls back to the first user message when thread name is missing", () => {
  assert.deepEqual(
    deriveDisplayTitle(null, "A very useful session title derived from the first real user turn"),
    {
      title: "A very useful session title derived from the first real user turn",
      titleSource: "derived_from_first_user_message",
      recordedTitle: null,
    },
  );
});

test("formatStructuredValue preserves objects and pretty-prints JSON strings", () => {
  assert.deepEqual(formatStructuredValue({ ok: true, count: 2 }), {
    text: '{\n  "ok": true,\n  "count": 2\n}',
    fence: "json",
  });

  assert.deepEqual(formatStructuredValue('{"hello":"world"}'), {
    text: '{\n  "hello": "world"\n}',
    fence: "json",
  });

  assert.deepEqual(formatStructuredValue("plain text"), {
    text: "plain text",
    fence: "text",
  });
});

test("redactString removes common secrets and local paths", () => {
  const text =
    "api_key=sk-proj-abcdefghijklmnopqrstuvwxyz1234567890 cwd=C:\\Users\\AKR\\.codex token=gho_abcdefghijklmnopqrstuvwxyz1234567890";
  const redacted = redactString(text, {
    codexHome: "C:\\Users\\AKR\\.codex",
    homeDir: "C:\\Users\\AKR",
  });

  assert.doesNotMatch(redacted, /sk-proj-/);
  assert.doesNotMatch(redacted, /gho_/);
  assert.doesNotMatch(redacted, /C:\\Users\\AKR/);
  assert.match(redacted, /\[REDACTED\]/);
  assert.match(redacted, /~\\?\.codex|~/);
});

test("listSessions derives titles, preserves named sessions, and excludes archives by default", async () => {
  const fixture = await createFixtureHome();
  const sessions = await listSessions(fixture.home);

  assert.equal(sessions.length, 2);
  const active = sessions.find((session) => session.threadId === fixture.activeThreadId);
  assert.ok(active);
  assert.match(active.title, /Export my Codex chat cleanly/);
  assert.equal(active.titleSource, "derived_from_first_user_message");

  const named = sessions.find((session) => session.threadId === fixture.namedThreadId);
  assert.equal(named?.title, "Named Fixture Session");
  assert.equal(named?.titleSource, "session_index");
});

test("pickMatchingSession supports exact and fuzzy matching", async () => {
  const fixture = await createFixtureHome();
  const sessions = await listSessions(fixture.home);

  assert.equal(pickMatchingSession(sessions, "Named Fixture Session")?.threadId, fixture.namedThreadId);
  assert.equal(pickMatchingSession(sessions, "export my codex")?.threadId, fixture.activeThreadId);
});

test("buildExportDocument keeps structured timeline data and avoids duplicate commentary assistant messages", async () => {
  const fixture = await createFixtureHome();
  const rolloutPath = path.join(
    fixture.home,
    "sessions",
    "2026",
    "04",
    "16",
    makeRolloutFilename("2026-04-16T12-42-10", fixture.activeThreadId),
  );

  const document = await buildExportDocument(fixture.home, rolloutPath, {
    includeBootstrap: false,
  });

  assert.equal(document.thread.titleSource, "derived_from_first_user_message");
  assert.deepEqual(
    document.entries.map((entry) => entry.kind),
    ["user", "reasoning", "commentary", "tool_call", "tool_output", "assistant"],
  );
  assert.equal(document.bootstrap.length, 2);
  assert.equal(document.thread.tokenUsage.total_tokens, 15);
  assert.equal(document.entries[3].fence, "json");
  assert.equal(document.entries[4].fence, "json");
  assert.equal(document.stats.rawRolloutLinesIncluded, true);
  assert.ok(Array.isArray(document.rawRolloutLines));
});

test("buildExportDocument can omit raw rollout lines for compact JSON", async () => {
  const fixture = await createFixtureHome();
  const rolloutPath = path.join(
    fixture.home,
    "sessions",
    "2026",
    "04",
    "16",
    makeRolloutFilename("2026-04-16T12-42-10", fixture.activeThreadId),
  );

  const document = await buildExportDocument(fixture.home, rolloutPath, {
    includeRawRolloutLines: false,
  });

  assert.equal(document.stats.rawLineCount > 0, true);
  assert.equal(document.stats.rawRolloutLinesIncluded, false);
  assert.equal("rawRolloutLines" in document, false);
});

test("redactExportDocument masks secrets in entries and raw rollout lines", async () => {
  const fixture = await createFixtureHome();
  const rolloutPath = path.join(
    fixture.home,
    "sessions",
    "2026",
    "04",
    "16",
    makeRolloutFilename("2026-04-16T12-42-10", fixture.activeThreadId),
  );
  const document = await buildExportDocument(fixture.home, rolloutPath);
  const redacted = redactExportDocument(document, {
    codexHome: fixture.home,
    homeDir: fixture.home,
  });
  const serialized = JSON.stringify(redacted);

  assert.equal(redacted.redaction.enabled, true);
  assert.doesNotMatch(serialized, /sk-proj-abcdefghijklmnopqrstuvwxyz1234567890/);
  assert.match(serialized, /\[REDACTED\]/);
});

test("renderMarkdown includes bootstrap only when requested", async () => {
  const fixture = await createFixtureHome();
  const rolloutPath = path.join(
    fixture.home,
    "sessions",
    "2026",
    "04",
    "16",
    makeRolloutFilename("2026-04-16T12-42-10", fixture.activeThreadId),
  );

  const document = await buildExportDocument(fixture.home, rolloutPath, {
    includeBootstrap: true,
  });

  const withoutBootstrap = renderMarkdown(document, { includeBootstrap: false });
  const withBootstrap = renderMarkdown(document, { includeBootstrap: true });

  assert.doesNotMatch(withoutBootstrap, /## Bootstrap Context/);
  assert.match(withBootstrap, /## Bootstrap Context/);
});

test("CLI lists sessions and derives a title for unnamed threads", async () => {
  const fixture = await createFixtureHome();
  const { stdout } = await execFileAsync(process.execPath, [CLI_PATH, "--home", fixture.home, "--list", "--limit", "5"]);

  assert.match(stdout, /updated_at\tstate\tthread_id\tname_or_preview\tcwd/);
  assert.match(stdout, /Export my Codex chat cleanly/);
  assert.match(stdout, /Named Fixture Session/);
});

test("CLI exports the current session when CODEX_THREAD_ID is set", async () => {
  const fixture = await createFixtureHome();
  const { stdout } = await execFileAsync(
    process.execPath,
    [CLI_PATH, "--home", fixture.home, "--current", "--format", "md"],
    {
      env: {
        ...process.env,
        CODEX_THREAD_ID: fixture.activeThreadId,
      },
    },
  );

  assert.match(stdout, /# Codex Chat Export/);
  assert.match(stdout, /Assistant response\./);
  assert.doesNotMatch(stdout, /## Bootstrap Context/);
});

test("CLI requires --include-archived to export archived sessions", async () => {
  const fixture = await createFixtureHome();

  await assert.rejects(
    execFileAsync(process.execPath, [CLI_PATH, "--home", fixture.home, "--id", fixture.archivedThreadId]),
    /Could not locate rollout/,
  );

  const outputPath = path.join(fixture.home, "exports", "archived.md");
  const { stdout } = await execFileAsync(process.execPath, [
    CLI_PATH,
    "--home",
    fixture.home,
    "--id",
    fixture.archivedThreadId,
    "--include-archived",
    "--output",
    outputPath,
  ]);

  assert.match(stdout, /archived\.md/);
  const content = await fs.readFile(outputPath, "utf8");
  assert.match(content, /Archived response\./);
});

test("CLI rejects invalid formats with a clear error", async () => {
  const fixture = await createFixtureHome();

  await assert.rejects(
    execFileAsync(process.execPath, [CLI_PATH, "--home", fixture.home, "--last", "--format", "html"]),
    /Unsupported format "html"/,
  );
});

test("CLI writes bundle exports with markdown, JSON, and manifest files", async () => {
  const fixture = await createFixtureHome();
  const bundlePath = path.join(fixture.home, "bundle-export");

  const { stdout } = await execFileAsync(process.execPath, [
    CLI_PATH,
    "--home",
    fixture.home,
    "--id",
    fixture.activeThreadId,
    "--bundle",
    bundlePath,
  ]);

  assert.equal(stdout.trim(), bundlePath);

  const chatMarkdown = await fs.readFile(path.join(bundlePath, "chat.md"), "utf8");
  const chatJson = JSON.parse(await fs.readFile(path.join(bundlePath, "chat.json"), "utf8"));
  const manifest = JSON.parse(await fs.readFile(path.join(bundlePath, "manifest.json"), "utf8"));

  assert.match(chatMarkdown, /# Codex Chat Export/);
  assert.match(chatMarkdown, /Assistant response\./);
  assert.equal(chatJson.thread.threadId, fixture.activeThreadId);
  assert.equal(manifest.thread.threadId, fixture.activeThreadId);
  assert.deepEqual(
    manifest.files.map((file) => file.path),
    ["chat.md", "chat.json", "manifest.json"],
  );
});

test("CLI rejects using --output and --bundle together", async () => {
  const fixture = await createFixtureHome();

  await assert.rejects(
    execFileAsync(process.execPath, [
      CLI_PATH,
      "--home",
      fixture.home,
      "--last",
      "--output",
      path.join(fixture.home, "chat.md"),
      "--bundle",
      path.join(fixture.home, "bundle"),
    ]),
    /Use either --output FILE or --bundle DIR, not both/,
  );
});

test("CLI redacts markdown and JSON exports when requested", async () => {
  const fixture = await createFixtureHome();

  const markdown = await execFileAsync(process.execPath, [
    CLI_PATH,
    "--home",
    fixture.home,
    "--id",
    fixture.activeThreadId,
    "--redact",
  ]);
  assert.doesNotMatch(markdown.stdout, /sk-proj-abcdefghijklmnopqrstuvwxyz1234567890/);
  assert.doesNotMatch(markdown.stdout, new RegExp(fixture.home.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(markdown.stdout, /\[REDACTED\]/);

  const json = await execFileAsync(process.execPath, [
    CLI_PATH,
    "--home",
    fixture.home,
    "--id",
    fixture.activeThreadId,
    "--format",
    "json",
    "--redact",
  ]);
  const parsed = JSON.parse(json.stdout);
  assert.equal(parsed.redaction.enabled, true);
  assert.doesNotMatch(JSON.stringify(parsed), /sk-proj-abcdefghijklmnopqrstuvwxyz1234567890/);
});

test("CLI redacts every bundle file when requested", async () => {
  const fixture = await createFixtureHome();
  const bundlePath = path.join(fixture.home, "redacted-bundle");

  await execFileAsync(process.execPath, [
    CLI_PATH,
    "--home",
    fixture.home,
    "--id",
    fixture.activeThreadId,
    "--bundle",
    bundlePath,
    "--redact",
  ]);

  for (const filename of ["chat.md", "chat.json", "manifest.json"]) {
    const content = await fs.readFile(path.join(bundlePath, filename), "utf8");
    assert.doesNotMatch(content, /sk-proj-abcdefghijklmnopqrstuvwxyz1234567890/);
  }
  const manifest = JSON.parse(await fs.readFile(path.join(bundlePath, "manifest.json"), "utf8"));
  assert.equal(manifest.redaction.enabled, true);
});

test("CLI omits raw rollout lines from compact JSON and bundle exports", async () => {
  const fixture = await createFixtureHome();

  const json = await execFileAsync(process.execPath, [
    CLI_PATH,
    "--home",
    fixture.home,
    "--id",
    fixture.activeThreadId,
    "--format",
    "json",
    "--no-raw",
  ]);
  const parsed = JSON.parse(json.stdout);
  assert.equal(parsed.stats.rawRolloutLinesIncluded, false);
  assert.equal("rawRolloutLines" in parsed, false);

  const bundlePath = path.join(fixture.home, "compact-bundle");
  await execFileAsync(process.execPath, [
    CLI_PATH,
    "--home",
    fixture.home,
    "--id",
    fixture.activeThreadId,
    "--bundle",
    bundlePath,
    "--no-raw",
  ]);
  const bundleJson = JSON.parse(await fs.readFile(path.join(bundlePath, "chat.json"), "utf8"));
  const manifest = JSON.parse(await fs.readFile(path.join(bundlePath, "manifest.json"), "utf8"));

  assert.equal(bundleJson.stats.rawRolloutLinesIncluded, false);
  assert.equal("rawRolloutLines" in bundleJson, false);
  assert.equal(manifest.stats.rawRolloutLinesIncluded, false);
  assert.match(manifest.files[1].description, /Compact structured export/);
});
