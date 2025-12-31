# Obsidian Taskdn

An Obsidian plugin for [Taskdn](https://github.com/dannysmith/taskdn), a task management system that stores tasks as markdown files with YAML frontmatter.

Taskdn's data lives as plain files on disk (so you can use Obsidian, VS Code, or AI tools to work with it). Taskdn includes a Desktop app, CLI tool (with a special `--ai` mode for LLMs), a Claude Code plugin and an Obsidian plugin. This is the Obsidian plugin.

<img width="641" height="120" alt="obsidian-tdn-example" src="https://github.com/user-attachments/assets/c9328012-fcb0-4956-80a0-9cbb0d9e53e1" />


## Installation

1. Open Settings → Community Plugins
2. Search for "Taskdn"
3. Click Install, then Enable

## Configuration

Go to Settings → Taskdn:

- **Tasks directory** – Path to the folder containing task files (default: `tasks`)
- **Default status** – Status for tasks created from checklist items (default: `inbox`)

## Usage

Wikilinks to task files are rendered as interactive widgets with a checkbox, title, project/area, and due date. Click the checkbox to toggle completion, or click the title to open the task file.

To convert a checklist item to a task, right-click on a line like `- [ ] My task` and select "Convert to Taskdn task".

Task files follow the [Taskdn specification](https://github.com/dannysmith/taskdn/blob/main/tdn-specs/S1-core.md).

## Development

```bash
git clone https://github.com/dannysmith/obsidian-taskdn.git
cd obsidian-taskdn
bun install
bun run dev      # Watch mode
bun run build    # Production build
bun run check    # Type check + lint
bun run fix      # Auto-fix lint/format issues
```

To test locally, copy `main.js`, `manifest.json`, and `styles.css` to `.obsidian/plugins/taskdn/` in your vault.

## License

[MIT](LICENSE)
