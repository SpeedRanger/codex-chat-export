# npm Publishing

Codex Chat Export should be published with npm Trusted Publishing, not a long-lived automation token.

## Why

Trusted Publishing uses OIDC from GitHub Actions. npm exchanges the workflow identity for a short-lived publish credential, which avoids storing an npm write token in GitHub secrets. For public packages published from public repositories, npm also generates provenance attestations automatically.

Official references:

- npm Trusted Publishing: https://docs.npmjs.com/trusted-publishers
- npm provenance: https://docs.npmjs.com/generating-provenance-statements
- GitHub OIDC: https://docs.github.com/en/actions/reference/security/oidc

## npm Setup

Create or claim the package on npm, then configure its trusted publisher:

- Package: `codex-chat-export`
- Publisher: GitHub Actions
- Organization or user: `SpeedRanger`
- Repository: `codex-chat-export`
- Workflow filename: `publish-npm.yml`
- Environment: leave empty unless a protected GitHub environment is configured

After the first successful trusted publish, set the package publishing access to require two-factor authentication and disallow traditional tokens. npm explicitly recommends this when using trusted publishers.

## Release Flow

1. Run local verification:

   ```bash
   npm test
   npm audit --audit-level=moderate
   npm pack --dry-run
   ```

2. Publish a GitHub release with the matching package version.

3. The `Publish npm` workflow runs on the `release.published` event.

4. Confirm the package page shows provenance on npm.

5. Verify install:

   ```bash
   npx codex-chat-export --help
   npm audit signatures
   ```

## Manual Dry Run

Before the first real publish, run the workflow manually with `dry_run=true`. This verifies the workflow without uploading a package.

To publish manually after npm trusted publisher setup, run the same workflow with `dry_run=false`.

## Security Rules

- Do not add `NPM_TOKEN` unless trusted publishing is unavailable.
- Do not publish from a local workstation as the default path.
- Do not publish from a private fork; npm provenance requires a public source repository.
- Keep `repository.url` in `package.json` pointed at `SpeedRanger/codex-chat-export`.
- Review `npm pack --dry-run` output before each release.
