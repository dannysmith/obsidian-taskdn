import { App, FileSystemAdapter, Menu, Platform, TFile } from "obsidian";
import { TaskData, TaskStatus } from "../types";
import {
  isDoneStatus,
  getDataTaskValue,
  formatDateForDisplay,
  toggleTaskStatus,
  extractWikilinkTarget,
} from "../utils/task-utils";

export interface TaskWidgetOptions {
  app: App;
  file: TFile;
  taskData: TaskData;
  /** Whether this widget is replacing a list item marker (for native-like checkbox positioning) */
  isListItem?: boolean;
  /** Whether to show the "open in desktop app" button */
  showDesktopButton?: boolean;
}

/**
 * Create a task widget DOM element
 * Shared between Live Preview and Reading Mode
 *
 * When isListItem is true, uses native Obsidian checkbox structure:
 * <span class="taskdn-widget-wrapper">
 *   <label class="task-list-label">
 *     <input class="task-list-item-checkbox taskdn-checkbox" data-task=" ">
 *   </label>
 *   <span class="taskdn-widget">...</span>
 * </span>
 *
 * Otherwise returns a self-contained inline pill with the checkbox inside.
 */
export function createTaskWidget(options: TaskWidgetOptions): HTMLElement {
  const {
    app,
    file,
    taskData,
    isListItem = false,
    showDesktopButton = false,
  } = options;

  const checkbox = createEl("input", {
    type: "checkbox",
    // List items mimic native task checkboxes so themes style them the same
    cls: isListItem
      ? "task-list-item-checkbox taskdn-checkbox"
      : "taskdn-checkbox",
  });
  const setCheckboxState = (status: TaskStatus) => {
    const done = isDoneStatus(status);
    checkbox.checked = done;
    if (isListItem) checkbox.dataset.task = getDataTaskValue(status);
    checkbox.setAttribute(
      "aria-label",
      `Mark "${taskData.title}" as ${done ? "incomplete" : "complete"}`
    );
  };
  setCheckboxState(taskData.status);

  // Content container (title, meta, desktop button)
  const content = createSpan({
    cls: "taskdn-widget",
    attr: {
      "data-status": taskData.status,
      role: "group",
      "aria-label": `Task: ${taskData.title}`,
    },
  });

  const title = content.createSpan({
    cls: "taskdn-title",
    text: taskData.title,
    attr: {
      role: "link",
      tabindex: "0",
      "aria-label": `Open task: ${taskData.title}`,
    },
  });
  onActivate(title, () => app.workspace.getLeaf(false).openFile(file));

  const meta = createSpan({ cls: "taskdn-meta" });

  const projectLink = taskData.projects?.[0];
  if (projectLink) {
    const projectName = extractWikilinkTarget(projectLink) || projectLink;
    addMetaLink(meta, app, file.path, projectName, "taskdn-project");
  } else if (taskData.area) {
    // Only show area if no project (to avoid clutter)
    const areaName = extractWikilinkTarget(taskData.area) || taskData.area;
    addMetaLink(meta, app, file.path, areaName, "taskdn-area");
  }

  if (taskData.deferUntil) {
    meta.createSpan({
      cls: "taskdn-defer",
      text: formatDateForDisplay(taskData.deferUntil),
      attr: { "aria-label": `Deferred until: ${taskData.deferUntil}` },
    });
  }

  if (taskData.due) {
    meta.createSpan({
      cls: "taskdn-due",
      text: formatDateForDisplay(taskData.due),
      attr: { "aria-label": `Due: ${taskData.due}` },
    });
  }

  if (meta.hasChildNodes()) {
    content.appendChild(meta);
  }

  if (showDesktopButton && Platform.isDesktopApp) {
    const desktopBtn = content.createSpan({
      cls: "taskdn-desktop-btn",
      text: "↗",
      attr: { role: "button", "aria-label": "Open in desktop app" },
    });
    // Stop the editor from moving the cursor under the button
    desktopBtn.addEventListener("mousedown", (e) => e.preventDefault());
    desktopBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openInDesktopApp(app, file.path);
    });
  }

  if (Platform.isDesktopApp) {
    content.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      new Menu()
        .addItem((item) =>
          item
            .setTitle("Open in taskdn desktop app")
            .setIcon("arrow-up-right")
            .onClick(() => openInDesktopApp(app, file.path))
        )
        .showAtMouseEvent(e);
    });
  }

  let root = content;
  if (isListItem) {
    // Native-like structure: checkbox outside the content
    root = createSpan({
      cls: "taskdn-widget-wrapper",
      attr: { "data-status": taskData.status },
    });
    root
      .createEl("label", {
        cls: "task-list-label",
        attr: { contenteditable: "false" },
      })
      .appendChild(checkbox);
    root.appendChild(content);
  } else {
    content.prepend(checkbox);
    // Isolates the widget from the surrounding line's text-decoration
    content.addClass("taskdn-inline");
  }

  checkbox.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();

    void (async () => {
      try {
        // Update immediately; the widget is rebuilt once the file's metadata changes
        const newStatus = await toggleTaskStatus(file, app);
        setCheckboxState(newStatus);
        content.dataset.status = newStatus;
        root.dataset.status = newStatus;
      } catch (err) {
        setCheckboxState(taskData.status);
        console.error("Taskdn: Failed to toggle task status:", err);
      }
    })();
  });

  return root;
}

/** Run `action` on click, or on Enter/Space when focused. */
function onActivate(el: HTMLElement, action: () => Promise<unknown>): void {
  el.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    void action();
  });
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
      void action();
    }
  });
}

function addMetaLink(
  parent: HTMLElement,
  app: App,
  sourcePath: string,
  linkText: string,
  className: string
): void {
  const el = parent.createSpan({
    cls: className,
    text: linkText,
    attr: { role: "link", tabindex: "0", "aria-label": `Open: ${linkText}` },
  });

  onActivate(el, async () => {
    const targetFile = app.metadataCache.getFirstLinkpathDest(
      linkText,
      sourcePath
    );
    if (targetFile) {
      await app.workspace.getLeaf(false).openFile(targetFile);
    } else {
      await app.workspace.openLinkText(linkText, sourcePath, false);
    }
  });
}

/** Open a vault file in the Taskdn desktop app via its URL scheme. Desktop only. */
function openInDesktopApp(app: App, filePath: string): void {
  const adapter = app.vault.adapter;
  if (!(adapter instanceof FileSystemAdapter)) return;
  const absolutePath = adapter.getFullPath(filePath);
  activeWindow.open(`taskdn://open?path=${encodeURIComponent(absolutePath)}`);
}
