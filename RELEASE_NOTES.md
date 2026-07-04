# Release Notes

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
