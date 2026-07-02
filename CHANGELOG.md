# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Changed

- Default test URL: `https://www.bilibili.com/video/BV1GJ411x7h7/`

## [0.6.5] - 2026-07-03

### Fixed

- Playback stall / unrecoverable pause: isolate player in Shadow DOM overlay, hide native player DOM, remount if removed, refresh stream on error/stalled/waiting with backup CDN URL.

## [0.6.4] - 2026-07-03

### Changed

- Rename to **解除B站版权BV视频404播放限制**; document **BV only, no bangumi** scope in metadata and README.

## [0.6.3] - 2026-07-03

## [0.6.1] - 2026-07-03

## [0.6.0] - 2026-07-03

### Changed

- Publish metadata refresh (superseded by 0.6.1 name).

## [0.5.1] - 2026-07-03

### Removed

- Custom danmaku overlay (playback-only scope).

## [0.5.0] - 2026-07-03

### Added

- Danmaku overlay from `comment.bilibili.com/{cid}.xml` (canvas renderer, no external CDN).

### Changed

- Remove on-screen debug label in the player area (status only in console).

## [0.4.0] - 2026-07-03

### Fixed

- Replace embed iframe (uses `wbi/playurl` → 17s placeholder) with direct `<video>` fed by legacy UGC `/x/player/playurl` (fnval=0, ~23min for test BV).

## [0.3.0] - 2026-07-03

### Fixed

- Chrome debug: modern pages use SSR `__INITIAL_STATE__.error.trueCode === -404` without calling `/x/web-interface/view`; patch state at assignment time.
- Mount `player.bilibili.com` embed iframe when the native Vue player cannot hydrate on error-page HTML.
- Fix fetch hook infinite recursion; narrow view URL matching to exact `/x/web-interface/view` path.

## [0.2.0] - 2026-07-03

### Fixed

- Patch SSR `__INITIAL_STATE__` when `error.trueCode === -404`; modern video pages no longer call `/x/web-interface/view` and previously redirected before hooks could run.
- Restrict hooks to top-frame video pages only; block error-page redirects after recovery.

## [0.1.0] - 2026-07-03

### Added

- Initial Tampermonkey script: recover AV-shell videos when `view` returns `-404` by synthesizing metadata from `pagelist` and falling back to legacy UGC `playurl`.
- Verified API path for example `BV1ShTF6qEuw`: UGC playurl works; PGC playurl returns `-404` without `ep_id`.

[Unreleased]: https://github.com/0xNMLSS/bilibili-av-shell-playfix/compare/v0.6.4...HEAD
[0.6.4]: https://github.com/0xNMLSS/bilibili-av-shell-playfix/releases/tag/v0.6.4
[0.1.0]: https://github.com/0xNMLSS/bilibili-av-shell-playfix/releases/tag/v0.1.0
