# AI Agent Instructions

Guidance for AI agents working in this Obsidian plugin codebase.

## What is Taskdn?

Taskdn is a file-based task management system that stores tasks, projects, and areas as Markdown files with YAML frontmatter. It draws on GTD and PARA methodology: **Tasks** are small, actionable items. **Projects** are collections of tasks that are "finishable" (they have a clear end state). **Areas** are ongoing responsibilities that are never finished (like "Health", "Finances", or "Client: Acme Corp"). Tasks can be loose, belong to an area directly, or belong to a project (which may itself belong to an area). All data lives as plain files on disk, enabling interaction via Obsidian, the Taskdn desktop app, CLI tools, or AI agents.

This plugin renders wikilinks to task files as interactive widgets. It currently only handles tasks—not projects or areas.

## Obsidian View Modes

Obsidian has two main modes for viewing notes:

- **Reading Mode**: Renders the note as formatted output (no editing). We use a markdown post-processor to replace task links with widgets.
- **Editing Mode**: Where you edit the note. Has two sub-modes:
  - **Live Preview** (default): Shows formatted content inline while editing. We use CM6 decorations to replace task wikilinks with widgets.
  - **Source Mode**: Shows raw markdown only. **We must never render widgets in Source Mode**—users expect to see and edit the raw `[[wikilink]]` syntax. Check `editorLivePreviewField` to detect this.

## Design Philosophy

Aim for maximum compatibility with themes and other plugins:

- Follow Obsidian conventions as closely as possible
- Use Obsidian's CSS variables, not hardcoded colors
- Mimic native Obsidian structures (e.g., task checkboxes use `task-list-item-checkbox` class)
- Keep CSS selectors simple and avoid overly specific rules that might conflict
- Don't assume specific DOM structures from other plugins

## Commands

```bash
bun install          # Install dependencies
bun run dev          # Watch mode
bun run build        # Production build (run before testing)
bun run check        # Type check + lint + format + tests
bun run fix          # Auto-fix lint/format issues
bun run test         # Run tests once
bun run test:watch   # Run tests in watch mode
```

## Releasing

Run `bun run release` to create a new release. The script will:

1. Run all checks (type check, lint, format, tests)
2. Prompt for version bump type (patch/minor/major)
3. Update `package.json`, `manifest.json`, and `versions.json`
4. Commit, create a signed tag, and push

GitHub Actions will then build and publish the release.

## Task Frontmatter Reference

Tasks are identified by being inside the configured `tasksDirectory` (default: `tasks/`).

**Required**: `title` (string), `status` (enum), `created-at`, `updated-at`

**Optional**: `completed-at`, `area` (wikilink), `projects` (single-element array of wikilink), `due`, `scheduled`, `defer-until`

**Status values**: `inbox`, `icebox`, `ready`, `in-progress`, `blocked`, `dropped`, `done`

The plugin displays: title, first project, area (if no project), defer-until date, due date. Checkbox toggles between `ready` ↔ `done`.

