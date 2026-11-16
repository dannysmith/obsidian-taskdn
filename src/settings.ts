import {
  App,
  PluginSettingTab,
  SettingDefinitionItem,
  debounce,
  normalizePath,
} from "obsidian";
import type TaskdnPlugin from "./main";
import { TaskdnSettings } from "./types";

type SettingKey = keyof TaskdnSettings;

/**
 * Settings tab, defined declaratively so Obsidian can render it and include
 * it in settings search.
 */
export class TaskdnSettingTab extends PluginSettingTab {
  plugin: TaskdnPlugin;

  /** Debounced because text settings change on every keystroke */
  private applySettings = debounce(
    () => this.plugin.applySettings(),
    300,
    true
  );

  constructor(app: App, plugin: TaskdnPlugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.icon = "check-square"; // Shown next to the tab in the settings sidebar
  }

  getSettingDefinitions(): SettingDefinitionItem<SettingKey>[] {
    return [
      {
        name: "Tasks directory",
        desc: "Folder containing your task files",
        control: {
          type: "folder",
          key: "tasksDirectory",
          placeholder: "tasks",
        },
      },
      {
        name: "Default status for new tasks",
        desc: "Status assigned to tasks created from checklist items",
        control: {
          type: "dropdown",
          key: "defaultStatus",
          options: { inbox: "Inbox", ready: "Ready", icebox: "Icebox" },
        },
      },
      {
        name: "Show desktop app button",
        desc: "Show a button on tasks to open them in the Taskdn desktop app",
        control: { type: "toggle", key: "showDesktopAppButton" },
      },
      {
        name: "Ignored files",
        desc:
          "Task files to exclude from widget rendering (one pattern per line). " +
          "Paths are relative to the tasks directory. Use * as wildcard. " +
          "Example: archive/* or *-template",
        control: {
          type: "textarea",
          key: "ignoredFiles",
          placeholder: "archive/*\n*-template",
        },
      },
      {
        name: "Use task title as inline title",
        desc:
          'Show the task\'s human-readable title (e.g., "Buy groceries") instead of ' +
          'the filename (e.g., "buy-groceries") at the top of task files. ' +
          "Edits update the title property, not the filename.",
        visible: () => this.showInlineTitle(),
        control: { type: "toggle", key: "useTaskTitleAsInlineTitle" },
      },
      {
        name: "Sync filename with task title",
        desc:
          "When you edit the inline title, also rename the file to match (in kebab-case). " +
          "Links to the file will be updated automatically by Obsidian.",
        visible: () =>
          this.showInlineTitle() &&
          this.plugin.settings.useTaskTitleAsInlineTitle,
        control: { type: "toggle", key: "syncFilenameWithTaskTitle" },
      },
    ];
  }

  getControlValue(key: string): unknown {
    // Stored as a list, edited as one pattern per line
    if (key === "ignoredFiles") {
      return this.plugin.settings.ignoredFiles.join("\n");
    }
    return super.getControlValue(key);
  }

  async setControlValue(key: string, value: unknown): Promise<void> {
    if (key === "ignoredFiles" && typeof value === "string") {
      value = value
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
    } else if (key === "tasksDirectory" && typeof value === "string") {
      value = value.trim() ? normalizePath(value) : "tasks";
    }
    await super.setControlValue(key, value);

    this.refreshDomState(); // Dependent settings may need showing or hiding
    this.applySettings();
  }

  /**
   * Whether Obsidian's "Show inline title" setting is on. It isn't part of the
   * public API, so read it from the vault config defensively.
   */
  private showInlineTitle(): boolean {
    const vault = this.app.vault as unknown as {
      config?: { showInlineTitle?: boolean };
    };
    return vault.config?.showInlineTitle ?? true;
  }
}
