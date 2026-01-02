# Obsidian Taskdn

An Obsidian plugin for [Taskdn](https://github.com/dannysmith/taskdn), a file-based task management system that stores tasks as Markdown files with YAML frontmatter.

Taskdn keeps everything as plain files on disk, so you can work with your tasks in Obsidian, the Taskdn desktop app, CLI tools, or AI agents. This plugin turns wikilinks to task files into interactive widgets.

<img width="808" height="335" alt="Screenshot 2026-01-02 at 06 06 28" src="https://github.com/user-attachments/assets/82ec1e7a-7b8d-4230-9264-4e135fd214ed" />

## Features

Wikilinks to task files become clickable widgets with:

- Checkbox to toggle completion (switches between `ready` and `done`)
- Task title (click to open the file)
- Project, area, and due/defer dates when present
- Coloured left border showing status (blue = inbox, yellow = in-progress, red = blocked, etc.)

When you put a task link in a bullet list (`- [[my-task]]`), it behaves like a native Obsidian checklist—completing it strikes through the whole line.

You can also right-click any checklist item (`- [ ] Do something`) to convert it into a Taskdn task file.

## Prerequisites

1. WikiLinks must be enabled (Settings → Files & Links → "Use [[Wikilinks]]")
2. You need a tasks folder with files following the [Taskdn spec](https://github.com/dannysmith/taskdn/blob/main/tdn-specs/S1-core.md)

## Installation

1. Settings → Community Plugins
2. Search for "Taskdn"
3. Install and enable

## Configuration

In Settings → Taskdn:

- **Tasks directory** – where your task files live (default: `tasks`)
- **Default status** – status for newly converted tasks (default: `inbox`)
- **Show desktop app button** – adds a button to open tasks in the Taskdn desktop app
- **Ignored files** – task files to exclude from widget rendering (one pattern per line, supports `*` wildcard). Paths are relative to the tasks directory, e.g. `archive/*` or `*-template`

## Usage

Link to any task file in your tasks directory:

```markdown
- [[my-task]]
Check out [[another-task]] for details.
```

Works in both Live Preview and Reading Mode.

## Development

```bash
git clone https://github.com/dannysmith/obsidian-taskdn.git
cd obsidian-taskdn
bun install
bun run dev      # Watch mode
bun run build    # Production build
bun run check    # Type check + lint
bun run fix      # Auto-fix lint/format
```

To test, copy `main.js`, `manifest.json`, and `styles.css` to `.obsidian/plugins/taskdn/` in your vault.

## License

[MIT](LICENSE)
