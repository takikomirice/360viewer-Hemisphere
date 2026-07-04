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
3. Paste the contents of each file in this repository into the matching Apps Script file
   - **Note**: `index.html` loads `styles.html` and `app.html` using `<?!= include("styles") ?>` and `<?!= include("app") ?>`, so all three HTML files are required
4. (Optional) For bulk input sheet integration: in the spreadsheet menu, run **"Initial Setup"** → **"Create & link bulk input sheet"** — this auto-creates and links the sheet. To link an existing sheet manually, add `STUDENT_SHEET_ID` to the Script Properties in the Apps Script editor.

---

### ④ Generate the initial config sheet and set the image URL

1. In the spreadsheet, run **"Initial Setup"** menu → **"Generate initial setup sheet"**
2. In the **"config"** sheet, enter the Google Drive URL you copied in step ① into **cell B2**

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

### View Mode (for students)

- Drag to navigate the 360° view (2D flat maps support scroll and zoom)
- Click a marker to see its label, description, link, photo, etc. (markers with the "Quiz" icon open a flip card)
- If multiple images exist, use the scene list on the top-left to navigate between panoramas / 2D maps
- If a hotspot has a "Jump to" target, clicking it jumps to another scene
- **Buttons (top right of the image)**:
  - **Fullscreen**: Enter fullscreen mode
  - **Home**: Jump to the home scene (image tagged `[HOME]`; folder mode only)
  - **Quality toggle**: Switch between low-load (fast) ↔ high quality (high)
  - **Gyro** (mobile only): Tilt your device to control the view
- **Embed code**: Click the "Embed code" button to generate and copy an iframe code for Google Sites or other sites (internal and external versions available)
- **URL parameters**: `?mode=internal` / `?mode=public` hides the top bar (for embeds); `?quality=high` / `?quality=fast` sets the initial quality

### Edit Mode (for teachers)

