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
}

/**
 * Create a task widget DOM element
 * Shared between Live Preview and Reading Mode
 */
export function createTaskWidget(options: TaskWidgetOptions): HTMLElement {
  const { app, file, taskData } = options;

  const container = document.createElement("span");
  container.className = "taskdn-widget";
  container.dataset.status = taskData.status;
  container.dataset.filePath = file.path;
  container.setAttribute("role", "group");
  container.setAttribute("aria-label", `Task: ${taskData.title}`);

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "taskdn-checkbox";
  checkbox.checked = isDoneStatus(taskData.status);
  checkbox.setAttribute(
    "aria-label",
    `Mark "${taskData.title}" as ${isDoneStatus(taskData.status) ? "incomplete" : "complete"}`
  );
  checkbox.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();

    void (async () => {
      try {
        const newStatus = await toggleTaskStatus(file, app);
        checkbox.checked = isDoneStatus(newStatus);
        container.dataset.status = newStatus;
        checkbox.setAttribute(
          "aria-label",
          `Mark "${taskData.title}" as ${isDoneStatus(newStatus) ? "incomplete" : "complete"}`
        );
      } catch (err) {
        checkbox.checked = isDoneStatus(taskData.status);
        console.error("Taskdn: Failed to toggle task status:", err);
      }
    })();
  });
  container.appendChild(checkbox);

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
  container.appendChild(title);

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
    container.appendChild(meta);
  }

  const desktopBtn = document.createElement("span");
  desktopBtn.className = "taskdn-desktop-btn";
  desktopBtn.setAttribute("role", "button");
  desktopBtn.setAttribute("aria-label", "Open in desktop app");
  desktopBtn.textContent = "↗";
  container.appendChild(desktopBtn);

  return container;
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
