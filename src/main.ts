import { Plugin, TFile, MarkdownPostProcessorContext, Menu } from "obsidian";
import { TaskdnSettings, DEFAULT_SETTINGS } from "./types";
import { TaskdnSettingTab } from "./settings";
import {
  resolveTaskFile,
  getTaskDataFromCache,
  getDataTaskValue,
  isTaskPath,
  isChecklistLine,
  extractChecklistInfo,
  sanitizeFilename,
  formatDate,
  escapeYamlString,
  isIgnoredFile,
} from "./utils/task-utils";
import { createTaskWidget, updateTaskWidget } from "./widgets/task-widget";
import { taskLinkViewPlugin } from "./live-preview";
import { createTaskEnterHandler } from "./enter-handler";

export default class TaskdnPlugin extends Plugin {
  settings: TaskdnSettings = { ...DEFAULT_SETTINGS };

  async onload() {
    await this.loadSettings();

    this.addSettingTab(new TaskdnSettingTab(this.app, this));
    this.registerEditorExtension(taskLinkViewPlugin(this));
    this.registerEditorExtension(createTaskEnterHandler(this));

    this.registerMarkdownPostProcessor(
      (element: HTMLElement, context: MarkdownPostProcessorContext) => {
        this.processTaskLinks(element, context);
      }
    );

    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor) => {
        const cursor = editor.getCursor();
        const line = editor.getLine(cursor.line);

        if (isChecklistLine(line)) {
          menu.addItem((item) => {
            item
              .setTitle("Convert to task")
              .setIcon("check-square")
              .onClick(() => {
                void this.convertChecklistToTask(editor, cursor.line);
              });
          });
        }
      })
    );

    this.addCommand({
      id: "convert-checklist-to-task",
      name: "Convert checklist item to task",
      editorCheckCallback: (checking, editor) => {
        const cursor = editor.getCursor();
        const line = editor.getLine(cursor.line);

        if (!isChecklistLine(line)) return false;
        if (checking) return true;

        void this.convertChecklistToTask(editor, cursor.line);
        return true;
      },
    });

    this.registerEvent(
      this.app.metadataCache.on("changed", (file) => {
        if (this.isTaskFile(file)) {
          this.refreshTaskWidgets(file);
        }
      })
    );

    this.updateDesktopButtonClasses();

    this.registerDomEvent(document, "click", (e) => {
      const btn = (e.target as HTMLElement).closest(".taskdn-desktop-btn");
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      const widget = btn.closest(".taskdn-widget");
      const filePath = widget?.getAttribute("data-file-path");
      if (filePath) this.openInDesktopApp(filePath);
    });

    this.registerDomEvent(document, "contextmenu", (e) => {
      const widget = (e.target as HTMLElement).closest(".taskdn-widget");
      if (!widget) return;
      const filePath = widget.getAttribute("data-file-path");
      if (!filePath) return;

      const menu = new Menu();
      menu.addItem((item) =>
        item
          .setTitle("Open in taskdn desktop app")
          .setIcon("arrow-up-right")
          .onClick(() => this.openInDesktopApp(filePath))
      );
      menu.showAtMouseEvent(e);
    });
  }

  onunload() {
    // Cleanup handled by Obsidian
  }

  async loadSettings() {
    const data = (await this.loadData()) as Partial<TaskdnSettings> | null;
    this.settings = { ...DEFAULT_SETTINGS, ...data };
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  updateDesktopButtonClasses() {
    document.body.classList.toggle(
      "taskdn-show-desktop-btn",
      this.settings.showDesktopAppButton
    );
  }

  private openInDesktopApp(filePath: string) {
    const vaultPath = (this.app.vault.adapter as { basePath?: string })
      .basePath;
    if (!vaultPath) return;
    const absolutePath = `${vaultPath}/${filePath}`;
    window.open(`taskdn://open?path=${encodeURIComponent(absolutePath)}`);
  }

  /**
   * Check if a file is a task file
   */
  isTaskFile(file: TFile): boolean {
    return isTaskPath(file.path, this.settings.tasksDirectory);
  }

  /**
   * Process task links in Reading Mode
   */
  private processTaskLinks(
    element: HTMLElement,
    context: MarkdownPostProcessorContext
  ) {
    const links =
      element.querySelectorAll<HTMLAnchorElement>("a.internal-link");

    links.forEach((link) => {
      const linkText = link.getAttribute("data-href");
      if (!linkText) return;

      const file = resolveTaskFile(
        linkText,
        context.sourcePath,
        this.app,
        this.settings.tasksDirectory
      );

      if (!file) return;

      // Check if file is in the ignore list
      if (
        isIgnoredFile(
          file,
          this.settings.tasksDirectory,
          this.settings.ignoredFiles
        )
      ) {
        return;
      }

      const cache = this.app.metadataCache.getFileCache(file);
      const taskData = getTaskDataFromCache(file, cache);

      const widget = createTaskWidget({
        app: this.app,
        file,
        taskData,
      });

      // Only treat as task list item if link is first content in <li>
      // (i.e., immediately after bullet marker like "- [[task]]")
      const parentLi = link.closest("li");
      const isFirstInLi = parentLi && this.isFirstContentInLi(link, parentLi);

      if (isFirstInLi && parentLi) {
        // Make parent <li> behave like a native task-list-item
        parentLi.classList.add("task-list-item");
        parentLi.dataset.task = getDataTaskValue(taskData.status);

        // Remove inline class since this is a list item context
        widget.classList.remove("taskdn-inline");

        // Extract checkbox to match native task-list-item structure exactly
        // Native: <li class="task-list-item"><input class="task-list-item-checkbox">text</li>
        const checkbox =
          widget.querySelector<HTMLInputElement>(".taskdn-checkbox");
        if (checkbox) {
          checkbox.classList.add("task-list-item-checkbox");
          checkbox.remove();
          link.replaceWith(checkbox, widget);
          return;
        }
      }

      link.replaceWith(widget);
    });
  }

  /**
   * Check if a link element is the first significant content in an <li>.
   * Returns true if there's no user text or content elements before the link.
   * Ignores Obsidian's internal elements like .list-bullet.
   */
  private isFirstContentInLi(link: HTMLElement, li: HTMLElement): boolean {
    let node: Node | null = li.firstChild;
    while (node && node !== link) {
      if (node.nodeType === Node.TEXT_NODE) {
        // Check if text node has non-whitespace content
        if (node.textContent && node.textContent.trim().length > 0) {
          return false;
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement;
        // Ignore Obsidian's list bullet marker element
        if (!el.classList.contains("list-bullet")) {
          return false;
        }
      }
      node = node.nextSibling;
    }
    return node === link;
  }

  /**
   * Convert a checklist line to a Taskdn task
   */
  private async convertChecklistToTask(
    editor: {
      getLine: (n: number) => string;
      setLine: (n: number, text: string) => void;
    },
    lineNumber: number
  ) {
    const line = editor.getLine(lineNumber);
    const { text, checked, indent, listMarker } = extractChecklistInfo(line);

    if (!text) return;

    const tasksDir = this.settings.tasksDirectory;
    if (!this.app.vault.getAbstractFileByPath(tasksDir)) {
      try {
        await this.app.vault.createFolder(tasksDir);
      } catch (err) {
        console.error("Taskdn: Failed to create tasks directory:", err);
        return;
      }
    }

    const filename = this.generateUniqueFilename(text);
    const filePath = `${tasksDir}/${filename}`;
    const status = checked ? "done" : this.settings.defaultStatus;
    const today = formatDate(new Date());

    let content = `---
title: "${escapeYamlString(text)}"
status: ${status}
created-at: ${today}
updated-at: ${today}`;

    if (checked) {
      content += `\ncompleted-at: ${today}`;
    }

    content += "\n---\n";

    try {
      await this.app.vault.create(filePath, content);
    } catch (err) {
      console.error("Taskdn: Failed to create task file:", err);
      return;
    }

    const basename = filename.replace(/\.md$/, "");
    editor.setLine(lineNumber, `${indent}${listMarker} [[${basename}]]`);
  }

  /**
   * Generate a unique filename for a task
   */
  private generateUniqueFilename(text: string): string {
    const base = sanitizeFilename(text);
    let filename = `${base}.md`;
    let counter = 1;
    const dir = this.settings.tasksDirectory;

    while (this.app.vault.getAbstractFileByPath(`${dir}/${filename}`)) {
      filename = `${base}-${counter}.md`;
      counter++;
    }

    return filename;
  }

  /**
   * Refresh all widgets for a specific task file
   */
  private refreshTaskWidgets(file: TFile) {
    const cache = this.app.metadataCache.getFileCache(file);
    const taskData = getTaskDataFromCache(file, cache);

    const widgets = document.querySelectorAll<HTMLElement>(
      `.taskdn-widget[data-file-path="${file.path}"]`
    );

    widgets.forEach((widget) => {
      updateTaskWidget(widget, taskData);
    });
  }
}
