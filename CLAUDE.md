# AI Agent Instructions

This file provides guidance to AI Agents like Claude Code when working with code in this repository.

## What is Taskdn?

Taskdn is a file-based task management system that stores tasks, projects, and areas as Markdown files with YAML frontmatter. It follows GTD/PARA methodology: **Tasks** are actionable items that can belong to **Projects** (finishable collections of tasks) or **Areas** (ongoing responsibilities like "Health" or "Work"). All data lives as plain files on disk, enabling interaction via Obsidian, CLI tools, or AI agents. This plugin renders wikilinks to task files as interactive widgets—it currently only handles tasks, not projects or areas.

## Task File Specification (S1-core)

Tasks must be stored in a designated tasks directory. The frontmatter follows this spec:

### Required Fields

| Field        | Type             | Description                        |
|--------------|------------------|------------------------------------|
| `title`      | string           | The title of the task              |
| `status`     | enum             | See status values below            |
| `created-at` | date or datetime | When the task was created          |
| `updated-at` | date or datetime | When the task was last modified    |

### Optional Fields

| Field          | Type                     | Description                                           |
|----------------|--------------------------|-------------------------------------------------------|
| `completed-at` | date or datetime         | Set when status becomes `done` or `dropped`           |
| `area`         | file reference           | Reference to an Area file (wikilink or path)          |
| `projects`     | array of file references | Single-element array with project reference           |
| `due`          | date or datetime         | Hard deadline                                         |
| `scheduled`    | date                     | Planned work date                                     |
| `defer-until`  | date                     | Hide until this date                                  |

### Status Values

| Status        | Description                                    |
|---------------|------------------------------------------------|
| `inbox`       | Newly captured, not yet processed              |
| `icebox`      | Intentionally deferred indefinitely            |
| `ready`       | Processed and ready to work on                 |
| `in-progress` | Currently being worked on                      |
| `blocked`     | Cannot proceed due to external dependency      |
| `dropped`     | Abandoned, will not be completed               |
| `done`        | Completed successfully                         |

Dates use ISO 8601 format: `YYYY-MM-DD` or `YYYY-MM-DDTHH:MM`.

## Status Display Semantics

| Status        | Border Color       | Special Treatment              |
|---------------|--------------------|--------------------------------|
| `inbox`       | Blue               | —                              |
| `icebox`      | Cyan               | —                              |
| `ready`       | None               | Neutral default state          |
| `in-progress` | Yellow             | —                              |
| `blocked`     | Red                | —                              |
| `dropped`     | Pink               | Opacity 0.7, title strikethrough |
| `done`        | None               | Opacity 0.7, title strikethrough |

## Widget Types

### Inline Widget
When a task wikilink appears within text (e.g., `Check out [[my-task]] for details`):
- Renders as a self-contained pill with checkbox inside
- Has `taskdn-inline` class to isolate from parent text-decoration
- Does not affect surrounding content styling

### List Item Widget
When a task wikilink is the first thing after a bullet marker (e.g., `- [[my-task]]`):
- Behaves like a native Obsidian checklist item
- Checkbox positioned outside the widget (native `task-list-item-checkbox` class)
- Line gets `HyperMD-task-line` class in Live Preview
- Completing the task strikes through the entire line (not just the widget)
- Uses `taskdn-widget-wrapper` structure with checkbox in a label

## Widget Features

- **Title**: Clickable link that opens the task file
- **Metadata display**: Shows first project (with `○` prefix), area (with `📁` prefix), defer-until date (`⏳`), and due date (`📅`)
- **Checkbox**: Toggles between `ready` and `done` status, updates frontmatter
- **Desktop app button**: Opens task in Taskdn desktop app via `taskdn://` URL scheme (hidden by default, enabled in settings)
- **Context menu**: Right-click shows "Open in taskdn desktop app" option
- **Convert to task**: Right-clicking a checklist line (`- [ ] text`) shows "Convert to task" to create a task file and replace the line with a wikilink

## File Structure

```
src/
├── main.ts              # Plugin entry point, lifecycle, event handlers
├── live-preview.ts      # CM6 ViewPlugin for Live Preview decorations
├── settings.ts          # Settings tab UI
├── types.ts             # TypeScript types (TaskStatus, TaskData, TaskdnSettings)
├── utils/
│   └── task-utils.ts    # Task resolution, status toggling, date formatting
└── widgets/
    └── task-widget.ts   # Shared widget DOM creation for both modes
styles.css               # All widget styling, responsive layouts
```

### Key Code Paths

