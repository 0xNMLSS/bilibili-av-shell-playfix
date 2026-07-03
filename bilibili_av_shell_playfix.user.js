// ==UserScript==
// @name         解除B站版权BV视频404播放限制
// @namespace    https://github.com/0xNMLSS
// @version      0.8.0-experiment
// @description  [实验分支] 播放器模式：?avspf=direct|native|embed|native-reload
// @description  仅 /video/BV* · 不解番剧。见 EXPERIMENT.md。
// @description  测试：https://www.bilibili.com/video/BV1GJ411x7h7/?avspf=native
// @author       0xNMLSS
// @supportURL   https://github.com/0xNMLSS/bilibili-av-shell-playfix
// @downloadURL  https://update.greasyfork.org/scripts/585302/%E8%A7%A3%E9%99%A4b%E7%AB%99%E7%89%88%E6%9D%83bv%E8%A7%86%E9%A2%91404%E6%92%AD%E6%94%BE%E9%99%90%E5%88%B6.user.js
// @updateURL    https://update.greasyfork.org/scripts/585302/%E8%A7%A3%E9%99%A4b%E7%AB%99%E7%89%88%E6%9D%83bv%E8%A7%86%E9%A2%91404%E6%92%AD%E6%94%BE%E9%99%90%E5%88%B6.user.js
// @compatible   chrome
// @compatible   firefox
// @license      MIT
// @match        *://www.bilibili.com/video/BV*
// @match        *://www.bilibili.com/video/av*
// @match        *://www.bilibili.com/video/AV*
// @run-at       document-start
// @grant        none
// @icon         https://www.bilibili.com/favicon.ico
// ==/UserScript==

