import { MarkdownView, TFile, Notice } from "obsidian";
import type TaskdnPlugin from "./main";
import { isValidTaskFile, formatDate } from "./utils/task-utils";

const DEBUG = true;

const TASK_VIEW_CLASS = "taskdn-task-view";

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

  // Early exit if feature disabled or no file
  if (!plugin.settings.useTaskTitleAsInlineTitle || !file) {
    // Clean up any setup we did
    if (nativeTitleEl) {
      delete nativeTitleEl.dataset.taskdnSetup;
      delete nativeTitleEl.dataset.filePath;
    }
    return;
  }

  // Check if this is a valid task file
  if (!isValidTaskFile(file, plugin.app, plugin.settings)) {
    // Clean up any setup we did
    if (nativeTitleEl) {
      delete nativeTitleEl.dataset.taskdnSetup;
      delete nativeTitleEl.dataset.filePath;
    }
    return;
  }

  // Get the title and status from frontmatter
  const cache = plugin.app.metadataCache.getFileCache(file);
  const fm = cache?.frontmatter as
    | { title?: string; status?: string }
    | undefined;
  const title = typeof fm?.title === "string" ? fm.title : "";
  const status = typeof fm?.status === "string" ? fm.status : "inbox";

  if (!nativeTitleEl) {
    if (DEBUG) console.debug("Taskdn: No native inline title found");
    return;
  }

  // Set up our event handlers on the native element (if not already done)
  if (!nativeTitleEl.dataset.taskdnSetup) {
    if (DEBUG) console.debug("Taskdn: Setting up native title interception");
    setupNativeTitleInterception(plugin, nativeTitleEl, file.path);
    nativeTitleEl.dataset.taskdnSetup = "true";
  }

  // Update the file path in case the view is showing a different file
  nativeTitleEl.dataset.filePath = file.path;

  // Update the title content (only if not editing)
  if (!editingElements.has(nativeTitleEl)) {
    nativeTitleEl.textContent = title;
  }

  if (DEBUG) {
    console.debug("Taskdn: processView complete", {
      filePath: file.path,
      title,
      status,
      nativeTitleSetup: nativeTitleEl.dataset.taskdnSetup,
    });
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
  el: HTMLElement,
  _initialFilePath: string
): void {
  let originalValue = "";

  // Use capture phase to intercept before Obsidian's handlers
  el.addEventListener(
    "focus",
    () => {
      if (DEBUG) console.debug("Taskdn: focus event (capture)");
      originalValue = el.textContent ?? "";
      editingElements.add(el);
    },
    true
  );

  el.addEventListener(
    "blur",
    (e) => {
      if (DEBUG) console.debug("Taskdn: blur event (capture)");

      const newValue = el.textContent ?? "";
      const path = el.dataset.filePath;

      if (DEBUG) {
        console.debug("Taskdn: blur details", {
          originalValue,
          newValue,
          path,
          changed: newValue !== originalValue,
        });
      }

      if (newValue !== originalValue && path) {
        // Stop Obsidian from handling this blur (which would rename the file)
        e.stopPropagation();
        e.preventDefault();

        // Save to frontmatter instead
        void saveTitle(plugin, path, newValue);
      }

      editingElements.delete(el);
    },
    true
  );

  el.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Enter") {
        if (DEBUG) console.debug("Taskdn: Enter key pressed");
        e.preventDefault();
        e.stopPropagation();
        el.blur();
      } else if (e.key === "Escape") {
        if (DEBUG) console.debug("Taskdn: Escape key pressed");
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
 * Save the title to frontmatter
 */
async function saveTitle(
  plugin: TaskdnPlugin,
  filePath: string,
  newTitle: string
): Promise<void> {
  if (DEBUG) {
    console.debug("Taskdn: saveTitle called", { filePath, newTitle });
  }

  try {
    // Get fresh file reference
    const file = plugin.app.vault.getAbstractFileByPath(filePath);
    if (!file || !(file instanceof TFile)) {
      console.error("Taskdn: Could not find file:", filePath);
      new Notice("Could not find file to save title");
      return;
    }

    if (DEBUG) {
      console.debug("Taskdn: calling processFrontMatter");
    }

    await plugin.app.fileManager.processFrontMatter(file, (fm: unknown) => {
      if (DEBUG) {
        console.debug("Taskdn: inside processFrontMatter callback", fm);
      }
      const frontmatter = fm as { title?: string; "updated-at"?: string };
      frontmatter.title = newTitle;
      frontmatter["updated-at"] = formatDate(new Date());
    });

    if (DEBUG) {
      console.debug("Taskdn: processFrontMatter completed");
      new Notice("Title saved");
    }
  } catch (error) {
    console.error("Taskdn: Error saving title:", error);
    new Notice("Error saving title - check console");
  }
}
