import { describe, it, expect } from "vitest";
import {
  isValidStatus,
  parseStatus,
  isDoneStatus,
  getDataTaskValue,
  isTaskPath,
  formatDate,
  formatDateForDisplay,
  isChecklistLine,
  extractChecklistInfo,
  sanitizeFilename,
  titleToKebabCase,
  extractWikilinkTarget,
  escapeYamlString,
} from "./task-utils";

describe("isValidStatus", () => {
  it("returns true for valid statuses", () => {
    expect(isValidStatus("inbox")).toBe(true);
    expect(isValidStatus("icebox")).toBe(true);
    expect(isValidStatus("ready")).toBe(true);
    expect(isValidStatus("in-progress")).toBe(true);
    expect(isValidStatus("blocked")).toBe(true);
    expect(isValidStatus("dropped")).toBe(true);
    expect(isValidStatus("done")).toBe(true);
  });

  it("returns false for invalid values", () => {
    expect(isValidStatus("invalid")).toBe(false);
    expect(isValidStatus("")).toBe(false);
    expect(isValidStatus(null)).toBe(false);
    expect(isValidStatus(undefined)).toBe(false);
    expect(isValidStatus(123)).toBe(false);
    expect(isValidStatus("DONE")).toBe(false); // case sensitive
  });
});

describe("parseStatus", () => {
  it("returns the status if valid", () => {
    expect(parseStatus("ready", "inbox")).toBe("ready");
    expect(parseStatus("done", "inbox")).toBe("done");
  });

  it("returns default if invalid", () => {
    expect(parseStatus("invalid", "inbox")).toBe("inbox");
    expect(parseStatus(null, "ready")).toBe("ready");
    expect(parseStatus(undefined, "ready")).toBe("ready");
  });
});

describe("isDoneStatus", () => {
  it("returns true for done", () => {
    expect(isDoneStatus("done")).toBe(true);
  });

  it("returns false for other statuses", () => {
    expect(isDoneStatus("ready")).toBe(false);
    expect(isDoneStatus("dropped")).toBe(false);
    expect(isDoneStatus("inbox")).toBe(false);
  });
});

describe("getDataTaskValue", () => {
  it("returns 'x' for done", () => {
    expect(getDataTaskValue("done")).toBe("x");
  });

  it("returns '-' for dropped", () => {
    expect(getDataTaskValue("dropped")).toBe("-");
  });

  it("returns ' ' for all other statuses", () => {
    expect(getDataTaskValue("inbox")).toBe(" ");
    expect(getDataTaskValue("ready")).toBe(" ");
    expect(getDataTaskValue("in-progress")).toBe(" ");
    expect(getDataTaskValue("blocked")).toBe(" ");
    expect(getDataTaskValue("icebox")).toBe(" ");
  });
});

describe("isTaskPath", () => {
  it("returns true for paths in tasks directory", () => {
    expect(isTaskPath("tasks/my-task.md", "tasks")).toBe(true);
    expect(isTaskPath("tasks/subfolder/task.md", "tasks")).toBe(true);
  });

  it("returns false for paths outside tasks directory", () => {
    expect(isTaskPath("notes/my-note.md", "tasks")).toBe(false);
    expect(isTaskPath("my-task.md", "tasks")).toBe(false);
    expect(isTaskPath("tasksfoo/task.md", "tasks")).toBe(false); // no trailing slash match
  });

  it("handles leading slashes", () => {
    expect(isTaskPath("/tasks/my-task.md", "tasks")).toBe(true);
    expect(isTaskPath("tasks/my-task.md", "/tasks")).toBe(true);
    expect(isTaskPath("/tasks/my-task.md", "/tasks")).toBe(true);
  });

  it("works with custom directory names", () => {
    expect(isTaskPath("my-tasks/task.md", "my-tasks")).toBe(true);
    expect(isTaskPath("folder/subfolder/task.md", "folder/subfolder")).toBe(
      true
    );
  });
});

describe("formatDate", () => {
  it("formats date as YYYY-MM-DD", () => {
    expect(formatDate(new Date("2025-01-15T12:00:00"))).toBe("2025-01-15");
    expect(formatDate(new Date("2025-12-31T23:59:59"))).toBe("2025-12-31");
  });
});

