# AI Agent Instructions

Guidance for AI agents working in this Obsidian plugin codebase.

## What is Taskdn?

Taskdn is a file-based task management system that stores tasks, projects, and areas as Markdown files with YAML frontmatter. It draws on GTD and PARA methodology: **Tasks** are small, actionable items. **Projects** are collections of tasks that are "finishable" (they have a clear end state). **Areas** are ongoing responsibilities that are never finished (like "Health", "Finances", or "Client: Acme Corp"). Tasks can be loose, belong to an area directly, or belong to a project (which may itself belong to an area). All data lives as plain files on disk, enabling interaction via Obsidian, the Taskdn desktop app, CLI tools, or AI agents.

This plugin renders wikilinks to task files as interactive widgets. It currently only handles tasks—not projects or areas.

## Obsidian View Modes

- **Reading Mode**: Rendered output, no editing. A markdown post-processor replaces task links with widgets.
- **Live Preview** (editing, default): CM6 decorations replace task wikilinks with widgets.
- **Source Mode** (editing): Raw markdown. **Never render widgets here**—users expect to edit the raw `[[wikilink]]`. Check `editorLivePreviewField` to detect it.

## Design Philosophy

Aim for maximum compatibility with themes and other plugins:

- Follow Obsidian conventions and mimic native structures (e.g. task checkboxes use the `task-list-item-checkbox` class)
- Use Obsidian's CSS variables, never hardcoded colours
- Keep CSS selectors simple; don't assume DOM structures from other plugins

## Commands

```bash
bun install          # Install dependencies (also enables the pre-commit hook)
bun run dev          # Watch build
bun run build        # Production build
bun run check        # Types, Obsidian lint (zero warnings), formatting, tests
bun run fix          # Auto-fix lint and formatting
bun run test         # Tests (bun test)
bun run test-vault   # Create or reset the test vault
```

## Testing in Obsidian

`bun run test-vault` writes a throwaway vault to `test-vault/` (gitignored) with fixture tasks and notes, and symlinks `main.js`, `manifest.json` and `styles.css` into it. Rerunning it resets the notes. Danny's own vault also loads the plugin from this repo, so every build reaches it too.

