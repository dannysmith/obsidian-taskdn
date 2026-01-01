import { App, TFile } from "obsidian";
import { TaskData } from "../types";
import {
  isDoneStatus,
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
 *   <span class="taskdn-widget taskdn-content">...</span>
 * </span>
 */
export function createTaskWidget(options: TaskWidgetOptions): HTMLElement {
  const { app, file, taskData, isListItem = false } = options;
  const isDone = isDoneStatus(taskData.status);

  // Create checkbox element
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = isDone;
  checkbox.setAttribute(
    "aria-label",
    `Mark "${taskData.title}" as ${isDone ? "incomplete" : "complete"}`
  );

  // Build the content container (title, meta, desktop button)
  const content = document.createElement("span");
  content.className = "taskdn-widget";
  content.dataset.status = taskData.status;
  content.dataset.filePath = file.path;
  content.setAttribute("role", "group");
  content.setAttribute("aria-label", `Task: ${taskData.title}`);

  const title = document.createElement("span");
  title.className = "taskdn-title";
  title.textContent = taskData.title;
  title.setAttribute("role", "link");
  title.setAttribute("tabindex", "0");
  title.setAttribute("aria-label", `Open task: ${taskData.title}`);

  const openFile = async () => {
    const leaf = app.workspace.getLeaf(false);
    await leaf.openFile(file);
  };

  title.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    void openFile();
  });
  title.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
      void openFile();
    }
  });
  content.appendChild(title);

  const meta = document.createElement("span");
  meta.className = "taskdn-meta";

  if (taskData.projects && taskData.projects.length > 0) {
    const projectLink = taskData.projects[0];
    const projectName = extractWikilinkTarget(projectLink) || projectLink;
    const projectEl = createMetaLink(
      app,
      file.path,
      projectName,
      "taskdn-project"
    );
    meta.appendChild(projectEl);
  }

  // Only show area if no project (to avoid clutter)
  if (taskData.area && (!taskData.projects || taskData.projects.length === 0)) {
    const areaName = extractWikilinkTarget(taskData.area) || taskData.area;
    const areaEl = createMetaLink(app, file.path, areaName, "taskdn-area");
    meta.appendChild(areaEl);
  }

  if (taskData.deferUntil) {
    const deferEl = document.createElement("span");
    deferEl.className = "taskdn-defer";
    deferEl.textContent = formatDateForDisplay(taskData.deferUntil);
    deferEl.setAttribute(
      "aria-label",
      `Deferred until: ${taskData.deferUntil}`
    );
    meta.appendChild(deferEl);
  }

  if (taskData.due) {
    const dueEl = document.createElement("span");
    dueEl.className = "taskdn-due";
    dueEl.textContent = formatDateForDisplay(taskData.due);
    dueEl.setAttribute("aria-label", `Due: ${taskData.due}`);
    meta.appendChild(dueEl);
  }

  if (meta.hasChildNodes()) {
    content.appendChild(meta);
  }

  const desktopBtn = document.createElement("span");
  desktopBtn.className = "taskdn-desktop-btn";
  desktopBtn.setAttribute("role", "button");
  desktopBtn.setAttribute("aria-label", "Open in desktop app");
  desktopBtn.textContent = "↗";
  content.appendChild(desktopBtn);

  // For list items, use native-like structure with checkbox outside
  if (isListItem) {
    checkbox.className = "task-list-item-checkbox taskdn-checkbox";
    checkbox.dataset.task = isDone ? "x" : " ";

    const wrapper = document.createElement("span");
    wrapper.className = "taskdn-widget-wrapper";
    wrapper.dataset.status = taskData.status;

    const label = document.createElement("label");
    label.className = "task-list-label";
    label.contentEditable = "false";
    label.appendChild(checkbox);

    wrapper.appendChild(label);
    wrapper.appendChild(content);

    // Checkbox click handler - update wrapper status too
    checkbox.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      void (async () => {
        try {
          const newStatus = await toggleTaskStatus(file, app);
          const newIsDone = isDoneStatus(newStatus);
          checkbox.checked = newIsDone;
          checkbox.dataset.task = newIsDone ? "x" : " ";
          content.dataset.status = newStatus;
          wrapper.dataset.status = newStatus;
          checkbox.setAttribute(
            "aria-label",
            `Mark "${taskData.title}" as ${newIsDone ? "incomplete" : "complete"}`
          );
        } catch (err) {
          checkbox.checked = isDone;
          console.error("Taskdn: Failed to toggle task status:", err);
        }
      })();
    });

    return wrapper;
  }

  // For non-list items (inline), keep checkbox inside content
  checkbox.className = "taskdn-checkbox";
  checkbox.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();

    void (async () => {
      try {
        const newStatus = await toggleTaskStatus(file, app);
        checkbox.checked = isDoneStatus(newStatus);
        content.dataset.status = newStatus;
        checkbox.setAttribute(
          "aria-label",
          `Mark "${taskData.title}" as ${isDoneStatus(newStatus) ? "incomplete" : "complete"}`
        );
      } catch (err) {
        checkbox.checked = isDone;
        console.error("Taskdn: Failed to toggle task status:", err);
      }
    })();
  });

  // Insert checkbox at the beginning of content
  content.insertBefore(checkbox, content.firstChild);

  return content;
}

