# ADR 0003: Separate Picot metadata and use QR device authorization

- Status: Accepted
- Date: 2026-07-14

## Context

Picot needs stable UI identity and remote-client authorization without taking ownership of Pi sessions,
credentials, settings, or project trust. The approved release retains LAN access without transport
encryption.

## Decision

SQLite stores only Picot metadata: workspace IDs, UI preferences, suspension policy, schema version,
and paired-device token hashes. Pi continues to own session JSONL, `AuthStorage`, settings files, and
`trust.json`. Losing or resetting the Picot database cannot mutate Pi sessions or workspace files.

Project Trust is a blocking, default-deny startup gate before project resources execute. Current-session
settings use native RPC; project and global defaults atomically merge into Pi settings while preserving
unknown keys.

Remote pairing is QR-only. A single-use pairing token expires after five minutes and exchanges for a
revocable long-term device token; only its hash is persisted. Remote clients may use approved runtime
operations but cannot invoke folder picking, app launching, package changes, updates, workspace
deletion, or other dangerous Host operations.
The `/picot-config` prompt adapter can mutate Pi-owned settings and historical session metadata; as of
2026, remote clients paired via QR are trusted to invoke it like desktop clients, so the Host router no
longer special-cases `/picot-config` runtime prompts for `ClientKind::Remote`. The dangerous
`host_request` operations above remain remote-forbidden.

The LAN transport remains unencrypted for this release. The product must display an explicit warning
that prompts and source may be observable on the network.

Workspace file browsing, source preview, Git status, and per-file Git diff are read-only Host data
operations. Their HTTP endpoints require a registered workspace ID, accept only workspace-relative
paths, and resolve those paths through the same containment checks used by file preview. Git commands
run in the registered workspace and never accept an arbitrary working directory from the browser.

Office and email preview is also Host-owned. For an allowlisted suffix, the Rust Host reads a
canonical workspace-contained regular file with a 32 MiB input cap and streams those bytes to an
optional local Python 3.10+ MarkItDown process using fixed arguments and a scrubbed environment.
Converted output is capped at 2 MiB, diagnostics at 256 KiB, execution at 20 seconds, and concurrency
at two conversions per Host. Source paths, credentials, plugins, cloud integrations, and shell
interpolation are never passed to the converter. Converted Markdown remains untrusted and is rendered
with the frontend's converted-document sanitizer and remote-image blocking policy.

## Consequences

- Import, sharing, encrypted transport, session indexing/FTS, and arbitrary TUI rendering remain
  deferred.
- Authorization is enforced by the Host route family, not by hiding frontend controls.
- Credentials, pairing secrets, prompt content, and command content must not appear in diagnostics.
