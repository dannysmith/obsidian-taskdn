import {
  ViewPlugin,
  ViewUpdate,
  Decoration,
  DecorationSet,
  EditorView,
  WidgetType,
} from "@codemirror/view";
import {
  RangeSetBuilder,
  EditorState,
  StateEffect,
  Prec,
} from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import type { SyntaxNodeRef } from "@lezer/common";
import { TFile, editorInfoField, editorLivePreviewField } from "obsidian";
import type TaskdnPlugin from "./main";
import {
  resolveTaskFile,
  getTaskDataFromCache,
  getDataTaskValue,
  isIgnoredFile,
  extractWikilinkTarget,
} from "./utils/task-utils";
import { createTaskWidget } from "./widgets/task-widget";
import { TaskData } from "./types";

// Prevents decoration rebuilds during click handling
const widgetClickInProgress = new WeakSet<EditorView>();
const CLICK_TIMEOUT_MS = 100;

/** Editors the view plugin is running in, so widgets can be refreshed from outside CM6. */
const editorViews = new Set<EditorView>();

/** Tells the view plugin to rebuild its widgets. */
const refreshWidgets = StateEffect.define<null>();

/**
 * Rebuild task widgets in every Live Preview editor. Call when a task file or
 * the plugin settings change.
 */
export function refreshLivePreviewWidgets(): void {
  for (const view of editorViews) {
    view.dispatch({ effects: refreshWidgets.of(null) });
  }
}

/**
 * CM6 Widget for rendering task links
 */
class TaskLinkWidget extends WidgetType {
  private clickTimeoutId: number | null = null;

  constructor(
    private plugin: TaskdnPlugin,
    private file: TFile,
    private taskData: TaskData,
    private view: EditorView,
    private isListItem: boolean,
    private showDesktopButton: boolean
  ) {
    super();
  }

  toDOM(): HTMLElement {
    const widget = createTaskWidget({
      app: this.plugin.app,
      file: this.file,
      taskData: this.taskData,
      isListItem: this.isListItem,
      showDesktopButton: this.showDesktopButton,
    });

    // Prevent CM6 from handling mouse events on the widget
    widget.addEventListener("mousedown", (e) => {
      if (this.clickTimeoutId !== null) {
        window.clearTimeout(this.clickTimeoutId);
      }

      widgetClickInProgress.add(this.view);
      e.stopPropagation();

      this.clickTimeoutId = window.setTimeout(() => {
        widgetClickInProgress.delete(this.view);
        this.clickTimeoutId = null;
        // Catch up on any refresh that was skipped during the click
        if (editorViews.has(this.view)) {
          this.view.dispatch({ effects: refreshWidgets.of(null) });
        }
      }, CLICK_TIMEOUT_MS);
    });

    return widget;
  }

  eq(other: TaskLinkWidget): boolean {
    return (
      this.file.path === other.file.path &&
      this.isListItem === other.isListItem &&
      this.showDesktopButton === other.showDesktopButton &&
      JSON.stringify(this.taskData) === JSON.stringify(other.taskData)
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

          // Show the raw wikilink while the cursor is inside it, so it can be
          // edited. A cursor just before or after it keeps the widget, so
          // clicking beside a widget and pressing Enter works.
          if (cursorPos > linkStart && cursorPos < linkEnd) {
            return;
          }

          const linkTarget = extractWikilinkTarget(
            state.sliceDoc(linkStart, linkEnd)
          );
          if (!linkTarget) return;

          const taskFile = resolveTaskFile(
            linkTarget,
            sourcePath,
            plugin.app,
            plugin.settings.tasksDirectory
          );

          if (!taskFile) return;

          // Check if file is in the ignore list
          if (
            isIgnoredFile(
              taskFile,
              plugin.settings.tasksDirectory,
              plugin.settings.ignoredFiles
            )
          ) {
            return;
          }

          const cache = plugin.app.metadataCache.getFileCache(taskFile);
          const taskData = getTaskDataFromCache(taskFile, cache);

          const hasListMarker = hasListMarkerBefore(state, linkStart);

          // Only add line decoration for actual list items (not inline task links)
          // This makes the line behave like a native task line with proper checkbox alignment
          // For inline links, we don't want native task line styling (like strikethrough on done)
          if (hasListMarker) {
            const lineStart = state.doc.lineAt(linkStart).from;
            if (!taskLineStarts.has(lineStart)) {
              taskLineStarts.add(lineStart);
              decorations.push({
                from: lineStart,
                to: lineStart,
                decoration: Decoration.line({
                  class: "HyperMD-task-line taskdn-task-line",
                  attributes: {
                    "data-task": getDataTaskValue(taskData.status),
                  },
                }),
              });
            }
          }

          // Replace only the wikilink, NOT the list marker
          // The list marker will be hidden via CSS and checkbox positioned in its place
          decorations.push({
            from: linkStart,
            to: linkEnd,
            decoration: Decoration.replace({
              widget: new TaskLinkWidget(
                plugin,
                taskFile,
                taskData,
                view,
                hasListMarker,
                plugin.settings.showDesktopAppButton
              ),
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

/**
 * Whether the link is the first thing after a bullet list marker ("- ", "* "
 * or "+ ", optionally indented). Numbered lists don't count.
 */
function hasListMarkerBefore(state: EditorState, linkStart: number): boolean {
  const line = state.doc.lineAt(linkStart);
  const beforeLink = line.text.slice(0, linkStart - line.from);
  return /^\s*[-*+]\s+$/.test(beforeLink);
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
  const viewPlugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(private view: EditorView) {
        editorViews.add(view);
        this.decorations = buildDecorations(view, plugin);
      }

      destroy() {
        editorViews.delete(this.view);
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
        const refreshRequested = update.transactions.some((tr) =>
          tr.effects.some((e) => e.is(refreshWidgets))
        );

        if (
          update.docChanged ||
          update.viewportChanged ||
          update.selectionSet ||
          modeChanged ||
          refreshRequested
        ) {
          this.decorations = buildDecorations(update.view, plugin);
        }
      }
    },
    {
      decorations: (v) => v.decorations,
    }
  ).extension;
  // Obsidian hides the "[[" with its own replace decoration. When the two
  // overlap, CM6 draws only the higher-precedence widget, so without this our
  // widget can vanish (e.g. after a refresh or a plugin reload).
  return Prec.highest(viewPlugin);
}
