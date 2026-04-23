# Security Policy

## Supported versions

The latest tagged release is supported for security fixes.

## Reporting a vulnerability

Open a private security advisory on GitHub if the issue could expose local Codex data, cause unsafe file access, or leak sensitive content through exports.

If private advisory flow is unavailable, open a normal issue only for non-sensitive reports.

## Threat model

This tool is intentionally narrow:

- it reads local Codex rollout files
- it formats and exports those files
- it does not authenticate to external services
- it does not send telemetry
- it does not mutate Codex storage

Primary risk areas:

- accidental export of sensitive bootstrap context
- accidental inclusion of local filesystem paths in shared output
- path handling bugs when writing output files
- malformed rollout lines causing incorrect rendering

## Security defaults

- Bootstrap context is excluded from Markdown and text output by default.
- `--redact` can redact common secret patterns, credential-looking key-value fields, credential-bearing URLs, and local home/Codex paths.
- Redaction is best-effort. It reduces accidental leaks but cannot guarantee that every sensitive value is removed.
- JSON export is lossless by design; review it before sharing.
- Output files are written only to the user-specified path.
- No shell execution is performed by the exporter itself.
- No dynamic code loading or plugin execution is used.

## Operational guidance

- Treat exports as sensitive unless reviewed.
- Prefer Markdown or text when sharing externally.
- Use `--redact` when preparing exports for public issues, bug reports, docs, or social posts.
- Use `--include-bootstrap` only when you explicitly need developer or system context.
- Review generated exports before posting them to public issues, docs, or social media.

## Supply chain

- npm publishing should use Trusted Publishing/OIDC, not long-lived write tokens.
- Release packages should be built from the public GitHub repository so npm provenance can point back to source.
- Review `npm pack --dry-run` before publishing.
- Keep public fixture files sanitized; never commit raw local Codex rollouts.
