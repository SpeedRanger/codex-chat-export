import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";

const SESSIONS_DIRNAME = "sessions";
const ARCHIVED_SESSIONS_DIRNAME = "archived_sessions";
const MAX_SCAN_FILES = 10000;
const HEAD_LINE_LIMIT = 40;
const USER_MESSAGE_BEGIN = "<user_message>";
const REDACTION_TOKEN = "[REDACTED]";

export function defaultCodexHome() {
  return path.join(os.homedir(), ".codex");
}

export function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value ?? "",
  );
}

export function parseTimestampUuidFromFilename(filename) {
  const match = /^rollout-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})-([0-9a-f-]{36})\.jsonl$/i.exec(
    filename ?? "",
  );
  if (!match) {
    return null;
  }

  const isoLike = match[1].replace(
    /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})$/,
    "$1T$2:$3:$4Z",
  );
  const createdAt = new Date(isoLike);
  if (Number.isNaN(createdAt.getTime())) {
    return null;
  }

  return {
    createdAt,
    threadId: match[2].toLowerCase(),
  };
}

export function normalizeWhitespace(text) {
  return String(text ?? "").replace(/\r\n/g, "\n").trim();
}

export function safeJsonParse(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function truncate(text, maxLength) {
  const value = String(text ?? "");
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 3)}...`;
}

function sanitizePreviewText(text) {
  return String(text ?? "")
    .replace(/<image[^>]*>/gi, " ")
    .replace(/<\/image>/gi, " ")
    .replace(/\[Image(?: #[0-9]+)?\]/g, " [Image] ")
    .replace(/\s+/g, " ")
    .trim();
}

export function deriveDisplayTitle(explicitTitle, preview) {
  const named = firstNonEmptyString(explicitTitle);
  if (named) {
    return {
      title: named,
      titleSource: "session_index",
      recordedTitle: named,
    };
  }

  const derived = truncate(sanitizePreviewText(preview), 96);
  if (derived) {
    return {
      title: derived,
      titleSource: "derived_from_first_user_message",
      recordedTitle: null,
    };
  }

  return {
    title: null,
    titleSource: null,
    recordedTitle: null,
  };
}

function isoOrNull(date) {
  return date instanceof Date && !Number.isNaN(date.getTime())
    ? date.toISOString()
    : null;
}

function entryTypeOf(line) {
  if (!line || typeof line !== "object") {
    return "";
  }
  if (line.type === "response_item") {
    return `response_item:${line.payload?.type ?? ""}`;
  }
  if (line.type === "event_msg") {
    return `event_msg:${line.payload?.type ?? ""}`;
  }
  return line.type ?? "";
}

function isIgnorableBetweenUserResponseAndUserEvent(line) {
  const kind = entryTypeOf(line);
  return (
    kind === "turn_context" ||
    kind === "event_msg:token_count" ||
    kind === "event_msg:agent_reasoning" ||
    kind === "event_msg:agent_reasoning_raw_content" ||
    kind === "response_item:reasoning"
  );
}

function contentTextPart(part) {
  if (!part || typeof part !== "object") {
    return "";
  }
  if (typeof part.text === "string") {
    return part.text;
  }
  if (part.type === "input_image" || part.type === "output_image") {
    return "[Image]";
  }
  if (part.type === "input_file") {
    return "[File]";
  }
  return "";
}

export function extractMessageText(content) {
  if (!Array.isArray(content)) {
    return "";
  }
  const parts = content
    .map((part) => normalizeWhitespace(contentTextPart(part)))
    .filter(Boolean);
  return parts.join("\n\n");
}

export function stripUserMessagePrefix(text) {
  const value = String(text ?? "");
  const index = value.indexOf(USER_MESSAGE_BEGIN);
  return index === -1
    ? normalizeWhitespace(value)
    : normalizeWhitespace(value.slice(index + USER_MESSAGE_BEGIN.length));
}

export function extractReasoningText(payload) {
  const summaryParts = Array.isArray(payload?.summary)
    ? payload.summary
        .map((part) => normalizeWhitespace(part?.text))
        .filter(Boolean)
    : [];
  if (summaryParts.length > 0) {
    return summaryParts.join("\n\n");
  }
  return "";
}

export function formatStructuredValue(value) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return {
        text: "",
        fence: "text",
      };
    }

    try {
      const parsed = JSON.parse(trimmed);
      return {
        text: JSON.stringify(parsed, null, 2),
        fence: "json",
      };
    } catch {
      return {
        text: value,
        fence: "text",
      };
    }
  }

  if (value && typeof value === "object") {
    return {
      text: JSON.stringify(value, null, 2),
      fence: "json",
    };
  }

  return {
    text: String(value ?? ""),
    fence: "text",
  };
}

function normalizePathForRedaction(value) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return null;
  }
  return normalized.replace(/\\/g, "/").replace(/\/+$/g, "");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function collectRedactionPaths(options = {}) {
  const candidates = [
    options.homeDir,
    options.codexHome,
    options.workspace,
    process.env.HOME,
    process.env.USERPROFILE,
  ];
  const paths = new Set();
  for (const candidate of candidates) {
    const normalized = normalizePathForRedaction(candidate);
    if (!normalized || normalized.length < 3) {
      continue;
    }
    paths.add(normalized);
    paths.add(normalized.replace(/\//g, "\\"));
  }
  return [...paths].sort((left, right) => right.length - left.length);
}

export function redactString(value, options = {}) {
  let redacted = String(value ?? "");

  const secretPatterns = [
    /\bsk-(?:proj-|ant-|live_|test_)?[A-Za-z0-9_-]{20,}\b/g,
    /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b/g,
    /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
    /\bAKIA[0-9A-Z]{16}\b/g,
    /\bASIA[0-9A-Z]{16}\b/g,
    /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g,
    /\b(?:pk|rk|sk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g,
    /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}\b/gi,
  ];
  for (const pattern of secretPatterns) {
    redacted = redacted.replace(pattern, REDACTION_TOKEN);
  }

  redacted = redacted.replace(
    /\b(api[_-]?key|access[_-]?token|auth[_-]?token|authorization|bearer|cookie|password|passwd|secret|client[_-]?secret)\b(\s*[:=]\s*)(["']?)([^"',\s;}\]]{6,})(["']?)/gi,
    (_match, key, separator, openQuote, _secret, closeQuote) =>
      `${key}${separator}${openQuote}${REDACTION_TOKEN}${closeQuote}`,
  );

  redacted = redacted.replace(
    /\b(https?:\/\/)([^:@\s/]+):([^@\s/]+)@/gi,
    `$1${REDACTION_TOKEN}@`,
  );

  for (const sensitivePath of collectRedactionPaths(options)) {
    redacted = redacted.replace(new RegExp(escapeRegExp(sensitivePath), "gi"), "~");
  }

  return redacted;
}

function redactValue(value, options = {}) {
  if (typeof value === "string") {
    return redactString(value, options);
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, options));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        redactValue(nestedValue, options),
      ]),
    );
  }
  return value;
}

export function redactExportDocument(document, options = {}) {
  const redacted = redactValue(document, options);
  return {
    ...redacted,
    redaction: {
      enabled: true,
      appliedAt: new Date().toISOString(),
      marker: REDACTION_TOKEN,
      rules: [
        "common API key and token patterns",
        "credential-bearing URLs",
        "sensitive key-value fields",
        "local home and Codex home paths",
      ],
    },
  };
}

export function loadIndexFileMap(lines, sourceLabel) {
  const map = new Map();
  for (const line of lines) {
    const parsed = safeJsonParse(line);
    if (!parsed) {
      continue;
    }
    const id = String(parsed.id ?? parsed.session_id ?? "").trim().toLowerCase();
    if (!isUuid(id)) {
      continue;
    }
    map.set(id, {
      source: sourceLabel,
      threadName:
        typeof parsed.thread_name === "string" && parsed.thread_name.trim()
          ? parsed.thread_name.trim()
          : null,
      updatedAt:
        typeof parsed.updated_at === "string" && parsed.updated_at.trim()
          ? parsed.updated_at.trim()
          : null,
      preview:
        typeof parsed.text === "string" && parsed.text.trim()
          ? parsed.text.trim()
          : null,
      ts:
        typeof parsed.ts === "number" && Number.isFinite(parsed.ts)
          ? new Date(parsed.ts * 1000).toISOString()
          : null,
    });
  }
  return map;
}

async function readAllLinesIfExists(filePath) {
  try {
    const content = await fsp.readFile(filePath, "utf8");
    return content.split(/\r?\n/).filter(Boolean);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

export async function loadThreadNameIndexes(codexHome) {
  const sessionIndex = loadIndexFileMap(
    await readAllLinesIfExists(path.join(codexHome, "session_index.jsonl")),
    "session_index",
  );
  const historyIndex = loadIndexFileMap(
    await readAllLinesIfExists(path.join(codexHome, "history.jsonl")),
    "history",
  );
  return {
    sessionIndex,
    historyIndex,
  };
}

async function readHeadLines(filePath, maxLines = HEAD_LINE_LIMIT) {
  const lines = [];
  const input = fs.createReadStream(filePath, { encoding: "utf8" });
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  try {
    for await (const line of rl) {
      if (line.trim()) {
        const parsed = safeJsonParse(line);
        if (parsed) {
          lines.push(parsed);
        }
      }
      if (lines.length >= maxLines) {
        break;
      }
    }
  } finally {
    rl.close();
    input.destroy();
  }
  return lines;
}

function firstNonEmptyString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

export function classifyResponseItems(lines) {
  const actualUserMessageIndexes = new Set();
  const bootstrapMessageIndexes = new Set();

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (
      line?.type !== "response_item" ||
      line?.payload?.type !== "message" ||
      line?.payload?.role !== "user"
    ) {
      continue;
    }

    let cursor = index + 1;
    let paired = false;
    while (cursor < lines.length) {
      const next = lines[cursor];
      const kind = entryTypeOf(next);
      if (kind === "event_msg:user_message") {
        paired = true;
        break;
      }
      if (!isIgnorableBetweenUserResponseAndUserEvent(next)) {
        break;
      }
      cursor += 1;
    }

    if (paired) {
      actualUserMessageIndexes.add(index);
    } else {
      bootstrapMessageIndexes.add(index);
    }
  }

  return {
    actualUserMessageIndexes,
    bootstrapMessageIndexes,
  };
}

export async function summarizeRolloutFile(filePath, indexes) {
  const stat = await fsp.stat(filePath);
  const filenameInfo = parseTimestampUuidFromFilename(path.basename(filePath));
  const headLines = await readHeadLines(filePath);
  const { actualUserMessageIndexes } = classifyResponseItems(headLines);

  const sessionMeta = headLines.find((line) => line.type === "session_meta");
  const threadId = String(
    sessionMeta?.payload?.id ?? filenameInfo?.threadId ?? "",
  ).toLowerCase();
  const indexEntry =
    indexes.sessionIndex.get(threadId) ?? indexes.historyIndex.get(threadId) ?? null;

  let preview = null;
  for (let index = 0; index < headLines.length; index += 1) {
    const line = headLines[index];
    if (
      line?.type === "response_item" &&
      line?.payload?.type === "message" &&
      line?.payload?.role === "user" &&
      actualUserMessageIndexes.has(index)
    ) {
      preview = extractMessageText(line.payload.content);
      if (preview) {
        break;
      }
    }
    if (line?.type === "event_msg" && line?.payload?.type === "user_message") {
      preview = stripUserMessagePrefix(line.payload.message);
      if (preview) {
        break;
      }
    }
  }

  const titleInfo = deriveDisplayTitle(indexEntry?.threadName, preview);
  const createdAt = firstNonEmptyString(
    sessionMeta?.payload?.timestamp,
    isoOrNull(filenameInfo?.createdAt),
  );
  const updatedAt = firstNonEmptyString(indexEntry?.updatedAt, stat.mtime.toISOString());

  return {
    threadId,
    title: titleInfo.title,
    titleSource: titleInfo.titleSource,
    recordedTitle: titleInfo.recordedTitle,
    preview: sanitizePreviewText(firstNonEmptyString(preview, indexEntry?.preview) ?? ""),
    cwd: firstNonEmptyString(sessionMeta?.payload?.cwd),
    modelProvider: firstNonEmptyString(sessionMeta?.payload?.model_provider),
    cliVersion: firstNonEmptyString(sessionMeta?.payload?.cli_version),
    source: firstNonEmptyString(sessionMeta?.payload?.source),
    createdAt,
    updatedAt,
    archived: filePath.includes(`${path.sep}${ARCHIVED_SESSIONS_DIRNAME}${path.sep}`),
    rolloutPath: filePath,
    sortUpdatedAtMs: stat.mtimeMs,
    sortCreatedAtMs: filenameInfo?.createdAt?.getTime?.() ?? 0,
  };
}

async function safeReadDir(dirPath) {
  try {
    return await fsp.readdir(dirPath, { withFileTypes: true });
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

function sortDirEntriesDescending(entries) {
  return [...entries].sort((left, right) => right.name.localeCompare(left.name));
}

async function collectNestedSessionFiles(rootPath) {
  const candidates = [];
  const yearEntries = await safeReadDir(rootPath);
  for (const yearEntry of sortDirEntriesDescending(yearEntries)) {
    if (!yearEntry.isDirectory()) {
      continue;
    }
    const monthEntries = await safeReadDir(path.join(rootPath, yearEntry.name));
    for (const monthEntry of sortDirEntriesDescending(monthEntries)) {
      if (!monthEntry.isDirectory()) {
        continue;
      }
      const dayEntries = await safeReadDir(path.join(rootPath, yearEntry.name, monthEntry.name));
      for (const dayEntry of sortDirEntriesDescending(dayEntries)) {
        if (!dayEntry.isDirectory()) {
          continue;
        }
        const dirPath = path.join(rootPath, yearEntry.name, monthEntry.name, dayEntry.name);
        const fileEntries = await safeReadDir(dirPath);
        for (const fileEntry of fileEntries) {
          if (!fileEntry.isFile()) {
            continue;
          }
          const fullPath = path.join(dirPath, fileEntry.name);
          if (parseTimestampUuidFromFilename(fileEntry.name)) {
            candidates.push(fullPath);
          }
        }
      }
    }
  }
  return candidates;
}

async function collectFlatSessionFiles(rootPath) {
  const entries = await safeReadDir(rootPath);
  return entries
    .filter((entry) => entry.isFile() && parseTimestampUuidFromFilename(entry.name))
    .map((entry) => path.join(rootPath, entry.name));
}

export async function collectRolloutPaths(codexHome, options = {}) {
  const includeArchived = Boolean(options.includeArchived);
  const activeRoot = path.join(codexHome, SESSIONS_DIRNAME);
  const archivedRoot = path.join(codexHome, ARCHIVED_SESSIONS_DIRNAME);
  const activePaths = await collectNestedSessionFiles(activeRoot);
  const archivedPaths = includeArchived ? await collectFlatSessionFiles(archivedRoot) : [];
  return [...activePaths, ...archivedPaths];
}

export async function listSessions(codexHome, options = {}) {
  const indexes = await loadThreadNameIndexes(codexHome);
  const rolloutPaths = await collectRolloutPaths(codexHome, options);
  const sessions = [];
  for (const rolloutPath of rolloutPaths) {
    if (sessions.length >= (options.scanLimit ?? MAX_SCAN_FILES)) {
      break;
    }
    const summary = await summarizeRolloutFile(rolloutPath, indexes);
    sessions.push(summary);
  }

  sessions.sort((left, right) => {
    if (right.sortUpdatedAtMs !== left.sortUpdatedAtMs) {
      return right.sortUpdatedAtMs - left.sortUpdatedAtMs;
    }
    if (right.sortCreatedAtMs !== left.sortCreatedAtMs) {
      return right.sortCreatedAtMs - left.sortCreatedAtMs;
    }
    return right.threadId.localeCompare(left.threadId);
  });

  return sessions;
}

export async function findRolloutPathByThreadId(codexHome, threadId, options = {}) {
  const target = String(threadId ?? "").trim().toLowerCase();
  if (!isUuid(target)) {
    return null;
  }

  const rolloutPaths = await collectRolloutPaths(codexHome, {
    includeArchived: options.includeArchived,
  });

  for (const rolloutPath of rolloutPaths) {
    if (path.basename(rolloutPath).toLowerCase().includes(target)) {
      return rolloutPath;
    }
  }

  return null;
}

export function pickMatchingSession(sessions, query) {
  const normalizedQuery = String(query ?? "").trim().toLowerCase();
  if (!normalizedQuery) {
    return null;
  }

  const exactId = sessions.find((session) => session.threadId === normalizedQuery);
  if (exactId) {
    return exactId;
  }

  const exactTitle = sessions.find(
    (session) => String(session.title ?? "").trim().toLowerCase() === normalizedQuery,
  );
  if (exactTitle) {
    return exactTitle;
  }

  const exactPreview = sessions.find(
    (session) => String(session.preview ?? "").trim().toLowerCase() === normalizedQuery,
  );
  if (exactPreview) {
    return exactPreview;
  }

  return (
    sessions.find((session) =>
      [session.title, session.preview, session.cwd, session.threadId]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedQuery)),
    ) ?? null
  );
}

async function readAllRolloutLines(filePath) {
  const lines = [];
  const input = fs.createReadStream(filePath, { encoding: "utf8" });
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  try {
    for await (const line of rl) {
      if (!line.trim()) {
        continue;
      }
      const parsed = safeJsonParse(line);
      if (parsed) {
        lines.push(parsed);
      }
    }
  } finally {
    rl.close();
    input.destroy();
  }
  return lines;
}

function buildTokenUsage(lines) {
  let latest = null;
  for (const line of lines) {
    if (line?.type === "event_msg" && line?.payload?.type === "token_count") {
      latest = line.payload.info?.last_token_usage ?? line.payload.info?.total_token_usage ?? null;
    }
  }
  return latest;
}

function buildBootstrapEntries(lines, classified) {
  const entries = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (
      line?.type === "response_item" &&
      line?.payload?.type === "message" &&
      (line?.payload?.role === "developer" ||
        line?.payload?.role === "system" ||
        classified.bootstrapMessageIndexes.has(index))
    ) {
      const text = extractMessageText(line.payload.content);
      if (!text || text.startsWith("<turn_aborted>")) {
        continue;
      }
      entries.push({
        kind: "bootstrap",
        role: line.payload.role,
        timestamp: line.timestamp ?? null,
        text,
      });
    }
  }
  return entries;
}

function summarizeToolCallName(payload) {
  return (
    firstNonEmptyString(
      payload?.name,
      payload?.tool_name,
      payload?.command?.[0],
      payload?.call_id,
    ) ?? "tool"
  );
}

function formatToolArgs(payload) {
  if (typeof payload?.arguments === "string") {
    return formatStructuredValue(payload.arguments);
  }
  if (payload?.input) {
    return formatStructuredValue(payload.input);
  }
  return formatStructuredValue(payload ?? {});
}

function buildFilteredEntries(lines, options = {}) {
  const includeBootstrap = Boolean(options.includeBootstrap);
  const includeCommentary = options.includeCommentary !== false;
  const includeReasoning = options.includeReasoning !== false;
  const includeTools = options.includeTools !== false;
  const classified = classifyResponseItems(lines);
  const bootstrapEntries = buildBootstrapEntries(lines, classified);
  const entries = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line || typeof line !== "object") {
      continue;
    }

    if (line.type === "response_item" && line.payload?.type === "message") {
      const role = line.payload.role;
      const phase = line.payload.phase ?? null;
      const text = extractMessageText(line.payload.content);
      if (!text) {
        continue;
      }

      if (role === "assistant") {
        if (phase === "commentary") {
          continue;
        }
        entries.push({
          kind: "assistant",
          timestamp: line.timestamp ?? null,
          text,
        });
        continue;
      }

      if (role === "user" && classified.actualUserMessageIndexes.has(index)) {
        entries.push({
          kind: "user",
          timestamp: line.timestamp ?? null,
          text,
        });
        continue;
      }

      if (includeBootstrap && classified.bootstrapMessageIndexes.has(index)) {
        entries.push({
          kind: "bootstrap",
          role,
          timestamp: line.timestamp ?? null,
          text,
        });
      }
      continue;
    }

    if (includeReasoning && line.type === "response_item" && line.payload?.type === "reasoning") {
      const text = extractReasoningText(line.payload);
      if (text) {
        entries.push({
          kind: "reasoning",
          timestamp: line.timestamp ?? null,
          text,
        });
      }
      continue;
    }

    if (includeTools && line.type === "response_item") {
      const responseType = line.payload?.type;
      if (
        responseType === "function_call" ||
        responseType === "local_shell_call" ||
        responseType === "tool_search_call" ||
        responseType === "custom_tool_call" ||
        responseType === "web_search_call" ||
        responseType === "image_generation_call"
      ) {
        entries.push({
          kind: "tool_call",
          timestamp: line.timestamp ?? null,
          name: summarizeToolCallName(line.payload),
          responseType,
          ...formatToolArgs(line.payload),
        });
        continue;
      }

      if (
        responseType === "function_call_output" ||
        responseType === "tool_search_output" ||
        responseType === "custom_tool_call_output"
      ) {
        entries.push({
          kind: "tool_output",
          timestamp: line.timestamp ?? null,
          responseType,
          callId: line.payload.call_id ?? null,
          ...formatStructuredValue(line.payload.output ?? ""),
        });
      }
      continue;
    }

    if (includeCommentary && line.type === "event_msg" && line.payload?.type === "agent_message") {
      const text = normalizeWhitespace(line.payload.message);
      if (text) {
        entries.push({
          kind: "commentary",
          timestamp: line.timestamp ?? null,
          phase: line.payload.phase ?? null,
          text,
        });
      }
    }
  }

  return {
    entries,
    bootstrapEntries,
  };
}

function metadataFromSessionMeta(sessionMetaLine, sessionSummary, tokenUsage) {
  const payload = sessionMetaLine?.payload ?? {};
  return {
    threadId: payload.id ?? sessionSummary.threadId ?? null,
    title: sessionSummary.title ?? null,
    titleSource: sessionSummary.titleSource ?? null,
    recordedTitle: sessionSummary.recordedTitle ?? null,
    createdAt: payload.timestamp ?? sessionSummary.createdAt ?? null,
    updatedAt: sessionSummary.updatedAt ?? null,
    cwd: payload.cwd ?? sessionSummary.cwd ?? null,
    source: payload.source ?? sessionSummary.source ?? null,
    modelProvider: payload.model_provider ?? sessionSummary.modelProvider ?? null,
    cliVersion: payload.cli_version ?? sessionSummary.cliVersion ?? null,
    archived: Boolean(sessionSummary.archived),
    rolloutPath: sessionSummary.rolloutPath,
    tokenUsage,
  };
}

export async function buildExportDocument(codexHome, rolloutPath, options = {}) {
  const indexes = await loadThreadNameIndexes(codexHome);
  const sessionSummary = await summarizeRolloutFile(rolloutPath, indexes);
  const rawLines = await readAllRolloutLines(rolloutPath);
  const sessionMetaLine = rawLines.find((line) => line.type === "session_meta") ?? null;
  const tokenUsage = buildTokenUsage(rawLines);
  const filtered = buildFilteredEntries(rawLines, options);

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    source: {
      codexHome,
      rolloutPath,
    },
    thread: metadataFromSessionMeta(sessionMetaLine, sessionSummary, tokenUsage),
    bootstrap: filtered.bootstrapEntries,
    entries: filtered.entries,
    stats: {
      rawLineCount: rawLines.length,
      entryCount: filtered.entries.length,
      bootstrapCount: filtered.bootstrapEntries.length,
    },
    rawRolloutLines: rawLines,
  };
}

function markdownFence(info, text) {
  return `\`\`\`${info}\n${text}\n\`\`\``;
}

