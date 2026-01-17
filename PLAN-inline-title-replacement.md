# Implementation Plan: Replace Inline Title with Task Title

## Overview

When Obsidian's "Show inline title" setting is enabled, task files display their kebab-case filename (e.g., `buy-new-faceplate-for-pub-cajon`) as a large heading above the content. This looks poor compared to the properly formatted `title` field in frontmatter (e.g., "Buy new faceplate for pub Cajon").

This feature will replace the inline title display with the task's `title` frontmatter field, while preserving the ability to edit it inline—with edits updating the frontmatter rather than renaming the file.

---

## Requirements

### Definition of a Valid Task File

A file is considered a **valid task file** (and eligible for this feature) if and only if ALL of the following are true:

1. The file is located within the configured `tasksDirectory` (e.g., `tasks/`)
2. The file has a `title` field in its frontmatter (can be empty string `""`, but must exist)
3. The file has a `status` field in its frontmatter
4. The file is NOT matched by any pattern in the plugin's `ignoredFiles` list

**Important**: The S1 spec also requires `created-at` and `updated-at` fields, but we do NOT check for these when determining validity for this feature. Only `title` and `status` are required.

Files that do not meet ALL of these criteria receive standard Obsidian behavior—no plugin features apply.

### Empty Title Handling

An empty title (`title: ""`) is valid. In this case:
- The inline title area appears empty (no text displayed)
- The user can click into it and type to add a title
- Saving updates the frontmatter `title` field as normal

### Core Behavior

| Condition | Behavior |
|-----------|----------|
| Valid task file + feature enabled | Show `title` field in inline title, edits update frontmatter |
| Valid task file + feature disabled | Standard Obsidian behavior (filename as title) |
| Invalid task file (missing title/status) | Standard Obsidian behavior |
| File not in tasks directory | Standard Obsidian behavior |
| File in ignore list | Standard Obsidian behavior |
| Obsidian "Show inline title" OFF | No inline title shown at all (Obsidian handles this) |

### Settings

Two new plugin settings:

1. **"Use task title as inline title"** (default: OFF)
   - Only visible when Obsidian's "Show inline title" is enabled
   - When ON: Valid task files show their `title` field instead of filename
   - When OFF: Standard Obsidian behavior for all files

2. **"Sync filename with task title"** (default: OFF)
   - Only visible when "Use task title as inline title" is ON
   - When ON: Editing the inline title updates BOTH the frontmatter `title` AND renames the file
   - When OFF: Editing only updates the frontmatter `title` field

### Visual Indicator

When viewing a valid task file with this feature active, display a **subtle left border accent** on the entire view pane. This indicates "you are viewing a task file" without cluttering the editor content.

Requirements:
- Very subtle—should not distract from content
- Lives outside the CodeMirror editor (on the view/pane level)
- Uses existing color conventions (could match status color or use a neutral accent)
- Does not interfere with themes or other plugins

### Inline Title Appearance

The inline title must look **identical to native Obsidian** in terms of:
- Font family, size, weight
- Color (respects theme)
- Padding and margins
- Cursor behavior
- Selection behavior

This ensures compatibility with themes and other plugins that style the inline title.

---

## Research Findings

### DOM Structure

The inline title is rendered as a contenteditable div:

```html
<div class="cm-editor">
  <div class="cm-scroller">
    <div class="cm-sizer">
      <div class="inline-title" contenteditable="true" spellcheck="true"
           autocapitalize="on" tabindex="-1" enterkeyhint="done">
        buy-new-faceplate-for-pub-cajon
      </div>
      <div class="metadata-container">...</div>
      <div class="cm-contentContainer">...</div>
    </div>
  </div>
</div>
```

### Accessing Obsidian's "Show Inline Title" Setting

The setting is accessible via an undocumented API:

```typescript
// @ts-ignore - undocumented API
const showInlineTitle = this.app.vault.config?.showInlineTitle;
```

This is stored in `.obsidian/app.json` as `"showInlineTitle": true`.

### Accessing the Inline Title Element

From a `MarkdownView`:

```typescript
const view = this.app.workspace.getActiveViewOfType(MarkdownView);
const inlineTitleEl = view?.containerEl.querySelector('.inline-title');
```

### Undocumented MarkdownView Title Methods

