# Progressive Images Implementation Plan

> **For agentic workers:** Use the approved design and execute the bounded experiment in sequence; request an independent review of the spec and final patch.

**Goal:** Produce a reproducible, private local experiment for panorama tiles, persistent thumbnail generation, and bounded parallel image delivery.

**Architecture:** A Node CLI uses sharp to decode/encode and explicit projection math to generate Pannellum-compatible tiles and rectilinear thumbnails. A loopback-only test server serves a viewer comparison page and a bounded-concurrency thumbnail queue. Output stays under ignored `output/quality-audit/progressive-images`.

**Tech Stack:** Node, sharp, Pannellum, browser-client for real browser interaction, node:test.

## Tasks

- [x] Add tests for cube orientation, panorama wrap, thumbnail dimensions, content-derived identity, complete-output reuse, and independent bounded queue results.
- [x] Run tests before implementation and confirm the missing functionality fails.
- [x] Implement `scripts/progressive-images/project.js`, `generate.js`, `queue.js`, and `serve.js` plus a local comparison UI.
- [x] Generate one image's derivative assets; record source provenance and output dimensions/bytes.
- [x] Use a real Pannellum browser view to compare whole-image and tiled delivery and 1-versus-4 thumbnail requests.
- [x] Verify generation reuse and failures without changing the live GAS project or source image sharing.
- [x] Record measured results and limitations in `docs/progressive-images-experiment.md`.
- [x] Run appropriate tests and independent review. Node404/404, revised measurement and concurrency review passed.
- [x] Commit and push only source/docs on `improve/quality-audit-20260908` (30af7b6).

## Next integration boundary

After the experiment, select and test an authenticated/public delivery contract, implement managed Drive thumbnail writes and startup queue idempotency, then integrate the viewer and resizable sidebar. These are not implied complete by local timing results.

2026-09-09: Saved both experimental WebP thumbnails to the designated Drive thumbnail folder using the existing clasp authorization. Verified parent, byte count, and MD5 through API read-back, and confirmed both files in the Drive UI. Automatic startup generation and persistence remain pending integration.