1. Click the **"Edit Mode"** button in the top right
2. The screen switches to a yellow-highlighted frame
3. Click the location where you want to add a hotspot
4. Fill in the fields and click **"Save"**:
   - **Label** (required)
   - **Description**
   - **Link**: External URL (https://...)
   - **Marker style**: Shape (circle/square/diamond/star), color, icon (info/photo/Wi-Fi/**quiz**)
   - **Photo** (folder mode only): Attach an image from the same folder to display in the hotspot popup
   - **Jump to scene** (folder mode only): Navigate to another 360° scene on click
5. Existing hotspots: click to edit, **right-click** for "Edit" / "Delete" menu
6. **In folder mode**: right-click an image in the scene list → "Rename" (renames the file in Google Drive), "Show properties", "Delete photo"
7. **Upload photo**: Use the **"⬆ Upload photo"** button in the scene list to upload a 360° panorama or 2D flat map directly to Google Drive (requires a folder URL in config)
8. **Refresh scene list**: In folder mode, click the **refresh button (↻)** at the left of the scene list to reload the image list
9. **Bulk input sheet integration** (folder mode): Use "Update bulk input sheet list" and "Import from bulk input sheet" to register hotspots in bulk (see [details](#bulk-input-sheet-integration))

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

- Images with a filename starting with `[2D]` are displayed as 2D flat maps instead of 360° panoramas
- When uploading a photo, selecting "2D flat map" automatically adds the `[2D]` prefix
- Hotspots (labels, descriptions, links, jump targets, etc.) work the same way in 2D mode

### Home Scene ([HOME] tag)

- In folder mode, an image with `[HOME]` in its filename is treated as the "home scene"
- Example: rename a file to `[HOME] School Entrance.jpg` to always return here via the Home button
- If no `[HOME]` image exists, the first image in the folder is used as home

### Subfolders in Folder Mode

- If a folder URL is set in config, images in subfolders are also displayed hierarchically
- Click a folder in the sidebar to view its contents; use "← Back" to return to the parent folder

---

## Bulk Input Sheet Integration

This feature lets you enter hotspot data in a spreadsheet and import it all at once from edit mode.

### Setup

1. Prepare a bulk input spreadsheet
   - **Create from menu** (recommended): Run **"Initial Setup"** → **"Create & link bulk input sheet"** to auto-create a sheet in the same folder as the container spreadsheet, save its ID in PropertiesService, and set up headers, column widths, and dropdown validation (if folder is configured)
   - **Link an existing sheet**: In the Apps Script editor → **Project Settings** → **Script Properties**, add `STUDENT_SHEET_ID` with the spreadsheet ID. Match the sheet name to `STUDENT_SHEET_NAME` in `Code.js` (default: "Sheet1")
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

- **Update bulk input sheet list**: Run from the viewer's edit mode sidebar. Sets dropdown validation for columns B, F, and G based on the folder's image names. (Can also be run from the spreadsheet menu: **"Initial Setup"** → **"Update bulk input sheet validation"**)
- **Import from bulk input sheet**: Reads rows where column H is not "Done", adds them as hotspots to the info sheet, then marks those rows as "Done"

### Initial Setup Menu (Bulk Input)

| Menu item | Description |
| --------- | ----------- |
| Create & link bulk input sheet | Creates a new sheet and links it to the system |
| Update bulk input sheet validation | Updates dropdowns for columns B, F, and G |
| Show linked sheet ID | Displays the ID and URL of the currently linked sheet |

> Only available in folder mode with `IMAGE_DRIVE_URL` set to a folder URL.
> Pitch/Yaw are set to 0 on import — adjust hotspot positions manually in edit mode as needed.

---

## Tech Stack

- **Pannellum** 2.5.6 — 360° panorama viewer (CDN: jsDelivr)
- **Google Apps Script (GAS)** — backend & data storage (V8 runtime)
- **Google Sheets** — stores config and hotspot data
- **Google Drive** — stores 360° images and photos (accessed via DriveApp & Drive API v3)

---

## File Structure

```text
360viewer/
├── Code.js             ← GAS backend (server-side)
├── index.html          ← Main HTML shell, includes styles and app
├── styles.html         ← CSS loaded from index.html
├── app.html            ← Frontend JavaScript loaded from index.html
├── appsscript.json     ← GAS project settings (timezone Asia/Tokyo, V8, web app config, etc.)
├── .clasp.json.example ← Example clasp config (.clasp.json is not committed)
├── .claspignore        ← Files excluded from clasp push
├── README.md           ← Japanese README
├── README.en.md        ← English README
└── RELEASE_NOTES.md    ← Release notes
```

### Local Development (clasp)

Using [clasp](https://github.com/google/clasp):

1. Install clasp: `npm install -g @google/clasp`
2. Log in: `clasp login`
3. Set the `scriptId` in `.clasp.json` to your GAS project ID (use `clasp create` for a new project)
4. Push code: `clasp push` / Pull code: `clasp pull`
5. `appsscript.json` is deployed automatically by clasp

---

## Releases

The first public release is `v1.0.0`. See [RELEASE_NOTES.md](RELEASE_NOTES.md) for the release notes.

---

## Spreadsheet Sheet Structure

### config sheet (settings)

| Column | Content |
| ------ | ------- |
| A | Setting key (e.g. `IMAGE_DRIVE_URL`) |
| B | Value (Google Drive URL: single file or folder; folder supports subfolders and multiple images) |
| C | Description |

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
| H | Shape (circle / square / diamond / star) |
| I | Color (blue / green / orange / purple / white / gray / yellow / red) |
| J | Icon (info / photo / wifi / quiz) |
| K | Photo ID (Google Drive file ID, optional) |
| L | Jump-to ID (target scene image ID for scene transitions, optional) |

The `config` and `info` sheets are created via **"Initial Setup"** menu → **"Generate initial setup sheet"**.
The `info` sheet is also auto-created on the first run of `saveHotspot`.
Sheets using the old schema are automatically migrated on first access.

---

## Troubleshooting

| Symptom | What to check |
| ------- | ------------- |
| Panorama image not showing | Check that Drive sharing is set to "Anyone with the link"; check that the URL is entered in config sheet cell B2 |
| Cannot save | Confirm the script is container-bound; recheck script execution permissions |
| Cannot embed in Google Sites | Check the "Who has access" setting in your deployment |
| Hotspots not showing | Check that the sheet name is `info` |
| Photo upload fails | Check that `IMAGE_DRIVE_URL` in config is set to a **folder** URL (not a file URL) |
| Bulk input sheet not working | Check that the bulk input sheet is linked ("Initial Setup" → "Show linked sheet ID"); check that `IMAGE_DRIVE_URL` is a folder URL; check edit permissions on the bulk input sheet |
| Gyro not working / not shown | Supported on smartphones and tablets only. Requires HTTPS, browser support for DeviceOrientation, and may require user permission |
| Home button not shown | Must be in folder mode (folder URL in `IMAGE_DRIVE_URL`); check that at least one image exists |

### About Image Delivery

Images are currently served via the direct URL `https://lh3.googleusercontent.com/d/{fileId}=s0`.
This is an unofficial Google endpoint and may stop working without notice if Google changes its specifications.

**If images stop loading**, consider switching to Base64 conversion:
In `Code.js`, replace the URL generation in `getImageDataUri` / `getHotspotPhotoDataUri` / `getConfig` with a Base64 Data URI approach using `DriveApp.getFileById(fileId).getBlob()`.
