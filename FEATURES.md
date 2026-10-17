# Pocket-Canvas — Feature List

Version 1.4.0 · © 2026 project-tech-me

Pocket-Canvas is a desktop and Android app for organising ideas visually. Put notes, pictures, links, to-do lists, tables, sketches, audio, video and files on an endless board, then group, connect and nest them however you think. Start from a template, keep your boards in step across your computers, and save things straight from your web browser.

**New in 1.4:** **Android app** that syncs with your computers · text formatting (font, size, bold, italic, underline, strikethrough, colour) · line styles (no arrows, arrows at both ends, dashed, dotted, thick, straight) and lines that float freely on the board · delete table rows and columns with one click · 51 board-icon colours plus any colour you like · no more gap at the edge of the board.

**New in 1.3:** Recycle bin (restore anything for 30 days) · easier deleting of cards and boards · password-protected, encrypted boards · automatic backups to a folder you choose · spell checking with suggestions.

**New in 1.2:** boards have a fixed top-left corner and grow right and down · 42 board icons (swap in your own pictures any time) · type or pick any colour on Colour cards, and the colour's name fills in automatically.

**New in 1.1:** syncing between computers · board templates (ready-made and your own) · comments · link previews · tables · audio and video cards · freehand sketches · export as PDF or picture · browser extension for Chrome, Edge, Brave, Opera, Vivaldi and Firefox.

---

## Card types

