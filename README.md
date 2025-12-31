# Obsidian Taskdn

An Obsidian plugin that renders wikilinks to [Taskdn](https://github.com/dannysmith/taskdn) task files as interactive checklist widgets.

## Features

### Task Wikilink Rendering

Wikilinks to task files (files in your configured tasks directory) are automatically rendered as interactive widgets showing:

- **Checkbox** - Click to toggle between `done` and `ready` status
- **Title** - Click to open the task file
- **Project/Area** - Shown as clickable links (if present in frontmatter)
- **Due date** - Displayed when set

Works in both **Live Preview** and **Reading Mode**.

### Checklist-to-Task Conversion

Convert regular checklist items into proper Taskdn task files:

1. Place your cursor on a checklist line (`- [ ] My task`)
2. Right-click and select "Convert to Taskdn task", or use the command palette
3. A new task file is created and the checklist item becomes a wikilink

Checked items (`- [x]`) are created with `status: done`.

## Installation

### From Community Plugins (Coming Soon)

1. Open Settings → Community Plugins
2. Search for "Taskdn"
3. Click Install, then Enable

### Manual Installation

1. Download the latest release (`main.js`, `manifest.json`, `styles.css`) from [Releases](https://github.com/dannysmith/obsidian-taskdn/releases)
2. Create a folder in your vault: `.obsidian/plugins/taskdn/`
3. Copy the downloaded files into that folder
4. Restart Obsidian
5. Enable "Taskdn" in Settings → Community Plugins

### Using BRAT (For Beta Testing)

1. Install the [BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin
2. Add this repository: `dannysmith/obsidian-taskdn`
3. Enable the plugin

## Configuration

Go to Settings → Taskdn to configure:

| Setting | Description | Default |
|---------|-------------|---------|
| **Tasks directory** | Path to the folder containing task files | `tasks` |
| **Default status** | Status for tasks created from checklist items | `inbox` |

## Task File Format

Task files must be in the configured tasks directory and use YAML frontmatter:

```yaml
---
title: My Task
status: ready
created-at: 2025-01-15
updated-at: 2025-01-15
area: "[[Work]]"
due: 2025-02-01
---

Optional task body/notes here.
```

This follows the [Taskdn specification](https://github.com/dannysmith/taskdn/blob/main/tdn-specs/S1-core.md).

### Supported Statuses

| Status | Description |
|--------|-------------|
| `inbox` | Uncategorized |
| `icebox` | On hold / someday |
| `ready` | Ready to work on |
| `in-progress` | Currently being worked on |
| `blocked` | Waiting on something |
| `done` | Completed |
| `dropped` | Abandoned |

## Development

### Setup

```bash
git clone https://github.com/dannysmith/obsidian-taskdn.git
cd obsidian-taskdn
bun install
```

### Build

```bash
# Production build
bun run build

# Development (watch mode)
bun run dev
```

### Testing Locally

1. Build the plugin
2. Copy `main.js`, `manifest.json`, and `styles.css` to your vault's `.obsidian/plugins/taskdn/` directory
3. Reload Obsidian

For hot-reload during development:
1. Install the [Hot Reload](https://github.com/pjeby/hot-reload) community plugin
2. Create an empty `.hotreload` file in the plugin directory
3. Run `bun run dev`

### Releasing

1. Update version: `npm version patch` (or `minor`/`major`)
2. Push with tags: `git push --follow-tags`
3. Create a GitHub release with the version tag
4. Attach `main.js`, `manifest.json`, and `styles.css` to the release

## Related

- [Taskdn](https://github.com/dannysmith/taskdn) - The task management system this plugin is built for
- [Taskdn CLI](https://github.com/dannysmith/taskdn/tree/main/tdn-cli) - Command-line interface for managing tasks

## License

[MIT](LICENSE)
