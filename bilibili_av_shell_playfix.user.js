// ==UserScript==
// @name         解除B站版权BV视频404播放限制
// @namespace    https://github.com/0xNMLSS
// @version      0.6.5
// @description  仅 /video/BV* · 不解番剧。通过 pagelist 与 UGC playurl 替换 view 数据, 实现版权 BV 壳在 view404 时的网页播放;
// @author       0xNMLSS
// @supportURL   https://github.com/0xNMLSS/bilibili-av-shell-playfix
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
    const VIEW_PATH = '/x/web-interface/view';
    const PAGELIST_PATH = '/x/player/pagelist';
    const LEGACY_PLAYURL_PATH = '/x/player/playurl';
    const WBI_PLAYURL_PATH = '/x/player/wbi/playurl';

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

    function buildVideoPayload(bvid, pages, pageIndex) {
      const aid = bv2aid(bvid);
      const current = pages.find((p) => p.page === pageIndex) || pages[0];
      const now = current.ctime || Math.floor(Date.now() / 1000);
      const mappedPages = pages.map((p) => ({
        cid: p.cid,
        page: p.page,
        part: p.part,
        duration: p.duration,
        dimension: p.dimension,
        first_frame: p.first_frame,
        from: p.from || 'vupload',
      }));
      return {
        bvid,
        aid,
        cid: current.cid,
        title: current.part || '视频',
        pic: (current.first_frame || '').replace(/^http:/, 'https:'),
        duration: current.duration,
        dimension: current.dimension,
        desc: '',
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
          view: 0,
          danmaku: 0,
          reply: 0,
          fav: 0,
          coin: 0,
          share: 0,
          like: 0,
          now_rank: 0,
          his_rank: 0,
          dislike: 0,
        },
      };
    }

    function buildSyntheticView(bvid, pages, pageIndex) {
      return {
        code: 0,
        message: '0',
        ttl: 1,
        data: buildVideoPayload(bvid, pages, pageIndex),
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
        if (recoverTimer) clearTimeout(recoverTimer);
        recoverTimer = setTimeout(() => reloadSource(reason), 400);
      };

      video.addEventListener('error', () => scheduleRecover('error'));
      video.addEventListener('stalled', () => scheduleRecover('stalled'));
      video.addEventListener('waiting', () => {
        if (video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) {
          scheduleRecover('waiting');
        }
      });
      video.addEventListener('pause', () => {
        if (playerRef.userPaused || video.ended || recovering) return;
        if (video.currentTime <= 0) return;
        setTimeout(() => {
          if (!playerRef.userPaused && video.paused && !video.ended && document.visibilityState === 'visible') {
            log('unexpected pause at', video.currentTime);
            video.play().catch(() => scheduleRecover('unexpected-pause'));
          }
        }, 250);
      });
      video.addEventListener('play', () => {
        playerRef.userPaused = false;
      });
      video.addEventListener('click', () => {
        playerRef.lastInteraction = Date.now();
      });
      video.addEventListener('keydown', () => {
        playerRef.lastInteraction = Date.now();
      });
      const origPause = video.pause.bind(video);
      video.pause = function () {
        if (Date.now() - (playerRef.lastInteraction || 0) < 500) {
          playerRef.userPaused = true;
        }
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
          lastInteraction: 0,
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
        return u.pathname === '/x/web-interface/view';
      } catch (_) {
        return false;
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
        toast('AV Shell Playfix：已通过备用接口恢复视频信息');
      }
      scheduleDirectPlayer(bvid, cid);
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
      const payload = buildVideoPayload(bvid, pages, pageIndex);
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
      markRecovered(bvid, payload.cid, pageIndex);
      log('SSR patched', bvid, 'cid', payload.cid);
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

      const pages = await fetchPagelist(bvid);
      const synthetic = buildSyntheticView(bvid, pages, pageLoc.page);
      markRecovered(bvid, synthetic.data.cid, pageLoc.page);
      log('synthetic view for', bvid, 'cid', recovery.cid);
      return synthetic;
    }

    async function maybeRecoverPlayurl(requestUrl, nativeJson) {
      if (!recovery.armed) {
        return nativeJson;
      }
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

    log('hooks installed for', location.href);
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
