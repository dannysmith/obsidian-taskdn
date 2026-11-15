Work through these in order and report each by its ID (e.g. "B2: the line didn't strike through"). Tick the box when a test passes. Tests change the task files, so run `bun run test-vault` afterwards to reset everything.

Unless a test says otherwise, use the [[Widgets]] note.

## A. Live Preview: clicking

- [ ] **A1. Tick a task.** In Widgets, tick the checkbox next to "Reply to the plumber" (first bullet).
  - The checkbox ticks, the title and the rest of the line get a strikethrough, the widget fades, and the blue left border disappears.
  - "Reply to the plumber" also appears in the numbered list further down. That one ticks too.
  - Open `tasks/inbox-task.md`: `status` is `done`, and `completed-at` and `updated-at` are today's date.
- [ ] **A2. Untick it.** Back in Widgets, untick "Reply to the plumber".
  - The strikethrough and fading go. There's still no blue border, because unticking sets the status to `ready`, not back to `inbox`.
  - In `tasks/inbox-task.md`, `status` is `ready` and `completed-at` has gone.
- [ ] **A3. Inline widget.** In the "Inline in prose" paragraph, tick the "Buy groceries" pill.
  - Only the pill's title gets a strikethrough. The rest of the sentence doesn't.
  - The "Buy groceries" bullets at the top and in "Nested" also tick.
- [ ] **A4. Open links.** Click the title "Learn the cello".
  - `tasks/icebox-task.md` opens in the same tab. Go back.
  - Click the purple "website-redesign" next to "Draft homepage copy". `projects/website-redesign.md` opens. Go back.

## B. Reading mode

Switch Widgets to Reading mode: click the book icon at the top right of the note, or press Cmd+E.

- [ ] **B1. Looks right.** The widgets look the same as in Live Preview. The bullet-list ones line up with "A native unchecked task" under "Native checklist for comparison".
- [ ] **B2. Tick a task.** Tick "Renew passport" (red border).
  - Report what you see straight away, and again after a second or so.
  - Expected: the checkbox ticks, the title and the whole line get a strikethrough, and the red border goes.
  - The "Renew passport" under "Nested" ticks as well.
- [ ] **B3. Untick it.** Everything from B2 reverses. The border doesn't come back, because the status is now `ready`.
- [ ] **B4. Inline widget.** Tick the "File the tax return" pill in the "Inline in prose" paragraph (it's ticked already, so this unticks it). Only the pill changes, not the sentence around it.
- [ ] **B5. Ignored and non-task links.** Under "Not tasks" and "Ignored tasks", every link is a normal link, not a widget.

Switch back to Live Preview (Cmd+E) before continuing.

## C. Settings

Open Settings, then Taskdn in the sidebar (under Community plugins).

- [ ] **C1. All settings show.** Six settings: Tasks directory, Default status for new tasks, Show desktop app button, Ignored files, Use task title as inline title, and Sync filename with task title.
- [ ] **C2. Dependent setting.** Turn off "Use task title as inline title". "Sync filename with task title" disappears straight away. Turn it back on and it reappears.
- [ ] **C3. Settings search.** Click any other tab in the settings sidebar, then type "inline title" in the search box at the top of the sidebar. Taskdn's setting appears in the results.
- [ ] **C4. Desktop button.** Back in Taskdn's settings, turn on "Show desktop app button". With the settings window still open, look at Widgets behind it (or close settings): every widget now has a small ↗ at its right-hand end. Check Reading mode as well. Leave it on for section D.
- [ ] **C5. Ignored files.** In "Ignored files", add a new line `inbox-task`. Within a second, "Reply to the plumber" in Widgets turns into a plain link. Delete the line and it becomes a widget again.
- [ ] **C6. Tasks directory.** Click into "Tasks directory". It suggests vault folders as you type. Choose `projects`: the task widgets in Widgets turn back into links, and the "website-redesign" link becomes a widget. Set it back to `tasks`.
- [ ] **C7. Default status.** Set "Default status for new tasks" to Ready. Section E uses this.

## D. Popout window

A popout is a note in its own separate window.

- [ ] **D1. Open a popout.** Right-click the "Widgets" tab at the top of the editor and choose **Move to new window**. Widgets opens in a new window and the widgets look normal there.
- [ ] **D2. Tick in the popout.** In the popout, tick and untick "Learn the cello". It behaves like A1 and A2.
- [ ] **D3. Desktop button and menu.** In the popout, hover over a ↗ and click it. Then right-click a widget's title.
  - The ↗ click and the menu item "Open in taskdn desktop app" both try to open the Taskdn desktop app. If you don't have it installed, just report whether anything happens.
  - The right-click menu shows only that one item.
- [ ] **D4. Updates reach the popout.** In the main window, open `tasks/icebox-task.md` and change `status` from `icebox` to `blocked` in its properties. In the popout, "Learn the cello" gets a red border within a second.

Close the popout window before continuing.

## E. Editing features

- [ ] **E1. Enter after a task.** In Widgets, click just to the right of the "Buy groceries" widget in the top list so the cursor is at the end of that line, then press Enter. The new line starts with an empty checkbox (`- [ ] `) rather than a plain bullet. Undo with Cmd+Z.
- [ ] **E2. Convert a checklist item.** Open [[Checklist conversion]]. Right-click "Call the bank about the mortgage" and choose **Convert to task**.
  - The line becomes a widget.
  - A new file `tasks/Call-the-bank-about-the-mortgage.md` exists with `status: ready` (from C7).
- [ ] **E3. Convert a done item.** Put the cursor on "Already done item", open the command palette (Cmd+P) and run **Taskdn: Convert checklist item to task**. The new task has `status: done` and a `completed-at` date.
- [ ] **E4. Quotes and colons.** Convert the "Item with "quotes" and a colon: in it" line. The new task's title shows exactly that text.

## F. Inline title

"Use task title as inline title" should be on (it is by default in this vault).

- [ ] **F1. Shows the task title.** Open `tasks/inbox-task.md`. The big title at the top reads "Reply to the plumber", not "inbox-task". If its status is still `inbox`, there's a blue line down the left edge of the note.
- [ ] **F2. Edit the title.** Click that title, change it to "Reply to the plumber today" and press Enter.
  - The `title` property updates and `updated-at` is today.
  - The filename stays `inbox-task.md`.
- [ ] **F3. Escape cancels.** Click the title, type something, press Escape. It goes back to how it was and nothing is saved.
- [ ] **F4. Sync filename.** Turn on "Sync filename with task title" in settings, then edit the title again to "Reply to the plumber". The file is renamed to `reply-to-the-plumber.md`, and its widget in Widgets still works.
- [ ] **F5. Normal notes are untouched.** Open [[Checklist conversion]], click its title, rename it to "Checklist conversion 2" and press Enter. The note is renamed as usual. Rename it back the same way.
- [ ] **F6. Turning it off.** Open a task file, then turn off "Use task title as inline title" in settings. The title switches to the filename straight away.
