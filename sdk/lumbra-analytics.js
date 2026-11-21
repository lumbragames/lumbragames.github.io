/*!
 * Lumbra Analytics — coleta anônima de uso dos jogos da Lumbra Games.
 * Uso:  LumbraAnalytics.init({ game: "PRANCHETA", version: "3.0", config: {apiKey, databaseURL} })
 *       LumbraAnalytics.event("match_start", { liga: "A" })
 * Não coleta nome, e-mail, localização precisa ou qualquer dado pessoal.
 */
(function (w) {
  "use strict";
  if (w.LumbraAnalytics) return;

  var VER = "1.1";
  var HEARTBEAT = 30000;          // sinal de presença a cada 30 s
  var NEW_SESSION_AFTER = 300000; // 5 min em segundo plano = nova sessão
  var MAX_EVENTS_SESSION = 300;
  var MAX_QUEUE = 300;

  var cfg, game, gameVersion, store, key, sid, sStart, lastBeat = 0, beatTimer = null,
      hiddenAt = 0, sentEvents = 0, queue = [], busy = false, ready = false, serverOffset = 0,
      remote = null, remoteCbs = [], beats = 0, shownThisSession = {};

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
      .then(function () { ready = true; push("session_start", { novo: first ? 1 : 0 }); flush(); shownThisSession = {}; fetchRemote(); })
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
    }).then(function () { if (!final && ++beats % 10 === 0) fetchRemote(); return flush(); }).catch(function (e) { logErr("beat", e); });
  }

  function endSession() {
    if (!sid) return;
    push("session_end", { seg: Math.round((now() - sStart) / 1000) });
    flush(true); beat(true);
    sid = null; ready = false;
    clearInterval(beatTimer); beatTimer = null;
  }


  // ---------- controle remoto (avisos, eventos e versão mínima vindos do Lumbra Control) ----------
  function vnum(v) { var m = String(v || "").match(/(\d+)(?!.*\d)/); return m ? +m[1] : 0; }
  function sNow() { return now() + serverOffset; }
  function inWindow(o) { var t = sNow(); return o && o.on && (!o.from || t >= o.from) && (!o.to || t <= o.to); }
  function verOk(o) { var v = vnum(gameVersion); return (!o.minV || v >= o.minV) && (!o.maxV || v <= o.maxV); }
  function openUrl(u) {
    if (!u) return;
    try { if (w.PranchetaNative && w.PranchetaNative.openUrl) { w.PranchetaNative.openUrl(u); return; } } catch (e) {}
    try { w.open(u, "_blank"); } catch (e) {}
  }
  function fetchRemote() {
    if (!store || !store.tok) return;
    auth().then(function () { return db("GET", "remote/" + game); })
      .then(function (r) { return r.json(); })
      .then(function (j) { remote = j || {}; applyRemote(); remoteCbs.forEach(function (cb) { try { cb(remote); } catch (e) {} }); })
      .catch(function () {});
  }
  var css = false;
  function styles() {
    if (css) return; css = true;
    var st = document.createElement("style");
    st.textContent =
      ".lbx-bg{position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.62);display:flex;align-items:center;justify-content:center;padding:22px;font-family:system-ui,-apple-system,Roboto,sans-serif;animation:lbxf .25s}" +
      ".lbx{width:100%;max-width:380px;border-radius:20px;background:#14111d;color:#f3f1f8;border:1px solid rgba(255,255,255,.14);box-shadow:0 30px 80px rgba(0,0,0,.6);overflow:hidden;animation:lbxu .3s cubic-bezier(.2,.8,.2,1)}" +
      ".lbx-top{padding:16px 18px 0;display:flex;align-items:center;gap:8px;font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}" +
      ".lbx-top i{width:8px;height:8px;border-radius:50%;background:currentColor}" +
      ".lbx h4{margin:8px 18px 0;font-size:20px;line-height:1.2}" +
      ".lbx p{margin:8px 18px 0;font-size:14.5px;line-height:1.45;color:#d6d2e2;white-space:pre-wrap}" +
      ".lbx-b{display:flex;gap:8px;padding:16px 18px 18px}" +
      ".lbx-b button{flex:1;padding:12px;border-radius:12px;font-size:14px;font-weight:800;border:0;cursor:pointer}" +
      ".lbx-ok{background:linear-gradient(135deg,#ffb347,#ff6a3d);color:#1b0d03}" +
      ".lbx-no{background:transparent;color:#d6d2e2;border:1px solid rgba(255,255,255,.18)!important}" +
      ".lbx-pill{position:fixed;left:50%;top:calc(10px + env(safe-area-inset-top));transform:translateX(-50%);z-index:2147482999;max-width:92vw;display:flex;align-items:center;gap:8px;padding:10px 14px;border-radius:99px;background:#14111d;color:#f3f1f8;border:1px solid rgba(255,255,255,.18);box-shadow:0 10px 30px rgba(0,0,0,.5);font:700 13px system-ui,-apple-system,Roboto,sans-serif;cursor:pointer;animation:lbxd .4s cubic-bezier(.2,.8,.2,1)}" +
      ".lbx-pill i{width:8px;height:8px;border-radius:50%;flex:none}" +
      "@keyframes lbxf{from{opacity:0}}@keyframes lbxu{from{opacity:0;transform:translateY(24px)}}@keyframes lbxd{from{opacity:0;transform:translate(-50%,-20px)}}";
    document.head.appendChild(st);
  }
  var KIND = { info: ["Aviso", "#4cc9f0"], novidade: ["Novidade", "#3ddc84"], evento: ["Evento", "#ffb347"], alerta: ["Importante", "#ff5470"], update: ["Atualização", "#8b5cf6"] };
  var boxOpen = false;
  function box(kind, title, text, okLabel, onOk, noLabel, onClose) {
    if (boxOpen || !document.body) return false;
    styles(); boxOpen = true;
    var k = KIND[kind] || KIND.info, bg = document.createElement("div"); bg.className = "lbx-bg";
    var b = document.createElement("div"); b.className = "lbx";
    var top = document.createElement("div"); top.className = "lbx-top"; top.style.color = k[1]; top.innerHTML = "<i></i>"; top.appendChild(document.createTextNode(k[0]));
    var h = document.createElement("h4"); h.textContent = title || "";
    var p = document.createElement("p"); p.textContent = text || "";
    var row = document.createElement("div"); row.className = "lbx-b";
    function close(cb) { boxOpen = false; try { bg.remove(); } catch (e) {} if (cb) cb(); }
    if (noLabel) { var n = document.createElement("button"); n.className = "lbx-no"; n.textContent = noLabel; n.onclick = function () { close(onClose); }; row.appendChild(n); }
    var o = document.createElement("button"); o.className = "lbx-ok"; o.textContent = okLabel || "OK"; o.onclick = function () { close(onOk); }; row.appendChild(o);
    b.appendChild(top); if (title) b.appendChild(h); if (text) b.appendChild(p); b.appendChild(row); bg.appendChild(b);
    document.body.appendChild(bg);
    return true;
  }
  function seen(id) { return store.seen && store.seen[id]; }
  function markSeen(id) { store.seen = store.seen || {}; store.seen[id] = 1; var ks = Object.keys(store.seen); if (ks.length > 40) delete store.seen[ks[0]]; save(); }
  function applyRemote() {
    if (!remote || !document.body) return;
    var u = remote.update, n = remote.notice, ev = remote.event;
    // 1) versão mínima
    if (u && u.on && u.min && vnum(gameVersion) && vnum(gameVersion) < u.min && !shownThisSession.up) {
      shownThisSession.up = 1;
      push("update_visto", { min: u.min });
      var again = function () { setTimeout(function () { shownThisSession.up = 0; applyRemote(); }, 400); };
      if (box("update", u.title || "Nova versão disponível", u.text || "Baixe a versão mais recente para continuar com tudo funcionando.", "Atualizar agora",
        function () { push("update_clique", { min: u.min }); flush(); openUrl(u.url); if (u.block) again(); },
        u.block ? null : "Depois", null)) return;
    }
    if (u && u.on && u.block && vnum(gameVersion) && vnum(gameVersion) < u.min) return;
    // 2) aviso
    if (inWindow(n) && verOk(n) && n.id && !shownThisSession["n" + n.id] && !(n.freq !== "sessao" && seen("n" + n.id))) {
      shownThisSession["n" + n.id] = 1;
      if (box(n.kind || "info", n.title, n.text, n.url ? (n.btn || "Ver agora") : (n.btn || "OK"),
        function () { markSeen("n" + n.id); push("aviso_clique", { id: n.id }); flush(); if (n.url) openUrl(n.url); },
        n.url ? "Fechar" : null, function () { markSeen("n" + n.id); push("aviso_fechar", { id: n.id }); flush(); })) {
        push("aviso_visto", { id: n.id }); flush(); return;
      }
    }
    // 3) evento especial: faixa no topo por alguns segundos, uma vez por sessão
    if (inWindow(ev) && ev.id && !shownThisSession["e" + ev.id]) {
      shownThisSession["e" + ev.id] = 1; styles();
      var pill = document.createElement("div"); pill.className = "lbx-pill";
      var dot = document.createElement("i"); dot.style.background = ev.color || "#ffb347";
      pill.appendChild(dot); pill.appendChild(document.createTextNode((ev.emoji ? ev.emoji + " " : "") + (ev.name || "Evento especial")));
      var gone = function () { try { pill.remove(); } catch (e) {} };
      pill.onclick = function () { gone(); push("evento_clique", { id: ev.id }); flush(); if (ev.text) box("evento", ev.name, ev.text + (ev.to ? "\n\nAté " + new Date(ev.to).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) + "." : ""), "Bora!", null, null, null); };
      document.body.appendChild(pill); setTimeout(gone, 7000);
      push("evento_visto", { id: ev.id }); flush();
    }
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
    get id() { return store && store.uid || null; },
    // configuração remota publicada no Lumbra Control (avisos, evento ativo, versão mínima)
    get remote() { return remote; },
    onRemote: function (cb) { if (typeof cb === "function") { remoteCbs.push(cb); if (remote) try { cb(remote); } catch (e) {} } },
    eventActive: function () { return remote && inWindow(remote.event) ? remote.event : null; }
  };
})(window);
