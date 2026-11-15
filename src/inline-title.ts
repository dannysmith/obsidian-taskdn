import { MarkdownView, TFile, Notice } from "obsidian";
import type TaskdnPlugin from "./main";
import {
  isValidTaskFile,
  formatDate,
  titleToKebabCase,
} from "./utils/task-utils";

const TASK_VIEW_CLASS = "taskdn-task-view";

/** Track which elements are currently being edited to avoid interrupting user */
const editingElements = new WeakSet<HTMLElement>();

/** Inline title elements we've already attached our event handlers to */
const interceptedTitles = new WeakSet<HTMLElement>();

/**
 * Set up inline title replacement for task files.
 * When viewing a valid task file with the feature enabled, displays the
 * frontmatter title instead of the filename in the inline title area.
 */
export function setupInlineTitleReplacement(plugin: TaskdnPlugin): void {
  const { workspace } = plugin.app;

  // Process all views on layout change and leaf change
  plugin.registerEvent(
    workspace.on("active-leaf-change", () => {
      refreshInlineTitles(plugin);
    })
  );

  plugin.registerEvent(
    workspace.on("layout-change", () => {
      refreshInlineTitles(plugin);
    })
  );

  // Update when frontmatter changes (but not if user is editing)
  plugin.registerEvent(
    plugin.app.metadataCache.on("changed", (file) => {
      if (file instanceof TFile) {
        updateViewsForFile(plugin, file);
      }
    })
  );

  // Initial processing
  refreshInlineTitles(plugin);
}

/**
 * Apply (or remove) task title replacement in all open MarkdownViews.
 */
export function refreshInlineTitles(plugin: TaskdnPlugin): void {
  plugin.app.workspace.iterateAllLeaves((leaf) => {
    const view = leaf.view;
    if (view instanceof MarkdownView) {
      processView(plugin, view);
    }
  });
}

/**
 * Update views showing a specific file
 */
function updateViewsForFile(plugin: TaskdnPlugin, file: TFile): void {
  plugin.app.workspace.iterateAllLeaves((leaf) => {
    const view = leaf.view;
    if (view instanceof MarkdownView && view.file?.path === file.path) {
      processView(plugin, view);
    }
  });
}

/**
 * Process a single MarkdownView for task title replacement
 */
function processView(plugin: TaskdnPlugin, view: MarkdownView): void {
  const file = view.file;
  const leafContent = view.containerEl.closest(".workspace-leaf-content");

  // Find the native inline title element
  const nativeTitleEl =
    view.containerEl.querySelector<HTMLElement>(".inline-title");

  // If user is editing the title, don't interrupt them
  if (nativeTitleEl && editingElements.has(nativeTitleEl)) {
    return;
  }

  // Remove task view class and status by default
  leafContent?.classList.remove(TASK_VIEW_CLASS);
  leafContent?.removeAttribute("data-taskdn-status");

  // Hand the title back to Obsidian if the feature is off or this isn't a task
  if (
    !plugin.settings.useTaskTitleAsInlineTitle ||
    !file ||
    !isValidTaskFile(file, plugin.app, plugin.settings)
  ) {
    if (nativeTitleEl?.dataset.filePath) {
      delete nativeTitleEl.dataset.filePath;
      if (file) nativeTitleEl.textContent = file.basename;
    }
    return;
  }

  // Get the title and status from frontmatter
  const cache = plugin.app.metadataCache.getFileCache(file);
  const fm = cache?.frontmatter as
    { title?: string; status?: string } | undefined;
  const title = typeof fm?.title === "string" ? fm.title : "";
  const status = typeof fm?.status === "string" ? fm.status : "inbox";

  if (!nativeTitleEl) return;

  // Set up our event handlers on the native element (once per element)
  if (!interceptedTitles.has(nativeTitleEl)) {
    setupNativeTitleInterception(plugin, nativeTitleEl);
    interceptedTitles.add(nativeTitleEl);
  }

  // Marks the title as ours; the handlers do nothing without it
  nativeTitleEl.dataset.filePath = file.path;

  // Update the title content (only if not editing)
  if (!editingElements.has(nativeTitleEl)) {
    nativeTitleEl.textContent = title;
  }

  // Add visual indicator class and status to the leaf content
  leafContent?.classList.add(TASK_VIEW_CLASS);
  leafContent?.setAttribute("data-taskdn-status", status);
}

