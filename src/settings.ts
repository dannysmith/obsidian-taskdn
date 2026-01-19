import { App, PluginSettingTab, Setting } from "obsidian";
import type TaskdnPlugin from "./main";
import { isValidStatus } from "./utils/task-utils";

export class TaskdnSettingTab extends PluginSettingTab {
  plugin: TaskdnPlugin;

  constructor(app: App, plugin: TaskdnPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Tasks directory")
      .setDesc("Path to the folder containing task files (e.g., 'tasks')")
      .addText((text) =>
        text
          .setPlaceholder("Tasks")
          .setValue(this.plugin.settings.tasksDirectory)
          .onChange(async (value) => {
            this.plugin.settings.tasksDirectory = value || "tasks";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Default status for new tasks")
      .setDesc("Status assigned to tasks created from checklist items")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("inbox", "Inbox")
          .addOption("ready", "Ready")
          .addOption("icebox", "Icebox")
          .setValue(this.plugin.settings.defaultStatus)
          .onChange(async (value) => {
            if (isValidStatus(value)) {
              this.plugin.settings.defaultStatus = value;
              await this.plugin.saveSettings();
            }
          })
      );

    new Setting(containerEl)
      .setName("Show desktop app button")
      .setDesc("Show a button on tasks to open them in the taskdn desktop app")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showDesktopAppButton)
          .onChange(async (value) => {
            this.plugin.settings.showDesktopAppButton = value;
            await this.plugin.saveSettings();
            this.plugin.updateDesktopButtonClasses();
          })
      );

    new Setting(containerEl)
      .setName("Ignored files")
      .setDesc(
        "Task files to exclude from widget rendering (one pattern per line). " +
          "Paths are relative to the tasks directory. Use * as wildcard. " +
          "Example: archive/* or *-template"
      )
      .addTextArea((text) =>
        text
          .setPlaceholder("Files to ignore\narchive/*\n*-template")
          .setValue(this.plugin.settings.ignoredFiles.join("\n"))
          .onChange(async (value) => {
            this.plugin.settings.ignoredFiles = value
              .split("\n")
              .map((line) => line.trim())
              .filter((line) => line.length > 0);
            await this.plugin.saveSettings();
          })
      );

    // Access Obsidian's internal config to check if "Show inline title" is enabled
    // This setting isn't part of the public API, so we use a type assertion
    const vaultWithConfig = this.app.vault as unknown as {
      config?: { showInlineTitle?: boolean };
    };
    const showInlineTitle = vaultWithConfig.config?.showInlineTitle ?? true;

    if (showInlineTitle) {
      new Setting(containerEl)
        .setName("Use task title as inline title")
        .setDesc(
          'Show the task\'s human-readable title (e.g., "Buy groceries") instead of ' +
            'the filename (e.g., "buy-groceries") at the top of task files. ' +
            "Edits update the title property, not the filename."
        )
        .addToggle((toggle) =>
          toggle
            .setValue(this.plugin.settings.useTaskTitleAsInlineTitle)
            .onChange(async (value) => {
              this.plugin.settings.useTaskTitleAsInlineTitle = value;
              await this.plugin.saveSettings();
              this.display(); // Re-render to show/hide dependent setting
            })
        );

      if (this.plugin.settings.useTaskTitleAsInlineTitle) {
        new Setting(containerEl)
          .setName("Sync filename with task title")
          .setDesc(
            "When you edit the inline title, also rename the file to match (in kebab-case). " +
              "Links to the file will be updated automatically by Obsidian."
          )
          .addToggle((toggle) =>
            toggle
              .setValue(this.plugin.settings.syncFilenameWithTaskTitle)
              .onChange(async (value) => {
                this.plugin.settings.syncFilenameWithTaskTitle = value;
                await this.plugin.saveSettings();
              })
          );
      }
    }
  }
}