(function () {
  'use strict';

  /** Self-contained page hook — must not close over userscript scope (GM4 inject). */
  function installPageHooks() {
    if (window.top !== window) return;
    if (!/\/video\/(BV[\w]+|av\d+|AV\d+)/i.test(location.pathname)) return;

    const TAG = '[AV Shell Playfix]';
    const EASTER_EGG_BVID = 'BV1GJ411x7h7';
    const VIEW_PATH = '/x/web-interface/view';
    const VIEW_DETAIL_PATH = '/x/web-interface/view/detail';
    const WBI_VIEW_DETAIL_PATH = '/x/web-interface/wbi/view/detail';
    const RELATED_PATH = '/x/web-interface/archive/related';
    const TAGS_PATH = '/x/tag/archive/tags';
    const DESC_PATH = '/x/web-interface/archive/desc';
    const PAGELIST_PATH = '/x/player/pagelist';
    const LEGACY_PLAYURL_PATH = '/x/player/playurl';
    const WBI_PLAYURL_PATH = '/x/player/wbi/playurl';
    const PLAYER_MODES = Object.freeze(['direct', 'native', 'embed', 'native-reload']);
    const MODE_STORAGE_KEY = 'avShellPlayfix:playerMode';

    function resolvePlayerMode() {
      try {
        const fromUrl = new URL(location.href).searchParams.get('avspf');
        if (fromUrl && PLAYER_MODES.includes(fromUrl)) {
          return fromUrl;
        }
      } catch (_) {
        /* ignore */
      }
      try {
        const fromStorage = localStorage.getItem(MODE_STORAGE_KEY);
        if (fromStorage && PLAYER_MODES.includes(fromStorage)) {
          return fromStorage;
        }
      } catch (_) {
        /* ignore */
      }
      return 'direct';
    }

    const playerMode = resolvePlayerMode();
    const experiment = {
      playurlRequests: 0,
      playurlLegacy: 0,
      nativeDuration: null,
      nativeVideoFound: false,
      embedLoaded: false,
      reloadAttempts: 0,
      panelEl: null,
    };

    function log(...args) {
      console.log(TAG, ...args);
    }

    function toast(msg) {
      log(msg);
      const show = () => {
        const el = document.createElement('div');
        el.textContent = msg;
        el.style.cssText =
          'position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:999999;' +
          'background:rgba(0,0,0,.78);color:#fff;padding:10px 16px;border-radius:8px;' +
          'font-size:14px;max-width:90vw;pointer-events:none';
        (document.body || document.documentElement).appendChild(el);
        setTimeout(() => el.remove(), 5000);
      };
      if (document.body) show();
      else document.addEventListener('DOMContentLoaded', show, { once: true });
    }

    function showEggPopup() {
      const show = () => {
        const el = document.createElement('div');
        el.textContent = 'Never gonna give you up';
        el.style.cssText =
          'position:fixed;top:64px;left:50%;transform:translateX(-50%);z-index:999999;' +
          'background:rgba(255,102,153,.92);color:#fff;padding:10px 16px;border-radius:8px;' +
          'font-size:14px;max-width:90vw;pointer-events:none';
        (document.body || document.documentElement).appendChild(el);
        setTimeout(() => el.remove(), 5000);
      };
      if (document.body) show();
      else document.addEventListener('DOMContentLoaded', show, { once: true });
    }

    function parsePageLocation(href) {
      const url = new URL(href, location.origin);
      const bvMatch = url.pathname.match(/\/video\/(BV[\w]+)/i);
      const avMatch = url.pathname.match(/\/video\/av(\d+)/i);
      const p = Number.parseInt(url.searchParams.get('p') || '1', 10) || 1;
      return {
        bvid: bvMatch ? bvMatch[1] : null,
        aid: avMatch ? Number(avMatch[1]) : null,
        page: p,
      };
    }

    function bv2aid(bvid) {
      const XOR_CODE = 23442827791579n;
      const MASK_CODE = 2251799813685247n;
      const BASE = 58n;
      const data = 'FcwAPNKTMug3GV5Lj7EJnHpWsx4tb8haYeviqBz6rkCy12mUSDQX9RdoZf';
      const bytes = [...bvid.slice(3)].reverse().map((c) => BigInt(data.indexOf(c)));
      const tmp = bytes.reduce((acc, b) => acc * BASE + b, 0n);
      return Number((tmp & MASK_CODE) ^ XOR_CODE);
    }

    function aid2bv(aid) {
      const XOR_CODE = 23442827791579n;
      const MASK_CODE = 2251799813685247n;
      const BASE = 58n;
      const data = 'FcwAPNKTMug3GV5Lj7EJnHpWsx4tb8haYeviqBz6rkCy12mUSDQX9RdoZf';
      let tmp = (BigInt(aid) ^ XOR_CODE) & MASK_CODE;
      const chars = [];
      while (tmp > 0n) {
        chars.push(data[Number(tmp % BASE)]);
        tmp /= BASE;
      }
      return 'BV1' + chars.reverse().join('');
    }

    function resolveBvidFromUrl(requestUrl, pageLoc) {
      try {
        const u = new URL(requestUrl, location.origin);
        const fromQuery = u.searchParams.get('bvid');
        if (fromQuery) return fromQuery;
        const aid = u.searchParams.get('aid');
        if (aid) return aid2bv(Number(aid));
      } catch (_) {
        /* ignore */
      }
      return pageLoc.bvid || (pageLoc.aid ? aid2bv(pageLoc.aid) : null);
    }

    function fetchPagelistSync(bvid) {
      const xhr = new XMLHttpRequest();
      xhr.open(
        'GET',
        `https://api.bilibili.com${PAGELIST_PATH}?bvid=${encodeURIComponent(bvid)}`,
        false,
      );
      xhr.withCredentials = true;
      xhr.send();
      if (xhr.status !== 200) {
        throw new Error(`pagelist http ${xhr.status}`);
      }
      const json = JSON.parse(xhr.responseText);
      if (json.code !== 0 || !Array.isArray(json.data) || json.data.length === 0) {
        throw new Error(json.message || 'pagelist failed');
      }
      return json.data;
    }

    const nativeFetch = window.fetch.bind(window);

    async function fetchJson(url) {
      const res = await nativeFetch(url, { credentials: 'include' });
      return res.json();
    }

    async function fetchPagelist(bvid) {
      const json = await fetchJson(
        `https://api.bilibili.com${PAGELIST_PATH}?bvid=${encodeURIComponent(bvid)}`,
      );
      if (json.code !== 0 || !Array.isArray(json.data) || json.data.length === 0) {
        throw new Error(json.message || 'pagelist failed');
      }
      return json.data;
    }

    function fetchRelatedSync(bvid, aid) {
      const params = new URLSearchParams({ bvid });
      if (aid) params.set('aid', String(aid));
      const xhr = new XMLHttpRequest();
      xhr.open('GET', `https://api.bilibili.com${RELATED_PATH}?${params}`, false);
      xhr.withCredentials = true;
      xhr.send();
      if (xhr.status !== 200) {
        throw new Error(`related http ${xhr.status}`);
      }
      const json = JSON.parse(xhr.responseText);
      if (json.code !== 0 || !Array.isArray(json.data)) {
        throw new Error(json.message || 'related failed');
      }
      return json.data;
    }

    async function fetchRelated(bvid, aid) {
      const params = new URLSearchParams({ bvid });
      if (aid) params.set('aid', String(aid));
      const json = await fetchJson(`https://api.bilibili.com${RELATED_PATH}?${params}`);
      if (json.code !== 0 || !Array.isArray(json.data)) {
        throw new Error(json.message || 'related failed');
      }
      return json.data;
    }

    function fetchDescSync(bvid) {
      const xhr = new XMLHttpRequest();
      xhr.open(
        'GET',
        `https://api.bilibili.com${DESC_PATH}?bvid=${encodeURIComponent(bvid)}`,
        false,
      );
      xhr.withCredentials = true;
      xhr.send();
      if (xhr.status !== 200) {
        return '';
      }
      const json = JSON.parse(xhr.responseText);
      if (json.code !== 0 || typeof json.data !== 'string' || json.data === '-') {
        return '';
      }
      return json.data;
    }

    async function fetchDesc(bvid) {
      const json = await fetchJson(
        `https://api.bilibili.com${DESC_PATH}?bvid=${encodeURIComponent(bvid)}`,
      );
      if (json.code !== 0 || typeof json.data !== 'string' || json.data === '-') {
        return '';
      }
      return json.data;
    }

    async function fetchTags(bvid) {
      const json = await fetchJson(
        `https://api.bilibili.com${TAGS_PATH}?bvid=${encodeURIComponent(bvid)}`,
      );
      if (json.code !== 0 || !Array.isArray(json.data)) {
        return [];
      }
      return json.data;
    }

    function buildVideoPayload(bvid, pages, pageIndex, extra = {}) {
      const aid = bv2aid(bvid);
      const current = pages.find((p) => p.page === pageIndex) || pages[0];
      const now = current.ctime || Math.floor(Date.now() / 1000);
      const desc = extra.desc || '';
      const mappedPages = pages.map((p) => ({
        cid: p.cid,
        page: p.page,
        part: p.part,
        duration: p.duration,
        dimension: p.dimension,
        first_frame: p.first_frame,
        from: p.from || 'vupload',
        ctime: p.ctime || now,
      }));
      return {
        bvid,
        aid,
        cid: current.cid,
        videos: pages.length,
        title: current.part || '视频',
        pic: (current.first_frame || '').replace(/^http:/, 'https:'),
        duration: current.duration,
        dimension: current.dimension,
        desc,
        desc_v2: desc ? [{ raw_text: desc, type: 1, biz_id: 0 }] : [],
        state: 0,
        attribute: 0,
        pubdate: now,
        ctime: now,
        tname: '',
        pages: mappedPages,
        owner: { mid: 1, name: '哔哩哔哩', face: '' },
        rights: {
          bp: 0,
          elec: 0,
          download: 0,
          no_reprint: 1,
          autoplay: 1,
          ugc_pay: 0,
          is_cooperation: 0,
          pay: 0,
          hd5: 1,
          no_background: 0,
          arc_pay: 0,
        },
        stat: {
          aid,
          view: 0,
          danmaku: 0,
          reply: 0,
          favorite: 0,
          coin: 0,
          share: 0,
          like: 0,
          now_rank: 0,
          his_rank: 0,
          dislike: 0,
          evaluation: '',
          vt: 0,
        },
      };
    }

    function buildSyntheticViewDetail(bvid, pages, pageIndex, related, tags, desc) {
      const view = buildVideoPayload(bvid, pages, pageIndex, { desc });
      return {
        code: 0,
        message: '0',
        ttl: 1,
        data: {
          View: view,
          Card: {
            card: {
              mid: view.owner.mid,
              name: view.owner.name,
              face: view.owner.face,
            },
            follower: 0,
            following: false,
          },
          Tags: tags,
          Reply: { page: { count: 0 }, replies: [] },
          Related: related,
          Spec: null,
          hot_share: { show: false, list: [] },
          elec: null,
          recommend: null,
          emergency: { no_like: false, no_coin: false, no_fav: false, no_share: false },
          view_addit: { 63: false, 64: false, 69: false, 71: false, 72: false },
          guide: null,
          query_tags: null,
          participle: [],
          module_ctrl: null,
          replace_recommend: false,
        },
      };
    }

    function buildSyntheticView(bvid, pages, pageIndex, extra = {}) {
      return {
        code: 0,
        message: '0',
        ttl: 1,
        data: buildVideoPayload(bvid, pages, pageIndex, extra),
      };
    }

    function fetchLegacyPlayurlSync(bvid, cid) {
      const params = new URLSearchParams({
        bvid,
        cid: String(cid),
        qn: '80',
        fnval: '0',
        fnver: '0',
        platform: 'pc',
        high_quality: '1',
      });
      const xhr = new XMLHttpRequest();
      xhr.open('GET', `https://api.bilibili.com${LEGACY_PLAYURL_PATH}?${params}`, false);
      xhr.withCredentials = true;
      xhr.send();
      if (xhr.status !== 200) {
        throw new Error(`playurl http ${xhr.status}`);
      }
      return JSON.parse(xhr.responseText);
    }

    async function fetchLegacyPlayurl(bvid, cid) {
      const params = new URLSearchParams({
        bvid,
        cid: String(cid),
        qn: '80',
        fnval: '0',
        fnver: '0',
        platform: 'pc',
        high_quality: '1',
      });
      return fetchJson(`https://api.bilibili.com${LEGACY_PLAYURL_PATH}?${params}`);
    }

    function pickPlayurlSource(playurlJson, preferBackup = false) {
      const data = playurlJson?.data;
      if (!data) return null;
      if (Array.isArray(data.durl) && data.durl[0]?.url) {
        const entry = data.durl[0];
        let url = entry.url;
        if (preferBackup && Array.isArray(entry.backup_url) && entry.backup_url[0]) {
          url = entry.backup_url[0];
        }
        return {
          type: 'mp4',
          url,
          durationMs: data.timelength || 0,
          hasBackup: Array.isArray(entry.backup_url) && entry.backup_url.length > 0,
        };
      }
      const video = data.dash?.video?.[0];
      if (video?.baseUrl) {
        return { type: 'dash', url: video.baseUrl, durationMs: (data.dash.duration || 0) * 1000 };
      }
      return null;
    }

    function hideNativePlayerChildren(host, keep) {
      for (const child of host.children) {
        if (child === keep) continue;
        child.dataset.avShellPlayfixHidden = '1';
        child.style.visibility = 'hidden';
        child.style.pointerEvents = 'none';
      }
    }

    function restoreNativePlayerDom(host) {
      if (!host) return;
      for (const child of host.children) {
        if (child.dataset.avShellPlayfixHidden !== '1') continue;
        delete child.dataset.avShellPlayfixHidden;
        child.style.visibility = '';
        child.style.pointerEvents = '';
      }
      host.querySelector('#av-shell-playfix-root')?.remove();
    }

    function findNativeVideo() {
      const host = findPlayerHost();
      if (!host) return null;
      for (const video of host.querySelectorAll('video')) {
        if (video.dataset.avShellPlayfix === 'video') continue;
        if (video.closest('#av-shell-playfix-root')) continue;
        return video;
      }
      return null;
    }

    function updateExperimentPanel() {
      if (playerMode === 'direct') return;
      const show = () => {
        let panel = experiment.panelEl;
        if (!panel?.isConnected) {
          panel = document.createElement('div');
          panel.id = 'av-shell-playfix-experiment';
          panel.style.cssText =
            'position:fixed;bottom:12px;left:12px;z-index:999998;max-width:360px;' +
            'background:rgba(0,0,0,.82);color:#9cf;padding:8px 10px;border-radius:6px;' +
            'font:12px/1.45 monospace;pointer-events:none;white-space:pre-wrap';
          (document.body || document.documentElement).appendChild(panel);
          experiment.panelEl = panel;
        }
        const dur = experiment.nativeDuration;
        const durText =
          dur == null || Number.isNaN(dur) ? 'n/a' : `${Math.round(dur)}s${dur > 0 && dur < 60 ? ' ⚠ placeholder?' : ''}`;
        panel.textContent =
          `[AV Shell Playfix experiment]\n` +
          `mode: ${playerMode}\n` +
          `playurl hooks: ${experiment.playurlRequests} (legacy ${experiment.playurlLegacy})\n` +
          `native video: ${experiment.nativeVideoFound ? 'yes' : 'no'} duration=${durText}\n` +
          `embed loaded: ${experiment.embedLoaded ? 'yes' : 'no'}\n` +
          `reload attempts: ${experiment.reloadAttempts}\n` +
          `switch: ?avspf=${PLAYER_MODES.filter((m) => m !== playerMode).join('|')}`;
      };
      if (document.body) show();
      else document.addEventListener('DOMContentLoaded', show, { once: true });
    }

    function tryPlayerApiReload(bvid, cid) {
      const aid = bv2aid(bvid);
      const apis = [window.player, window.__player__].filter(Boolean);
      for (const api of apis) {
        if (typeof api.reload === 'function') {
          try {
            api.reload();
            log('native-reload: player.reload()');
          } catch (err) {
            log('native-reload: player.reload() failed', err);
          }
        }
        if (typeof api.switchVideo === 'function') {
          try {
            api.switchVideo({ bvid, cid, aid });
            log('native-reload: player.switchVideo()');
          } catch (err) {
            log('native-reload: player.switchVideo() failed', err);
          }
        }
      }
    }

    async function injectLegacyIntoNativeVideo(bvid, cid, reason) {
      const video = findNativeVideo();
      if (!video) {
        log('native-reload: no native video to inject', reason);
        return false;
      }
      try {
        const playurlJson = await fetchLegacyPlayurl(bvid, cid);
        if (playurlJson.code !== 0) {
          throw new Error(playurlJson.message || String(playurlJson.code));
        }
        const source = pickPlayurlSource(playurlJson, false);
        if (!source) throw new Error('no source');
        video.src = source.url.replace(/^http:/, 'https:');
        video.load();
        experiment.reloadAttempts++;
        log('native-reload: injected legacy src', reason, source.type);
        updateExperimentPanel();
        return true;
      } catch (err) {
        log('native-reload: inject failed', reason, err);
        return false;
      }
    }

    function startNativeWatch(bvid, cid, withReload) {
      const host = findPlayerHost();
      if (host) restoreNativePlayerDom(host);

      let reloadDone = false;
      const inspect = () => {
        const video = findNativeVideo();
        if (video) {
          experiment.nativeVideoFound = true;
          if (video.duration && !Number.isNaN(video.duration)) {
            experiment.nativeDuration = video.duration;
          }
          updateExperimentPanel();
          if (
            withReload &&
            !reloadDone &&
            video.duration > 0 &&
            video.duration < 60
          ) {
            reloadDone = true;
            tryPlayerApiReload(bvid, cid);
            injectLegacyIntoNativeVideo(bvid, cid, 'short-duration');
          }
        }
      };

      inspect();
      const timer = setInterval(() => {
        inspect();
      }, 1000);
      setTimeout(() => clearInterval(timer), 120000);
      updateExperimentPanel();
    }

    function mountEmbedPlayer(bvid, cid, pageIndex) {
      const mount = () => {
        const host = findPlayerHost();
        if (!host) return false;

        host.style.minHeight = '480px';
        host.style.width = '100%';
        host.style.background = '#000';

        let root = host.querySelector('#av-shell-playfix-root');
        if (!root) {
          root = document.createElement('div');
          root.id = 'av-shell-playfix-root';
          root.dataset.avShellPlayfix = 'root';
          root.style.cssText =
            'position:absolute;inset:0;z-index:5;width:100%;height:100%;min-height:480px;background:#000';
          host.style.position = 'relative';
          host.appendChild(root);
        }
        hideNativePlayerChildren(host, root);

        let iframe = root.querySelector('iframe[data-av-shell-playfix="embed"]');
        if (!iframe) {
          iframe = document.createElement('iframe');
          iframe.dataset.avShellPlayfix = 'embed';
          iframe.allow = 'autoplay; fullscreen';
          iframe.referrerPolicy = 'origin';
          iframe.style.cssText = 'width:100%;height:100%;min-height:480px;border:0;display:block';
          iframe.addEventListener('load', () => {
            experiment.embedLoaded = true;
            updateExperimentPanel();
            log('embed iframe loaded');
          });
          root.appendChild(iframe);
        }

        const page = pageIndex || pageLoc.page;
        const aid = bv2aid(bvid);
        iframe.src =
          `https://player.bilibili.com/player.html?isOutside=true&aid=${aid}` +
          `&bvid=${encodeURIComponent(bvid)}&cid=${cid}&page=${page}&high_quality=1&danmaku=1`;
        log('embed player mounted', bvid, 'cid', cid, 'page', page);
        updateExperimentPanel();
        return true;
      };

      if (mount()) return;
      const observer = new MutationObserver(() => {
        if (mount()) observer.disconnect();
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
      setTimeout(() => observer.disconnect(), 60000);
    }

    function scheduleWhenDomReady(fn) {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', fn, { once: true });
      } else {
        fn();
      }
    }

    function schedulePlayerMount(bvid, cid, pageIndex) {
      switch (playerMode) {
        case 'native':
          scheduleWhenDomReady(() => startNativeWatch(bvid, cid, false));
          break;
        case 'native-reload':
          scheduleWhenDomReady(() => startNativeWatch(bvid, cid, true));
          break;
        case 'embed':
          scheduleWhenDomReady(() => mountEmbedPlayer(bvid, cid, pageIndex));
          break;
        default:
          scheduleDirectPlayer(bvid, cid);
      }
    }

    function attachStreamRecovery(video, bvid, cid, playerRef) {
      let recovering = false;
      let recoverTimer = 0;

      const reloadSource = async (reason) => {
        if (recovering || playerRef.userPaused) return;
        recovering = true;
        const savedTime = video.currentTime;
        const wasPlaying = !video.paused;
        playerRef.useBackup = !playerRef.useBackup;
        log('stream recover', reason, 'backup=', playerRef.useBackup);
        try {
          const playurlJson = await fetchLegacyPlayurl(bvid, cid);
          if (playurlJson.code !== 0) throw new Error(playurlJson.message || String(playurlJson.code));
          const source = pickPlayurlSource(playurlJson, playerRef.useBackup);
          if (!source) throw new Error('no source');
          video.src = source.url.replace(/^http:/, 'https:');
          video.load();
          await new Promise((resolve, reject) => {
            const onReady = () => {
              video.removeEventListener('loadedmetadata', onReady);
              video.removeEventListener('error', onErr);
              resolve();
            };
            const onErr = () => {
              video.removeEventListener('loadedmetadata', onReady);
              video.removeEventListener('error', onErr);
              reject(new Error('reload metadata failed'));
            };
            video.addEventListener('loadedmetadata', onReady);
            video.addEventListener('error', onErr);
          });
          if (savedTime > 0 && savedTime < video.duration) {
            video.currentTime = savedTime;
          }
          if (wasPlaying) {
            await video.play();
          }
        } catch (err) {
          log('stream recover failed', err);
        } finally {
          recovering = false;
        }
      };

      const scheduleRecover = (reason) => {
        if (playerRef.userPaused) return;
        if (recoverTimer) clearTimeout(recoverTimer);
        recoverTimer = setTimeout(() => reloadSource(reason), 400);
      };

      let lastGesture = 0;
      const markGesture = () => {
        lastGesture = Date.now();
      };
      video.addEventListener('pointerdown', markGesture, true);
      video.addEventListener('keydown', markGesture, true);

      video.addEventListener('error', () => scheduleRecover('error'));
      video.addEventListener('stalled', () => scheduleRecover('stalled'));
      video.addEventListener('waiting', () => {
        if (playerRef.userPaused) return;
        if (video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) {
          scheduleRecover('waiting');
        }
      });
      video.addEventListener('pause', () => {
        if (video.ended || recovering) return;
        // Native controls pause via UA shadow DOM — no JS pause() call, only this event.
        if (playerRef.userPaused || Date.now() - lastGesture < 800) {
          playerRef.userPaused = true;
        }
      });
      video.addEventListener('play', () => {
        playerRef.userPaused = false;
      });
      const origPause = video.pause.bind(video);
      video.pause = function () {
        // ponytail: stalls fire 'pause' without calling pause(); only JS pause() is user intent
        playerRef.userPaused = true;
        return origPause();
      };
    }

    function ensurePlayerRoot(host) {
      let root = host.querySelector('#av-shell-playfix-root');
      if (root) return root;
      root = document.createElement('div');
      root.id = 'av-shell-playfix-root';
      root.dataset.avShellPlayfix = 'root';
      root.style.cssText =
        'position:absolute;inset:0;z-index:5;width:100%;height:100%;min-height:480px;background:#000';
      host.style.position = 'relative';
      host.appendChild(root);
      hideNativePlayerChildren(host, root);
      return root;
    }

    function startHostGuard(bvid, cid, playerRef) {
      if (playerMode !== 'direct') return;
      if (playerRef.guard) return;
      playerRef.guard = new MutationObserver(() => {
        const host = findPlayerHost();
        const root = document.querySelector('#av-shell-playfix-root');
        const video = playerRef.video;
        if (!recovery.armed) return;
        if (!host || !root?.isConnected || !video?.isConnected) {
          log('player host lost, remounting');
          playerRef.guard.disconnect();
          playerRef.guard = null;
          playerRef.video = null;
          mountDirectPlayer(bvid, cid);
          return;
        }
        hideNativePlayerChildren(host, root);
      });
      playerRef.guard.observe(document.documentElement, { childList: true, subtree: true });
    }

    function findPlayerHost() {
      return (
        document.querySelector('#bilibili-player') ||
        document.querySelector('.bpx-player-container') ||
        document.querySelector('#playerWrap') ||
        document.querySelector('.player-wrap')
      );
    }

    const pageLoc = parsePageLocation(location.href);
    const recovery = {
      armed: false,
      bvid: pageLoc.bvid,
      cid: null,
      toastShown: false,
      player: null,
    };

    function mountDirectPlayer(bvid, cid) {
      if (playerMode !== 'direct') return;
      const mount = () => {
        const host = findPlayerHost();
        if (!host) return false;

        const existingRoot = host.querySelector('#av-shell-playfix-root');
        const existingVideo = recovery.player?.video;
        if (existingRoot?.isConnected && existingVideo?.isConnected) {
          hideNativePlayerChildren(host, existingRoot);
          return true;
        }

        let playurlJson;
        try {
          playurlJson = fetchLegacyPlayurlSync(bvid, cid);
        } catch (err) {
          log('legacy playurl sync failed', err);
          return false;
        }
        if (playurlJson.code !== 0) {
          log('legacy playurl code', playurlJson.code, playurlJson.message);
          return false;
        }

        const source = pickPlayurlSource(playurlJson, false);
        if (!source) {
          log('no playable source in legacy playurl');
          return false;
        }

        host.style.minHeight = '480px';
        host.style.width = '100%';
        host.style.background = '#000';

        const root = ensurePlayerRoot(host);
        let shadow = root.shadowRoot;
        if (!shadow) {
          shadow = root.attachShadow({ mode: 'closed' });
        }

        let video = shadow.querySelector('video');
        if (!video) {
          video = document.createElement('video');
          video.dataset.avShellPlayfix = 'video';
          video.controls = true;
          video.playsInline = true;
          video.preload = 'auto';
          video.style.cssText =
            'width:100%;height:100%;min-height:480px;background:#000;display:block';
          shadow.appendChild(video);
        }

        const playerRef = {
          video,
          useBackup: false,
          userPaused: false,
          guard: recovery.player?.guard || null,
        };
        if (!video.dataset.avShellPlayfixBound) {
          video.dataset.avShellPlayfixBound = '1';
          attachStreamRecovery(video, bvid, cid, playerRef);
        }

        video.src = source.url.replace(/^http:/, 'https:');
        recovery.player = playerRef;

        video.addEventListener(
          'loadedmetadata',
          () => {
            log('direct player ready', 'duration', video.duration, 'type', source.type);
            if (video.duration > 0 && video.duration < 60) {
              log('warn: suspicious short duration', video.duration);
            }
          },
          { once: true },
        );

        startHostGuard(bvid, cid, playerRef);
        log('direct player mounted', bvid, 'cid', cid, source.type, 'shadow');
        return true;
      };

      if (mount()) return;
      const observer = new MutationObserver(() => {
        if (mount()) observer.disconnect();
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
      setTimeout(() => observer.disconnect(), 60000);
    }

    function scheduleDirectPlayer(bvid, cid) {
      const run = () => mountDirectPlayer(bvid, cid);
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', run, { once: true });
      } else {
        run();
      }
    }

    function isViewUrl(url) {
      if (typeof url !== 'string') return false;
      try {
        const u = new URL(url, location.origin);
        return u.pathname === VIEW_PATH;
      } catch (_) {
        return false;
      }
    }

    function isViewDetailUrl(url) {
      if (typeof url !== 'string') return false;
      try {
        const u = new URL(url, location.origin);
        return u.pathname === VIEW_DETAIL_PATH || u.pathname === WBI_VIEW_DETAIL_PATH;
      } catch (_) {
        return (
          url.includes(VIEW_DETAIL_PATH) ||
          url.includes(WBI_VIEW_DETAIL_PATH)
        );
      }
    }

    function isPlayurlUrl(url) {
      return (
        typeof url === 'string' &&
        (url.includes(WBI_PLAYURL_PATH) || url.includes(LEGACY_PLAYURL_PATH))
      );
    }

    function isSsrNotFound(state) {
      const err = state?.error;
      return err && (err.trueCode === -404 || err.code === 404);
    }

    function markRecovered(bvid, cid, pageIndex) {
      recovery.armed = true;
      recovery.bvid = bvid;
      recovery.cid = cid;
      if (!recovery.toastShown) {
        recovery.toastShown = true;
        const modeHint = playerMode === 'direct' ? '' : ` [${playerMode}]`;
        toast(`AV Shell Playfix${modeHint}：已通过备用接口恢复视频信息`);
        if (bvid === EASTER_EGG_BVID) {
          showEggPopup();
        }
      }
      schedulePlayerMount(bvid, cid, pageIndex);
    }

    function patchSsrState(state) {
      if (!isSsrNotFound(state)) return false;
      const bvid =
        state.bvid || pageLoc.bvid || (state.aid && aid2bv(state.aid)) || (pageLoc.aid && aid2bv(pageLoc.aid));
      if (!bvid) {
        log('SSR -404 but no bvid');
        return false;
      }
      const pageIndex = state.p || pageLoc.page;
      const pages = fetchPagelistSync(bvid);
      const desc = fetchDescSync(bvid);
      const payload = buildVideoPayload(bvid, pages, pageIndex, { desc });
      state.error = { code: 0, trueCode: 0, message: '0', fromSpider: false };
      state.aid = payload.aid;
      state.bvid = payload.bvid;
      state.cid = payload.cid;
      state.p = pageIndex;
      state.videoData = Object.assign(state.videoData || {}, payload);
      if (!state.cidMap) {
        state.cidMap = {};
      }
      for (const part of payload.pages) {
        state.cidMap[part.page] = part.cid;
      }
      try {
        state.related = fetchRelatedSync(bvid, payload.aid);
      } catch (err) {
        log('SSR related failed', err);
        state.related = state.related || [];
      }
      markRecovered(bvid, payload.cid, pageIndex);
      log('SSR patched', bvid, 'cid', payload.cid, 'related', state.related.length);
      return true;
    }

    let initialStateValue;
    Object.defineProperty(window, '__INITIAL_STATE__', {
      configurable: true,
      enumerable: true,
      get() {
        return initialStateValue;
      },
      set(value) {
        try {
          patchSsrState(value);
        } catch (err) {
          log('SSR patch failed', err);
        }
        initialStateValue = value;
      },
    });

    function blockErrorRedirect(url) {
      const s = String(url);
      return (
        recovery.armed &&
        (s.includes('errorpage') || (s === 'https://www.bilibili.com/' || s === 'https://www.bilibili.com'))
      );
    }

    const nativeAssign = Location.prototype.assign;
    Location.prototype.assign = function (url) {
      if (blockErrorRedirect(url)) {
        log('blocked assign redirect', url);
        return;
      }
      return nativeAssign.call(this, url);
    };

    const nativeReplace = Location.prototype.replace;
    Location.prototype.replace = function (url) {
      if (blockErrorRedirect(url)) {
        log('blocked replace redirect', url);
        return;
      }
      return nativeReplace.call(this, url);
    };

    const hrefDesc = Object.getOwnPropertyDescriptor(Location.prototype, 'href');
    if (hrefDesc?.set && hrefDesc?.get) {
      const nativeHrefSet = hrefDesc.set;
      Object.defineProperty(Location.prototype, 'href', {
        configurable: true,
        enumerable: hrefDesc.enumerable,
        get: hrefDesc.get,
        set(url) {
          if (blockErrorRedirect(url)) {
            log('blocked href redirect', url);
            return;
          }
          nativeHrefSet.call(this, url);
        },
      });
    }

    async function maybeRecoverView(requestUrl) {
      const nativeJson = await fetchJson(requestUrl);
      if (nativeJson.code !== -404) {
        return nativeJson;
      }

      const bvid = resolveBvidFromUrl(requestUrl, pageLoc);
      if (!bvid) {
        log('view -404 but no bvid resolved', requestUrl);
        return nativeJson;
      }

      const [pages, desc] = await Promise.all([fetchPagelist(bvid), fetchDesc(bvid)]);
      const synthetic = buildSyntheticView(bvid, pages, pageLoc.page, { desc });
      markRecovered(bvid, synthetic.data.cid, pageLoc.page);
      log('synthetic view for', bvid, 'cid', recovery.cid);
      return synthetic;
    }

    async function maybeRecoverViewDetail(requestUrl, nativeJson) {
      if (nativeJson?.code === 0) {
        return nativeJson;
      }
      if (nativeJson?.code !== -404 && nativeJson?.code !== 62002) {
        return nativeJson;
      }

      const bvid = resolveBvidFromUrl(requestUrl, pageLoc);
      if (!bvid) {
        log('view/detail -404 but no bvid resolved', requestUrl);
        return nativeJson;
      }

      const aid = bv2aid(bvid);
      const [pages, related, tags, desc] = await Promise.all([
        fetchPagelist(bvid),
        fetchRelated(bvid, aid),
        fetchTags(bvid),
        fetchDesc(bvid),
      ]);
      const synthetic = buildSyntheticViewDetail(bvid, pages, pageLoc.page, related, tags, desc);
      markRecovered(bvid, synthetic.data.View.cid, pageLoc.page);
      log('synthetic view/detail for', bvid, 'related', related.length);
      return synthetic;
    }

    async function maybeRecoverPlayurl(requestUrl, nativeJson) {
      if (!recovery.armed) {
        return nativeJson;
      }
      experiment.playurlRequests++;
      updateExperimentPanel();
      if (nativeJson.code === 0) {
        const src = pickPlayurlSource(nativeJson);
        if (src && (src.durationMs > 60000 || nativeJson.data?.dash?.duration > 60)) {
          return nativeJson;
        }
        log('playurl ok but looks like placeholder, trying legacy UGC');
      }
      let cid = recovery.cid;
      if (!cid) {
        try {
          const u = new URL(requestUrl, location.origin);
          cid = Number(u.searchParams.get('cid'));
        } catch (_) {
          /* ignore */
        }
      }
      if (!cid || !recovery.bvid) {
        return nativeJson;
      }
      log('playurl failed, trying legacy UGC', nativeJson.code, nativeJson.message);
      const legacy = await fetchLegacyPlayurl(recovery.bvid, cid);
      if (legacy.code === 0) {
        experiment.playurlLegacy++;
        updateExperimentPanel();
        log('legacy playurl ok');
        return legacy;
      }
      toast(`AV Shell Playfix：播放地址获取失败 (${legacy.message || legacy.code})`);
      return nativeJson;
    }

    window.fetch = async function avShellFetch(input, init) {
      const url = typeof input === 'string' ? input : input?.url;
      try {
        if (url && isViewUrl(url)) {
          const patched = await maybeRecoverView(url);
          return new Response(JSON.stringify(patched), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (url && isViewDetailUrl(url)) {
          let nativeJson;
          try {
            nativeJson = await fetchJson(url);
          } catch (err) {
            log('view/detail fetch failed', err);
            return nativeFetch(input, init);
          }
          const patched = await maybeRecoverViewDetail(url, nativeJson);
          return new Response(JSON.stringify(patched), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        const resp = await nativeFetch(input, init);
        if (url && isPlayurlUrl(url) && recovery.armed) {
          const text = await resp.clone().text();
          let json;
          try {
            json = JSON.parse(text);
          } catch {
            return resp;
          }
          const fixed = await maybeRecoverPlayurl(url, json);
          if (fixed !== json) {
            return new Response(JSON.stringify(fixed), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }
        }
        return resp;
      } catch (err) {
        log('fetch hook error', err);
        return nativeFetch(input, init);
      }
    };

    const XHR = window.XMLHttpRequest;
    const nativeOpen = XHR.prototype.open;
    const nativeSend = XHR.prototype.send;

    XHR.prototype.open = function (method, url, ...rest) {
      this.__avShellUrl = String(url);
      return nativeOpen.call(this, method, url, ...rest);
    };

    XHR.prototype.send = function (...args) {
      const url = this.__avShellUrl || '';

      if (isViewUrl(url)) {
        maybeRecoverView(url)
          .then((json) => {
            const body = JSON.stringify(json);
            Object.defineProperty(this, 'readyState', { configurable: true, get: () => 4 });
            Object.defineProperty(this, 'status', { configurable: true, get: () => 200 });
            Object.defineProperty(this, 'responseText', { configurable: true, get: () => body });
            Object.defineProperty(this, 'response', { configurable: true, get: () => body });
            this.dispatchEvent(new Event('readystatechange'));
            this.dispatchEvent(new Event('load'));
          })
          .catch((err) => {
            log('xhr view recovery failed', err);
            nativeSend.apply(this, args);
          });
        return;
      }

      if (isViewDetailUrl(url)) {
        fetchJson(url)
          .then((json) => maybeRecoverViewDetail(url, json))
          .then((json) => {
            const body = JSON.stringify(json);
            Object.defineProperty(this, 'readyState', { configurable: true, get: () => 4 });
            Object.defineProperty(this, 'status', { configurable: true, get: () => 200 });
            Object.defineProperty(this, 'responseText', { configurable: true, get: () => body });
            Object.defineProperty(this, 'response', { configurable: true, get: () => body });
            this.dispatchEvent(new Event('readystatechange'));
            this.dispatchEvent(new Event('load'));
          })
          .catch((err) => {
            log('xhr view/detail recovery failed', err);
            nativeSend.apply(this, args);
          });
        return;
      }

      if (isPlayurlUrl(url) && recovery.armed) {
        const xhr = this;
        const onReady = function () {
          if (xhr.readyState !== 4) return;
          xhr.removeEventListener('readystatechange', onReady);
          try {
            const json = JSON.parse(xhr.responseText);
            maybeRecoverPlayurl(url, json).then((fixed) => {
              if (fixed === json) return;
              const body = JSON.stringify(fixed);
              Object.defineProperty(xhr, 'responseText', { configurable: true, get: () => body });
              Object.defineProperty(xhr, 'response', { configurable: true, get: () => body });
              xhr.dispatchEvent(new Event('readystatechange'));
              xhr.dispatchEvent(new Event('load'));
            });
          } catch (_) {
            /* ignore */
          }
        };
        xhr.addEventListener('readystatechange', onReady);
      }

      return nativeSend.apply(this, args);
    };

    window.__avShellPlayfixExperiment = {
      mode: playerMode,
      modes: PLAYER_MODES,
      stats: () => ({ ...experiment }),
      setMode(next) {
        if (!PLAYER_MODES.includes(next)) {
          throw new Error(`unknown mode: ${next}; use one of ${PLAYER_MODES.join(', ')}`);
        }
        try {
          localStorage.setItem(MODE_STORAGE_KEY, next);
        } catch (_) {
          /* ignore */
        }
        const url = new URL(location.href);
        url.searchParams.set('avspf', next);
        location.assign(url.toString());
      },
    };

    log('hooks installed for', location.href, 'playerMode=', playerMode);
    updateExperimentPanel();
  }

  function injectIntoPage(source) {
    const script = document.createElement('script');
    script.textContent = `;(${source})();`;
    (document.head || document.documentElement).appendChild(script);
    script.remove();
  }

  const desc = Object.getOwnPropertyDescriptor(window, 'XMLHttpRequest');
  if (desc && desc.writable === false) {
    injectIntoPage(installPageHooks.toString());
  } else {
    installPageHooks();
  }
})();
