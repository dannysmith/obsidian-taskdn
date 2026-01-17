import { MarkdownView, TFile } from "obsidian";
import type TaskdnPlugin from "./main";
import { isValidTaskFile, formatDate } from "./utils/task-utils";

const TASK_VIEW_CLASS = "taskdn-task-view";
const CUSTOM_TITLE_CLASS = "taskdn-inline-title";

/** Track which elements are currently being edited to avoid interrupting user */
const editingElements = new WeakSet<HTMLElement>();

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

  // Update when frontmatter changes (but not if user is editing)
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

  // Find existing custom title element
  const existingCustomTitle = view.containerEl.querySelector<HTMLElement>(
    `.${CUSTOM_TITLE_CLASS}`
  );

  // If user is editing, don't interrupt them
  if (existingCustomTitle && editingElements.has(existingCustomTitle)) {
    return;
  }

  // Remove task view class and status by default
  leafContent?.classList.remove(TASK_VIEW_CLASS);
  leafContent?.removeAttribute("data-taskdn-status");

  // Early exit if feature disabled or no file
  if (!plugin.settings.useTaskTitleAsInlineTitle || !file) {
    removeCustomTitle(view);
    return;
  }

  // Check if this is a valid task file
  if (!isValidTaskFile(file, plugin.app, plugin.settings)) {
    removeCustomTitle(view);
    return;
  }

  // Get the title and status from frontmatter
  const cache = plugin.app.metadataCache.getFileCache(file);
  const fm = cache?.frontmatter as
    | { title?: string; status?: string }
    | undefined;
  const title = typeof fm?.title === "string" ? fm.title : "";
  const status = typeof fm?.status === "string" ? fm.status : "inbox";

  // Find the native inline title element
  const nativeTitleEl =
    view.containerEl.querySelector<HTMLElement>(".inline-title");
  if (!nativeTitleEl) return;

  // Create or update our custom title element
  let customTitleEl = existingCustomTitle;
  if (!customTitleEl) {
    customTitleEl = createCustomTitleElement(plugin, file);
    nativeTitleEl.insertAdjacentElement("afterend", customTitleEl);
  }

  // Update the title content (only if not editing)
  if (!editingElements.has(customTitleEl)) {
    customTitleEl.textContent = title;
  }

  // Add visual indicator class and status to the leaf content
  leafContent?.classList.add(TASK_VIEW_CLASS);
  leafContent?.setAttribute("data-taskdn-status", status);
}

/**
 * Create a custom editable title element
 */
function createCustomTitleElement(
  plugin: TaskdnPlugin,
  file: TFile
): HTMLElement {
  const el = document.createElement("div");
  el.className = CUSTOM_TITLE_CLASS;
  el.contentEditable = "true";
  el.spellcheck = true;
  el.setAttribute("autocapitalize", "on");
  el.setAttribute("tabindex", "-1");
  el.setAttribute("enterkeyhint", "done");

  let originalValue = "";

  el.addEventListener("focus", () => {
    originalValue = el.textContent ?? "";
    editingElements.add(el);
  });

  el.addEventListener("blur", () => {
    editingElements.delete(el);
    const newValue = el.textContent ?? "";
    if (newValue !== originalValue) {
      void saveTitle(plugin, file, newValue);
    }
  });

  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      el.blur();
    } else if (e.key === "Escape") {
      e.preventDefault();
      el.textContent = originalValue;
      el.blur();
    }
  });

  // Prevent default paste behavior that might include formatting
  el.addEventListener("paste", (e) => {
    e.preventDefault();
    const text = e.clipboardData?.getData("text/plain") ?? "";
    // Use Selection API to insert plain text at cursor
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      range.deleteContents();
      range.insertNode(document.createTextNode(text));
      range.collapse(false);
    }
  });

  return el;
}

/**
 * Remove our custom title element and restore native behavior
 */
function removeCustomTitle(view: MarkdownView): void {
  const customTitle = view.containerEl.querySelector(`.${CUSTOM_TITLE_CLASS}`);
  customTitle?.remove();
}

/**
 * Save the title to frontmatter
 */
async function saveTitle(
  plugin: TaskdnPlugin,
  file: TFile,
  newTitle: string
): Promise<void> {
  // Verify file still exists
  const currentFile = plugin.app.vault.getAbstractFileByPath(file.path);
  if (!currentFile || !(currentFile instanceof TFile)) return;

  await plugin.app.fileManager.processFrontMatter(file, (fm: unknown) => {
    const frontmatter = fm as { title?: string; "updated-at"?: string };
    frontmatter.title = newTitle;
    frontmatter["updated-at"] = formatDate(new Date());
  });
}
