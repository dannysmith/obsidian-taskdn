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

  // Checkbox
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "taskdn-checkbox";
  checkbox.checked = isDoneStatus(taskData.status);
  checkbox.setAttribute(
    "aria-label",
    `Mark "${taskData.title}" as ${isDoneStatus(taskData.status) ? "incomplete" : "complete"}`
  );
  checkbox.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();

    try {
      const newStatus = await toggleTaskStatus(file, app);
      // Update DOM directly
      checkbox.checked = isDoneStatus(newStatus);
      container.dataset.status = newStatus;
      checkbox.setAttribute(
        "aria-label",
        `Mark "${taskData.title}" as ${isDoneStatus(newStatus) ? "incomplete" : "complete"}`
      );
    } catch (err) {
      // Revert checkbox visual state on error
      checkbox.checked = isDoneStatus(taskData.status);
      console.error("Taskdn: Failed to toggle task status:", err);
    }
  });
  container.appendChild(checkbox);

  // Title (clickable to open file)
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

  title.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    await openFile();
  });
  title.addEventListener("keydown", async (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
      await openFile();
    }
  });
  container.appendChild(title);

  // Project/Area indicators
  const meta = document.createElement("span");
  meta.className = "taskdn-meta";

  // Show project if present
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

  // Show area if present (and no project shown, to avoid clutter)
  if (taskData.area && (!taskData.projects || taskData.projects.length === 0)) {
    const areaName = extractWikilinkTarget(taskData.area) || taskData.area;
    const areaEl = createMetaLink(app, file.path, areaName, "taskdn-area");
    meta.appendChild(areaEl);
  }

  // Due date (emoji moved to CSS for consistency)
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

  return container;
}

/**
 * Create a clickable metadata link
 */
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
    // Use source path for proper relative link resolution
    const targetFile = app.metadataCache.getFirstLinkpathDest(
      linkText,
      sourcePath
    );
    if (targetFile) {
      const leaf = app.workspace.getLeaf(false);
      await leaf.openFile(targetFile);
    } else {
      // Fallback to openLinkText for unresolved links
      await app.workspace.openLinkText(linkText, sourcePath, false);
    }
  };

  el.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    await openLink();
  });
  el.addEventListener("keydown", async (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
      await openLink();
    }
  });
  return el;
}

/**
 * Update an existing widget's display based on new task data
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

  // Update due date
  const existingDue = widget.querySelector<HTMLElement>(".taskdn-due");
  const meta = widget.querySelector<HTMLElement>(".taskdn-meta");

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

  // Note: Project/Area updates would require app and sourcePath to rebuild links.
  // For now, those updates require a full widget rebuild via decoration refresh.
}
