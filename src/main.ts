import { Plugin, TFile, MarkdownView } from "obsidian";
import { TaskdnSettings, DEFAULT_SETTINGS } from "./types";
import { TaskdnSettingTab } from "./settings";
import {
  isTaskPath,
  isChecklistLine,
  extractChecklistInfo,
  sanitizeFilename,
  formatDate,
  escapeYamlString,
} from "./utils/task-utils";
import { taskLinkViewPlugin, refreshLivePreviewWidgets } from "./live-preview";
import { processTaskLinks } from "./reading-mode";
import { createTaskEnterHandler } from "./enter-handler";
import {
  setupInlineTitleReplacement,
  refreshInlineTitles,
} from "./inline-title";

export default class TaskdnPlugin extends Plugin {
  settings: TaskdnSettings = { ...DEFAULT_SETTINGS };

  async onload() {
    await this.loadSettings();

    this.addSettingTab(new TaskdnSettingTab(this.app, this));
    this.registerEditorExtension(taskLinkViewPlugin(this));
    this.registerEditorExtension(createTaskEnterHandler(this));

    this.registerMarkdownPostProcessor((element, context) =>
      processTaskLinks(this, element, context)
    );

    setupInlineTitleReplacement(this);

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

    // Reading mode widgets refresh themselves (see reading-mode.ts)
    this.registerEvent(
      this.app.metadataCache.on("changed", (file) => {
        if (this.isTaskFile(file)) refreshLivePreviewWidgets();
      })
    );
  }

  async loadSettings() {
    const data = (await this.loadData()) as Partial<TaskdnSettings> | null;
    this.settings = { ...DEFAULT_SETTINGS, ...data };
  }

  /**
   * Re-render everything that depends on the settings. Settings can turn links
   * into widgets and back, so Reading mode notes are re-rendered in full.
   */
  applySettings() {
    refreshLivePreviewWidgets();
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (leaf.view instanceof MarkdownView) {
        leaf.view.previewMode.rerender(true);
      }
    });
    refreshInlineTitles(this);
  }

  /**
   * Check if a file is a task file
   */
  isTaskFile(file: TFile): boolean {
    return isTaskPath(file.path, this.settings.tasksDirectory);
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
}
