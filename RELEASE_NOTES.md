# Release Notes

## v1.1.0 - 2026-07-05

Feature and security-focused release for public sharing, edit protection, mobile viewing, and delivery performance.

### Highlights

- Added edit-token protection for mutating server calls, with edit-key setup and regeneration support.
- Added public share URL, iframe embed, and QR code generation flows that do not expose edit keys.
- Improved image delivery with direct URL loading, auto fallback, and explicit Base64 fallback mode.
- Added mobile public-viewing UI improvements, including bottom-sheet scene and hotspot details.
- Centralized gyro state shutdown and UI state handling for more predictable viewer interaction.
- Added read-only access notices and edit-key warnings for safer shared links.
- Added folder-listing and read-only hotspot caching, with invalidation after edits.
- Added configurable `WEB_APP_URL` support for stable edit and share URL generation.
- Expanded automated test coverage across edit tokens, sharing, QR codes, delivery, gyro, mobile UI, and caching.

### Notes

- For stable share and edit URLs, set `WEB_APP_URL` in the config sheet after deployment.
- Public share URLs and QR codes are intentionally generated without `editKey`.
- Base64 delivery remains available as a fallback, but public viewing uses direct delivery by default.

## v1.0.0 - 2026-07-04

Initial public release of 360° Viewer - Hemisphere.

### Highlights

- Embeddable Google Apps Script 360° panorama viewer for Google Sites.
- Hotspot editing with labels, descriptions, links, marker shapes, colors, and icons.
- Photo attachment and scene-jump support for multi-image folder tours.
- 2D flat-map mode using `[2D]` image filename prefixes.
- Home scene support using `[HOME]` image filename tags.
- Quiz mode with flip-card question and answer hotspots.
- Google Drive folder browsing with subfolder navigation and scene refresh.
- Teacher workflow for uploading, renaming, deleting, and inspecting scene images.
- Bulk input spreadsheet integration for registering hotspots from a separate sheet.
- Japanese README and English README for public setup and usage.

### Notes

- The project runs as a container-bound Google Apps Script attached to a Google Spreadsheet.
- Images are currently served through a Googleusercontent direct URL format. If Google changes that behavior, switch the image delivery code back to Base64 data URI generation as described in the README.
- The UI text is currently Japanese.
