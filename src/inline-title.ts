import { MarkdownView, TFile } from "obsidian";
import type TaskdnPlugin from "./main";
import { isValidTaskFile } from "./utils/task-utils";

const TASK_VIEW_CLASS = "taskdn-task-view";

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
      processAllViews(plugin);
    })
  );

  plugin.registerEvent(
    workspace.on("layout-change", () => {
      processAllViews(plugin);
    })
  );

  // Update when frontmatter changes
  plugin.registerEvent(
    plugin.app.metadataCache.on("changed", (file) => {
      if (file instanceof TFile) {
        updateViewsForFile(plugin, file);
      }
    })
  );

  // Initial processing
  processAllViews(plugin);
}

/**
 * Process all open MarkdownViews
 */
function processAllViews(plugin: TaskdnPlugin): void {
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

  // Remove task view class by default
  leafContent?.classList.remove(TASK_VIEW_CLASS);

  // Early exit if feature disabled or no file
  if (!plugin.settings.useTaskTitleAsInlineTitle || !file) {
    restoreNativeTitle(view);
    return;
  }

  // Check if this is a valid task file
  if (!isValidTaskFile(file, plugin.app, plugin.settings)) {
    restoreNativeTitle(view);
    return;
  }

  // Get the title from frontmatter
  const cache = plugin.app.metadataCache.getFileCache(file);
  const fm = cache?.frontmatter as { title?: string } | undefined;
  const title = typeof fm?.title === "string" ? fm.title : "";

  // Find the inline title element
  const inlineTitleEl =
    view.containerEl.querySelector<HTMLElement>(".inline-title");
  if (!inlineTitleEl) return;

  // Update the inline title content
  inlineTitleEl.textContent = title;

  // Add visual indicator class to the leaf content
  leafContent?.classList.add(TASK_VIEW_CLASS);
}

/**
 * Restore the native inline title (filename)
 */
function restoreNativeTitle(view: MarkdownView): void {
  const file = view.file;
  if (!file) return;

  const inlineTitleEl =
    view.containerEl.querySelector<HTMLElement>(".inline-title");
  if (!inlineTitleEl) return;

  // Only restore if it's currently showing a different value
  // (to avoid unnecessary DOM updates)
  if (inlineTitleEl.textContent !== file.basename) {
    inlineTitleEl.textContent = file.basename;
  }
}
