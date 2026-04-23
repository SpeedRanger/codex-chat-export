# Demo Output

This is a shortened example of the Markdown shape produced by:

```bash
codex-chat-export --last --redact --no-raw
```

```markdown
# Codex Chat Export

- Thread ID: `01900000-0000-7000-8000-000000000001`
- Thread Name: `Export this sanitized legacy chat.`
- Created At: 2026-01-01T00:00:00.000Z
- Updated At: 2026-01-01T00:00:05.000Z
- CWD: `C:\codex-chat-export\fixture`
- Source: cli
- Model Provider: openai
- CLI Version: current-schema-shapes
- Archived: no

## Conversation

### User

Export this sanitized legacy chat.

### Reasoning Summary

sanitized reasoning summary

### Commentary

sanitized commentary

### Tool Call: exec_command

- Response Type: `function_call`

```json
{
  "cmd": "sanitized command",
  "cwd": "C:\\codex-chat-export\\fixture"
}
```

### Tool Output

```json
{
  "ok": true,
  "text": "sanitized output"
}
```

### Assistant

Sanitized assistant response.

## Export Stats

- Exported entries: 6
- Bootstrap entries: 2
- Raw rollout lines: 35
```