function renderEntryHeading(level, label, timestamp) {
  const timeSuffix = timestamp ? ` (${timestamp})` : "";
  return `${"#".repeat(level)} ${label}${timeSuffix}`;
}

export function renderMarkdown(document, options = {}) {
  const { thread, bootstrap, entries, stats } = document;
  const lines = [
    "# Codex Chat Export",
    "",
    "- Thread ID: `" + (thread.threadId ?? "unknown") + "`",
    "- Thread Name: " + (thread.title ? `\`${thread.title}\`` : "_unnamed_"),
    "- Created At: " + (thread.createdAt ?? "_unknown_"),
    "- Updated At: " + (thread.updatedAt ?? "_unknown_"),
    "- CWD: " + (thread.cwd ? `\`${thread.cwd}\`` : "_unknown_"),
    "- Source: " + (thread.source ?? "_unknown_"),
    "- Model Provider: " + (thread.modelProvider ?? "_unknown_"),
    "- CLI Version: " + (thread.cliVersion ?? "_unknown_"),
    "- Archived: " + (thread.archived ? "yes" : "no"),
    "- Rollout: `" + thread.rolloutPath + "`",
    "- Exported At: " + document.exportedAt,
    "",
    "## Conversation",
    "",
  ];

  for (const entry of entries) {
    if (entry.kind === "user") {
      lines.push(renderEntryHeading(3, "User", entry.timestamp), "", entry.text, "");
      continue;
    }
    if (entry.kind === "assistant") {
      lines.push(renderEntryHeading(3, "Assistant", entry.timestamp), "", entry.text, "");
      continue;
    }
    if (entry.kind === "commentary") {
      lines.push(renderEntryHeading(3, "Commentary", entry.timestamp), "", entry.text, "");
      continue;
    }
    if (entry.kind === "reasoning") {
      lines.push(renderEntryHeading(3, "Reasoning Summary", entry.timestamp), "", entry.text, "");
      continue;
    }
    if (entry.kind === "tool_call") {
      lines.push(
        renderEntryHeading(3, `Tool Call: ${entry.name}`, entry.timestamp),
        "",
        "- Response Type: `" + entry.responseType + "`",
        "",
        markdownFence(entry.fence ?? "text", entry.text),
        "",
      );
      continue;
    }
    if (entry.kind === "tool_output") {
      lines.push(renderEntryHeading(3, "Tool Output", entry.timestamp), "");
      if (entry.callId) {
        lines.push("- Call ID: `" + entry.callId + "`", "");
      }
      lines.push(markdownFence(entry.fence ?? "text", entry.text), "");
    }
  }

  if (thread.tokenUsage) {
    lines.push("## Token Usage", "");
    for (const [key, value] of Object.entries(thread.tokenUsage)) {
      lines.push(`- ${key}: ${value}`);
    }
    lines.push("");
  }

  if (options.includeBootstrap && bootstrap.length > 0) {
    lines.push("## Bootstrap Context", "");
    for (const entry of bootstrap) {
      lines.push(
        renderEntryHeading(3, `Bootstrap ${entry.role}`, entry.timestamp),
        "",
        entry.text,
        "",
      );
    }
  }

  lines.push("## Export Stats", "");
  lines.push(`- Exported entries: ${stats.entryCount}`);
  lines.push(`- Bootstrap entries: ${stats.bootstrapCount}`);
  lines.push(`- Raw rollout lines: ${stats.rawLineCount}`);
  lines.push("");

  return lines.join("\n");
}

