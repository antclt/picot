# Engineering Lessons

This document records prevention rules derived from production defects. Treat each
applicable rule as a release-blocking acceptance criterion, not as guidance.

## Runtime adapters must preserve the handler contract

When `extensions/embedded-server.ts` routes are invoked through Bun's Fetch
adapter, request and response objects are not Node `IncomingMessage` and
`ServerResponse` instances. A handler MUST NOT call Node EventEmitter methods
such as `once()` or `removeListener()` unless the adapter provides them.

- Define the smallest shared contract at the boundary.
- Prefer standard `AbortSignal` cancellation for Fetch paths; support Node event
  lifecycle only as an optional compatibility path.
- Test every new or changed HTTP route through the production Fetch adapter shape,
  in addition to testing extracted helpers.
- Include already-aborted requests and cleanup paths in cancellation tests.
- A route exception that can terminate the embedded server is a session-loading
  regression and MUST have an end-to-end smoke check.

## Prototypes are UI contracts, not inspiration

A supplied visual prototype is binding for the described surface. Before coding,
turn it into explicit, testable requirements:

- visible rows, labels, icons, separators, spacing, truncation, and controls;
- API fields intentionally omitted from the UI;
- localized text and accessible names; and
- loading, empty, error, and viewport-clamping states.

The design spec MUST state those requirements. DOM tests MUST assert the
structural contract. For popup, overlay, or other appearance-sensitive work, a
real browser screenshot or interaction check against the prototype is REQUIRED;
unit tests alone are insufficient.

## Shared-state rerenders must preserve transient UI deliberately

A Pin mutation can synchronously rerender the sidebar while a quick-info card is
open. Any renderer that replaces DOM MUST explicitly decide what happens to an
open overlay, focused control, hover target, pending request, and scroll/fold
state.

- Preserve an open card when the same logical workspace is recreated.
- Rebind the card to the replacement header before the old DOM is discarded.
- Test the complete sequence: open overlay → mutate shared state → rerender →
  verify visibility, target data, focus behavior, and action state.
- Only close transient UI when the underlying logical target disappeared or the
  product specification says to close it.

## Required evidence before completion

For a change spanning frontend, embedded server, or persistence:

1. Run focused behavior tests for each changed boundary.
2. Run the full test suite and the project formatter/linter check.
3. Exercise the real affected path in the development app when it crosses the
   browser/server adapter or changes visible UI.
4. Record any intentionally retained API/UI difference in both the feature design
   spec and `ARCHITECTURE.md`.

## Workspace transitions must use the active server root

A workspace/session switch crosses several independent state boundaries:
`session.cwd`, sidebar project metadata, foreground port, broker routing, the
WebView origin, and the embedded server's active context. Treating any one of
these as the workspace authority can produce a misleadingly valid request to
the wrong Pi process.

- For a workspace-root file-tree refresh, request `/api/files?scope=workspace`
  without an explicit `path`. The active embedded server resolves and returns
  its own canonical root.
- Pass an explicit `path` only for navigation inside an already-loaded tree.
  Never reuse the previous workspace's absolute root during a transition; the
  file route correctly rejects it with `403 outsideWorkspace`.
- Use the session's recorded `cwd` and the server's `mirror_sync.workspaceId`
  as authoritative workspace identity. Sidebar project paths are display and
  grouping metadata and may be stale or inconsistent with imported sessions.
- A same-workspace session switch must not reload the file tree. A
  cross-workspace switch must force exactly one root refresh after the new
  session's mirror snapshot confirms the active workspace.
- Do not hide this race with an unconditional retry. A `403 outsideWorkspace`
  identifies a wrong root and must be fixed at the source; only transient
  readiness/network errors are candidates for bounded retry.

### Diagnostic sequence

When a file-tree transition fails, capture the complete request URL and the
runtime routing state before changing code:

1. Compare the request origin/port with `foregroundPort` and `wsSourcePort`.
2. Compare the request's `path` with the server-reported `workspaceId` and the
   selected session's `cwd`.
3. Inspect the JSON error code. `outsideWorkspace` means the client sent a
   stale or foreign absolute path; it is not a generic loading failure.
4. Reproduce consecutive switches, not only the first switch after startup;
   stale in-memory paths often appear only on the second transition.

The regression was initially obscured by valid history rendering and successful
broker events. The decisive evidence was a request such as:

```text
/api/files?path=/Users/.../picot-v3&scope=workspace
```

being sent after the active session had moved to another workspace. Removing the
stale root from workspace-root requests fixed the 403 without introducing a new
transport architecture or a full-page refresh.

## Pre-commit re-staging collapses partial file stages

The `.husky/pre-commit` hook re-stages every lintable staged file with a plain
`git add` so that Biome/rustfmt fixes land in the commit. A whole-file `git add`
is not a no-op when the file was only partially staged: it stages the entire
working-tree copy, overwriting any partial stage built with `git apply --cached`
or `git add -p`. Unstaged in-progress work in that file then silently lands in
the commit.

This bites whenever a single file mixes a hunk you want to commit with
in-progress work you do not — for example, a bug-fix hunk in `app.js` while an
unrelated feature is half-written in the same file.

- A partial stage is not durable across this hook. If a file must commit only
  some of its working-tree changes, make the working tree contain only those
  changes at commit time: `git stash` the rest of that file, or temporarily
  reset it to HEAD and re-apply just the target hunk, then commit, then restore
  the held-back changes.
- Never assume "No fixes applied" means the hook did not touch the index. The
  hook re-stages unconditionally, regardless of whether Biome changed anything.
- After committing a partially-staged file, verify with
  `git show <commit> -- <file>` that the committed line count matches the
  intended hunk. A much larger diff means in-progress work was swept in.
- Prefer physical separation: keep a bug fix and an in-progress feature in
  different files, or use a worktree, so partial staging is not needed.

### Diagnostic sequence

When a commit unexpectedly contains unrelated in-progress work:

1. `git show <commit> --stat` — if a file's insertion count dwarfs the intended
   hunk, the hook re-staged the whole file.
2. `git show <commit>:<file> | grep <in-progress-marker>` — confirms the
   in-progress code is in the commit, not only in the working tree.
3. Recover with `git reset --mixed HEAD~1` (the working tree is preserved),
   then re-commit with the working tree holding only the target hunk for that
   file.

The decisive evidence here was a 290-line `app.js` diff in a commit that was
supposed to add an 8-line hunk, with `enterFocus` present in the committed blob
but meant to stay unstaged as in-progress feature work.
