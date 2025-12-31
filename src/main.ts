import { Plugin, TFile, MarkdownPostProcessorContext } from "obsidian";
import { TaskdnSettings, DEFAULT_SETTINGS } from "./types";
import { TaskdnSettingTab } from "./settings";
import {
  resolveTaskFile,
  getTaskDataFromCache,
  isTaskPath,
  isChecklistLine,
  extractChecklistInfo,
  sanitizeFilename,
  formatDate,
  escapeYamlString,
  isDoneStatus,
} from "./utils/task-utils";
import { createTaskWidget, updateTaskWidget } from "./widgets/task-widget";
import { taskLinkViewPlugin } from "./live-preview";

export default class TaskdnPlugin extends Plugin {
  settings: TaskdnSettings = { ...DEFAULT_SETTINGS };

  async onload() {
    await this.loadSettings();

    this.addSettingTab(new TaskdnSettingTab(this.app, this));
    this.registerEditorExtension(taskLinkViewPlugin(this));

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
  }

  onunload() {
    // Cleanup handled by Obsidian
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
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

      const cache = this.app.metadataCache.getFileCache(file);
      const taskData = getTaskDataFromCache(file, cache);

      const widget = createTaskWidget({
        app: this.app,
        file,
        taskData,
      });

      // Make parent <li> behave like a native task-list-item
      const parentLi = link.closest("li");
      if (parentLi) {
        parentLi.classList.add("task-list-item");
        parentLi.dataset.task = isDoneStatus(taskData.status) ? "x" : " ";

        // Extract checkbox to match native task-list-item structure exactly
        // Native: <li class="task-list-item"><input class="task-list-item-checkbox">text</li>
        const checkbox = widget.querySelector<HTMLInputElement>(".taskdn-checkbox");
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
        console.error(`Taskdn: Failed to create tasks directory: ${err}`);
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
      console.error(`Taskdn: Failed to create task file: ${err}`);
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