According to [obsidian-typings](https://github.com/Fevol/obsidian-typings), `MarkdownView` has these internal methods for title handling:

- `saveTitle(titleEl: HTMLElement): Promise<void>` - Updates file to match title
- `onTitleBlur(): Promise<void>` - Called when title loses focus
- `onTitleChange(titleEl: HTMLElement): void` - Called on input event
- `onTitleFocus(): void` - Called when title gains focus

These handle the native behavior where editing the inline title renames the file.

### Relevant Workspace Events

- `workspace.on('active-leaf-change')` - Fires when switching between tabs/files
- `workspace.on('layout-change')` - Fires when workspace layout changes
- `metadataCache.on('changed')` - Fires when a file's metadata changes

### Existing Pattern: processFrontMatter

The plugin already uses `app.fileManager.processFrontMatter()` in `toggleTaskStatus()` to safely modify YAML frontmatter. We'll use the same approach for updating the title.

---

## Implementation Approach

**Strategy: CSS Hide + Custom Element**

Rather than trying to intercept Obsidian's native title editing behavior (which would require monkey-patching undocumented methods), we will:

1. Hide the native `.inline-title` element via CSS for valid task files
2. Insert a custom contenteditable element that looks identical
3. Wire up our own input/blur handlers to update frontmatter
4. Sync display when frontmatter changes from other sources

This approach:
- Avoids fighting Obsidian's native file rename behavior
- Uses standard DOM APIs
- Is more resilient to Obsidian updates
- Follows patterns already established in the codebase

---

## Phased Implementation Plan

### Phase 1: Detection and Read-Only Display

**Goal**: Display the task title instead of filename, without editing support. Add the visual indicator.

**Deliverable**: When viewing a valid task file with feature enabled, the `title` field appears instead of the filename, and a subtle left border indicates it's a task file.

#### Tasks

1. **Add helper function to validate task files**

   Create or update utility function that checks all validity criteria:
   ```typescript
   function isValidTaskFile(file: TFile, app: App, settings: TaskdnSettings): boolean {
     // 1. Check if in tasks directory
     // 2. Check if NOT in ignore list
     // 3. Check if has 'title' field in frontmatter (including empty string)
     // 4. Check if has 'status' field in frontmatter
   }
   ```

2. **Add settings to types.ts**
   ```typescript
   interface TaskdnSettings {
     // ... existing
     useTaskTitleAsInlineTitle: boolean;  // default: false
     syncFilenameWithTaskTitle: boolean;  // default: false
   }
   ```

3. **Add settings UI in settings.ts**
   - "Use task title as inline title" - only show if `app.vault.config?.showInlineTitle` is true
   - "Sync filename with task title" - only show if above setting is ON
   - Include clear descriptions explaining the behavior

4. **Create new file `src/inline-title.ts`**
   - Export function `setupInlineTitleReplacement(plugin: TaskdnPlugin)`
   - Register workspace event listeners (`active-leaf-change`, `layout-change`)
   - Implement `processViewForTaskTitle(view: MarkdownView)`

5. **Implement title replacement logic**
   ```
   For each MarkdownView:
     - Get the file from the view
     - Check if isValidTaskFile()
     - If not valid: ensure no taskdn classes, return (native behavior)
     - If valid:
       - Add class to view container: 'taskdn-task-view'
       - Find .inline-title element
       - Set its textContent to the task's title from frontmatter
       - (Phase 1: leave it non-editable or let native editing happen)
   ```

6. **Add CSS for visual indicator**
   ```css
   /* Subtle left border on task file views */
   .workspace-leaf-content:has(.taskdn-task-view) {
     border-left: 2px solid var(--color-accent);
     /* Or use a very subtle, semi-transparent color */
   }
   ```

7. **Wire up in main.ts**
   - Call `setupInlineTitleReplacement(this)` in `onload()`

8. **Handle metadata changes**
   - Listen to `metadataCache.on('changed')` for task files
   - Update displayed title when frontmatter changes

#### Testing Phase 1

- [ ] Valid task file with feature ON → shows `title` field, has left border accent
- [ ] Valid task file with feature OFF → shows filename (native), no border
- [ ] File missing `title` field → shows filename (native), no border
- [ ] File missing `status` field → shows filename (native), no border
- [ ] File in ignore list → shows filename (native), no border
- [ ] File outside tasks directory → shows filename (native), no border
- [ ] Task with empty `title: ""` → shows empty title area, has border
- [ ] Edit title in Properties panel → inline title updates
- [ ] Multiple tabs with same task → all update correctly
- [ ] Left border is subtle and doesn't clash with themes

---

### Phase 2: Editable Title (Frontmatter Sync)

**Goal**: Allow editing the inline title, with changes updating the frontmatter `title` field.

**Deliverable**: Clicking and editing the title updates frontmatter. Pressing Enter or clicking away saves. Escape cancels.

#### Tasks

1. **Prevent native editing behavior**
   - Replace native `.inline-title` with our own element (or intercept events)
   - Our element should have same attributes: `contenteditable="true"`, etc.

2. **Implement custom contenteditable handling**
   - On focus: Store original value for cancel/comparison
   - On input: Update display (don't save yet)
   - On blur: Save to frontmatter if changed
   - On Enter key: Save and blur
   - On Escape key: Restore original value and blur

3. **Create `updateTaskTitle(file: TFile, newTitle: string)` utility**
   ```typescript
   async function updateTaskTitle(file: TFile, newTitle: string, app: App): Promise<void> {
     await app.fileManager.processFrontMatter(file, (fm) => {
       fm.title = newTitle;
       fm['updated-at'] = new Date().toISOString();
     });
   }
   ```

4. **Handle edge cases**
   - Empty title: Allow it (valid per requirements)
   - Same title as before: Don't trigger unnecessary save
   - File deleted while editing: Handle gracefully (check file exists before save)

5. **Sync with external changes**
   - If title changes in frontmatter while user is NOT focused on inline title, update display
   - If user IS focused/editing, don't interrupt them

#### Testing Phase 2

- [ ] Click inline title → can edit text
- [ ] Edit and click away → frontmatter `title` field updated, `updated-at` updated
- [ ] Edit and press Enter → saves and exits edit mode
- [ ] Edit and press Escape → reverts to original, exits edit mode
- [ ] Edit title in Properties panel while not focused → inline title updates
- [ ] Clear title completely → saves empty string, displays empty
- [ ] Type same title as before → no unnecessary save triggered
- [ ] Delete file while editing → no crash, handles gracefully

---

### Phase 3: Filename Sync Option

**Goal**: Implement the optional "Sync filename with task title" setting.

**Deliverable**: When enabled, editing the inline title also renames the file to match.

#### Tasks

1. **Implement filename sync logic**
   ```typescript
   async function updateTaskTitleAndFilename(
     file: TFile,
     newTitle: string,
     app: App
   ): Promise<void> {
     // 1. Update frontmatter title
     // 2. Generate safe filename from title (kebab-case, sanitize)
     // 3. Rename file using app.fileManager.renameFile()
     // 4. Handle conflicts (file already exists with that name)
   }
   ```

2. **Add filename sanitization utility**
   - Convert title to kebab-case
   - Remove/replace invalid filename characters
   - Handle edge cases (empty, too long, reserved names)

3. **Handle rename conflicts**
   - If target filename exists, append number or show error
   - Consider: Should we warn user before rename?

4. **Update all references (optional/advanced)**
   - Obsidian may handle link updates automatically
   - Verify behavior with wikilinks to renamed file

#### Testing Phase 3

- [ ] Setting OFF: editing title only updates frontmatter
- [ ] Setting ON: editing title updates frontmatter AND renames file
- [ ] Filename is properly sanitized (kebab-case, no special chars)
- [ ] Rename conflict handled gracefully
- [ ] Links to file still work after rename (Obsidian handles this)
- [ ] Empty title with sync ON: doesn't rename to empty filename

---

### Phase 4: Polish and Edge Cases

**Goal**: Handle all edge cases, ensure visual consistency, improve UX.

**Deliverable**: Feature feels native and handles all scenarios gracefully.

#### Tasks

1. **Visual consistency**
   - Verify inline title matches native styling exactly
   - Test with multiple themes (default light, default dark, 2-3 popular community themes)
   - Ensure cursor and selection behavior matches native

2. **Reading mode support**
   - In Reading mode, inline title is shown but not editable
   - Ensure our title replacement works there too (display only)
   - Verify left border indicator appears in Reading mode too

3. **Refine visual indicator**
   - Tune the left border color/opacity for subtlety
   - Test with various themes to ensure it's visible but not distracting
   - Consider using status-based color (optional enhancement)

4. **Handle rapid file switching**
   - Debounce or guard against race conditions
   - Clean up properly when switching files mid-edit
   - Ensure no lingering classes on wrong views

5. **Handle file operations**
   - File renamed externally: Update display
   - File deleted: Clean up gracefully, remove indicator
   - File moved out of tasks directory: Revert to native behavior, remove indicator
   - Frontmatter edited to remove title/status: Revert to native behavior

6. **Performance**
   - Ensure no unnecessary re-renders
   - Profile with many open tabs (10+)
   - Verify metadata cache listener isn't firing excessively

7. **Mobile compatibility** (if applicable)
   - Test on Obsidian mobile
   - Ensure touch interactions work for editing

#### Testing Phase 4

- [ ] Visual comparison with native inline title (screenshot diff)
- [ ] Test with 3+ different themes
- [ ] Rapid file switching while editing doesn't cause issues
- [ ] File deletion while viewing doesn't crash
- [ ] Moving file out of tasks directory reverts behavior immediately
- [ ] Removing `title` field from frontmatter reverts behavior
- [ ] Reading mode displays title correctly (not editable)
- [ ] Performance acceptable with 10+ tabs open
- [ ] Left border looks good across multiple themes

---

## Technical Notes

### Type Extensions

We'll need to extend Obsidian types for the undocumented APIs:

```typescript
// src/obsidian-extensions.d.ts

declare module 'obsidian' {
  interface Vault {
    config?: {
      showInlineTitle?: boolean;
    };
  }
}
```

### File Structure

```
src/
├── main.ts                    # Add setupInlineTitleReplacement call
├── types.ts                   # Add new settings
├── settings.ts                # Add conditional settings UI
├── inline-title.ts            # NEW: All inline title replacement logic
├── obsidian-extensions.d.ts   # NEW: Type extensions for undocumented APIs
└── utils/
    └── task-utils.ts          # Add isValidTaskFile, updateTaskTitle
```

### CSS Structure

```css
/* Visual indicator: subtle left border on task views */
.workspace-leaf-content.taskdn-task-view {
  border-left: 2px solid var(--background-modifier-border);
  /* Or even more subtle: */
  /* border-left: 2px solid rgba(var(--color-accent-rgb), 0.3); */
}

/* Hide native inline title when our replacement is active */
.taskdn-task-view .inline-title {
  display: none;
}

/* Our custom inline title element */
.taskdn-inline-title {
  /* Inherit all styles from native .inline-title */
  /* Use CSS variables for theme compatibility */
  font-size: var(--inline-title-size);
  font-weight: var(--inline-title-weight);
  font-style: var(--inline-title-style);
  font-variant: var(--inline-title-variant);
  font-family: var(--inline-title-font);
  letter-spacing: var(--inline-title-letter-spacing);
  line-height: var(--inline-title-line-height);
  color: var(--inline-title-color);
}
```

---

## References

- [Obsidian Forum: Access inline title element](https://forum.obsidian.md/t/access-inline-title-element-in-plugin-markdown-post-processor/51400)
- [Obsidian Typings](https://github.com/Fevol/obsidian-typings) - Undocumented API types
- [registerDomEvent Documentation](https://docs.obsidian.md/Reference/TypeScript+API/Component/registerDomEvent)
- [Front Matter Title Plugin](https://github.com/snezhig/obsidian-front-matter-title) - Similar concept for explorer/graph
- [Obsidian CSS Variables: Inline Title](https://docs.obsidian.md/Reference/CSS+variables/Editor/Inline+title)

---

## Success Criteria

- [ ] Valid task files show `title` field in inline title area
- [ ] Invalid task files (missing title/status, in ignore list, outside tasks dir) get native behavior
- [ ] Empty title displays as empty and is editable
- [ ] Editing inline title updates frontmatter `title` field
- [ ] Optional: Editing also renames file when "Sync filename" setting is ON
- [ ] Subtle left border indicates "this is a task file"
- [ ] Feature only active when both Obsidian "Show inline title" and plugin setting are ON
- [ ] Works in both Edit and Reading modes
- [ ] Inline title visually indistinguishable from native
- [ ] No performance impact
- [ ] Graceful handling of all edge cases
