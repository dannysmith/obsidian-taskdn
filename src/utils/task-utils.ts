import { App, TFile, CachedMetadata } from "obsidian";
import { TaskData, TaskStatus } from "../types";

/**
 * Valid task statuses for runtime validation
 */
const VALID_STATUSES: readonly TaskStatus[] = [
  "inbox",
  "icebox",
  "ready",
  "in-progress",
  "blocked",
  "dropped",
  "done",
] as const;

/**
 * Check if a value is a valid TaskStatus
 */
export function isValidStatus(value: unknown): value is TaskStatus {
  return (
    typeof value === "string" && VALID_STATUSES.includes(value as TaskStatus)
  );
}

/**
 * Parse and validate a status from frontmatter, returning default if invalid
 */
export function parseStatus(
  value: unknown,
  defaultStatus: TaskStatus
): TaskStatus {
  return isValidStatus(value) ? value : defaultStatus;
}

/**
 * Check if a status represents a "done" task
 */
export function isDoneStatus(status: TaskStatus): boolean {
  return status === "done";
}

/**
 * Check if a file path is within the tasks directory
 */
export function isTaskPath(filePath: string, tasksDirectory: string): boolean {
  // Normalize paths - handle both with and without leading slash
  const normalizedPath = filePath.startsWith("/")
    ? filePath.slice(1)
    : filePath;
  const normalizedTasksDir = tasksDirectory.startsWith("/")
    ? tasksDirectory.slice(1)
    : tasksDirectory;

  return normalizedPath.startsWith(normalizedTasksDir + "/");
}

/**
 * Resolve a wikilink to a task file
 * Returns null if the link doesn't resolve to a task file
 */
export function resolveTaskFile(
  linkText: string,
  sourcePath: string,
  app: App,
  tasksDirectory: string
): TFile | null {
  // Remove any heading/block references from the link
  const cleanLink = linkText.split("#")[0].split("^")[0];

  const file = app.metadataCache.getFirstLinkpathDest(cleanLink, sourcePath);
  if (file && isTaskPath(file.path, tasksDirectory)) {
    return file;
  }
  return null;
}

/**
 * Extract task data from file cache (fast, no file read)
 */
export function getTaskDataFromCache(
  file: TFile,
  cache: CachedMetadata | null
): TaskData {
  const fm = cache?.frontmatter;

  return {
    title: fm?.title ?? file.basename,
    status: parseStatus(fm?.status, "inbox"),
    due: fm?.due,
    scheduled: fm?.scheduled,
    deferUntil: fm?.["defer-until"],
    projects: fm?.projects,
    area: fm?.area,
    completedAt: fm?.["completed-at"],
  };
}

/**
 * Toggle task status between done and ready
 * Returns the new status
 */
export async function toggleTaskStatus(
  file: TFile,
  app: App
): Promise<TaskStatus> {
  let newStatus: TaskStatus = "ready";

  await app.fileManager.processFrontMatter(file, (fm) => {
    const wasDone = fm.status === "done";
    newStatus = wasDone ? "ready" : "done";
    fm.status = newStatus;
    fm["updated-at"] = formatDate(new Date());

    if (!wasDone) {
      // Completing the task
      fm["completed-at"] = formatDate(new Date());
    } else {
      // Un-completing - remove completed-at
      delete fm["completed-at"];
    }
  });

  return newStatus;
}

/**
 * Format a date as YYYY-MM-DD
 */
export function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

/**
 * Parse a YYYY-MM-DD date string to a Date object at noon local time
 */
function parseDateString(dateStr: string): Date | null {
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const [, year, month, day] = match;
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day), 12);
  }
  try {
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
}

/**
 * Get days difference between two dates (ignoring time)
 */
function getDaysDiff(date: Date, today: Date): number {
  const dateOnly = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  );
  const todayOnly = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  );
  return Math.round(
    (dateOnly.getTime() - todayOnly.getTime()) / (1000 * 60 * 60 * 24)
  );
}

/**
 * Format a date for display with plain English for nearby dates
 * Returns "today", "tomorrow", "yesterday", "next Monday", "last Wednesday"
 * for dates within a week, otherwise "Jan 31" format
 */
export function formatDateForDisplay(dateStr: string): string {
  const date = parseDateString(dateStr);
  if (!date) return dateStr;

  const today = new Date();
  const daysDiff = getDaysDiff(date, today);

  if (daysDiff === 0) return "today";
  if (daysDiff === 1) return "tomorrow";
  if (daysDiff === -1) return "yesterday";

  const dayName = date.toLocaleDateString(undefined, { weekday: "long" });

  // Within next week (2-7 days ahead)
  if (daysDiff >= 2 && daysDiff <= 7) {
    return `next ${dayName}`;
  }

  // Within past week (2-7 days ago)
  if (daysDiff >= -7 && daysDiff <= -2) {
    return `last ${dayName}`;
  }

  // Default format for dates further away
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/**
 * Check if a line is a checklist item
 * Requires a list marker (-, *, or numbered) followed by checkbox
 */
export function isChecklistLine(line: string): boolean {
  return /^\s*([-*]|\d+\.)\s+\[[ xX]\]\s+.+$/.test(line);
}

/**
 * Extract info from a checklist line
 */
export function extractChecklistInfo(line: string): {
  text: string;
  checked: boolean;
  indent: string;
  listMarker: string;
} {
  const match = line.match(/^(\s*)([-*]|\d+\.)\s+\[([ xX])\]\s+(.+)$/);
  if (!match) {
    return { text: "", checked: false, indent: "", listMarker: "-" };
  }
  return {
    indent: match[1],
    listMarker: match[2],
    checked: match[3].toLowerCase() === "x",
    text: match[4].trim(),
  };
}

/**
 * Sanitize a string for use as a filename
 */
export function sanitizeFilename(text: string): string {
  const sanitized = text
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);

  return sanitized || "untitled-task";
}

/**
 * Extract wikilink text from a string (e.g., "[[My Task]]" -> "My Task")
 */
export function extractWikilinkTarget(text: string): string | null {
  const match = text.match(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/);
  return match ? match[1] : null;
}

/**
 * Escape a string for use in YAML double-quoted string
 */
export function escapeYamlString(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
}
