import {
  Plugin,
  TFile,
  MarkdownPostProcessorContext,
  MarkdownView,
} from "obsidian";
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
import { createTaskWidget } from "./widgets/task-widget";
import { taskLinkViewPlugin, refreshLivePreviewWidgets } from "./live-preview";
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

    this.registerMarkdownPostProcessor(
      (element: HTMLElement, context: MarkdownPostProcessorContext) => {
        this.processTaskLinks(element, context);
      }
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

    this.registerEvent(
      this.app.metadataCache.on("changed", (file) => {
        if (this.isTaskFile(file)) {
          this.refreshWidgets(file);
        }
      })
    );
  }

  async loadSettings() {
    const data = (await this.loadData()) as Partial<TaskdnSettings> | null;
    this.settings = { ...DEFAULT_SETTINGS, ...data };
  }

  /** Re-render everything that depends on the settings. */
  applySettings() {
    this.refreshWidgets();
    refreshInlineTitles(this);
  }

  /**
   * Rebuild task widgets in open notes. Given a changed task file, Reading
   * mode only re-renders the notes that link to it.
   */
  refreshWidgets(changedTask?: TFile) {
    refreshLivePreviewWidgets();

    const links = this.app.metadataCache.resolvedLinks;
    this.app.workspace.iterateAllLeaves((leaf) => {
      const view = leaf.view;
      if (!(view instanceof MarkdownView) || view.getMode() !== "preview") {
        return;
      }
      if (changedTask && !links[view.file?.path ?? ""]?.[changedTask.path]) {
        return;
      }
      view.previewMode.rerender(true);
    });
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
        showDesktopButton: this.settings.showDesktopAppButton,
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
   * Returns true if there's no visible text content before the link.
   * This handles various Obsidian DOM structures without needing to know
   * specific internal class names.
   */
  private isFirstContentInLi(link: HTMLElement, li: HTMLElement): boolean {
    // Get all text before the link by using a TreeWalker
    const walker = li.doc.createTreeWalker(li, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        // Check if this text node comes before the link in document order
        const position = node.compareDocumentPosition(link);
        if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
          // Link comes after this text node
          return NodeFilter.FILTER_ACCEPT;
        }
        return NodeFilter.FILTER_REJECT;
      },
    });

    // Check if any text node before the link has non-whitespace content
    let textNode: Text | null;
    while ((textNode = walker.nextNode() as Text | null)) {
      if (textNode.textContent && textNode.textContent.trim().length > 0) {
        return false;
      }
    }

    return true;
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