**Live Preview** (`live-preview.ts`):
- `taskLinkViewPlugin()` creates a CM6 `ViewPlugin`
- `buildDecorations()` iterates visible ranges, finds wikilinks via syntax tree
- Creates `Decoration.replace()` with `TaskLinkWidget` (extends `WidgetType`)
- Line decorations add `HyperMD-task-line` class for native task styling
- Decorations rebuild on `docChanged`, `viewportChanged`, `selectionSet`

**Reading Mode** (`main.ts:processTaskLinks`):
- Markdown post-processor finds `a.internal-link` elements
- Calls `createTaskWidget()` and replaces the link
- Adds `task-list-item` class to parent `<li>` when appropriate

**Widget Creation** (`widgets/task-widget.ts`):
- `createTaskWidget()` builds DOM for both modes
- `isListItem` param determines checkbox position (inside vs outside widget)
- Checkbox click calls `toggleTaskStatus()` which uses `processFrontMatter()`

## Development Rules

1. **Always use `bun`** for package management and scripts
2. **Always run `bun run build`** before asking the user to test locally
3. **Always run `bun run check`** before committing to catch type/lint errors
4. Use Obsidian's CSS variables (e.g., `--text-normal`, `--color-blue`) rather than hardcoded colors
5. Use `createEl()`, `createDiv()`, `createSpan()` instead of `innerHTML` for security
6. Access app via `this.app`, never global `app` or `window.app`
7. Register events with `registerEvent()` and commands with `addCommand()` for automatic cleanup
8. Use `processFrontMatter()` for YAML modifications, not direct file writes
9. Read task data from `metadataCache`, never parse files directly
10. Never use lookbehind assertions in regex (breaks mobile)

## CSS Development

The `css-expert` skill is useful when working on styles. Key challenges in this codebase:

- **Live Preview alignment**: Uses `text-indent: -30px` trick to match native task checkbox positioning
- **Container queries**: Used for responsive widget layout at narrow widths
- **List marker hiding**: `.cm-formatting-list` is hidden, checkbox takes its place
- **Strikethrough isolation**: Inline widgets use `text-decoration: none` to prevent inheritance

## Documentation References

### Obsidian Plugin Development
- **Developer Docs Home**: https://docs.obsidian.md/Home
- **Plugin API Types**: https://github.com/obsidianmd/obsidian-api
- **Sample Plugin**: https://github.com/obsidianmd/obsidian-sample-plugin
- **Plugin Guidelines**: https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines
- **Submission Requirements**: https://docs.obsidian.md/Plugins/Releasing/Submission+requirements+for+plugins
- **Developer Forum**: https://forum.obsidian.md/c/developers-api/14

### Editor Extensions (CodeMirror 6)
- **Editor Extensions**: https://docs.obsidian.md/Plugins/Editor/Editor+extensions
- **Decorations**: https://docs.obsidian.md/Plugins/Editor/Decorations
- **View Plugins**: https://docs.obsidian.md/Plugins/Editor/View+plugins
- **State Fields**: https://docs.obsidian.md/Plugins/Editor/State+fields

### CSS Variables
- **CSS Variables Overview**: https://docs.obsidian.md/Reference/CSS+variables/CSS+variables
- **Colors Reference**: https://docs.obsidian.md/Reference/CSS+variables/Foundations/Colors
- **About Styling**: https://docs.obsidian.md/Reference/CSS+variables/About+styling
- **Editor List Styles**: https://docs.obsidian.md/Reference/CSS+variables/Editor/List

### Context7 Commands

```bash
# Obsidian Help documentation
mcp__context7__query-docs libraryId="/websites/help_obsidian_md" query="your query"

# CodeMirror 6 documentation (decorations, widgets, view plugins)
mcp__context7__query-docs libraryId="/websites/codemirror_net" query="your query"
```

### Taskdn Specification
- Full S1-core spec: `/Users/danny/dev/taskdn/tdn-specs/S1-core.md`
- Overview: `/Users/danny/dev/taskdn/docs/overview.md`

## Common Pitfalls

### Live Preview Decoration Issues
- View plugins can't add layout-affecting decorations (block widgets, line breaks)
- Decorations must be sorted by position before adding to `RangeSetBuilder`
- Use `widgetClickInProgress` WeakSet to prevent decoration rebuilds during clicks
- Check `editorLivePreviewField` to avoid rendering in Source mode

### Widget Click Handling
- Widgets must call `e.stopPropagation()` on mousedown to prevent CM6 interference
- Use `ignoreEvent()` to tell CM6 which events the widget handles

### Checkbox Alignment
- Native Obsidian tasks use 30px indent; match this with `text-indent: -30px` + `padding-inline-start: 30px`
- Checkbox needs `task-list-item-checkbox` class for native styling
