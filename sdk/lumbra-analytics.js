/*!
 * Lumbra Analytics — coleta anônima de uso dos jogos da Lumbra Games.
 * Uso:  LumbraAnalytics.init({ game: "PRANCHETA", version: "3.0", config: {apiKey, databaseURL} })
 *       LumbraAnalytics.event("match_start", { liga: "A" })
 * Não coleta nome, e-mail, localização precisa ou qualquer dado pessoal.
 */
(function (w) {
  "use strict";
  if (w.LumbraAnalytics) return;

  var VER = "1.0";
  var HEARTBEAT = 30000;          // sinal de presença a cada 30 s
  var NEW_SESSION_AFTER = 300000; // 5 min em segundo plano = nova sessão
  var MAX_EVENTS_SESSION = 300;
  var MAX_QUEUE = 300;

  var cfg, game, gameVersion, store, key, sid, sStart, lastBeat = 0, beatTimer = null,
      hiddenAt = 0, sentEvents = 0, queue = [], busy = false, ready = false, serverOffset = 0;

  function now() { return Date.now(); }
  function load() { try { return JSON.parse(localStorage.getItem(key) || "{}"); } catch (e) { return {}; } }
  function save() { try { localStorage.setItem(key, JSON.stringify(store)); } catch (e) {} }
  function rid() { return now().toString(36) + Math.random().toString(36).slice(2, 8); }
  var TS = { ".sv": "timestamp" };
  function inc(n) { return { ".sv": { increment: n } }; }

  function device() {
    var ua = navigator.userAgent || "", os = "Outro", osv = "", model = "";
    var m = ua.match(/Android\s([\d.]+)/);
    if (m) { os = "Android"; osv = m[1].split(".")[0]; var d = ua.match(/Android [\d.]+;\s*([^;)]+?)(?:\sBuild|\))/); if (d) model = d[1].replace(/^[a-z]{2}-[a-z]{2};\s*/i, "").trim(); }
    else if (/iPhone|iPad/.test(ua)) { os = "iOS"; model = /iPad/.test(ua) ? "iPad" : "iPhone"; }
    else if (/Windows/.test(ua)) os = "Windows";
    else if (/Mac OS/.test(ua)) os = "macOS";
    else if (/Linux/.test(ua)) os = "Linux";
    var app = /; wv\)/.test(ua) || /Version\/[\d.]+ Chrome\/[\d.]+ Mobile/.test(ua) && /Android/.test(ua);
    var tz = ""; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) {}
    return {
      os: os, osv: osv, model: (model || "").slice(0, 40), plat: app ? "app" : "web",
      lang: (navigator.language || "").slice(0, 10), tz: tz.slice(0, 40),
      scr: Math.round(screen.width) + "x" + Math.round(screen.height)
    };
  }

  function logErr(where, e) {
    store.err = { w: where, m: String(e && e.message || e).slice(0, 160), t: now() };
    save();
  }

  // ---------- login anônimo (Firebase Auth via REST) ----------
  function authOk() { return store.tok && store.exp > now() + 60000; }
  function auth() {
    if (authOk()) return Promise.resolve();
    var url, body;
    if (store.ref) {
      url = "https://securetoken.googleapis.com/v1/token?key=" + cfg.apiKey;
      body = "grant_type=refresh_token&refresh_token=" + encodeURIComponent(store.ref);
      return fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: body })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (!j.id_token) { if (j.error) { store.ref = null; } throw new Error("refresh: " + (j.error && j.error.message)); }
          store.tok = j.id_token; store.ref = j.refresh_token; store.uid = j.user_id;
          store.exp = now() + (+j.expires_in || 3600) * 1000; save();
        });
    }
    url = "https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=" + cfg.apiKey;
    return fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ returnSecureToken: true }) })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j.idToken) throw new Error("signUp: " + (j.error && j.error.message));
        store.tok = j.idToken; store.ref = j.refreshToken; store.uid = j.localId;
        store.exp = now() + (+j.expiresIn || 3600) * 1000; save();
      });
  }

  function db(method, path, body, keepalive) {
    var url = cfg.databaseURL.replace(/\/$/, "") + "/" + path + ".json?auth=" + store.tok;
    return fetch(url, { method: method, body: body === undefined ? undefined : JSON.stringify(body), keepalive: !!keepalive })
      .then(function (r) { if (!r.ok) return r.text().then(function (t) { throw new Error(method + " " + path.split("/")[0] + " " + r.status + " " + t.slice(0, 80)); }); return r; });
  }

  function syncOffset() {
    var t0 = now();
    return db("PUT", "online/" + game + "/" + store.uid, { sid: sid, l: TS, v: gameVersion })
      .then(function (r) { return r.json(); })
      .then(function (j) { if (j && j.l) serverOffset = j.l - Math.round((t0 + now()) / 2); });
  }

  // ---------- sessão ----------
  function startSession() {
    sid = rid(); sStart = now(); sentEvents = 0; lastBeat = now();
    var first = !store.reg;
    var d = device();
    var p = { last: TS, sessions: inc(1), ver: gameVersion, os: d.os, osv: d.osv, model: d.model, plat: d.plat, lang: d.lang, tz: d.tz, scr: d.scr, sdk: VER };
    if (first) p.first = TS;
    return auth()
      .then(function () { return db("PATCH", "players/" + game + "/" + store.uid, p); })
      .then(function () { if (first) { store.reg = 1; save(); } return db("PUT", "sessions/" + game + "/" + sid, { u: store.uid, s: TS, l: TS, d: 0, v: gameVersion, n: first ? 1 : 0 }); })
      .then(syncOffset)
      .then(function () {
        if (store.err) { var e = store.err; store.err = null; save(); return db("POST", "diag/" + game, { u: store.uid, w: e.w, m: e.m, t: TS, ct: e.t }).catch(function () {}); }
      })
      .then(function () { ready = true; push("session_start", { novo: first ? 1 : 0 }); flush(); })
      .catch(function (e) { ready = false; sid = null; logErr("start", e); });
  }

  function beat(final) {
    if (!sid || !ready) return Promise.resolve();
    var t = now(), delta = Math.max(0, Math.round((t - lastBeat) / 1000));
    if (delta > 120) delta = 120; // nunca soma tempo de tela desligada
    lastBeat = t;
    var dur = Math.round((t - sStart) / 1000);
    var ka = !!final, mySid = sid, uid = store.uid;
    return auth().then(function () {
      var ps = [
        db("PATCH", "sessions/" + game + "/" + mySid, { u: uid, l: TS, d: dur }, ka),
        db("PATCH", "players/" + game + "/" + uid, { last: TS, secs: inc(delta) }, ka)
      ];
      ps.push(final ? db("DELETE", "online/" + game + "/" + uid, undefined, ka)
                    : db("PUT", "online/" + game + "/" + uid, { sid: mySid, l: TS, v: gameVersion }, ka));
      return Promise.all(ps);
    }).then(flush).catch(function (e) { logErr("beat", e); });
  }

  function endSession() {
    if (!sid) return;
    push("session_end", { seg: Math.round((now() - sStart) / 1000) });
    flush(true); beat(true);
    sid = null; ready = false;
    clearInterval(beatTimer); beatTimer = null;
  }

  // ---------- eventos ----------
  function clean(p) {
    var o = {}, n = 0;
    if (!p || typeof p !== "object") return o;
    for (var k in p) {
      if (n >= 8) break;
      var v = p[k], kk = String(k).replace(/[.#$\[\]\/]/g, "_").slice(0, 24);
      if (typeof v === "number" && isFinite(v)) o[kk] = v;
      else if (typeof v === "boolean") o[kk] = v ? 1 : 0;
      else if (v != null) o[kk] = String(v).slice(0, 60);
      n++;
    }
    return o;
  }
  function push(name, params) {
    if (sentEvents >= MAX_EVENTS_SESSION) return;
    sentEvents++;
    queue.push({ n: String(name).replace(/[^\w\-]/g, "_").slice(0, 40), p: clean(params), ct: now() });
    if (queue.length > MAX_QUEUE) queue.shift();
  }
  function flush(final) {
    if (busy || !ready || !queue.length || !sid) return Promise.resolve();
    busy = true;
    var batch = queue.splice(0, 50), body = {};
    batch.forEach(function (e) { body[rid()] = { u: store.uid, s: sid, n: e.n, p: e.p, t: TS, ct: e.ct }; });
    return auth().then(function () { return db("PATCH", "events/" + game, body, !!final); })
      .catch(function (e) { queue = batch.concat(queue).slice(0, MAX_QUEUE); logErr("events", e); })
      .then(function () { busy = false; if (queue.length && !final) flush(); });
  }

  // ---------- ciclo de vida ----------
  function onVis() {
    if (document.hidden) { hiddenAt = now(); beat(); flush(); }
    else {
      if (!sid || (hiddenAt && now() - hiddenAt > NEW_SESSION_AFTER)) { if (sid) endSession(); begin(); }
      else { lastBeat = now(); beat(); }
      hiddenAt = 0;
    }
  }
  function begin() {
    if (beatTimer) clearInterval(beatTimer);
    startSession();
    beatTimer = setInterval(function () { if (!document.hidden) beat(); }, HEARTBEAT);
  }

  function autoClicks() {
    var last = 0;
    document.addEventListener("click", function (ev) {
      var el = ev.target && ev.target.closest && ev.target.closest("button,[role=button],.btn,a");
      if (!el || now() - last < 800) return;
      last = now();
      var label = (el.getAttribute("data-la") || el.getAttribute("aria-label") || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40);
      if (label) push("ui", { botao: label });
    }, true);
  }

  w.LumbraAnalytics = {
    init: function (o) {
      try {
        if (ready || sid || !o || !o.config || !o.config.apiKey || !o.config.databaseURL || !o.game) return;
        cfg = o.config; game = String(o.game).toUpperCase().replace(/[^A-Z0-9_]/g, "_");
        gameVersion = String(o.version || "").slice(0, 20);
        key = "lumbra_an_" + game; store = load();
        if (store.optout) return;
        document.addEventListener("visibilitychange", onVis);
        w.addEventListener("pagehide", function () { endSession(); });
        w.addEventListener("online", function () { if (!ready) { if (sid) sid = null; begin(); } });
        if (o.autoClicks !== false) autoClicks();
        begin();
      } catch (e) { try { logErr("init", e); } catch (_) {} }
    },
    event: function (name, params) { try { push(name, params); if (queue.length >= 20) flush(); } catch (e) {} },
    optOut: function () { try { endSession(); store.optout = 1; save(); } catch (e) {} },
    get id() { return store && store.uid || null; }
  };
})(window);