**Full spec**: See the [S1-core specification](https://github.com/dannysmith/taskdn/blob/main/tdn-specs/S1-core.md).

## Visual Design

| Status        | Left Border      | Opacity | Strikethrough |
| ------------- | ---------------- | ------- | ------------- |
| `inbox`       | `--color-blue`   | —       | —             |
| `icebox`      | `--color-cyan`   | —       | —             |
| `ready`       | none             | —       | —             |
| `in-progress` | `--color-yellow` | —       | —             |
| `blocked`     | `--color-red`    | —       | —             |
| `dropped`     | `--color-pink`   | 0.7     | title only    |
| `done`        | none             | 0.7     | title only    |

## Architecture

### Rendering Implementation

As described in [Obsidian View Modes](#obsidian-view-modes), we render widgets differently depending on context:

- **Live Preview** (`live-preview.ts`): CM6 `ViewPlugin` that walks the syntax tree for visible ranges, finds wikilinks, resolves them to task files, and creates `Decoration.replace()` decorations.
- **Reading Mode** (`main.ts`): Markdown post-processor that finds `a.internal-link` elements and replaces them with widget DOM.

Both share `createTaskWidget()` from `widgets/task-widget.ts`.

### Two Widget Structures

**Inline** (wikilink in flowing text like `See [[my-task]] for details`):

- Self-contained pill with checkbox inside
- `taskdn-inline` class isolates it from parent text-decoration

**List item** (wikilink after bullet like `- [[my-task]]`):

- Mimics native Obsidian checklist structure
- Checkbox positioned outside widget with `task-list-item-checkbox` class
- Line gets `HyperMD-task-line` class so completing strikes through the whole line
- Wrapped in `taskdn-widget-wrapper`

The `isListItem` param in `createTaskWidget()` controls which structure is used.

### Key Obsidian APIs

- **`metadataCache.getFileCache()`**: Read frontmatter without parsing files. Never parse YAML directly.
- **`processFrontMatter()`**: Modify frontmatter safely. Used by `toggleTaskStatus()`.
- **`editorLivePreviewField`**: State field to detect Live Preview vs Source mode. Only render widgets in Live Preview.
- **`editorInfoField`**: Get the current file path for resolving relative wikilinks.
- **`registerEditorExtension()`**: Register CM6 extensions for the editor.

## Development Notes

### Why ViewPlugin instead of StateField?

ViewPlugin is better for performance when decorations depend only on visible content. We rebuild decorations on viewport/selection changes, which is the ViewPlugin use case. StateField would be needed if decorations had to affect content outside the viewport.

### The Click Handling Problem

CM6 aggressively handles mouse events on decorations. Without intervention, clicking a widget checkbox would trigger CM6's default behavior (moving cursor, selecting text).

Solution:

1. Widget's `ignoreEvent()` returns true for mouse events
2. `mousedown` handler calls `e.stopPropagation()`
3. `widgetClickInProgress` WeakSet prevents decoration rebuilds during the click (otherwise the widget would be destroyed mid-interaction)

### The Checkbox Alignment Problem

Native Obsidian task lines use 30px left indent. Our list-item widgets need to match this exactly so checkboxes align with native tasks.

Solution in CSS:

```css
.cm-line:has(.taskdn-widget-wrapper) {
  text-indent: -30px !important;
  padding-inline-start: 30px !important;
}
```

The list marker (`.cm-formatting-list`) is hidden; our checkbox takes its place.

### Decoration Ordering

`RangeSetBuilder` requires decorations in document order. `buildDecorations()` collects all decorations into an array, sorts by position, then adds them to the builder. Line decorations and widget decorations for the same line must both be sorted.

## CSS Notes

Key patterns in `styles.css`:

- **Container queries** for responsive layout at narrow widths
- **CSS Grid** for widget content layout (title, meta, button)
- **`text-decoration: none`** on inline widgets to prevent strikethrough inheritance from surrounding text

Obsidian CSS variables to use: `--color-blue`, `--color-yellow`, `--color-red`, `--color-cyan`, `--color-pink`, `--text-normal`, `--text-muted`, `--background-secondary`, `--text-accent`.

## Documentation

### Context7 Queries

```
# CodeMirror 6 (decorations, widgets, ViewPlugin, WidgetType)
libraryId="/websites/codemirror_net"

# Obsidian general help
libraryId="/websites/help_obsidian_md"
```

### Key Obsidian Docs

- [Editor Extensions](https://docs.obsidian.md/Plugins/Editor/Editor+extensions) - CM6 integration overview
- [Decorations](https://docs.obsidian.md/Plugins/Editor/Decorations) - How to style/replace content
- [View Plugins](https://docs.obsidian.md/Plugins/Editor/View+plugins) - Viewport-aware extensions
- [CSS Variables](https://docs.obsidian.md/Reference/CSS+variables/Foundations/Colors) - Theme-compatible colors
- [Plugin Guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines) - Best practices for submission

### API Reference

- [obsidian-api](https://github.com/obsidianmd/obsidian-api) - TypeScript definitions
- [Sample Plugin](https://github.com/obsidianmd/obsidian-sample-plugin) - Reference implementation

## Rules

1. Always use `bun`, never `npm` or `pnpm`.
2. Run `bun run build` before asking user to test locally
3. Run `bun run check` before committing
4. Never use `innerHTML` with user content—use `createEl()`, `createDiv()`, `createSpan()`
5. Never use regex lookbehind assertions (breaks mobile)
6. Access app via `this.app`, never global `app`