| Card | What it does |
|---|---|
| **Note** | Rich text. A **formatting bar** appears while you type: font, size, **bold**, _italic_, underline, ~~strikethrough~~ and colour, for the words you select (or the whole note when nothing is selected). Ctrl+B / I / U, Ctrl+Shift+X for strikethrough. Quick formatting at the start of a line: `- ` bullets, `1. ` numbered list, `# ` heading, `## ` sub-heading, `> ` quote. Spell-check as you type. |
| **To-do list** | Title plus tick-box tasks and a progress bar. Enter adds the next task; Backspace on an empty task removes it. Ticked tasks are struck through. |
| **Link** | Paste or type a web address. Pocket-Canvas fetches a **preview**: the page's picture, title, description, site name and icon. Click to open the page in your normal web browser. Edit the title or address any time; right-click to refresh the preview or remove its picture. |
| **Image** | PNG, JPG, GIF, WebP, BMP, SVG and AVIF. Add one from a file picker, drag it in from your desktop, or paste it from the clipboard. Optional caption. Double-click to open it in your usual image viewer. An **empty picture card** (from a template) shows *Choose picture*: click it, or drop or paste a picture onto it to fill it. |
| **File** | Attach any file (PDF, Word, spreadsheet, zip…). Shows the file type, name and size, with an **Open** button that uses its normal app. |
| **Audio / video** | MP3, WAV, OGG, M4A, AAC, FLAC, Opus, MP4, M4V, WebM, OGV, MOV and MKV play right on the card with **Play/Pause**, **Stop** (rewinds to the start), a position slider, time and mute. Videos show in the card. Playing one pauses any other, and playback carries on while you work on the board. |
| **Table** | Rows and columns of text with an optional heading row. **Tab** / **Shift+Tab** move between cells and **Enter** moves down; new rows are added as you go. **+ Row** / **+ Column** and **− Row** / **− Column** buttons: the minus buttons delete the row or column of the cell you last clicked (or the last one), and shade it red first so you can see what will go. Right-click a cell to insert or delete rows and columns anywhere. |
| **Sketch** | Freehand drawing. Double-click to draw with 9 pen colours and 4 sizes, an eraser, *Undo line* and *Clear*. Smooth lines, kept as shapes (not pixels), so they stay sharp at any zoom and size. Works with a mouse, touchpad, touch screen or pen. |
| **Board** | A board inside your board, with its own **icon**, colour and card count. Open it to start a fresh canvas inside. Boards can be nested as deep as you like. Right-click › **Change icon…** to choose from 42 icons and 51 background colours (17 colours, each light, middle and deep), type any colour code or pick one, or use your own picture. |
| **Column** | A neat vertical stack of cards. Drag cards in, reorder them inside, or drag them back out onto the board. |
| **Heading** | Large title text for labelling areas of a board. Change its font, size, colour, bold, italic, underline or strikethrough from the formatting bar. |
| **Colour swatch** | Type any colour code (e.g. `#3A7BE0`, with or without the #) or click the colour to pick one. The **name fills in automatically** with the nearest named colour (e.g. *Dodger Blue*); type your own name and it stays. Good for palettes and mood boards. |

## Templates

- Templates always load at the **top-left corner**. On a board that already has cards, they go at the left edge below what's there.
- **Six ready-made templates:** Mood board, Storyboard, Project plan, Mind map, Weekly planner and Brainstorm. Each has a preview in the gallery.
- **New board from a template** (Ctrl+Shift+N), or **insert a template** onto the board you're on (right-click an empty spot, or the *Start from a template* button on an empty board)
- **Save your own:** turn any board, including the boards inside it, into a template (File › Save Board as Template…, or right-click a board card). Give it a name and description; it appears under **My templates**.
- Rename or delete your own templates from the gallery
- Templates sync between your computers along with your boards

## Deleting and the Recycle bin

- **Delete cards** with the bin button on any selected card, the bin button in the top bar, the **Delete** key, right-click › **Move to Recycle bin**, or **Edit › Move to Recycle Bin**
- **Delete boards** from the board card, from the sidebar (right-click a board), or from inside the board (right-click an empty spot › **Delete this board**). Everything inside goes with it. Home can't be deleted.
- Everything deleted goes to the **Recycle bin** (sidebar bin button, which shows a count, or **Edit › Recycle Bin…**)
- **Restore** puts cards back where they were, including the lines between them and their place in a column; boards come back with everything inside
- Items are **removed for good after 30 days**. You can also delete single items or **Empty Recycle bin**.
- A toast with **Undo** appears after every delete
- The Recycle bin syncs between your computers

## Password-protected boards

- Right-click a board › **Lock with a password…**, set a password (at least 6 characters) and an optional hint
- The board's contents, including every board inside it, are **encrypted** (AES-256 with a PBKDF2-derived key). In the saved file, sync folder, backups and exports, they can't be read without the password.
- Opening a locked board asks for the password; boards inside it then open without asking again
- It **locks again when you leave it**, when you click **Unlocked · Lock now** in the top bar, and whenever the app starts
- **Change password…** and **Remove password…** while it's open
- A padlock shows on the board's card and in the sidebar
- Cards deleted from a locked board stay encrypted in the Recycle bin
- The board's name, colour and icon stay visible; pictures and files on it are stored like any others
- If the password is forgotten, the board can't be opened. There is no back door.

## Comments

- Add comments to any card: right-click › **Add comment**, or Ctrl+Shift+M
- Comments show your name and when they were written; the card shows a count badge
- **Resolve** (and reopen), **edit** or **delete** comments; show or hide resolved ones
- Comments are included in search
- Your name for comments is set in Settings

## Adding things to a board

- Drag a tool from the left-hand toolbar onto the exact spot you want, or click it to drop the card in the middle of the screen
- Double-click an empty spot to start a new note there
- Right-click an empty spot to add a note, to-do, heading, board, column, table or sketch there, or to insert a template
- Quick keys: **N** note · **T** to-do · **H** heading · **B** board · **C** column · **K** link · **G** table (grid) · **S** sketch · **L** line
- **Drag in** audio and video files and they become playable cards
- **Paste** an image to make an image card, a web address to make a link card, or text to make a note
- **Drag in** files, images or web links from your desktop or browser. Several at once is fine.

## Arranging cards

- Drag cards anywhere to the right of and below the board's top-left corner. The board never runs out of space in those directions.
- Resize notes, to-dos, links, pictures, files, headings, columns, tables, sketches and audio/video cards from the bottom-right corner
- Select several cards by dragging a box around them, or Shift/Ctrl-click to add or remove one
- Nudge selected cards with the arrow keys (hold Shift for bigger steps)
- Bring to front or send to back
- Duplicate (Ctrl+D), copy, cut and paste cards, including between boards. Columns keep their contents and boards keep everything inside them.
- Colour labels: right-click any card and pick one of 11 colours, or none

## Boards inside boards

- Drop a card onto a **board card** to move it inside that board
- Or drop it onto a board in the **sidebar** or the **breadcrumb path** at the top. That works for any board, not just the ones on screen.
- Right-click → **Move to board…** picks any board from a list
- The app stops you from putting a board inside itself
- The **sidebar** shows every board as a tree you can fold and unfold
- The **breadcrumb path** shows where you are and takes you back up with one click
- Rename a board by clicking its name in the top bar or on its card
- **Right-click a board in the sidebar** to open, rename, change its icon, lock it with a password, or move it to the Recycle bin
- Deleted boards, with everything inside, can be restored from the Recycle bin for 30 days

## Text formatting

- A small **formatting bar** appears above a card while you type in it
- **Font:** Default, Sans serif, Serif, Monospace, Handwriting, Rounded or Poster
- **Size:** 10 to 64 point, **bold**, _italic_, underline, ~~strikethrough~~, 16 text colours, and **Clear formatting**
- In **notes** it changes the words you select (or the whole note if nothing is selected)
- In **headings, to-do lists, tables, columns and other cards** it changes all the card's text at once
- Keyboard: Ctrl+B / Ctrl+I / Ctrl+U, Ctrl+Shift+X for strikethrough

## Lines and arrows

- Draw lines with the **Line** tool: click (or tap) where it starts and where it ends, or press and drag
- Each end can be **attached to a card** or **free on the board**, so lines and arrows can be used on their own as pointers, dividers or underlines
- Attached ends follow their card as it moves. Select a line to see a handle on each end: drag a handle onto a card to attach it, or anywhere else to free it. Drag a free line to move it.
- **Arrows:** none, at the end, at the start, or at both ends
- **Style:** solid, dashed or dotted; thin, medium or thick; curved or straight; any of 11 colours
- A **line style bar** appears while drawing or with a line selected; the style you pick is used for the next new line too
- Right-click a line for the same options, plus **Reverse direction**, **Detach from cards** and **Delete**

## Moving around

- Every board has a fixed **top-left corner**, flush with the edge of the window, and carries on as far as you like to the **right and down**. Cards can't be dragged or pasted past the corner.

- Scroll to move, or hold **Space** and drag, or drag with the middle mouse button
- Zoom with Ctrl + scroll (towards the mouse pointer), Ctrl + = / −, or the zoom buttons. Zoom range is 10%–300%.
- **Fit to content** (Ctrl+1) shows the whole board at once, starting from the top-left corner
- Each board remembers where you were and how far you'd zoomed
- Alt + ← goes up to the parent board
- **Touch screens:** drag one finger on an empty part of the board to move around, pinch with two fingers to zoom, and press and hold for the right-click menu

## Search

- Ctrl+F searches every board at once: notes, to-dos, links (including their descriptions), headings, captions, tables, file and media names, swatches, board names and comments
- Results show the matching text highlighted and which board it's on
- Click a result to jump to that board, centred on the card, with a highlight flash

## Spelling

- Spelling is checked as you type in notes, headings, to-dos, tables, captions and comments, with red underlines
- **Right-click** a misspelt word for suggestions, **Add to dictionary**, and Cut/Copy/Paste
- English (UK) by default; choose another language, plus an optional second one, in **Settings › Spelling** (macOS uses your system's languages)
- See and remove the words you've added to your dictionary
- Turn it off in Settings

## Undo and safety

- Undo and redo for everything, including moves, edits, colours, deletes and lines. Up to 80 steps. (Undo history is cleared when a password-protected board is opened or locked.)
- Saves automatically a moment after every change, with a **Saving… / Saved** indicator
- Keeps a backup copy of the previous save. If the main save file is ever damaged, the app loads the backup instead.
- Everything stays on your computer. No account, no internet needed.

## Syncing between computers

- Keep your boards the same on all your computers **and Android devices** through a folder your sync service already keeps up to date: **Dropbox, OneDrive, Google Drive, iCloud Drive, Nextcloud, Syncthing** or similar (a self-hosted Nextcloud or Syncthing works too)
- Set up once per computer in **Settings › Sync**: choose the same folder on each
- **Nothing is overwritten:** each computer writes only its own file, and Pocket-Canvas merges changes card by card. Different cards changed on different computers are all kept; for the same card, the most recent change wins.
- Deletions sync too, but a card that was edited on another computer *after* it was deleted is kept, so nothing is silently lost
- If two computers each started with their own Home board, their contents are combined into one Home
- Pictures, files, audio and video sync as well
- Works offline: changes made while the sync folder is unavailable are shared when it comes back
- The top bar shows **Synced**, a brief **Updated** when changes arrive, or **Sync problem** with the reason. Settings shows every computer and when it last changed something.
- Scroll position, zoom, theme and settings stay separate on each computer
- **On Android**, use a sync app that keeps a real folder on the phone, such as **Syncthing**, and type that folder's location in Settings › Sync (Android asks once to allow access to files)

## Browser extension (web clipper)

- **One extension** for **Chrome, Microsoft Edge, Brave, Opera, Vivaldi and Firefox**, ready for each browser's add-on store or to load directly without a store
- **Toolbar button:** save the current page (with its preview), the selected text, or a **screenshot** of the visible page. Choose the board and add a note (saved as a comment).
- **Right-click** to save a page, link, picture, video, audio or selected text
- Saved items land in a **From the web** column on the chosen board. Selected text keeps a link back to its page.
- Videos and sounds are downloaded into playable cards (up to 500 MB); if a site doesn't allow that, a link is saved instead
- **Private and safe:** talks only to the Pocket-Canvas app on your own computer, never to the internet. Each browser must be approved once in the app, websites can't use the connection, and you can disconnect browsers any time in Settings.
- `npm run extension` builds the store-ready zip

## Automatic backups

- Pocket-Canvas **backs up all your boards automatically**, by default every day to *Documents › Pocket-Canvas Backups*
- **Choose a different folder** in **Settings › Backups**: another drive, a USB stick or a cloud folder
- How often: every hour, every day, every week, or only when you click **Back up now** (also **File › Back Up Now**)
- Keeps the 30 most recent backups (you choose how many)
- **Restore** any backup from the list; a backup of your current boards is made first, so you can always go back
- Pictures and files are stored once in the backup folder and shared between backups, so backups stay small
- Locked boards stay encrypted in backups

## Export, backup and import

- **Export a board as a picture (PNG) or PDF** (Ctrl+Shift+E): the whole board on one page, at full size, however big. PNG in standard or high quality, on the board colour, white or a transparent background. PDF keeps text sharp at any zoom.
- **Export a board as Markdown**, including every board inside it, for use in other note apps or documents. Tables export as real Markdown tables.
- **Full backup** of all boards to a single file, and **Import backup** to restore it (locked boards stay encrypted)
- **File → Open Data Folder** goes straight to where your boards, images and files are kept
- Copying cards also copies them as plain text, so you can paste them into email, Word and so on
- Boards from the earlier **PocketCanvas** version are imported automatically the first time you start Pocket-Canvas

## Look and feel

- Light and dark themes. Follows your computer's setting until you choose one (Ctrl+Shift+L).
- Clean dotted-grid canvas
- Hide the sidebar for more room (Ctrl+\)
- Welcome board on first launch, with tips to get started
- Keyboard shortcuts list built in (**?** button at the bottom of the sidebar, or F1)
- **Settings** (Ctrl+, or the ⚙ button): your name for comments, this computer's name, link previews on/off, spelling, backups, sync and the browser extension
- Your Pocket-Canvas logo on the window, taskbar, installer, sidebar and About box
- **Board icons** in the sidebar and on board cards. The icon pictures are separate files in `src/board-icons/`, ready to replace with your own designs.

## Security and privacy

- Web links always open in your own web browser, never inside the app
- Pasted note text is cleaned of any hidden code
- The app's interface runs locked down, with no direct access to your computer beyond the save and file actions it needs
- Link previews can be turned off if you'd rather the app never contacts websites
- The browser-extension connection listens only on your own computer (127.0.0.1) and needs a secret key that's handed out only when you click **Allow**

## Platforms and installing

- **Windows:** installer (.exe). You choose the install folder, and it adds desktop and Start menu shortcuts.
- **Linux:** AppImage (runs without installing) and .deb package (Ubuntu, Debian, Mint…)
- **macOS:** .dmg
- **Android:** an .apk to install on phones and tablets (Android 7 or newer), with the same boards, cards, templates, comments, Recycle bin, password-protected boards and sync. On Android: a ⋮ menu takes the place of the menu bar, Back closes windows and steps out of boards, and boards are shared as Markdown through the share sheet. Export as picture or PDF, folder backups, the browser extension and spelling settings are desktop-only.
- A ready-made GitHub Actions workflow runs all the automated tests, then builds all three installers, the Android app and the browser-extension zip

---

## Ideas for later

Things that could come next:

- Sharing a board with other people and editing it together at the same time
- Syncing through a self-hosted server, as an alternative to a sync folder
- Exporting a board as a multi-page PDF (for example A4 pages) as well as one big page
- Pressure-sensitive pen strokes and shapes (rectangles, arrows) in sketches
- Embedding YouTube and other online videos (today they're saved as link cards with a preview)
- A tested Safari version of the browser extension
- Phone and tablet apps
