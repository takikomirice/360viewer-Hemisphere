# 360° Viewer - Hemisphere

An embeddable 360° panorama viewer for Google Sites — a self-hosted Thinglink alternative built with GAS + Pannellum.
Teachers can add hotspot markers (with labels, descriptions, links, and photos) to 360° images or 2D flat maps, and students can view them interactively. Supports a **Quiz mode (flip card)** for inquiry-based learning.
Runs as a **container-bound** Google Apps Script (bound to a Google Spreadsheet).

> **Language note:** The UI (buttons, menus, dialogs) is currently in Japanese.
> If you'd like to use this in another language, you are welcome to translate the text in `index.html` and `Code.js` yourself. Contributions are also welcome!

---

## Table of Contents

- [Setup](#setup)
- [Usage](#usage)
- [Bulk Input Sheet Integration](#bulk-input-sheet-integration)
- [Tech Stack](#tech-stack)
- [File Structure](#file-structure)
- [Releases](#releases)
- [Licenses](#licenses)
- [Spreadsheet Sheet Structure](#spreadsheet-sheet-structure)
- [Troubleshooting](#troubleshooting)

---

## Setup

### ① Prepare a 360° image on Google Drive

1. Upload an equirectangular 360° image to Google Drive
   (Or upload directly from the viewer's edit mode using the photo upload feature)
2. Right-click the file (or folder) → **"Share"** → set to **"Anyone with the link"** as **"Viewer"**
3. Copy the link
   - **Single image**: share link to the file
   - **Multiple images**: share link to the folder (lists all images in the folder)
   - **If using photo upload**: set `IMAGE_DRIVE_URL` in config to a **folder** URL (not a file URL)

---

### ② Create a Google Spreadsheet

1. Create a new spreadsheet at [Google Sheets](https://sheets.google.com)

---

### ③ Add Apps Script to the Spreadsheet

1. In the spreadsheet menu, click **"Extensions"** → **"Apps Script"**
2. From the left panel, click **"+ New file"** and create these 5 files: `Code.js`, `index.html`, `styles.html`, `app.html`, `appsscript.json`
3. Paste each repository file into its matching Apps Script file. Because this is a multi-file project, using [clasp](#local-development-clasp) below is normally recommended
   - **Note**: The audio editor UI is integrated into `index.html`, its CSS into `styles.html`, and the pinned vendor code, audio editor, and 360Viewer client into `app.html` in dependency order. All three HTML files are required
4. (Optional) For bulk input sheet integration, run **"設定"** → **"一括入力用スプシを作成"** in the spreadsheet menu. This creates and links the official input sheet.

---

### ④ Generate the initial config sheet and set the image URL

1. In the spreadsheet, run **"設定"** → **"初期設定・更新"**
2. In the **"config"** sheet, enter the Google Drive URL you copied in step ① into **cell B2**
3. The setup also creates or repairs `config`, `info`, and `scenes`, and generates `EDIT_KEY` only when it is missing.

---

### ⑤ Deploy as a Web App

1. In the Apps Script editor, click **"Deploy"** → **"New deployment"**
2. Settings:
   - **Type**: Web app
   - **Execute as**: Me (requires spreadsheet access)
   - **Who has access**: Choose based on your audience
     - Internal only: `Anyone in your organization`
     - Public: `Anyone`
3. Click **"Deploy"** → copy the **Web app URL**
4. Paste the deployed HTTPS `/exec` URL directly into `WEB_APP_URL` on the `config` sheet.

Run **"設定"** → **"編集用URLを生成・更新"** to generate the edit URL in the config `EDIT_URL` cell. Setup does not generate it, and there is no Apps Script service-URL fallback. Direct edits to `WEB_APP_URL` or `EDIT_KEY` clear a stale `EDIT_URL`; run the menu command again afterward.

---

### ⑥ Embed in Google Sites

#### Method A (URL embed)

1. Open your Google Sites page in edit mode
2. In the right panel, click **"Embed"** → **"Embed URL"** and paste the deployed URL
3. Click **"Insert"** → resize and save

#### Method B (iframe embed)

1. Open the viewer and click the **"Embed code"** button in the top right
2. Copy the generated iframe code (internal or external version)
3. In Google Sites, click **"Embed"** → **"Embed HTML"** and paste the code

---

## Usage

### Scene thumbnails and sidebar width

The scene list uses photo cards with centered white names on a translucent bottom band. On desktop, drag its right edge or focus the divider and use the arrow keys to resize it (140–480px, default 160px); the width is saved in this browser. Mobile retains the bottom scene list and uses two columns when the viewing sheet is expanded.

After the panorama is ready, at most two thumbnail requests run in the background. Opening the editing URL saves missing thumbnails in the existing `Hemisphere Hotspot/thumbnail` folder; viewing URLs only read images. Source IDs and content checksums prevent duplicate generation. Sharing permissions remain unchanged.

In fast quality mode, hovering or focusing a scene prefetches one image and, in viewing mode, its hotspots. Cached revisits avoid the direct-image fallback wait. Data saver, 2G, original quality, and forced direct delivery disable intent prefetch. Multiresolution tile delivery remains experimental and still requires a delivery destination; see the [integration notes](docs/scene-sidebar-integration.md).

### View Mode (for students)

- Drag to navigate the 360° view (2D flat maps support scroll and zoom)
- Click a marker to see its label, description, link, photo, audio, etc. (markers with the "Quiz" icon open a flip card)
- If multiple images exist, use the scene list on the top-left to navigate between panoramas / 2D maps
- If a hotspot has a "Jump to" target, clicking it jumps to another scene
- **Buttons (top right of the image)**:
  - **Fullscreen**: Enter fullscreen mode
  - **Home**: Jump to the scene marked as home in `scenes` (folder mode only)
  - **Quality toggle**: Switch between low-load (fast) ↔ high quality (high)
  - **Gyro** (mobile only): Tilt your device to control the view
- **Embed code**: Click the "Embed code" button to generate and copy an iframe code for Google Sites or other sites (internal and external versions available)
- **URL parameters**: `?mode=internal` / `?mode=public` hides the top bar (for embeds); `?quality=high` / `?quality=fast` sets the initial quality

### Edit Mode (for teachers)

1. Click the **"Edit Mode"** button in the top right
2. The screen switches to a yellow-highlighted frame
3. Click the location where you want to add a hotspot
4. Fill in the fields and click **"Save"**:
   - **Label** (required for ordinary markers; in jump mode the label field is hidden and disabled, new jumps stay blank, and an existing saved label is preserved)
   - **Description**
   - **Link**: External URL (https://...)
   - **Marker style**: three shapes, twelve colors, and thirteen icons (info/photo/**audio**/link/Wi-Fi/**quiz**/eye/warning/flag/animal/leaf/flower/historic)
   - **Photo** (folder mode only): Attach an image from the same folder to display in the hotspot popup
   - **Audio** (optional, one item maximum): Select, trim, adjust, and encode audio to MP3 in the browser, then attach it to the hotspot
   - **Jump to scene** (folder mode only, required): Navigate to another scene on click. View mode shows the latest destination scene name, falling back to the saved label and then the ID only when the target is missing
5. Existing hotspots: **right-click** for the "Edit" / "Move" / "Delete" menu
6. **In folder mode**: right-click an image in the scene list → "Change settings" (saves name, type, and north correction together), "Set as home", "Show properties", or "Delete photo". Renaming preserves the original image extension. Because 360 and 2D coordinates have different meanings, a scene with saved hotspots cannot switch between those types until its hotspots are deleted
7. **Upload photo**: Use the **"⬆ Upload photo"** button in the scene list to upload a 360° panorama or 2D flat map directly to Google Drive (requires a folder URL in config)
8. **Refresh scene list**: In folder mode, click the **refresh button (↻)** at the left of the scene list to reload the image list
9. **Bulk input sheet integration** (folder mode): Use "Update bulk input sheet list" and "Import from bulk input sheet" to register hotspots in bulk (see [details](#bulk-input-sheet-integration))

Supported image extensions (jpg/jpeg/png/gif/webp) are hidden in the scene list, settings dialog, photo and jump selectors, and jump tooltips. The formal Drive name and the `scenes` value keep their extension, and "Show properties" displays that formal name.

A Drive name beginning with `=` is stored in `scenes` as literal display-name text, never as a spreadsheet formula.

Marker value catalogs:

- Shape IDs: circle / square / diamond (legacy `star` values are read as `circle`)
- Color IDs: blue / cyan / teal / green / lime / yellow / orange / red / pink / purple / gray / white
- Icon IDs (new selections): info / photo / audio / link / wifi / quiz / eye / warning / flag / animal / leaf / flower / historic

Legacy `star` data falls back only while reading and restoring the editor. Loading does not rewrite the sheet automatically or replace localStorage values. Saving an edited legacy marker may store `circle`. Legacy `video` values are hidden from new selections, but existing markers keep their original value and SVG while viewing, editing, and saving. `audio` is available as a normal new selection, but audio attachments remain independent and never overwrite the icon selected by the user. The `video` and `audio` icons do not add media behavior by themselves; `quiz` remains the only icon with special flip-card behavior.

Starting "Move" dims the original marker and shows a matching preview marker that follows the pointer or touch position. A simple click or short tap commits the move: 360 scenes convert it to yaw/pitch, while 2D scenes convert it to percentages within the displayed image. Panorama drags, points outside a 2D image, Escape, scene changes, and leaving edit mode do not commit. The real marker changes only after the save succeeds. While a hotspot create, update, or delete request is pending, settings for that scene wait; the server also rejects coordinates if the scene type changed after capture. After a move save request is submitted, scene switching and edit/delete/move actions that could conflict wait for the response so the sheet and the visible marker cannot overwrite each other.

### Hotspot Audio

- Each hotspot has zero or one audio attachment. Selecting a new source replaces rather than appends; audio may coexist with photos, descriptions, and links, but jump hotspots cannot carry audio
- Inputs may be M4A, MP3, or WAV. Five minutes / 50 MB or less is recommended; files over ten minutes or 200 MB and audio with three or more channels are rejected
- The trim range is 0.5–120 seconds (up to 30 seconds initially). Gain may be AUTO with a -20 / -18 / -16 dBFS target, or manual within ±6 dB
- Output is `audio/mpeg`, 48 kHz, 192 kbps CBR. An encoded MP3 over 4 MiB cannot be attached
- Loading, waveform display, preview, editing, and MP3 encoding happen only in the browser. The result panel's Attach button returns the MP3 to the hotspot form, where it remains client-only until Save. Hemisphere does not show an MP3 download action
- Closing the editor with its top-right button or Escape discards only the unconfirmed editor result and preserves an attachment already pending in the form. Existing audio can be kept, replaced, or removed explicitly. Recoverable save failures preserve form and pending attachment state
- The form labels saved media as “Attached audio” and pending media as “Audio to attach.” Internal Drive names containing timestamps or UUIDs are never shown in the public popup or editor form
- The public popup renders a `preload="none"` player and “Preparing audio…” immediately, then lazily requests an association-validated Base64 Data URI through GAS. Playback never starts automatically
- On PCs, a short sustained hover or keyboard focus starts prefetching. Requests for the same identity share one in-flight operation and a small bounded cache. Scene changes stop playback, close the popup, clear the cache, and invalidate stale responses
- Audio is stored in `Hemisphere Hotspot/audio`. Replacement, removal, and hotspot deletion clean up only unreferenced files inside that authoritative folder
- Large or long sources are constrained by device memory, GAS request/execution limits, and Drive capacity. Trim more aggressively or convert to a smaller source before retrying
- Mediabunny and `@mediabunny/mp3-encoder` are pinned to 1.50.8. See [Third-party software](#third-party-software) for licenses

### Hotspot Attachment Folder

The edit-mode “Hotspot folder” button opens the following authoritative root beside the container spreadsheet. Attachment folders are kept outside `IMAGE_DRIVE_URL` and excluded from scene listing, public subfolder traversal, scene registration, and scene deletion.

```text
Hemisphere Hotspot
├── photos
└── audio
```

Setup/update, the first photo or audio save, and opening the folder all use the same structure manager. When authoritative legacy photo or audio folder IDs exist, the folders themselves are moved and renamed, preserving child-folder IDs, file IDs, and all photo/audio IDs in `info`. A failed transaction restores prior names and parents and trashes only newly created empty folders where possible. If full rollback fails, processing stops with an administrator-review structure error. Same-name folders are never adopted or merged by name alone.

### Quiz Mode (Flip Card)

Setting a marker's icon to **"Quiz"** makes it open a flip card instead of a standard popup.
Great for inquiry-based or fieldwork learning where students interact with "question → answer" pairs.

**How to set up:**

1. Add or edit a hotspot in edit mode
2. In the "Marker style" panel, set **Icon = Quiz**
3. In **Description**, enter `question text|answer text` (pipe-separated)
   - Example: `What year was this bridge built?|1954`
   - If `|` and answer are omitted, the card shows "No answer set"
4. (Optional) Set a **Link** URL to show a "Learn more" link on the answer side

**Student interaction:**

- Click the marker → the question card opens
- Click the card → it flips to reveal the answer (click again to flip back)
- Close with the `×` button or by clicking the dimmed area outside the card

---

### 2D Flat Maps

- The `2D` / `360` type in `scenes` is the authoritative display setting.
- Only an unregistered Drive image uses `[2D]` in its filename during first sync. Adding or removing the tag later does not change its stored type, and existing tags are not removed.
- Selecting "2D flat map" during upload writes `2D` directly to `scenes`; it no longer adds a `[2D]` filename prefix.
- Hotspots (labels, descriptions, links, jump targets, etc.) work the same way in 2D mode

### Home Scene

- The home flag in `scenes` is authoritative and is normalized to at most one root-folder image.
- Only an unregistered image uses `[HOME]` as a first-sync migration candidate. Renaming an already registered file does not change its home flag or remove the tag.
- Selection priority is an existing valid home, the first newly registered `[HOME]` image, then the first image by scene order.

### Subfolders in Folder Mode

- If a folder URL is set in config, images in subfolders are also displayed hierarchically
- Click a folder to verify it belongs under the configured root by walking only toward its parents, then sync and show only that folder's direct children; use "← Back" to return. Startup never recursively scans every subfolder.

### Drive / scenes Sync, Cache, and Partial Success

- The root is synced on initial display and scene-list refresh, a subfolder when opened, and an upload target after Drive creation. Joined Drive + `scenes` results are cached briefly.
- Upload, integrated settings changes, explicit delete, automatic registration, home normalization, and lazy northOffset storage invalidate the affected folder cache.
- A file missing from a Drive listing is never enough to delete its `scenes` row or `info` hotspots. Those rows are removed only after an explicit edit-mode delete successfully trashes the Drive file.
- If Drive upload succeeds but `scenes` registration fails, the Drive file is retained and the UI reports partial success; a later folder sync can register it.
- Rename updates Drive before `scenes`. A post-Drive failure is reported and a later sync repairs the display name using the Drive update timestamp.
- If cleanup after a successful explicit Drive delete fails, the UI reports which downstream data may remain.
- If only cache invalidation fails after Drive and sheet updates, the completed stages remain successful and the UI reports partial success.
- When a Drive file moves between folders, sync updates the parent ID on the same `scenes` row and invalidates both the previous and current parent caches without duplicates. Cache-only failures keep the completed sheet update and return a warning with the affected folder IDs in logs.
- Scene properties require a valid edit token on the server because the API returns Drive URLs and media metadata. Direct calls from normal, public, or internal views are rejected.

---

## Bulk Input Sheet Integration

This feature lets you enter hotspot data in a spreadsheet and import it all at once from edit mode.

### Setup

1. Prepare a bulk input spreadsheet
   - **Create from menu**: Run **"設定"** → **"一括入力用スプシを作成"**. A sheet is created beside the container only when no official ID exists; headers, widths, and dropdown validation are prepared automatically when possible.
   - ScriptProperties `STUDENT_SHEET_ID` is the sole authoritative link. A valid existing ID is verified and reused rather than replaced by another new sheet.
   - Config `STUDENT_SHEET_URL` is display-only. Editing it never changes the link; create, update, and import repair it from the spreadsheet opened with the official property ID.
2. Set up the following column structure in the bulk input sheet (row 1 = header):

| Column | Content |
| ------ | ------- |
| A | No. (row number, optional) |
| B | Target scene (image name) |
| C | Label |
| D | Description |
| E | Link URL |
| F | Photo (image name in the same folder) |
| G | Jump to (image name) |
| H | Status ("Done" when imported) |

### Operations in Edit Mode

- **Update bulk input sheet list**: Run from the viewer's edit mode sidebar. Sets dropdown validation for columns B, F, and G based on the folder's image names. (Can also be run from **"設定"** → **"一括入力用スプシを更新"**.)
- **Import from bulk input sheet**: Imports only rows whose target, photo, and jump names resolve to exactly one configured image, then marks those rows as "Done". Ordinary markers require a label; jump rows preserve a blank label. Missing or duplicate-name references and blank-label ordinary rows remain pending.

### Settings Menu (Bulk Input)

| Menu item | Description |
| --------- | ----------- |
| 一括入力用スプシを作成 | Creates only when the official ID is missing; otherwise verifies the existing sheet |
| 一括入力用スプシを更新 | Repairs the official URL, blank headers, and dropdowns for columns B, F, and G |
| 一括入力データを取り込む | Imports pending rows from the official sheet and toasts imported/skipped counts |

> Only available in folder mode with `IMAGE_DRIVE_URL` set to a folder URL.
> Pitch/Yaw are set to 0 on import — adjust hotspot positions manually in edit mode as needed.

---

## Tech Stack

- **Pannellum** 2.5.6 — 360° panorama viewer (CDN: jsDelivr)
- **Google Apps Script (GAS)** — backend & data storage (V8 runtime)
- **Google Sheets** — stores config and hotspot data
- **Google Drive** — stores 360° images and photos (accessed via DriveApp & Drive API v3)
- **Mediabunny / @mediabunny/mp3-encoder** 1.50.8 — in-browser audio decoding and MP3 encoding, bundled as pinned GAS HTML

---

## File Structure

```text
360viewer/
├── Code.js             ← GAS backend (server-side)
├── index.html          ← Main HTML shell, includes styles and app
├── styles.html         ← CSS loaded from index.html
├── app.html            ← Pinned audio vendors, audio editor, and viewer JavaScript
├── vendor/             ← Third-party license texts
├── scripts/            ← Vendor synchronization and integrity checks
├── appsscript.json     ← GAS project settings (timezone Asia/Tokyo, V8, web app config, etc.)
├── package.json        ← Playwright harness dependencies and commands
├── playwright.config.js← Responsive browser test configuration
├── tests/              ← Node.js regression tests and local browser harness
├── .clasp.json.example ← Example clasp config (.clasp.json is not committed)
├── .claspignore        ← Files excluded from clasp push
├── LICENSE             ← MIT license for this project
├── README.md           ← Japanese README
└── README.en.md        ← English README
```

### Local UI Preview (Playwright)

The local harness renders the real `index.html`, `styles.html`, and `app.html` files used by GAS. It replaces only `google.script.run`, Pannellum, and image fixtures; production code never imports the harness.

```powershell
npm install
npm run vendor:check
npx playwright install chromium  # Only when no usable Chrome/Chromium is installed
npm run preview:ui
```

Open a URL such as `http://127.0.0.1:4173/?mode=public&sceneType=360`. Supported `mode` values are `public`, `internal`, and `edit`; supported `sceneType` values are `360` and `2D`.

Run the responsive coordinate, overflow, and scene-list interaction checks with:

```powershell
npm run test:browser
```

To write post-change screenshots and coordinate JSON to `output/playwright/after/`, run `$env:UI_CAPTURE_PHASE='after'; npx playwright test --grep "after screenshots"` in PowerShell. `output/playwright/` is excluded from both Git and clasp.

### Local Development (clasp)

Using [clasp](https://github.com/google/clasp):

1. Install clasp: `npm install -g @google/clasp`
2. Log in: `clasp login`
3. Set the `scriptId` in `.clasp.json` to your GAS project ID (use `clasp create` for a new project)
4. Push code: `clasp push` / Pull code: `clasp pull`
5. `appsscript.json` is deployed automatically by clasp

---

## Releases

See [GitHub Releases](https://github.com/takikomirice/360viewer-Hemisphere/releases) for version-specific changes and upgrade instructions.

---

## Licenses

This project is distributed under the [MIT License](LICENSE).

### Third-party software

#### Mediabunny 1.50.8

- Package: `mediabunny`
- License: Mozilla Public License 2.0 (MPL-2.0)
- Source: <https://github.com/Vanilagy/mediabunny>
- Documentation: <https://mediabunny.dev/>

#### Mediabunny MP3 Encoder 1.50.8

- Package: `@mediabunny/mp3-encoder`
- License: Mozilla Public License 2.0 (MPL-2.0)
- Source: <https://github.com/Vanilagy/mediabunny/tree/main/packages/mp3-encoder>
- Documentation: <https://mediabunny.dev/guide/extensions/mp3-encoder>

#### LAME 3.100

The MP3 extension bundles a WebAssembly build of the LAME MP3 Encoder. LAME is licensed under the GNU Lesser General Public License (LGPL); project information is available at <https://lame.sourceforge.io/>.

The audio vendor bundle in `app.html` and the license texts in `vendor/` are synchronized from the official packages by `scripts/sync-audio-vendor.js`. The package MPL-2.0 license texts are retained in `vendor/`.

---

## Spreadsheet Sheet Structure

### config sheet (settings)

| Column | Content |
| ------ | ------- |
| A | Setting key (e.g. `IMAGE_DRIVE_URL`) |
| B | Value (Google Drive URL: single file or folder; folder supports subfolders and multiple images) |
| C | Description |

The primary settings appear in this order; other existing settings remain after them:

1. `IMAGE_DRIVE_URL`
2. `HOTSPOT_FOLDER_URL`
3. `STUDENT_SHEET_URL`
4. `EDIT_KEY`
5. `WEB_APP_URL`
6. `EDIT_URL`

`HOTSPOT_FOLDER_URL` is the display-only URL of the authoritative root. Script Properties are authoritative: `HOTSPOT_FOLDER_ID` identifies `Hemisphere Hotspot`, `HOTSPOT_PHOTO_FOLDER_ID` identifies its direct `photos` child, and `HOTSPOT_AUDIO_FOLDER_ID` identifies its direct `audio` child. If absent, all three folders are created lazily on the first attachment save or folder-open action. Legacy `HOTSPOT_PHOTO_FOLDER_URL` and `HOTSPOT_AUDIO_FOLDER_URL` rows are removed only after a successful migration and only when blank or verified to reference the authoritative child; unexpected values remain with a warning.

`EDIT_URL` is generated only by the spreadsheet menu command **"編集用URLを生成・更新"**, using the config values `WEB_APP_URL` and `EDIT_KEY`. `WEB_APP_URL` must be entered directly and must be a valid HTTPS `/exec` URL. Setup never changes `EDIT_URL`; direct edits to either source value clear the stale URL, and invalid or blank input leaves `EDIT_URL` empty. No temporary or Apps Script service URL is used.

The config-sheet `EDIT_KEY` is authoritative for URL generation and normal authentication. Setup migrates a legacy `EDIT_KEY` Script Property when the config value is blank. If an existing config key differs, the legacy key remains accepted only while the stored legacy `EDIT_URL` explicitly contains it; running **"編集用URLを生成・更新"** switches authentication to the config key alone. If the config cannot be read, edit authentication fails closed instead of falling back to the legacy key.

Regenerating `EDIT_KEY` immediately invalidates both old edit URLs and temporary edit tokens already issued from the previous key.

### scenes sheet (per-image settings)

| Column | Content |
| ------ | ------- |
| A | Drive file ID (primary key) |
| B | Display name |
| C | Parent folder ID |
| D | Type |
| E | Home flag |
| F | Display order |
| G | northOffset |
| H | northOffset source (`xmp`, `none`, or `manual`) |
| I | Drive updated timestamp |
| J | scenes row updated timestamp |

Legacy `NORTH_<Drive file ID>` config rows are migrated when setup is re-run. Numeric values and `NONE` rows are removed only after equivalent scenes values are verified; invalid values, failed migrations, and conflicts with manual values remain in config.

In folder mode, images in the folder currently being viewed are matched to `scenes` by Drive file ID. Only unregistered images are batch-added at the end of that folder's order. Filename tags never overwrite type, home, order, or northOffset on existing rows. A missing Drive listing entry is not treated as deletion, and sync never changes `info`.

Public northOffset extraction is allowed only for an existing `scenes` row whose parent is under the configured root, whose type is explicitly `360`, and whose Drive MIME type is JPEG. Unregistered, root-outside, `2D`, and non-JPEG targets return `null` without reading the Drive Blob/XMP or creating a scene row. Single-image mode allows only the exact file configured in `IMAGE_DRIVE_URL`; `2D` display never consumes a stored northOffset.

### info sheet (hotspots)

| Column | Content |
| ------ | ------- |
| A | Saved timestamp |
| B | Image ID |
| C | Label |
| D | Description |
| E | Link URL |
| F | Pitch (vertical angle) |
| G | Yaw (horizontal angle) |
| H | Shape (circle / square / diamond) |
| I | Color (blue / cyan / teal / green / lime / yellow / orange / red / pink / purple / gray / white) |
| J | Icon (one of thirteen current values, including audio; video is legacy-compatible) |
| K | Photo ID (Google Drive file ID, optional) |
| L | Jump-to ID (target scene image ID for scene transitions, optional) |
| M | Hotspot ID |
| N | Audio ID (one optional MP3 file ID in `Hemisphere Hotspot/audio`) |

The `config`, `info`, and `scenes` sheets are created or repaired via **"Initial Setup"** menu → **"Generate initial setup sheet"**.
The `info` sheet is also auto-created on the first run of `saveHotspot`.
The exact legacy 13-column schema is migrated by appending only column N; existing column-M hotspot IDs are never moved or regenerated. Unknown column layouts fail closed instead of being guessed. Bulk input creates hotspots without audio and does not overwrite audio IDs on existing rows.
Legacy `star` shapes are normalized to `circle` when read, but loading does not rewrite the sheet automatically. Saving an edited legacy marker may persist `circle`.

---

## Troubleshooting

| Symptom | What to check |
| ------- | ------------- |
| Panorama image not showing | Check that Drive sharing is set to "Anyone with the link"; check that the URL is entered in config sheet cell B2 |
| Cannot save | Confirm the script is container-bound; recheck script execution permissions |
| Cannot embed in Google Sites | Check the "Who has access" setting in your deployment |
| Hotspots not showing | Check that the sheet name is `info` |
| Photo upload fails | Check that `IMAGE_DRIVE_URL` in config is set to a **folder** URL (not a file URL) |
| Audio encoding or attachment fails | Check the input format, duration, channel count, and that the generated MP3 is at most 4 MiB. Also check GAS request/execution limits, Drive capacity, and edit-URL authorization; retry with a shorter source |
| Public audio cannot be loaded | Redeploy the latest web app, then verify that the `info` scene ID, hotspot ID, and audio ID match a file inside the authoritative managed audio folder |
| Bulk input sheet not working | Check that ScriptProperties `STUDENT_SHEET_ID` is valid, `IMAGE_DRIVE_URL` is a folder URL, and the script can edit the official input sheet. The create menu command reuses a valid existing ID. |
| Gyro not working / not shown | Supported on smartphones and tablets only. Requires HTTPS, browser support for DeviceOrientation, and may require user permission |
| Home button not shown | Must be in folder mode (folder URL in `IMAGE_DRIVE_URL`); check that at least one image exists |

### About Image Delivery

Images are currently served via the direct URL `https://lh3.googleusercontent.com/d/{fileId}=s0`.
This is an unofficial Google endpoint and may stop working without notice if Google changes its specifications.

**If images stop loading**, consider switching to Base64 conversion:
In `Code.js`, replace the URL generation in `getImageDataUri` / `getHotspotPhotoDataUri` / `getConfig` with a Base64 Data URI approach using `DriveApp.getFileById(fileId).getBlob()`.
