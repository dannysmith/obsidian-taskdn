# Obsidian Taskdn

An Obsidian plugin for [Taskdn](https://github.com/dannysmith/taskdn), a file-based task management system that stores tasks as Markdown files with YAML frontmatter.

Taskdn keeps everything as plain files on disk, so you can work with your tasks in Obsidian, the Taskdn desktop app, CLI tools, or AI agents. This plugin turns wikilinks to task files into interactive widgets.

<img width="808" height="335" alt="Screenshot 2026-01-02 at 06 06 28" src="https://github.com/user-attachments/assets/82ec1e7a-7b8d-4230-9264-4e135fd214ed" />

## Features

### Task Link Widgets

Wikilinks to task files become clickable widgets with:

- Checkbox to toggle completion (switches between `ready` and `done`)
- Task title (click to open the file)
- Project, area, and due/defer dates when present
- Coloured left border showing status (blue = inbox, yellow = in-progress, red = blocked, etc.)

When you put a task link in a bullet list (`- [[my-task]]`), it behaves like a native Obsidian checklist—completing it strikes through the whole line.

You can also right-click any checklist item (`- [ ] Do something`) to convert it into a Taskdn task file.

### Inline Title Replacement

When Obsidian's "Show inline title" setting is enabled, you can optionally have task files display their human-readable `title` frontmatter instead of the filename.

<img width="615" height="209" alt="Inline title replacement showing task title instead of filename" src="https://github.com/user-attachments/assets/placeholder-inline-title.png" />

**How it works:**

- Enable "Use task title as inline title" in the plugin settings
- When viewing a task file, the inline title shows the `title` frontmatter (e.g., "Buy groceries") instead of the filename (e.g., "buy-groceries")
- Editing the inline title updates the `title` frontmatter and sets `updated-at` to today's date
- A coloured left border appears on the document indicating the task's status

This only applies to valid Taskdn task files—documents in your tasks directory with both `title` and `status` frontmatter that aren't in the ignored files list. For all other files, Obsidian's normal inline title behaviour is unchanged.

**Optional filename sync:** Enable "Sync filename with task title" to also rename the file when you edit the inline title. The filename is converted to kebab-case (e.g., "Buy Groceries" → `buy-groceries.md`), and Obsidian automatically updates any links to the file.

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
- **Use task title as inline title** – display the `title` frontmatter instead of the filename in Obsidian's inline title (requires Obsidian's "Show inline title" to be enabled)
- **Sync filename with task title** – when editing the inline title, also rename the file to match (in kebab-case)

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
