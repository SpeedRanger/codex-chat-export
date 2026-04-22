# Showcase

`codex-chat-export` turns a long Codex CLI session into a portable archive.

## Output Model

Open the visual explainer:

[output-model.html](showcase/output-model.html)

The core flow:

```text
~/.codex/sessions/... rollout JSONL
  -> codex-chat-export --bundle ./my-chat
    -> chat.md
    -> chat.json
    -> manifest.json
```

## Human Artifact

`chat.md` is the readable transcript.

It includes:

- session metadata
- user prompts
- assistant responses
- reasoning summaries when persisted by Codex
- commentary/progress updates
- tool calls with arguments
- tool outputs
- token usage and export stats

## Machine Artifact

`chat.json` is the structured export.

Use full JSON when you need maximum fidelity, including raw rollout lines:

```bash
codex-chat-export --last --format json --output chat.json
```

Use compact JSON when you need smaller artifacts for sharing or automation:

```bash
codex-chat-export --last --format json --no-raw --output chat.compact.json
```

## Shareable Artifact

Use redaction when preparing an export for public issues, demos, docs, or social posts:

```bash
codex-chat-export --last --bundle ./shareable-chat --redact --no-raw
```

Redaction is best-effort. Always review output before publishing it.

## Benchmark Snapshot

Run a synthetic benchmark:

```bash
npm run benchmark:large -- --turns 1000
```

The benchmark measures:

- session listing
- Markdown export
- compact JSON export
- full JSON export
- compact bundle export
