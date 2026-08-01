# Picot Roadmap

Ideas and planned features. Nothing here is committed — just captured so it doesn't get lost.

---

## 🔨 In Progress


### Session Name Display & Rename in Sidebar
Implemented. Picot now uses Pi's no-argument `SessionManager.listAll()` names, preserves the existing catalog policy, exposes a loopback-only managed-session rename endpoint, and provides target-aware rename controls across sidebar row variants. See [`docs/session-naming.md`](docs/session-naming.md) for the persisted contract and validation boundaries.

---

## 🔜 Low-Hanging Fruit

_(nothing queued right now — see Bigger Ideas below)_

---

## 🔮 Bigger Ideas

### File Preview Panel

Context-aware split pane that displays files the agent is working on.

- Code → syntax highlighted viewer (Monaco/CodeMirror)
- Images → preview (PNG, SVG, generated images)
- HTML → live iframe preview, hot reloads as agent edits
- Markdown → rendered preview

Desktop: button collapses sidebar and shrinks conversation to narrow feed, preview panel takes 60-70%. Mobile: tap a file reference to open full-screen preview.

Builds on the file browser — could auto-show preview when a file gets edited.



### Agent Teams (bundled)

Ship a subagent/team extension as part of Picot. Spawn agent teams from the web UI, visual grouping in sidebar, team status overview, live-switch between agents. Based on Pi's subagent pattern but tightly integrated.

### Session Templates

Start a new session pre-loaded with context for a specific project. Each with its own CLAUDE.md, working directory, and maybe a starter prompt.

### Multi-Model A/B Testing

Send the same prompt to two models side by side and compare responses. Split view with both responses streaming.

### memoryd Dashboard

Standalone viewer for memoryd memory files. Was previously built into Picot, stripped out to keep the core lean. The viewer code is saved at `~/Desktop/memoryd-viewer/`. Now being integrated into the native macOS memoryd menu bar app.
