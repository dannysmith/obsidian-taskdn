import {
  ViewPlugin,
  ViewUpdate,
  Decoration,
  DecorationSet,
  EditorView,
  WidgetType,
} from "@codemirror/view";
import { RangeSetBuilder, EditorState } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import type { SyntaxNodeRef } from "@lezer/common";
import { TFile, editorInfoField } from "obsidian";
import type TaskdnPlugin from "./main";
import { resolveTaskFile, getTaskDataFromCache } from "./utils/task-utils";
import { createTaskWidget } from "./widgets/task-widget";
import { TaskData } from "./types";

// Track views where a widget click is in progress
// This prevents decoration rebuilds during click handling
const widgetClickInProgress = new WeakSet<EditorView>();

// Timeout for clearing click-in-progress state (ms)
const CLICK_TIMEOUT_MS = 100;

/**
 * Helper to compare optional string arrays
 */
function arraysEqual(a?: string[], b?: string[]): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  return a.every((val, i) => val === b[i]);
}

/**
 * CM6 Widget for rendering task links
 */
class TaskLinkWidget extends WidgetType {
  private clickTimeoutId: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private plugin: TaskdnPlugin,
    private file: TFile,
    private taskData: TaskData,
    private view: EditorView
  ) {
    super();
  }

  toDOM(): HTMLElement {
    const widget = createTaskWidget({
      app: this.plugin.app,
      file: this.file,
      taskData: this.taskData,
    });

    // Prevent mousedown from triggering CM6 selection changes
    // This is critical - we stop the event in bubble phase after children receive it
    widget.addEventListener("mousedown", (e) => {
      // Clear any pending timeout
      if (this.clickTimeoutId !== null) {
        clearTimeout(this.clickTimeoutId);
      }

      // Mark that a click is in progress to prevent decoration rebuilds
      widgetClickInProgress.add(this.view);

      // Stop propagation to prevent CM6 from handling this
      e.stopPropagation();

      // Clear the flag after the click completes
      this.clickTimeoutId = setTimeout(() => {
        widgetClickInProgress.delete(this.view);
        this.clickTimeoutId = null;
      }, CLICK_TIMEOUT_MS);
    });

    return widget;
  }

  eq(other: TaskLinkWidget): boolean {
    // Compare all fields that affect the widget display
    return (
      this.file.path === other.file.path &&
      this.taskData.status === other.taskData.status &&
      this.taskData.title === other.taskData.title &&
      this.taskData.due === other.taskData.due &&
      this.taskData.area === other.taskData.area &&
      arraysEqual(this.taskData.projects, other.taskData.projects)
    );
  }

  ignoreEvent(event: Event): boolean {
    // Return true to prevent the editor from handling mouse events
    if (
      event.type === "mousedown" ||
      event.type === "mouseup" ||
      event.type === "click" ||
      event.type === "pointerdown"
    ) {
      return true;
    }
    return false;
  }
}

/**
 * Build decorations for task wikilinks
 */
function buildDecorations(
  view: EditorView,
  plugin: TaskdnPlugin
): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const { state } = view;

  // Get the source path from the editor (for link resolution)
  const editorInfo = view.state.field(editorInfoField, false);
  const file = editorInfo?.file;
  const sourcePath = file?.path ?? "";

  // Find the cursor position to avoid decorating links the cursor is in
  const cursorPos = state.selection.main.head;

  const tree = syntaxTree(state);

  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from,
      to,
      enter: (node: SyntaxNodeRef) => {
        // Look for internal links (wikilinks)
        // In Obsidian's CM6 tree, these are typically "hmd-internal-link" or similar
        if (
          node.name.includes("internal-link") ||
          node.name.includes("hmd-internal-link")
        ) {
          // Get the full wikilink including brackets
          const linkStart = findLinkStart(state, node.from);
          const linkEnd = findLinkEnd(state, node.to);

          // Skip if cursor is inside the link (allows editing the raw wikilink)
          if (cursorPos >= linkStart && cursorPos <= linkEnd) {
            return;
          }

          // Extract the link text (without brackets and display text)
          const fullText = state.sliceDoc(linkStart, linkEnd);
          const linkMatch = fullText.match(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/);
          if (!linkMatch) return;

          const linkText = linkMatch[1];

          // Check if this resolves to a task file
          const taskFile = resolveTaskFile(
            linkText,
            sourcePath,
            plugin.app,
            plugin.settings.tasksDirectory
          );

          if (!taskFile) return;

          // Get task data from cache
          const cache = plugin.app.metadataCache.getFileCache(taskFile);
          const taskData = getTaskDataFromCache(taskFile, cache);

          // Create decoration
          const decoration = Decoration.replace({
            widget: new TaskLinkWidget(plugin, taskFile, taskData, view),
          });

          builder.add(linkStart, linkEnd, decoration);
        }
      },
    });
  }

  return builder.finish();
}

/**
 * Find the start of a wikilink (the first '[')
 */
function findLinkStart(state: EditorState, pos: number): number {
  const line = state.doc.lineAt(pos);
  const lineText = line.text;
  const lineStart = line.from;
  const relativePos = pos - lineStart;

  // Search backwards for [[
  for (let i = relativePos; i >= 1; i--) {
    if (lineText[i] === "[" && lineText[i - 1] === "[") {
      return lineStart + i - 1;
    }
  }
  return pos;
}

/**
 * Find the end of a wikilink (after the last ']')
 */
function findLinkEnd(state: EditorState, pos: number): number {
  const line = state.doc.lineAt(pos);
  const lineText = line.text;
  const lineStart = line.from;
  const relativePos = pos - lineStart;

  // Search forwards for ]]
  for (let i = relativePos; i < lineText.length - 1; i++) {
    if (lineText[i] === "]" && lineText[i + 1] === "]") {
      return lineStart + i + 2;
    }
  }
  return pos;
}

/**
 * ViewPlugin for Live Preview mode
 */
export function taskLinkViewPlugin(plugin: TaskdnPlugin) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildDecorations(view, plugin);
      }

      update(update: ViewUpdate) {
        // Don't rebuild during a widget click - it would remove the widget
        // before the click handler can fire
        if (widgetClickInProgress.has(update.view)) {
          return;
        }

        // Rebuild decorations on document changes, viewport changes, or selection changes
        if (
          update.docChanged ||
          update.viewportChanged ||
          update.selectionSet
        ) {
          this.decorations = buildDecorations(update.view, plugin);
        }
      }
    },
    {
      decorations: (v) => v.decorations,
    }
  );
}
