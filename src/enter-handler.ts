import { keymap, EditorView } from "@codemirror/view";
import { EditorSelection, Prec } from "@codemirror/state";
import { editorInfoField } from "obsidian";
import type TaskdnPlugin from "./main";
import { resolveTaskFile } from "./utils/task-utils";

/**
 * Creates a keymap that handles Enter key in task widget lines.
 *
 * When pressing Enter after a task wikilink (like `- [[my-task]] text`),
 * creates a checkbox item `- [ ] ` instead of a bullet `- `.
 *
 * This works in both Live Preview and Source mode, but only triggers when:
 * 1. Line is a bullet list item starting with a wikilink
 * 2. The wikilink resolves to a task file
 * 3. Cursor is after the wikilink (not inside it)
 */
export function createTaskEnterHandler(plugin: TaskdnPlugin) {
  // Use Prec.highest to run before Obsidian's list continuation handler.
  // We return false when conditions don't match, so other handlers still work.
  return Prec.highest(
    keymap.of([
      {
        key: "Enter",
        run: (view: EditorView) => {
          return handleTaskEnter(view, plugin);
        },
      },
    ])
  );
}

function handleTaskEnter(view: EditorView, plugin: TaskdnPlugin): boolean {
  const { state } = view;
  const selection = state.selection.main;

  // Only handle single cursor (no range selections)
  if (!selection.empty) return false;

  const line = state.doc.lineAt(selection.head);
  const lineText = line.text;
  const cursorInLine = selection.head - line.from;

  // Match a task widget line: optional indent + bullet marker + wikilink at start
  // Captures: [1] = indent, [2] = link target
  const taskLineMatch = lineText.match(
    /^(\s*)[-*+]\s*\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/
  );
  if (!taskLineMatch) return false;

  const [, indent, linkTarget] = taskLineMatch;

  // Find the full wikilink bounds (handles aliases like [[task|alias]])
  const wikilinkMatch = lineText.match(/\[\[([^\]|#]+)(?:[|#][^\]]+)?\]\]/);
  if (!wikilinkMatch) return false;

  const wikilinkStart = lineText.indexOf(wikilinkMatch[0]);
  const wikilinkEnd = wikilinkStart + wikilinkMatch[0].length;

  // Don't handle if cursor is before or inside the wikilink
  // (allows editing the raw wikilink when cursor is there)
  if (cursorInLine < wikilinkEnd) {
    return false;
  }

  // Verify this is actually a task file (not just any wikilink)
  const editorInfo = state.field(editorInfoField, false);
  const sourcePath = editorInfo?.file?.path ?? "";

  const taskFile = resolveTaskFile(
    linkTarget,
    sourcePath,
    plugin.app,
    plugin.settings.tasksDirectory
  );

  if (!taskFile) return false;

  // Get text after cursor (what goes to the new line)
  const textAfterCursor = lineText.slice(cursorInLine);
  const trimmedText = textAfterCursor.trimStart();

  // Build the new checkbox line
  const newLine = `\n${indent}- [ ] ${trimmedText}`;

  // Calculate new cursor position: after "- [ ] " on the new line
  // +1 for newline, +indent.length for preserved indent, +6 for "- [ ] "
  const newCursorPos = selection.head + 1 + indent.length + 6;

  view.dispatch({
    changes: {
      from: selection.head,
      to: line.to,
      insert: newLine,
    },
    selection: EditorSelection.cursor(newCursorPos),
  });

  return true;
}
