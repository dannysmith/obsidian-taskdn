/**
 * Creates (or resets) a throwaway Obsidian vault at `test-vault/` for manually
 * testing the plugin. The plugin's build output is symlinked into the vault, so
 * after `bun run build` (or while `bun run dev` is running) reload the plugin in
 * Obsidian to pick up changes.
 *
 * Rerunning rewrites every fixture note and the plugin settings. Anything else
 * in the vault is left alone.
 *
 * Usage: bun run test-vault
 */
import {
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const vault = join(root, "test-vault");
const pluginDir = join(vault, ".obsidian", "plugins", "taskdn");

/** Local YYYY-MM-DD for today plus `offset` days. */
function day(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function write(path: string, content: string) {
  const full = join(vault, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
}

function task(
  path: string,
  title: string,
  status: string,
  extra: Record<string, string> = {}
) {
  const fields = {
    title: JSON.stringify(title),
    status,
    "created-at": day(-14),
    "updated-at": day(-1),
    ...extra,
  };
  const yaml = Object.entries(fields)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
  write(`tasks/${path}`, `---\n${yaml}\n---\n`);
}

// Tasks: one per status, plus the fields the widget displays
task("inbox-task.md", "Reply to the plumber", "inbox");
task("icebox-task.md", "Learn the cello", "icebox");
task("ready-task.md", "Buy groceries", "ready", { due: day(0) });
task("project-task.md", "Draft homepage copy", "ready", {
  projects: '["[[website-redesign]]"]',
  due: day(1),
});
task("area-task.md", "Book a dentist appointment", "in-progress", {
  area: '"[[health]]"',
  "defer-until": day(5),
});
task("blocked-task.md", "Renew passport", "blocked", { due: day(-3) });
task("dropped-task.md", "Organise the garage sale", "dropped");
task("done-task.md", "File the tax return", "done", {
  "completed-at": day(-2),
});
task(
  "long-title-task.md",
  "Research, compare and order a replacement for the broken standing desk motor before the warranty runs out",
  "ready",
  {
    projects: '["[[website-redesign]]"]',
    "defer-until": day(20),
    due: day(40),
  }
);
task("archive/old-task.md", "Archived task (ignored)", "done");
task("weekly-template.md", "Template task (ignored)", "inbox");
write(
  "tasks/no-frontmatter.md",
  "A file in the tasks folder with no frontmatter.\n"
);

write("projects/website-redesign.md", '---\ntitle: "Website redesign"\n---\n');
write("areas/health.md", '---\ntitle: "Health"\n---\n');

write(
  "Widgets.md",
  `## Bullet list (should look like native tasks)

- [[inbox-task]]
- [[icebox-task]]
- [[ready-task]]
- [[project-task]]
- [[area-task]]
- [[blocked-task]]
- [[dropped-task]]
- [[done-task]]
- [[long-title-task]]
- [[no-frontmatter]]

## Nested

- Parent item
  - [[ready-task]]
  - [[done-task]] with trailing text
    - [[blocked-task]]

## Native checklist for comparison

- [ ] A native unchecked task
- [x] A native checked task

## Inline in prose

See [[ready-task]] before the weekend, and [[done-task]] is finished.

Aliased: [[project-task|the homepage task]]. Heading link: [[area-task#Notes]].

## Numbered list (inline widgets, not list items)

1. [[inbox-task]]
2. [[done-task]]

## Not tasks (should stay plain links)

- [[website-redesign]]
- [[health]]
- [[Checklist conversion]]

## Ignored tasks (should stay plain links)

- [[old-task]]
- [[weekly-template]]
`
);

write(
  "Checklist conversion.md",
  `Right-click an item, or run "Convert checklist item to task".

- [ ] Call the bank about the mortgage
- [x] Already done item
* [ ] Star bullet item
1. [ ] Numbered item
- [ ] Item with "quotes" and a colon: in it
`
);

// Step-by-step checks for testing by hand
write(
  "Manual tests.md",
  readFileSync(join(import.meta.dirname, "manual-tests.md"), "utf8")
);

// Obsidian config: enable the plugin and seed its settings
write(".obsidian/community-plugins.json", JSON.stringify(["taskdn"]));
write(
  ".obsidian/app.json",
  JSON.stringify({ showInlineTitle: true, useMarkdownLinks: false }, null, 2)
);
write(
  ".obsidian/plugins/taskdn/data.json",
  JSON.stringify(
    {
      tasksDirectory: "tasks",
      ignoredFiles: ["archive/*", "*-template"],
      useTaskTitleAsInlineTitle: true,
    },
    null,
    2
  )
);

for (const file of ["main.js", "manifest.json", "styles.css"]) {
  const link = join(pluginDir, file);
  rmSync(link, { force: true });
  symlinkSync(relative(pluginDir, join(root, file)), link);
}

console.log(`Test vault ready at ${vault}`);
