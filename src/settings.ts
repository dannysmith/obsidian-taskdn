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
          .setPlaceholder("tasks")
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
  }
}
