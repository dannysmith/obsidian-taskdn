import {
  MarkdownPostProcessorContext,
  MarkdownRenderChild,
  TFile,
} from "obsidian";
import type TaskdnPlugin from "./main";
import {
  resolveTaskFile,
  getTaskDataFromCache,
  getDataTaskValue,
  isIgnoredFile,
} from "./utils/task-utils";
import { createTaskWidget } from "./widgets/task-widget";

/**
 * Markdown post-processor for Reading mode: replaces links to task files with
 * task widgets.
 */
export function processTaskLinks(
  plugin: TaskdnPlugin,
  element: HTMLElement,
  context: MarkdownPostProcessorContext
): void {
  const { app, settings } = plugin;

  element
    .querySelectorAll<HTMLAnchorElement>("a.internal-link")
    .forEach((link) => {
      const linkText = link.getAttribute("data-href");
      if (!linkText) return;

      const file = resolveTaskFile(
        linkText,
        context.sourcePath,
        app,
        settings.tasksDirectory
      );
      if (
        !file ||
        isIgnoredFile(file, settings.tasksDirectory, settings.ignoredFiles)
      ) {
        return;
      }

      // Only treat as a task list item if the link is the first content in its
      // <li> (i.e. immediately after the bullet, like "- [[task]]")
      const li = link.closest("li");
      const listItem = li && isFirstContentInLi(link, li) ? li : null;

      context.addChild(new ReadingTaskWidget(plugin, file, link, listItem));
    });
}

/**
 * A task widget in Reading mode. It rebuilds itself when the task file
 * changes, so the rest of the note isn't re-rendered (which would lose the
 * scroll position). Obsidian unloads it when its section is re-rendered.
 */
class ReadingTaskWidget extends MarkdownRenderChild {
  /** The nodes currently standing in for the link */
  private nodes: ChildNode[];

  constructor(
    private plugin: TaskdnPlugin,
    private file: TFile,
    link: HTMLElement,
    private listItem: HTMLElement | null
  ) {
    // Obsidian unloads this child once containerEl leaves the DOM, so use the
    // link's parent, which outlives our own re-renders
    super(link.parentElement ?? link);
    this.nodes = [link];
  }

  onload() {
    this.render();
    this.registerEvent(
      this.plugin.app.metadataCache.on("changed", (file) => {
        if (file.path === this.file.path) this.render();
      })
    );
  }

  private render() {
    const { app, settings } = this.plugin;
    const taskData = getTaskDataFromCache(
      this.file,
      app.metadataCache.getFileCache(this.file)
    );
    const widget = createTaskWidget({
      app,
      file: this.file,
      taskData,
      showDesktopButton: settings.showDesktopAppButton,
    });

    let newNodes: HTMLElement[] = [widget];
    const checkbox = widget.querySelector<HTMLElement>(".taskdn-checkbox");
    if (this.listItem && checkbox) {
      // Match native task list items:
      // <li class="task-list-item"><input class="task-list-item-checkbox">text</li>
      this.listItem.addClasses(["task-list-item", "taskdn-task-item"]);
      this.listItem.dataset.task = getDataTaskValue(taskData.status);
      widget.removeClass("taskdn-inline");
      checkbox.addClass("task-list-item-checkbox");
      newNodes = [checkbox, widget];
    }

    // Removing a focused checkbox loses keyboard focus, so move it to the new one
    const focused = this.containerEl.doc.activeElement;
    const refocus =
      focused?.hasClass("taskdn-checkbox") &&
      this.nodes.some((node) => node.contains(focused));

    this.nodes[0]?.before(...newNodes);
    this.nodes.forEach((node) => node.remove());
    this.nodes = newNodes;

    if (refocus) checkbox?.focus({ preventScroll: true });
  }
}

/**
 * Check if a link element is the first significant content in an <li>.
 * Returns true if there's no visible text content before the link.
 * This handles various Obsidian DOM structures without needing to know
 * specific internal class names.
 */
function isFirstContentInLi(link: HTMLElement, li: HTMLElement): boolean {
  // Walk the text nodes that come before the link
  const walker = li.doc.createTreeWalker(li, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT,
  });

  let textNode: Node | null;
  while ((textNode = walker.nextNode())) {
    if (textNode.textContent?.trim()) return false;
  }
  return true;
}