export function renderText(document, options = {}) {
  const markdown = renderMarkdown(document, options);
  return markdown
    .replace(/^### /gm, "=== ")
    .replace(/^## /gm, "== ")
    .replace(/^# /gm, "= ")
    .replace(/```(?:json|text)?\n/g, "")
    .replace(/\n```/g, "");
}

export function formatSessionRow(session) {
  const name = session.title ?? truncate(sanitizePreviewText(session.preview), 88) ?? "";
  const cwd = session.cwd ? truncate(session.cwd, 50) : "-";
  return [
    session.updatedAt ?? "-",
    session.archived ? "archived" : "active",
    session.threadId,
    name,
    cwd,
  ].join("\t");
}

export function usageText() {
  return [
    "Codex Chat Export",
    "",
    "Usage:",
    "  node scripts/codex-chat-export.mjs --last [--format md|txt|json] [--output FILE]",
    "  node scripts/codex-chat-export.mjs --last --bundle DIR",
    "  node scripts/codex-chat-export.mjs --current [--output FILE]",
    "  node scripts/codex-chat-export.mjs --id THREAD_ID [--output FILE]",
    "  node scripts/codex-chat-export.mjs --match QUERY [--output FILE]",
    "  node scripts/codex-chat-export.mjs --list [--limit N]",
    "",
    "Options:",
    "  --home PATH              Override Codex home (default: ~/.codex)",
    "  --format FORMAT          md, txt, or json (default: md)",
    "  --output FILE            Write export to a file instead of stdout",
    "  --bundle DIR             Write chat.md, chat.json, and manifest.json to a directory",
    "  --last                   Export the most recently updated session",
    "  --current                Export the session pointed to by CODEX_THREAD_ID",
    "  --id THREAD_ID           Export a specific thread id",
    "  --match QUERY            Match a thread name or preview substring",
    "  --list                   List recent sessions",
    "  --limit N                Limit rows for --list or --match scan (default: 20)",
    "  --include-archived       Include archived sessions in scans and lookup",
    "  --include-bootstrap      Include developer/system/bootstrap context in export",
    "  --redact                 Redact common secrets and local paths from exported content",
    "  --help                   Show this help text",
  ].join("\n");
}