function createMetaLink(
  app: App,
  sourcePath: string,
  linkText: string,
  className: string
): HTMLElement {
  const el = document.createElement("span");
  el.className = className;
  el.textContent = linkText;
  el.setAttribute("role", "link");
  el.setAttribute("tabindex", "0");
  el.setAttribute("aria-label", `Open: ${linkText}`);

  const openLink = async () => {
    const targetFile = app.metadataCache.getFirstLinkpathDest(
      linkText,
      sourcePath
    );
    if (targetFile) {
      const leaf = app.workspace.getLeaf(false);
      await leaf.openFile(targetFile);
    } else {
      await app.workspace.openLinkText(linkText, sourcePath, false);
    }
  };

  el.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    void openLink();
  });
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
      void openLink();
    }
  });
  return el;
}

/**
 * Update an existing widget's display based on new task data.
 * Project/area updates require a full widget rebuild via decoration refresh.
 */
export function updateTaskWidget(
  widget: HTMLElement,
  taskData: TaskData,
  _app?: App,
  _sourcePath?: string
): void {
  widget.dataset.status = taskData.status;
  widget.setAttribute("aria-label", `Task: ${taskData.title}`);

  const checkbox = widget.querySelector<HTMLInputElement>(".taskdn-checkbox");
  if (checkbox) {
    checkbox.checked = isDoneStatus(taskData.status);
    checkbox.setAttribute(
      "aria-label",
      `Mark "${taskData.title}" as ${isDoneStatus(taskData.status) ? "incomplete" : "complete"}`
    );
  }

  const title = widget.querySelector<HTMLElement>(".taskdn-title");
  if (title) {
    title.textContent = taskData.title;
    title.setAttribute("aria-label", `Open task: ${taskData.title}`);
  }

  const meta = widget.querySelector<HTMLElement>(".taskdn-meta");
  const existingDefer = widget.querySelector<HTMLElement>(".taskdn-defer");
  const existingDue = widget.querySelector<HTMLElement>(".taskdn-due");

  if (taskData.deferUntil) {
    if (existingDefer) {
      existingDefer.textContent = formatDateForDisplay(taskData.deferUntil);
      existingDefer.setAttribute(
        "aria-label",
        `Deferred until: ${taskData.deferUntil}`
      );
    } else if (meta) {
      const deferEl = document.createElement("span");
      deferEl.className = "taskdn-defer";
      deferEl.textContent = formatDateForDisplay(taskData.deferUntil);
      deferEl.setAttribute(
        "aria-label",
        `Deferred until: ${taskData.deferUntil}`
      );
      // Insert before due date if it exists
      if (existingDue) {
        meta.insertBefore(deferEl, existingDue);
      } else {
        meta.appendChild(deferEl);
      }
    }
  } else if (existingDefer) {
    existingDefer.remove();
  }

  if (taskData.due) {
    if (existingDue) {
      existingDue.textContent = formatDateForDisplay(taskData.due);
      existingDue.setAttribute("aria-label", `Due: ${taskData.due}`);
    } else if (meta) {
      const dueEl = document.createElement("span");
      dueEl.className = "taskdn-due";
      dueEl.textContent = formatDateForDisplay(taskData.due);
      dueEl.setAttribute("aria-label", `Due: ${taskData.due}`);
      meta.appendChild(dueEl);
    }
  } else if (existingDue) {
    existingDue.remove();
  }
}