/**
 * Set up event interception on the native inline title element.
 * We intercept blur to save to frontmatter instead of renaming the file.
 */
function setupNativeTitleInterception(
  plugin: TaskdnPlugin,
  el: HTMLElement
): void {
  let originalValue = "";

  // Use capture phase to intercept before Obsidian's handlers
  el.addEventListener(
    "focus",
    () => {
      originalValue = el.textContent ?? "";
      editingElements.add(el);
    },
    true
  );

  el.addEventListener(
    "blur",
    (e) => {
      editingElements.delete(el);
      const path = el.dataset.filePath;
      if (!path) return;

      // Always stop Obsidian handling the blur on a task: it renames the file
      // whenever the title text differs from the filename, which it always
      // does here, even when nothing was edited
      e.stopPropagation();
      e.preventDefault();

      const newValue = el.textContent ?? "";
      if (newValue !== originalValue) {
        // Save to frontmatter instead
        void saveTitle(plugin, path, newValue);
      }
    },
    true
  );

  el.addEventListener(
    "keydown",
    (e) => {
      if (!el.dataset.filePath) return;
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        el.blur();
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        el.textContent = originalValue;
        el.blur();
      }
    },
    true
  );
}

/**
 * Save the title to frontmatter, and optionally rename the file to match.
 */
async function saveTitle(
  plugin: TaskdnPlugin,
  filePath: string,
  newTitle: string
): Promise<void> {
  try {
    const file = plugin.app.vault.getAbstractFileByPath(filePath);
    if (!file || !(file instanceof TFile)) {
      console.error("Taskdn: Could not find file:", filePath);
      return;
    }

    // Update frontmatter title
    await plugin.app.fileManager.processFrontMatter(file, (fm: unknown) => {
      const frontmatter = fm as { title?: string; "updated-at"?: string };
      frontmatter.title = newTitle;
      frontmatter["updated-at"] = formatDate(new Date());
    });

    // Optionally rename file to match title
    if (plugin.settings.syncFilenameWithTaskTitle) {
      await renameFileToMatchTitle(plugin, file, newTitle);
    }
  } catch (error) {
    console.error("Taskdn: Error saving title:", error);
  }
}

/**
 * Rename the file to match the given title (kebab-case).
 * Handles conflicts by appending a number.
 */
async function renameFileToMatchTitle(
  plugin: TaskdnPlugin,
  file: TFile,
  title: string
): Promise<void> {
  // Don't rename if title is empty
  const newBasename = titleToKebabCase(title);
  if (!newBasename) {
    return;
  }

  // Skip if basename already matches
  if (file.basename === newBasename) {
    return;
  }

  // Construct the new path
  const parentPath = file.parent?.path ?? "";
  const newPath = parentPath
    ? `${parentPath}/${newBasename}.md`
    : `${newBasename}.md`;

  // Check if a file already exists at the new path
  const existingFile = plugin.app.vault.getAbstractFileByPath(newPath);
  if (existingFile) {
    // Try adding a number suffix to find a unique name
    let counter = 2;
    let uniquePath: string;
    do {
      const uniqueBasename = `${newBasename}-${counter}`;
      uniquePath = parentPath
        ? `${parentPath}/${uniqueBasename}.md`
        : `${uniqueBasename}.md`;
      counter++;
    } while (
      plugin.app.vault.getAbstractFileByPath(uniquePath) &&
      counter < 100
    );

    if (counter >= 100) {
      new Notice("Could not rename file: too many files with similar names");
      return;
    }

    try {
      await plugin.app.fileManager.renameFile(file, uniquePath);
    } catch (error) {
      console.error("Taskdn: Error renaming file:", error);
      new Notice("Error renaming file");
    }
    return;
  }

  // No conflict, rename directly
  try {
    await plugin.app.fileManager.renameFile(file, newPath);
  } catch (error) {
    console.error("Taskdn: Error renaming file:", error);
    new Notice("Error renaming file");
  }
}
