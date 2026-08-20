# Security Policy

## Supported Versions

| Version | Supported          |
|---------|--------------------|
| 0.2.x   | ✅                 |
| < 0.2   | ❌                 |

## Reporting a Vulnerability

This project is a self-hosted dashboard; join keys and per-agent tokens are the
only authentication. If you discover a security issue:

1. **Do not** open a public issue with exploit details.
2. Open a [private vulnerability report](https://github.com/shreyashp47/Agent-Office/security/advisories/new)
   or email the maintainer via the contact on the repository profile.
3. Include: affected version, steps to reproduce, and impact.

You can expect an acknowledgment within 72 hours and a status update within a
week. Security fixes are released as patch versions.

## Security Notes for Deployments

- The server binds to `127.0.0.1` by default — only expose it publicly via the
  documented Cloudflare tunnel or a reverse proxy (see
  [docs/PUBLIC_ACCESS.md](docs/PUBLIC_ACCESS.md)).
- `/agent-push` is rate-limited to 4 requests/sec per agent; all mutating agent
  endpoints require a per-agent bearer token.
- `detail` text is sanitized before rendering in speech bubbles; no HTML is
  injected.