With the test vault open in Obsidian, drive it with the [Obsidian CLI](https://help.obsidian.md/cli) after each build:

```bash
obsidian vault=test-vault plugin:reload id=taskdn   # Load the new build
obsidian vault=test-vault reload             # Reload the whole window (a clean startup)
obsidian vault=test-vault open file=Widgets  # Open a note
obsidian vault=test-vault dev:errors         # Errors since load
obsidian vault=test-vault dev:screenshot     # Prints the path of a temp PNG
obsidian vault=test-vault dev:dom selector=".taskdn-widget" total
obsidian vault=test-vault dev:mobile on      # Mobile emulation
```

- Only ever target `vault=test-vault`. `eval` and `dev:cdp` run arbitrary code and need Danny's approval.
- Files in `test-vault/` can be edited directly; Obsidian picks up the change, which is a quick way to test widget refreshes.
- Screenshot filenames contain narrow no-break spaces. Copy with a glob (`cp "$dir"/obsidian-screenshot-*.png ...`) before reading.

## Releasing

Run `bun run release`. It runs the checks, bumps the version in `package.json`, `manifest.json` and `versions.json`, then commits, tags and pushes. GitHub Actions builds and publishes the release.

The Obsidian community directory reviews every release: it lints the source with `eslint-plugin-obsidianmd` (our ESLint config uses the same rules) and runs `bun run build` to check the published `main.js` matches the source.

## Task Frontmatter Reference

Tasks are files inside the configured `tasksDirectory` (default: `tasks/`).

**Required**: `title` (string), `status` (enum), `created-at`, `updated-at`

**Optional**: `completed-at`, `area` (wikilink), `projects` (single-element array of wikilink), `due`, `scheduled`, `defer-until`

**Status values**: `inbox`, `icebox`, `ready`, `in-progress`, `blocked`, `dropped`, `done`

The widget shows: title, first project, area (if no project), defer-until date, due date. The checkbox toggles `ready` ↔ `done`.

**Full spec**: [S1-core specification](https://github.com/dannysmith/taskdn/blob/main/tdn-specs/S1-core.md).

## Visual Design

| Status        | Widget border    | Task note border | Opacity | Strikethrough |
| ------------- | ---------------- | ---------------- | ------- | ------------- |
| `inbox`       | `--color-blue`   | `--color-blue`   | —       | —             |
| `icebox`      | `--color-cyan`   | `--color-cyan`   | —       | —             |
| `ready`       | none             | `--text-faint`   | —       | —             |
| `in-progress` | `--color-yellow` | `--color-yellow` | —       | —             |
| `blocked`     | `--color-red`    | `--color-red`    | —       | —             |
| `dropped`     | `--color-pink`   | `--color-pink`   | 0.7     | title only    |
| `done`        | none             | `--color-green`  | 0.7     | title only    |

The task note border is the left edge of an open task note when "Use task title as inline title" is on.

## Architecture

- **Live Preview** (`live-preview.ts`): a CM6 `ViewPlugin` walks the syntax tree in the visible ranges, resolves wikilinks to task files and adds `Decoration.replace()` widgets.
- **Reading Mode** (`reading-mode.ts`): a markdown post-processor replaces `a.internal-link` elements with widgets. Each widget is a `MarkdownRenderChild` that rebuilds itself when its task file changes.

Both use `createTaskWidget()` from `widgets/task-widget.ts`, which has two structures (chosen by `isListItem`):

- **Inline** (`See [[my-task]] for details`): self-contained pill with the checkbox inside. The `taskdn-inline` class stops it inheriting the line's strikethrough.
- **List item** (`- [[my-task]]`): mimics a native checklist item. The checkbox sits outside the widget with the `task-list-item-checkbox` class, and the line gets `HyperMD-task-line` so completing it strikes through the whole line.

### Key Obsidian APIs

- **`metadataCache.getFileCache()`**: read frontmatter. Never parse YAML yourself.
- **`fileManager.processFrontMatter()`**: write frontmatter safely.
- **`editorLivePreviewField`**: Live Preview vs Source mode.
- **`editorInfoField`**: the current file path, for resolving relative wikilinks.

### Non-obvious details

- **Click handling**: CM6 grabs mouse events on decorations, so a checkbox click would move the cursor instead. The widget's `ignoreEvent()` returns true for mouse events, its `mousedown` handler stops propagation, and the `widgetClickInProgress` WeakSet blocks decoration rebuilds mid-click (otherwise the widget is destroyed during the interaction).
- **Checkbox alignment**: native task lines use a 30px indent. `styles.css` forces the same indent on lines containing `.taskdn-widget-wrapper` and hides the list marker so our checkbox takes its place.
- **Decoration order**: `RangeSetBuilder` needs decorations in document order, so `buildDecorations()` collects line and widget decorations, sorts them, then adds them.
- **Decoration precedence**: the view plugin is wrapped in `Prec.highest`. Obsidian hides `[[` with its own replace decoration, and when replace decorations overlap CM6 only draws the higher-precedence widget, so without it widgets randomly render empty.
- **Refreshing**: widgets are rebuilt, never patched in place. When a task file changes, Live Preview rebuilds via a CM6 state effect (`refreshLivePreviewWidgets()`) and each Reading mode widget re-renders itself. Avoid re-rendering whole Reading mode notes for task changes: it loses the scroll position. Settings changes (`applySettings()`) do re-render them, since links can become widgets or stop being widgets.

## Documentation

Context7 library IDs: `/websites/codemirror_net` (CM6 decorations, widgets, ViewPlugin) and `/websites/help_obsidian_md` (Obsidian help).

- [Editor extensions](https://docs.obsidian.md/Plugins/Editor/Editor+extensions), [Decorations](https://docs.obsidian.md/Plugins/Editor/Decorations), [View plugins](https://docs.obsidian.md/Plugins/Editor/View+plugins)
- [CSS variables](https://docs.obsidian.md/Reference/CSS+variables/Foundations/Colors)
- [Plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines) and [eslint-plugin-obsidianmd](https://github.com/obsidianmd/eslint-plugin) (rule docs explain each lint finding)
- [obsidian-api](https://github.com/obsidianmd/obsidian-api) (type definitions; `node_modules/obsidian/obsidian.d.ts` has `@since` tags) and the [sample plugin](https://github.com/obsidianmd/obsidian-sample-plugin)

## Rules

1. Use `bun`, never `npm` or `pnpm`.
2. `bun run check` must pass with zero warnings before committing (the pre-commit hook runs it). Fix lint findings rather than disabling them; a disable comment needs a reason (`// eslint-disable-next-line rule -- why`).
3. Never use `innerHTML`. Build DOM with `createEl()`, `createDiv()`, `createSpan()`.
4. Don't use the global `document`/`window` for anything tied to a note: notes can be open in popout windows. Use `activeDocument`/`activeWindow`, or attach listeners to the elements we create.
5. Access the app via `this.app` (or `plugin.app`), never the global `app`.
6. Using an API newer than `minAppVersion` in `manifest.json` fails lint. Raise `minAppVersion` deliberately, not to silence the rule.
7. Write frontmatter dates with `formatDate()` (local `YYYY-MM-DD`).