describe("formatDateForDisplay", () => {
  it("returns 'today' for today's date", () => {
    const today = new Date();
    const dateStr = formatDate(today);
    expect(formatDateForDisplay(dateStr)).toBe("today");
  });

  it("returns 'tomorrow' for tomorrow's date", () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = formatDate(tomorrow);
    expect(formatDateForDisplay(dateStr)).toBe("tomorrow");
  });

  it("returns 'yesterday' for yesterday's date", () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = formatDate(yesterday);
    expect(formatDateForDisplay(dateStr)).toBe("yesterday");
  });

  it("returns 'next <day>' for dates 2-7 days ahead", () => {
    const future = new Date();
    future.setDate(future.getDate() + 3);
    const dateStr = formatDate(future);
    const result = formatDateForDisplay(dateStr);
    expect(result).toMatch(/^next \w+$/);
  });

  it("returns 'last <day>' for dates 2-7 days ago", () => {
    const past = new Date();
    past.setDate(past.getDate() - 3);
    const dateStr = formatDate(past);
    const result = formatDateForDisplay(dateStr);
    expect(result).toMatch(/^last \w+$/);
  });

  it("returns month/day format for dates further away", () => {
    const farFuture = new Date();
    farFuture.setDate(farFuture.getDate() + 30);
    const dateStr = formatDate(farFuture);
    const result = formatDateForDisplay(dateStr);
    // Should be something like "Feb 14" - not "today/tomorrow/next X"
    expect(result).not.toMatch(/^(today|tomorrow|yesterday|next|last)/);
  });

  it("returns original string for invalid dates", () => {
    expect(formatDateForDisplay("not-a-date")).toBe("not-a-date");
    expect(formatDateForDisplay("")).toBe("");
  });
});

describe("isChecklistLine", () => {
  it("returns true for valid checklist lines", () => {
    expect(isChecklistLine("- [ ] Task")).toBe(true);
    expect(isChecklistLine("- [x] Done task")).toBe(true);
    expect(isChecklistLine("- [X] Done task")).toBe(true);
    expect(isChecklistLine("* [ ] Task")).toBe(true);
    expect(isChecklistLine("  - [ ] Indented task")).toBe(true);
    expect(isChecklistLine("1. [ ] Numbered task")).toBe(true);
  });

  it("returns false for non-checklist lines", () => {
    expect(isChecklistLine("- Regular list item")).toBe(false);
    expect(isChecklistLine("Just text")).toBe(false);
    expect(isChecklistLine("- [] No space in checkbox")).toBe(false);
    expect(isChecklistLine("- [ ]")).toBe(false); // no text after checkbox
    expect(isChecklistLine("")).toBe(false);
  });
});

describe("extractChecklistInfo", () => {
  it("extracts info from unchecked item", () => {
    const result = extractChecklistInfo("- [ ] My task");
    expect(result.text).toBe("My task");
    expect(result.checked).toBe(false);
    expect(result.indent).toBe("");
    expect(result.listMarker).toBe("-");
  });

  it("extracts info from checked item", () => {
    const result = extractChecklistInfo("- [x] Done task");
    expect(result.text).toBe("Done task");
    expect(result.checked).toBe(true);
  });

  it("handles uppercase X", () => {
    const result = extractChecklistInfo("- [X] Done task");
    expect(result.checked).toBe(true);
  });

  it("preserves indentation", () => {
    const result = extractChecklistInfo("    - [ ] Indented");
    expect(result.indent).toBe("    ");
  });

  it("handles different list markers", () => {
    expect(extractChecklistInfo("* [ ] Task").listMarker).toBe("*");
    expect(extractChecklistInfo("1. [ ] Task").listMarker).toBe("1.");
  });

  it("returns defaults for non-matching lines", () => {
    const result = extractChecklistInfo("not a checklist");
    expect(result.text).toBe("");
    expect(result.checked).toBe(false);
    expect(result.listMarker).toBe("-");
  });
});

describe("sanitizeFilename", () => {
  it("replaces invalid characters with hyphens", () => {
    expect(sanitizeFilename('file:name/test*"foo')).toBe("file-name-test-foo");
  });

  it("replaces spaces with hyphens", () => {
    expect(sanitizeFilename("my task name")).toBe("my-task-name");
  });

  it("collapses multiple hyphens", () => {
    expect(sanitizeFilename("foo---bar")).toBe("foo-bar");
    expect(sanitizeFilename("foo   bar")).toBe("foo-bar");
  });

  it("removes leading and trailing hyphens", () => {
    expect(sanitizeFilename("-foo-")).toBe("foo");
    expect(sanitizeFilename("  foo  ")).toBe("foo");
  });

  it("truncates to 100 characters", () => {
    const longText = "a".repeat(150);
    expect(sanitizeFilename(longText).length).toBe(100);
  });

  it("returns 'untitled-task' for empty result", () => {
    expect(sanitizeFilename("")).toBe("untitled-task");
    expect(sanitizeFilename("---")).toBe("untitled-task");
    expect(sanitizeFilename("***")).toBe("untitled-task");
  });
});

