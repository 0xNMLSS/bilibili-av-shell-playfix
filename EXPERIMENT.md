# Native player experiment branch

Branch: `experiment/native-player-modes`

Compare four playback strategies on copyright-shell BV pages where `view` returns `-404`.

## Install (dev)

1. Tampermonkey → disable the Greasy Fork release script (avoid double injection).
2. New script → paste `bilibili_av_shell_playfix.user.js` from this branch.
3. Open test URL with a mode query param (see below).

## Modes

| Mode | URL example | What it does |
|------|-------------|--------------|
| `direct` | `?avspf=direct` | **Baseline** — Shadow DOM + HTML5 `<video>` + legacy UGC playurl (current production behavior). |
| `native` | `?avspf=native` | Keep Bilibili bpx-player visible; rely on SSR/view patch + playurl hook only. No overlay. |
| `embed` | `?avspf=embed` | Hide native player; mount `player.bilibili.com` iframe overlay. |
| `native-reload` | `?avspf=native-reload` | Like `native`, but if native `<video>` duration &lt; 60s, call `player.reload()` / `switchVideo()` and inject legacy mp4 into the native video element. |

Default when `avspf` is omitted: `direct`.

Persist mode without URL param:

```js
localStorage.setItem('avShellPlayfix:playerMode', 'native')
```

Switch from console:

```js
__avShellPlayfixExperiment.setMode('embed')
```

## Test URL

https://www.bilibili.com/video/BV1GJ411x7h7/?avspf=native

Replace `native` with each mode. Hard refresh (Ctrl+F5) between runs.

## What to record

For each mode, note:

| Check | Pass criteria |
|-------|----------------|
| Page loads (no error redirect) | Title + sidebar visible |
| Player UI | Bilibili chrome vs browser controls vs iframe |
| Video duration | Full ~23 min (not ~17 s placeholder) |
| Play / pause | User can pause without auto-resume |
| Seek | Scrub bar works |
| Danmaku | Optional — may fail on synthetic metadata |
| Console | Filter `AV Shell Playfix` |

Bottom-left **experiment panel** (non-`direct` modes) shows:

- `playurl hooks` / `legacy` — hook fired and legacy fallback used
- `native video duration` — `⚠ placeholder?` if &lt; 60s
- `embed loaded` — iframe onload
- `reload attempts` — `native-reload` inject count

## Expected hypotheses

| Mode | Expected |
|------|----------|
| `direct` | Stable full playback; browser-native controls |
| `native` | May work if playurl hook replaces placeholder before player binds; danmaku/UI best if it works |
| `embed` | Likely ~17s placeholder (iframe uses its own playurl; hooks do not apply cross-origin) |
| `native-reload` | Hybrid: Bilibili UI if player keeps overlay; inject may break DASH/MSE |

## After testing

Fill results in an issue or comment:

```
mode: native
duration: 212s ⚠
pause: ok
verdict: fail — placeholder
```

If a mode beats `direct` on stability **and** UX, we can promote it on `master`; otherwise keep `direct` as default.
