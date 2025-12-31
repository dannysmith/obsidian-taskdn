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
import { TFile, editorInfoField, editorLivePreviewField } from "obsidian";
import type TaskdnPlugin from "./main";
import { resolveTaskFile, getTaskDataFromCache } from "./utils/task-utils";
import { createTaskWidget } from "./widgets/task-widget";
import { TaskData } from "./types";

// Prevents decoration rebuilds during click handling
const widgetClickInProgress = new WeakSet<EditorView>();
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

    // Prevent CM6 from handling mouse events on the widget
    widget.addEventListener("mousedown", (e) => {
      if (this.clickTimeoutId !== null) {
        clearTimeout(this.clickTimeoutId);
      }

      widgetClickInProgress.add(this.view);
      e.stopPropagation();

      this.clickTimeoutId = setTimeout(() => {
        widgetClickInProgress.delete(this.view);
        this.clickTimeoutId = null;
      }, CLICK_TIMEOUT_MS);
    });

    return widget;
  }

  eq(other: TaskLinkWidget): boolean {
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
    return (
      event.type === "mousedown" ||
      event.type === "mouseup" ||
      event.type === "click" ||
      event.type === "pointerdown"
    );
  }
}

/**
 * Build decorations for task wikilinks
 */
/**
 * Collected decoration info for sorting before adding to builder
 */
interface DecorationInfo {
  from: number;
  to: number;
  decoration: Decoration;
}

function buildDecorations(
  view: EditorView,
  plugin: TaskdnPlugin
): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const { state } = view;

  // Don't render widgets in Source mode - only in Live Preview
  const isLivePreview = state.field(editorLivePreviewField, false);
  if (!isLivePreview) {
    return builder.finish();
  }

  const editorInfo = state.field(editorInfoField, false);
  const sourcePath = editorInfo?.file?.path ?? "";
  const cursorPos = state.selection.main.head;
  const tree = syntaxTree(state);

  // Collect all decorations first (line decorations + widget decorations)
  const decorations: DecorationInfo[] = [];
  const taskLineStarts = new Set<number>(); // Track lines we've already added class to

  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from,
      to,
      enter: (node: SyntaxNodeRef) => {
        // Obsidian's CM6 syntax tree uses "hmd-internal-link" for wikilinks
        if (
          node.name.includes("internal-link") ||
          node.name.includes("hmd-internal-link")
        ) {
          const linkStart = findLinkStart(state, node.from);
          const linkEnd = findLinkEnd(state, node.to);

          // Skip if cursor is inside (allows editing the raw wikilink)
          if (cursorPos >= linkStart && cursorPos <= linkEnd) {
            return;
          }

          const fullText = state.sliceDoc(linkStart, linkEnd);
          const linkMatch = fullText.match(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/);
          if (!linkMatch) return;

          const taskFile = resolveTaskFile(
            linkMatch[1],
            sourcePath,
            plugin.app,
            plugin.settings.tasksDirectory
          );

          if (!taskFile) return;

          const cache = plugin.app.metadataCache.getFileCache(taskFile);
          const taskData = getTaskDataFromCache(taskFile, cache);

          // Add line decoration to make line behave like native task line
          const lineStart = state.doc.lineAt(linkStart).from;
          if (!taskLineStarts.has(lineStart)) {
            taskLineStarts.add(lineStart);
            decorations.push({
              from: lineStart,
              to: lineStart,
              decoration: Decoration.line({ class: "HyperMD-task-line" }),
            });
          }

          // Add widget decoration
          decorations.push({
            from: linkStart,
            to: linkEnd,
            decoration: Decoration.replace({
              widget: new TaskLinkWidget(plugin, taskFile, taskData, view),
            }),
          });
        }
      },
    });
  }

  // Sort by position and add to builder (RangeSetBuilder requires sorted order)
  decorations.sort((a, b) => a.from - b.from || a.to - b.to);
  for (const { from, to, decoration } of decorations) {
    builder.add(from, to, decoration);
  }

  return builder.finish();
}

function findLinkStart(state: EditorState, pos: number): number {
  const line = state.doc.lineAt(pos);
  const relativePos = pos - line.from;

  for (let i = relativePos; i >= 1; i--) {
    if (line.text[i] === "[" && line.text[i - 1] === "[") {
      return line.from + i - 1;
    }
  }
  return pos;
}

function findLinkEnd(state: EditorState, pos: number): number {
  const line = state.doc.lineAt(pos);
  const relativePos = pos - line.from;

  for (let i = relativePos; i < line.text.length - 1; i++) {
    if (line.text[i] === "]" && line.text[i + 1] === "]") {
      return line.from + i + 2;
    }
  }
  return pos;
}

export function taskLinkViewPlugin(plugin: TaskdnPlugin) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildDecorations(view, plugin);
      }

      update(update: ViewUpdate) {
        if (widgetClickInProgress.has(update.view)) {
          return;
        }

        // Check if live preview mode changed
        const wasLivePreview = update.startState.field(
          editorLivePreviewField,
          false
        );
        const isLivePreview = update.state.field(editorLivePreviewField, false);
        const modeChanged = wasLivePreview !== isLivePreview;

        if (
          update.docChanged ||
          update.viewportChanged ||
          update.selectionSet ||
          modeChanged
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