describe("extractWikilinkTarget", () => {
  it("extracts target from simple wikilink", () => {
    expect(extractWikilinkTarget("[[My Task]]")).toBe("My Task");
  });

  it("extracts target from wikilink with alias", () => {
    expect(extractWikilinkTarget("[[My Task|Display Text]]")).toBe("My Task");
  });

  it("returns null for non-wikilink text", () => {
    expect(extractWikilinkTarget("plain text")).toBeNull();
    expect(extractWikilinkTarget("[single bracket]")).toBeNull();
    expect(extractWikilinkTarget("")).toBeNull();
  });

  it("handles wikilinks in surrounding text", () => {
    expect(extractWikilinkTarget("Check out [[task]] here")).toBe("task");
  });
});

describe("escapeYamlString", () => {
  it("escapes backslashes", () => {
    expect(escapeYamlString("foo\\bar")).toBe("foo\\\\bar");
  });

  it("escapes double quotes", () => {
    expect(escapeYamlString('say "hello"')).toBe('say \\"hello\\"');
  });

  it("escapes newlines", () => {
    expect(escapeYamlString("line1\nline2")).toBe("line1\\nline2");
  });

  it("escapes carriage returns", () => {
    expect(escapeYamlString("line1\rline2")).toBe("line1\\rline2");
  });

  it("escapes tabs", () => {
    expect(escapeYamlString("col1\tcol2")).toBe("col1\\tcol2");
  });

  it("handles multiple escapes", () => {
    expect(escapeYamlString('a\\b"c\nd')).toBe('a\\\\b\\"c\\nd');
  });

  it("returns unchanged string if no escaping needed", () => {
    expect(escapeYamlString("normal text")).toBe("normal text");
  });
});

describe("titleToKebabCase", () => {
  it("converts simple title to kebab-case", () => {
    expect(titleToKebabCase("Buy New Faceplate")).toBe("buy-new-faceplate");
    expect(titleToKebabCase("My Task")).toBe("my-task");
  });

  it("handles already lowercase text", () => {
    expect(titleToKebabCase("simple task")).toBe("simple-task");
  });

  it("replaces special characters with hyphens", () => {
    expect(titleToKebabCase("What's next?")).toBe("what-s-next");
    expect(titleToKebabCase("Task: Do something!")).toBe("task-do-something");
    expect(titleToKebabCase('Say "hello"')).toBe("say-hello");
  });

  it("collapses multiple spaces and hyphens", () => {
    expect(titleToKebabCase("foo   bar")).toBe("foo-bar");
    expect(titleToKebabCase("foo---bar")).toBe("foo-bar");
    expect(titleToKebabCase("foo - bar")).toBe("foo-bar");
  });

  it("trims leading and trailing whitespace and hyphens", () => {
    expect(titleToKebabCase("  My Task  ")).toBe("my-task");
    expect(titleToKebabCase("---task---")).toBe("task");
  });

  it("returns null for empty or whitespace-only input", () => {
    expect(titleToKebabCase("")).toBeNull();
    expect(titleToKebabCase("   ")).toBeNull();
  });

  it("returns null for input that becomes empty after sanitization", () => {
    expect(titleToKebabCase("???")).toBeNull();
    expect(titleToKebabCase("---")).toBeNull();
    expect(titleToKebabCase("!@#$%")).toBeNull();
  });

  it("truncates to 100 characters", () => {
    const longTitle = "a".repeat(150);
    const result = titleToKebabCase(longTitle);
    expect(result).not.toBeNull();
    expect(result!.length).toBe(100);
  });

  it("handles mixed case and punctuation", () => {
    expect(titleToKebabCase("Buy new faceplate for pub Cajon")).toBe(
      "buy-new-faceplate-for-pub-cajon"
    );
  });

  it("handles numbers", () => {
    expect(titleToKebabCase("Task 123")).toBe("task-123");
    expect(titleToKebabCase("2024 Goals")).toBe("2024-goals");
  });
});
