// Lumbra Control — painel administrativo da Lumbra Games
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getDatabase, ref, get, set, update, remove, onValue, query, orderByChild, startAt, limitToLast, equalTo } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const DAY = 864e5, ONLINE_WINDOW = 75e3;
const nf = new Intl.NumberFormat("pt-BR");
const fmt = n => nf.format(Math.round(n));
const pct = n => (n == null || !isFinite(n)) ? "—" : (Math.round(n * 10) / 10).toString().replace(".", ",") + "%";
const dur = s => { s = Math.round(s || 0); if (s < 60) return s + " s"; const m = Math.floor(s / 60); if (m < 60) return m + " min" + (s % 60 ? " " + (s % 60) + " s" : ""); return Math.floor(m / 60) + " h " + (m % 60) + " min"; };
const dkey = t => { const d = new Date(t); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
const dlabel = k => k.slice(8, 10) + "/" + k.slice(5, 7);
const sod = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const ago = t => { if (!t) return "nunca"; const s = (Date.now() - t) / 1000; if (s < 60) return "agora há pouco"; if (s < 3600) return "há " + Math.round(s / 60) + " min"; if (s < 86400) return "há " + Math.round(s / 3600) + " h"; return "há " + Math.round(s / 86400) + " dias"; };

const TAG = {
  real: '<span class="tag t-real" title="Dado real, medido diretamente">Real</span>',
  est: '<span class="tag t-est" title="Estimativa baseada em sinais indiretos">Estimado</span>',
  na: '<span class="tag t-na" title="Esta fonte de dados não existe para este jogo">Indisponível</span>',
  none: '<span class="tag t-none" title="A coleta está ligada, mas ainda não chegaram dados">Sem dados ainda</span>',
  off: '<span class="tag t-off" title="O jogo ainda não envia dados">Não conectado</span>'
};

const ICONS = {
  home: '<path d="M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-6h-6v6H4a1 1 0 01-1-1z"/>',
  games: '<rect x="2" y="7" width="20" height="12" rx="4"/><path d="M7 11v4M5 13h4M15 12h.01M18 14h.01"/>',
  live: '<circle cx="12" cy="12" r="3"/><path d="M5.6 5.6a9 9 0 000 12.8M18.4 5.6a9 9 0 010 12.8M8.5 8.5a5 5 0 000 7M15.5 8.5a5 5 0 010 7"/>',
  ret: '<path d="M3 12a9 9 0 109-9"/><path d="M3 4v5h5M12 7v5l3 2"/>',
  aud: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18"/>',
  rep: '<path d="M6 3h9l5 5v13H6z"/><path d="M14 3v6h6M9 13h8M9 17h6"/>',
  ctrl: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  players: '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0114 0M16 4a4 4 0 010 8M22 21a7 7 0 00-4-6.3"/>',
  alert: '<path d="M18 16V11a6 6 0 10-12 0v5l-2 2h16zM10 20a2 2 0 004 0"/>',
  cfg: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-2.7 1.1V21a2 2 0 11-4 0v-.1a1.6 1.6 0 00-2.7-1.1l-.1.1a2 2 0 11-2.8-2.8l.1-.1A1.6 1.6 0 003 15H3a2 2 0 110-4h.1a1.6 1.6 0 001.1-2.7l-.1-.1a2 2 0 112.8-2.8l.1.1A1.6 1.6 0 009 4.6V4a2 2 0 114 0v.1a1.6 1.6 0 002.7 1.1l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 001.1 2.7H21a2 2 0 110 4h-.1a1.6 1.6 0 00-1.5 1z"/>'
};
const PAGES = [
  ["home", "Visão geral", "home"], ["games", "Jogos", "games"], ["live", "Ao vivo", "live"], ["ctrl", "Controle", "ctrl"], ["players", "Jogadores", "players"], ["ret", "Retenção", "ret"],
  ["aud", "Público", "aud"], ["rep", "Relatórios", "rep"], ["alert", "Alertas", "alert"], ["cfg", "Ajustes", "cfg"]
];

// ---------------- estado ----------------
const S = { period: "30", page: "home", gameId: null, games: {}, remote: {}, rlog: {}, pf: { g: "", q: "", sort: "last" }, players: {}, sessions: {}, online: {}, diag: {}, dl: {}, dlSnap: {}, events: {},
  offset: 0, loadedAt: 0, ghError: null, charts: [] };
let app, auth, db, user;

function toast(m) { const t = $("#toast"); t.textContent = m; t.classList.add("on"); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("on"), 2600); }
function show(id) { ["boot", "login", "noperm", "nocfg", "app"].forEach(x => $("#" + x).classList.toggle("hide", x !== id)); }
const serverNow = () => Date.now() + S.offset;

// ---------------- boot ----------------
const cfg = window.LUMBRA_FIREBASE;
if (!cfg || !cfg.apiKey || String(cfg.apiKey).startsWith("COLE")) { show("nocfg"); }
else {
  app = initializeApp(cfg); auth = getAuth(app); db = getDatabase(app);
  onValue(ref(db, ".info/serverTimeOffset"), s => { S.offset = s.val() || 0; });
  onAuthStateChanged(auth, async u => {
    user = u;
    if (!u || u.isAnonymous) { show("login"); return; }
    show("boot"); $("#bootMsg").textContent = "Verificando acesso…";
    try { await get(ref(db, "games")); }
    catch (e) { $("#myUid").textContent = u.uid; show("noperm"); return; }
    buildNav(); show("app"); await loadAll(); route();
  });
}

$("#loginForm").addEventListener("submit", async e => {
  e.preventDefault(); $("#loginErr").textContent = ""; $("#loginBtn").disabled = true;
  try { await signInWithEmailAndPassword(auth, $("#email").value.trim(), $("#pass").value); }
  catch (err) {
    const c = err.code || "";
    $("#loginErr").textContent = c.includes("invalid") || c.includes("wrong") || c.includes("not-found") ? "E-mail ou senha incorretos." :
      c.includes("too-many") ? "Muitas tentativas. Aguarde alguns minutos." : c.includes("network") ? "Sem conexão com a internet." : "Não foi possível entrar (" + c + ").";
  }
  $("#loginBtn").disabled = false;
});
$("#logout").onclick = $("#logout2").onclick = () => signOut(auth);
$("#copyUid").onclick = () => { navigator.clipboard.writeText($("#myUid").textContent).then(() => toast("Código copiado")); };
$("#period").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; S.period = b.dataset.p; [...$("#period").children].forEach(x => x.classList.toggle("on", x === b)); render(); });
$("#refresh").onclick = async () => { $("#refresh").classList.add("spin"); await loadAll(); render(); $("#refresh").classList.remove("spin"); toast("Dados atualizados"); };
window.addEventListener("hashchange", route);

function buildNav() {
  const h = PAGES.map(([id, label, ic]) => `<a data-p="${id}" href="#/${id}"><svg viewBox="0 0 24 24">${ICONS[ic]}</svg><span>${label}</span></a>`).join("");
  $("#nav").innerHTML = h; $("#tabbar").innerHTML = h;
}
function route() {
  const parts = (location.hash.replace(/^#\/?/, "") || "home").split("/");
  S.page = PAGES.some(p => p[0] === parts[0]) ? parts[0] : "home";
  S.gameId = S.page === "games" && parts[1] ? decodeURIComponent(parts[1]) : null;
  document.querySelectorAll("#nav a,#tabbar a").forEach(a => a.classList.toggle("on", a.dataset.p === S.page));
  render(); window.scrollTo(0, 0);
}

// ---------------- dados ----------------
async function loadAll() {
  const safe = p => get(ref(db, p)).then(s => s.val() || {}).catch(e => { console.warn(p, e); return {}; });
  const [games, players, online, dlSnap, remote, rlog] = await Promise.all([safe("games"), safe("players"), safe("online"), safe("admin/dl"), safe("remote"), safe("admin/rlog")]);
  S.games = games; S.players = players; S.online = online; S.dlSnap = dlSnap; S.remote = remote; S.rlog = rlog;
  S.sessions = {}; S.diag = {};
  await Promise.all(Object.keys(games).map(async g => {
    S.sessions[g] = await get(ref(db, "sessions/" + g)).then(s => s.val() || {}).catch(() => ({}));
    S.diag[g] = await get(query(ref(db, "diag/" + g), orderByChild("t"), limitToLast(100))).then(s => s.val() || {}).catch(() => ({}));
  }));
  await loadDownloads();
  S.loadedAt = Date.now();
  $("#syncInfo").textContent = "Atualizado " + new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (!S.liveSub) {
    S.liveSub = onValue(ref(db, "online"), s => { S.online = s.val() || {}; if (S.page === "live" || S.page === "home" || S.page === "games") updateLive(); });
    setInterval(() => updateLive(), 10000);
  }
}

async function loadDownloads() {
  S.dl = {}; S.ghError = null;
  const today = dkey(Date.now());
  for (const [g, info] of Object.entries(S.games)) {
    const src = (info.downloads || "").split("\n").map(x => x.trim()).filter(Boolean);
    if (!src.length) { S.dl[g] = null; continue; }
    let total = 0, ok = true;
    for (const line of src) {
      const [repo, asset] = line.split("|").map(x => (x || "").trim());
      try {
        const r = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=100`, { headers: { Accept: "application/vnd.github+json" } });
        if (!r.ok) throw new Error("GitHub " + r.status);
        const rel = await r.json();
        rel.forEach(x => (x.assets || []).forEach(a => { if (!asset || a.name === asset) total += a.download_count || 0; }));
      } catch (e) { ok = false; S.ghError = (S.ghError ? S.ghError + "; " : "") + g + ": " + e.message; }
    }
    S.dl[g] = ok ? total : null;
    if (ok && (S.dlSnap[today]?.[g] !== total)) {
      S.dlSnap[today] = { ...(S.dlSnap[today] || {}), [g]: total };
      set(ref(db, `admin/dl/${today}/${g}`), total).catch(() => {});
    }
  }
}

// ---------------- cálculos ----------------
function range() {
  const end = serverNow();
  if (S.period === "all") {
    let min = end;
    Object.values(S.players).forEach(gp => Object.values(gp).forEach(p => { if (p.first && p.first < min) min = p.first; }));
    return { start: sod(Math.min(min, end - 6 * DAY)), end, days: Math.ceil((end - sod(Math.min(min, end - 6 * DAY))) / DAY), all: true };
  }
  const days = +S.period;
  return { start: days === 1 ? end - DAY : sod(end - (days - 1) * DAY), end, days, hourly: days === 1 };
}
const gameIds = only => only ? [only] : Object.keys(S.games);
function sessList(only) { const out = []; gameIds(only).forEach(g => Object.values(S.sessions[g] || {}).forEach(s => out.push({ ...s, g }))); return out; }
function playList(only) { const out = []; gameIds(only).forEach(g => Object.entries(S.players[g] || {}).forEach(([u, p]) => out.push({ ...p, u, g }))); return out; }
function hasData(only) { return gameIds(only).some(g => Object.keys(S.players[g] || {}).length); }

function metrics(only, rg = range()) {
  const ss = sessList(only), ps = playList(only), now = serverNow();
  const inR = ss.filter(s => s.l >= rg.start && s.s <= rg.end);
  const act = (from) => new Set(ss.filter(s => s.l >= from).map(s => s.g + ":" + s.u)).size;
  const activeR = new Set(inR.map(s => s.g + ":" + s.u));
  const newR = ps.filter(p => p.first >= rg.start && p.first <= rg.end);
  const newSet = new Set(newR.map(p => p.g + ":" + p.u));
  const returning = [...activeR].filter(k => !newSet.has(k)).length;
  const durs = inR.map(s => s.d || 0).filter(d => d > 0);
  const avgS = durs.length ? durs.reduce((a, b) => a + b, 0) / durs.length : null;
  const totalT = durs.reduce((a, b) => a + b, 0);
  const onlineN = gameIds(only).reduce((n, g) => n + Object.values(S.online[g] || {}).filter(o => now - o.l < ONLINE_WINDOW).length, 0);
  let dl = null, dlKnown = false;
  gameIds(only).forEach(g => { if (S.dl[g] != null) { dl = (dl || 0) + S.dl[g]; dlKnown = true; } });
  return {
    players: ps.length, today: act(sod(now)), d7: act(now - 7 * DAY), d30: act(now - 30 * DAY), active: activeR.size,
    newP: newR.length, returning, sessions: inR.length, avgS, avgPlayer: activeR.size ? totalT / activeR.size : null, totalT,
    online: onlineN, dl, dlKnown, connected: hasData(only)
  };
}
function prevRange(rg) { const len = rg.end - rg.start; return { start: rg.start - len, end: rg.start, days: rg.days, hourly: rg.hourly }; }

function buckets(rg) {
  const out = [];
  if (rg.hourly) { const s = Math.floor(rg.start / 36e5) * 36e5; for (let t = s; t <= rg.end; t += 36e5) out.push({ k: t, label: new Date(t).getHours() + "h", a: t, b: t + 36e5 }); }
  else { for (let t = sod(rg.start); t <= rg.end; t += DAY) { const a = sod(t + 2 * 36e5); out.push({ k: dkey(a), label: dlabel(dkey(a)), a, b: a + DAY }); } }
  return out;
}
function series(only, rg = range()) {
  const bs = buckets(rg), ss = sessList(only), ps = playList(only);
  const act = bs.map(b => new Set(ss.filter(s => s.l >= b.a && s.s < b.b).map(s => s.g + s.u)).size);
  const nw = bs.map(b => ps.filter(p => p.first >= b.a && p.first < b.b).length);
  const before = ps.filter(p => p.first < bs[0].a).length;
  let acc = before; const cum = nw.map(n => (acc += n));
  const avg = bs.map(b => { const d = ss.filter(s => s.s >= b.a && s.s < b.b && s.d > 0).map(s => s.d); return d.length ? Math.round(d.reduce((x, y) => x + y, 0) / d.length / 6) / 10 : null; });
  const sess = bs.map(b => ss.filter(s => s.s >= b.a && s.s < b.b).length);
  return { labels: bs.map(b => b.label), keys: bs.map(b => b.k), act, nw, cum, avg, sess };
}
function retention(only) {
  const ss = sessList(only), ps = playList(only), now = serverNow(), out = {};
  const byU = {}; ss.forEach(s => { (byU[s.g + ":" + s.u] ||= []).push(s.s); });
  [1, 7, 14, 30].forEach(n => {
    const cohort = ps.filter(p => p.first && sod(p.first) + (n + 1) * DAY <= now);
    let back = 0;
    cohort.forEach(p => { const a = sod(p.first) + n * DAY, b = a + DAY; if ((byU[p.g + ":" + p.u] || []).some(t => t >= a && t < b)) back++; });
    out[n] = { cohort: cohort.length, back, rate: cohort.length ? back / cohort.length * 100 : null };
  });
  return out;
}

// ---------------- visual ----------------
function killCharts() { S.charts.forEach(c => c.destroy()); S.charts = []; }
const C_AMBER = "#ffb347", C_EMBER = "#ff6a3d", C_VIOLET = "#8b5cf6", C_GREEN = "#3ddc84", C_BLUE = "#4cc9f0";
function chart(id, type, labels, sets, opt = {}) {
  const el = document.getElementById(id); if (!el || !window.Chart) return;
  const ctx = el.getContext("2d");
  const ds = sets.map((s, i) => {
    const col = s.color || [C_AMBER, C_VIOLET, C_GREEN, C_BLUE][i % 4];
    let bg = col + "33";
    if (type === "line") { const g = ctx.createLinearGradient(0, 0, 0, el.parentNode.clientHeight || 220); g.addColorStop(0, col + "55"); g.addColorStop(1, col + "00"); bg = g; }
    return { label: s.label, data: s.data, borderColor: col, backgroundColor: type === "bar" ? col + "cc" : bg, fill: type === "line" && !s.nofill, tension: .35,
      borderWidth: 2, pointRadius: labels.length > 31 ? 0 : 2.5, pointHoverRadius: 5, borderRadius: 6, maxBarThickness: 34, spanGaps: true, borderDash: s.dash || [] };
  });
  S.charts.push(new Chart(el, {
    type, data: { labels, datasets: ds },
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: 700 }, interaction: { mode: "index", intersect: false },
      plugins: { legend: { display: sets.length > 1, labels: { color: "#9a95ab", boxWidth: 10, boxHeight: 10, usePointStyle: true, font: { size: 11 } } },
        tooltip: { backgroundColor: "#181522", borderColor: "rgba(255,255,255,.14)", borderWidth: 1, titleColor: "#f3f1f8", bodyColor: "#d6d2e2", padding: 10, callbacks: opt.tip ? { label: opt.tip } : {} } },
      scales: { x: { grid: { display: false }, ticks: { color: "#6d6880", maxRotation: 0, autoSkip: true, maxTicksLimit: 7, font: { size: 10 } } },
        y: { beginAtZero: true, grid: { color: "rgba(255,255,255,.05)" }, ticks: { color: "#6d6880", precision: 0, font: { size: 10 } }, ...(opt.ymax ? { max: opt.ymax } : {}) } }
    }
  }));
}
function kpi(label, value, tag, help, delta) {
  const v = value == null ? `<div class="v na">${tag === TAG.na ? "Indisponível" : tag === TAG.off ? "Não conectado" : "Sem dados ainda"}</div>` : `<div class="v">${value}</div>`;
  const v2 = value != null && String(value).replace(/<[^>]+>/g, "").length > 7 ? v.replace('class="v"', 'class="v long"') : v;
  return `<div class="card kpi"><div class="l"><span>${label}</span><button class="info" data-help="${esc(help)}" data-t="${esc(label)}">?</button></div>${v2}<div style="margin-top:6px">${tag}</div>${delta || ""}</div>`;
}
function deltaHtml(cur, prev) {
  if (cur == null || prev == null) return "";
  if (prev === 0) return cur > 0 ? `<div class="d up">▲ novo no período</div>` : "";
  const d = (cur - prev) / prev * 100;
  return `<div class="d ${d >= 0 ? "up" : "down"}">${d >= 0 ? "▲" : "▼"} ${pct(Math.abs(d))} vs período anterior</div>`;
}
function emptyBox(t, s) { return `<div class="empty"><div><b>${t}</b>${s || ""}</div></div>`; }
document.addEventListener("click", e => { const b = e.target.closest(".info"); if (b) modal(`<h3>${esc(b.dataset.t)}</h3><p class="muted">${esc(b.dataset.help)}</p><button class="ghost" data-close>Entendi</button>`); });
function modal(html) { $("#mbox").innerHTML = html; $("#modal").classList.remove("hide"); }
$("#modal").addEventListener("click", e => { if (e.target.id === "modal" || e.target.closest("[data-close]")) $("#modal").classList.add("hide"); });
const pname = () => ({ "1": "últimas 24 horas", "7": "últimos 7 dias", "30": "últimos 30 dias", "90": "últimos 90 dias", "all": "todo o período" })[S.period];
const gcolor = g => S.games[g]?.color || C_AMBER;

const HELP = {
  dl: "Soma de downloads do arquivo APK registrados pelo GitHub em todas as versões publicadas. Conta downloads, não instalações: a mesma pessoa pode baixar mais de uma vez.",
  players: "Quantidade de jogadores diferentes que já abriram o jogo com a coleta ligada. Cada aparelho recebe um código anônimo; se o jogador apagar os dados do app, ele passa a contar como novo.",
  today: "Jogadores diferentes que jogaram desde a meia-noite de hoje.",
  d7: "Jogadores diferentes que jogaram nos últimos 7 dias.",
  d30: "Jogadores diferentes que jogaram nos últimos 30 dias.",
  newP: "Jogadores que abriram o jogo pela primeira vez dentro do período escolhido.",
  ret: "Jogadores ativos no período que já tinham jogado antes do período começar.",
  avgS: "Duração média de cada sessão de jogo no período. A medição é feita por sinais a cada 30 segundos, então a precisão é de cerca de 30 s.",
  avgP: "Tempo total jogado no período dividido pelo número de jogadores ativos.",
  online: "Jogadores com o jogo aberto agora. O jogo envia um sinal a cada 30 segundos; quem não envia sinal há mais de 75 segundos deixa de contar. Por isso é uma estimativa muito próxima do real, com atraso de até 75 s.",
  sessions: "Quantidade de vezes que o jogo foi aberto (ou voltou após 5 minutos em segundo plano) no período."
};

// ---------------- páginas ----------------
function render() {
  if (!user) return;
  killCharts();
  const P = { home: pHome, games: S.gameId ? pGame : pGames, live: pLive, ctrl: pCtrl, players: pPlayers, ret: pRet, aud: pAud, rep: pRep, alert: pAlert, cfg: pCfg }[S.page];
  const name = PAGES.find(p => p[0] === S.page)[1];
  $("#crumb").textContent = S.gameId ? "Jogos" : "Lumbra Control";
  $("#title").textContent = S.gameId ? (S.games[S.gameId]?.name || S.gameId) : name;
  $("#period").style.visibility = ["live", "cfg", "alert", "ctrl"].includes(S.page) ? "hidden" : "visible";
  $("#view").innerHTML = P();
  (P.after || (() => {}))();
  const al = computeAlerts().filter(a => a.level === "bad" || a.level === "warn").length;
  document.querySelectorAll('[data-p="alert"]').forEach(a => { a.querySelector(".dot")?.remove(); if (al) a.insertAdjacentHTML("afterbegin", '<span class="dot"></span>'); });
}

function kpiBlock(only) {
  const rg = range(), m = metrics(only, rg), pm = metrics(only, prevRange(rg));
  const conn = m.connected, T = conn ? TAG.real : (Object.keys(S.games).length ? TAG.off : TAG.none);
  const v = (x, f = fmt) => conn ? f(x) : null;
  return `<div class="grid4">
    ${kpi("Downloads (APK)", m.dlKnown ? fmt(m.dl) : null, m.dlKnown ? TAG.real : TAG.na, HELP.dl)}
    ${kpi("Jogadores registrados", v(m.players), T, HELP.players)}
    ${kpi("Online agora", conn ? `<span class="live"></span> <span data-online="${only || ""}">${fmt(m.online)}</span>` : null, conn ? TAG.est : T, HELP.online)}
    ${kpi("Ativos hoje", v(m.today), T, HELP.today)}
    ${kpi("Ativos em 7 dias", v(m.d7), T, HELP.d7)}
    ${kpi("Ativos em 30 dias", v(m.d30), T, HELP.d30)}
    ${kpi("Novos jogadores", v(m.newP), T, HELP.newP + " (" + pname() + ")", conn ? deltaHtml(m.newP, pm.newP) : "")}
    ${kpi("Jogadores que voltaram", v(m.returning), T, HELP.ret + " (" + pname() + ")", conn ? deltaHtml(m.returning, pm.returning) : "")}
    ${kpi("Sessões", v(m.sessions), T, HELP.sessions, conn ? deltaHtml(m.sessions, pm.sessions) : "")}
    ${kpi("Tempo médio por sessão", conn && m.avgS != null ? dur(m.avgS) : null, conn ? (m.avgS != null ? TAG.real : TAG.none) : T, HELP.avgS)}
    ${kpi("Tempo por jogador", conn && m.avgPlayer != null ? dur(m.avgPlayer) : null, conn ? (m.avgPlayer != null ? TAG.real : TAG.none) : T, HELP.avgP)}
    ${kpi("Tempo total jogado", conn ? dur(m.totalT) : null, T, "Soma do tempo de todas as sessões no período.")}
  </div>`;
}

function chartsBlock(only) {
  const conn = hasData(only);
  const box = (id, t, tag, extra = "") => `<div class="card"><h3><b>${t}</b>${tag}</h3><div class="chart">${conn ? `<canvas id="${id}"></canvas>` : emptyBox("Sem dados ainda", "Os gráficos aparecem quando os primeiros jogadores abrirem o jogo com a coleta ligada.")}</div>${extra}</div>`;
  return `<div class="grid2">
    ${box("cAct", "Jogadores ativos e novos", TAG.real)}
    ${box("cCum", "Crescimento de jogadores", TAG.real)}
    ${box("cAvg", "Tempo médio por sessão (min)", TAG.real)}
    ${dlChartBox(only)}
  </div>`;
}
function dlChartBox(only) {
  const ids = gameIds(only).filter(g => S.dl[g] != null);
  const days = Object.keys(S.dlSnap).sort();
  const ok = ids.length && days.length;
  return `<div class="card"><h3><b>Evolução dos downloads</b>${ids.length ? TAG.real : TAG.na}</h3><div class="chart">${ok ? '<canvas id="cDl"></canvas>' : emptyBox(ids.length ? "Histórico começando" : "Sem fonte de downloads", ids.length ? "" : "Cadastre a fonte de downloads do jogo em Ajustes.")}</div>
  <p class="note">O GitHub só informa o total acumulado. O painel guarda um registro por dia sempre que é aberto, então o histórico começa no primeiro dia de uso do painel.</p></div>`;
}
function chartsAfter(only) {
  if (!hasData(only)) return drawDl(only);
  const sr = series(only);
  chart("cAct", "line", sr.labels, [{ label: "Ativos", data: sr.act }, { label: "Novos", data: sr.nw, color: C_VIOLET }]);
  chart("cCum", "line", sr.labels, [{ label: "Jogadores (acumulado)", data: sr.cum, color: C_GREEN }]);
  chart("cAvg", "bar", sr.labels, [{ label: "Minutos", data: sr.avg, color: C_EMBER }]);
  drawDl(only);
}
function drawDl(only) {
  const ids = gameIds(only).filter(g => S.dl[g] != null), days = Object.keys(S.dlSnap).sort();
  if (!ids.length || !days.length) return;
  chart("cDl", "line", days.map(dlabel), ids.map(g => ({ label: S.games[g].name || g, data: days.map(d => S.dlSnap[d]?.[g] ?? null), color: gcolor(g) })));
}

function pHome() {
  const ng = Object.keys(S.games).length;
  if (!ng) return `<div class="card">${emptyBox("Nenhum jogo cadastrado", "Cadastre os jogos da Lumbra Games para que eles possam começar a enviar dados.")}<div class="btnrow" style="justify-content:center"><button class="primary" id="seed">Cadastrar Prancheta e WILDFORGE</button><a class="ghost" href="#/cfg" style="text-decoration:none">Cadastrar outro</a></div></div>`;
  const al = computeAlerts().slice(0, 3);
  return kpiBlock(null) + chartsBlock(null) +
    `<p class="sec">Jogos</p>${gamesList()}` +
    (al.length ? `<p class="sec">Alertas recentes</p>${al.map(alertHtml).join("")}` : "");
}
pHome.after = () => {
  const b = $("#seed");
  if (b) return b.onclick = async () => {
    b.disabled = true;
    const t = Date.now(), seed = {
      PRANCHETA: { name: "Prancheta", color: "#3ddc84", status: "Lançado", downloads: "lumbragames/Prancheta|prancheta.apk", notes: "Eventos: carreira_nova, partida_inicio, partida_fim, clube_criado, saf_compra, tela", created: t, updated: t },
      WILDFORGE: { name: "WILDFORGE", color: "#ff6a3d", status: "Em desenvolvimento", downloads: "", notes: "Eventos: cliques nos botões (ui)", created: t, updated: t }
    };
    try { await update(ref(db, "games"), seed); S.games = seed; await loadDownloads(); toast("Jogos cadastrados"); render(); }
    catch (e) { b.disabled = false; toast("Erro ao cadastrar: " + e.message); }
  };
  chartsAfter(null);
};

function gamesList() {
  const now = serverNow();
  return `<div class="glist">${Object.entries(S.games).map(([g, info]) => {
    const conn = Object.keys(S.players[g] || {}).length > 0;
    const on = Object.values(S.online[g] || {}).filter(o => now - o.l < ONLINE_WINDOW).length;
    const m = metrics(g);
    return `<button class="gitem" onclick="location.hash='#/games/${encodeURIComponent(g)}'">
      <div class="gico" style="background:${esc(info.color || C_AMBER)}">${esc((info.name || g)[0])}</div>
      <div class="gm"><b>${esc(info.name || g)}</b><small>${conn ? `${fmt(m.players)} jogadores · ${fmt(m.d7)} ativos em 7 dias` : "Coleta ainda não conectada"}</small><div style="margin-top:6px">${conn ? TAG.real : TAG.off}</div></div>
      <div class="gs">${conn ? `<b><span data-online="${esc(g)}">${on}</span></b><small>online</small>` : ""}</div></button>`;
  }).join("")}</div>`;
}

function pGames() { return Object.keys(S.games).length ? gamesList() + `<p class="note">Toque em um jogo para ver as estatísticas dele. Para cadastrar um jogo novo, vá em Ajustes.</p>` : pHome(); }

function pGame() {
  const g = S.gameId, info = S.games[g];
  if (!info) return `<div class="card">${emptyBox("Jogo não encontrado")}</div>`;
  const r = retention(g), conn = hasData(g);
  const ss = sessList(g), versions = {};
  ss.filter(s => s.l >= range().start).forEach(s => versions[s.v || "?"] = (versions[s.v || "?"] || 0) + 1);
  const diagN = Object.keys(S.diag[g] || {}).length;
  const lastData = Math.max(0, ...ss.map(s => s.l || 0));
  return `<button class="back" onclick="location.hash='#/games'">← Todos os jogos</button>
  ${kpiBlock(g)}${chartsBlock(g)}
  <div class="grid2">
    <div class="card"><h3><b>Retenção</b>${conn ? TAG.real : TAG.off}</h3>${retTable({ [g]: r })}</div>
    <div class="card"><h3><b>Integração</b>${conn ? TAG.real : TAG.off}</h3>
      <table><tr><td>Identificador</td><td class="n"><b>${esc(g)}</b></td></tr>
      <tr><td>Coleta</td><td class="n">${conn ? "Conectada" : "Aguardando primeiros dados"}</td></tr>
      <tr><td>Últimos dados recebidos</td><td class="n">${lastData ? ago(lastData) : "—"}</td></tr>
      <tr><td>Erros de envio registrados</td><td class="n">${diagN}</td></tr>
      <tr><td>Fonte de downloads</td><td class="n">${S.dl[g] != null ? "GitHub" : "Não cadastrada"}</td></tr></table></div>
  </div>
  <p class="sec">Versões</p>
  <div class="card"><h3><b>O que cada versão está fazendo</b><span class="muted">${pname()}</span></h3>${versionTable(g)}</div>
  <p class="sec">Comportamento</p>
  <div class="grid2">
    <div class="card"><h3><b>Horários de pico</b>${conn ? TAG.real : TAG.off}</h3><div class="chart sm">${conn ? '<canvas id="cHour"></canvas>' : emptyBox("Sem dados ainda")}</div>${conn ? peakNote(g) : ""}</div>
    <div class="card"><h3><b>Dias da semana</b>${conn ? TAG.real : TAG.off}</h3><div class="chart sm">${conn ? '<canvas id="cWeek"></canvas>' : emptyBox("Sem dados ainda")}</div><p class="note">Sessões iniciadas em cada dia da semana, no período.</p></div>
    <div class="card"><h3><b>Telas mais abertas</b><span class="muted">${pname()}</span></h3><div id="scrBox">${conn ? '<div class="empty">Carregando…</div>' : emptyBox("Sem dados ainda")}</div></div>
    <div class="card"><h3><b>Eventos mais frequentes</b><span class="muted">${pname()}</span></h3><div id="evBox">${conn ? '<div class="empty">Carregando eventos…</div>' : emptyBox("Sem dados ainda")}</div></div>
  </div>`;
}
pGame.after = () => {
  const g = S.gameId; if (!S.games[g]) return; chartsAfter(g);
  if (!hasData(g)) return;
  drawHabits(g);
  const since = range().start;
  get(query(ref(db, "events/" + g), orderByChild("t"), startAt(since), limitToLast(5000))).then(s => {
    const c = {}, scr = {}; let n = 0;
    s.forEach(x => { const e = x.val(); n++;
      if (e.n === "tela") { const k = SCREEN[e.p?.aba || e.p?.pagina] || e.p?.aba || e.p?.pagina || "?"; scr[k] = (scr[k] || 0) + 1; return; }
      if (e.n === "session_start" || e.n === "session_end") return;
      let k = EVNAME[e.n] || e.n; if (e.n === "ui" && e.p?.botao) k = "Botão: " + e.p.botao; c[k] = (c[k] || 0) + 1; });
    const el = $("#evBox"); if (el) el.innerHTML = Object.keys(c).length ? barsHtml(c, "vezes", 12) + (n >= 5000 ? '<p class="note">Mostrando os 5.000 eventos mais recentes do período.</p>' : "") : emptyBox("Nenhum evento no período");
    const el2 = $("#scrBox"); if (el2) el2.innerHTML = Object.keys(scr).length ? barsHtml(scr, "aberturas", 10) : emptyBox("Nenhuma tela registrada", "O jogo precisa enviar o evento \"tela\".");
  }).catch(e => { ["#evBox", "#scrBox"].forEach(id => { const el = $(id); if (el) el.innerHTML = emptyBox("Erro ao carregar", esc(e.message)); }); });
};

function barsHtml(obj, unit, max = 8) {
  const arr = Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, max);
  if (!arr.length) return emptyBox("Sem dados no período");
  const top = arr[0][1], tot = Object.values(obj).reduce((a, b) => a + b, 0);
  return `<div class="rows">${arr.map(([k, v]) => `<div class="row"><span>${esc(k)}</span><span class="muted">${fmt(v)} ${unit} · ${pct(v / tot * 100)}</span><div class="bar"><i style="width:${v / top * 100}%"></i></div></div>`).join("")}</div>`;
}

function updateLive() {
  const now = serverNow();
  document.querySelectorAll("[data-online]").forEach(el => {
    const g = el.dataset.online;
    el.textContent = fmt(gameIds(g || null).reduce((n, x) => n + Object.values(S.online[x] || {}).filter(o => now - o.l < ONLINE_WINDOW).length, 0));
  });
  if (S.page === "live") { const el = $("#liveList"); if (el) el.innerHTML = liveList(); }
}
function liveList() {
  const now = serverNow(), rows = [];
  Object.entries(S.online).forEach(([g, us]) => Object.entries(us || {}).forEach(([u, o]) => { if (now - o.l < ONLINE_WINDOW) {
    const s = S.sessions[g]?.[o.sid]; rows.push({ g, u, v: o.v, since: s ? s.s : null, l: o.l }); } }));
  if (!rows.length) return emptyBox("Ninguém jogando agora", "A lista atualiza sozinha.");
  return `<div class="tw"><table><tr><th>Jogo</th><th>Jogador</th><th>Versão</th><th class="n">Sessão</th><th class="n">Último sinal</th></tr>${rows.map(r =>
    `<tr><td>${esc(S.games[r.g]?.name || r.g)}</td><td><code>${esc(r.u.slice(0, 6))}…</code></td><td>${esc(r.v || "—")}</td><td class="n">${r.since ? dur((now - r.since) / 1000) : "—"}</td><td class="n">${Math.max(0, Math.round((now - r.l) / 1000))} s</td></tr>`).join("")}</table></div>`;
}
function pLive() {
  const conn = hasData(null);
  return `<div class="card" style="text-align:center;padding:30px 16px">
      <p class="muted"><span class="live"></span> &nbsp;Jogando agora em todos os jogos</p>
      <div class="big"><span data-online="">${conn ? fmt(metrics(null).online) : "—"}</span></div>
      <div style="margin-top:8px">${conn ? TAG.est : TAG.off}</div>
      <p class="note">Conta jogadores que enviaram sinal nos últimos 75 segundos. Não é o mesmo que "ativos nos últimos 30 minutos". Atualiza sozinho.</p></div>
    <div class="grid3">${Object.entries(S.games).map(([g, i]) => `<div class="card kpi"><div class="l"><span>${esc(i.name || g)}</span></div><div class="v"><span data-online="${esc(g)}">0</span></div><div style="margin-top:6px">${hasData(g) ? TAG.est : TAG.off}</div></div>`).join("")}</div>
    <p class="sec">Sessões conectadas</p><div class="card" id="liveList">${liveList()}</div>`;
}
pLive.after = updateLive;

function retTable(map) {
  const rows = Object.entries(map).map(([g, r]) => `<tr><td>${esc(S.games[g]?.name || g)}</td>${[1, 7, 14, 30].map(n => `<td class="n">${r[n].rate == null ? '<span class="muted">—</span>' : `<b>${pct(r[n].rate)}</b><br><small class="muted">${r[n].back}/${r[n].cohort}</small>`}</td>`).join("")}</tr>`).join("");
  return `<div class="tw"><table><tr><th>Jogo</th><th class="n">Dia 1</th><th class="n">Dia 7</th><th class="n">Dia 14</th><th class="n">Dia 30</th></tr>${rows}</table></div>
  <p class="note">"Dia 7" = dos jogadores que começaram há pelo menos 8 dias, quantos jogaram exatamente no 7º dia depois de começar. "—" = ainda não passou tempo suficiente.</p>`;
}
function pRet() {
  const map = {}; Object.keys(S.games).forEach(g => map[g] = retention(g));
  const any = Object.values(map).some(r => r[1].cohort);
  return `<div class="card"><h3><b>Retenção por jogo</b>${any ? TAG.real : TAG.none}</h3>${retTable(map)}</div>
    <div class="card"><h3><b>Comparação de retenção</b>${any ? TAG.real : TAG.none}</h3><div class="chart">${any ? '<canvas id="cRet"></canvas>' : emptyBox("Sem dados suficientes", "A retenção do Dia 1 aparece 2 dias depois dos primeiros jogadores.")}</div></div>`;
}
pRet.after = () => {
  const ids = Object.keys(S.games).filter(g => retention(g)[1].cohort);
  if (!ids.length) return;
  chart("cRet", "bar", ["Dia 1", "Dia 7", "Dia 14", "Dia 30"], ids.map(g => { const r = retention(g); return { label: S.games[g].name || g, data: [1, 7, 14, 30].map(n => r[n].rate == null ? null : Math.round(r[n].rate * 10) / 10), color: gcolor(g) }; }),
    { ymax: 100, tip: c => c.dataset.label + ": " + pct(c.raw) });
};

const TZ_BR = { Sao_Paulo: "Sudeste/Sul", Fortaleza: "Nordeste", Recife: "Nordeste", Bahia: "Nordeste", Maceio: "Nordeste", Araguaina: "Norte", Belem: "Norte", Santarem: "Norte", Manaus: "Norte", Boa_Vista: "Norte", Porto_Velho: "Norte", Rio_Branco: "Norte", Eirunepe: "Norte", Cuiaba: "Centro-Oeste", Campo_Grande: "Centro-Oeste", Noronha: "Nordeste" };
const TZ_C = { "Europe/Lisbon": "Portugal", "Atlantic/Azores": "Portugal", "Atlantic/Madeira": "Portugal", "America/Montevideo": "Uruguai", "America/Asuncion": "Paraguai", "America/Santiago": "Chile", "America/Bogota": "Colômbia", "America/Lima": "Peru", "America/Mexico_City": "México", "Africa/Luanda": "Angola", "Africa/Maputo": "Moçambique", "Europe/Madrid": "Espanha", "Europe/London": "Reino Unido", "Europe/Paris": "França", "Europe/Berlin": "Alemanha", "Europe/Rome": "Itália" };
function country(p) {
  const tz = p.tz || "", city = tz.split("/").pop();
  if (tz.startsWith("America/") && TZ_BR[city]) return "Brasil";
  if (TZ_C[tz]) return TZ_C[tz];
  if (tz.startsWith("America/Argentina")) return "Argentina";
  if (/^America\/(New_York|Chicago|Denver|Los_Angeles|Phoenix|Detroit|Anchorage)/.test(tz)) return "Estados Unidos";
  const reg = (p.lang || "").split("-")[1];
  return reg ? "Outro (" + reg.toUpperCase() + ")" : "Desconhecido";
}
function pAud() {
  const ps = playList(null).filter(p => (p.last || 0) >= range().start);
  if (!ps.length) return `<div class="card">${emptyBox(hasData(null) ? "Nenhum jogador ativo no período" : "Sem dados ainda", "Esta página mostra de onde vêm e quais aparelhos usam os jogadores.")}</div>`;
  const cnt = f => { const o = {}; ps.forEach(p => { const k = f(p); if (k) o[k] = (o[k] || 0) + 1; }); return o; };
  return `<p class="note" style="margin:-4px 0 12px">${fmt(ps.length)} jogadores ativos nos ${pname()}. Nenhuma localização precisa é coletada.</p>
  <div class="grid2">
    <div class="card"><h3><b>Países</b>${TAG.est}</h3>${barsHtml(cnt(country), "jogadores")}<p class="note">Estimado pelo fuso horário e idioma do aparelho.</p></div>
    <div class="card"><h3><b>Regiões do Brasil</b>${TAG.est}</h3>${barsHtml(cnt(p => { const c = (p.tz || "").split("/").pop(); return (p.tz || "").startsWith("America/") && TZ_BR[c] ? TZ_BR[c] : null; }), "jogadores")}<p class="note">Pelo fuso horário. São Paulo cobre Sudeste, Sul e parte do Centro-Oeste e Nordeste.</p></div>
    <div class="card"><h3><b>Sistema</b>${TAG.real}</h3>${barsHtml(cnt(p => (p.os || "?") + (p.osv ? " " + p.osv : "")), "jogadores")}</div>
    <div class="card"><h3><b>Aparelhos</b>${TAG.real}</h3>${barsHtml(cnt(p => p.model || "Não informado"), "jogadores")}</div>
    <div class="card"><h3><b>Como jogam</b>${TAG.real}</h3>${barsHtml(cnt(p => p.plat === "app" ? "App (APK)" : "Navegador"), "jogadores")}</div>
    <div class="card"><h3><b>Origem de aquisição</b>${TAG.na}</h3>${emptyBox("Não rastreável hoje", "Os jogos são baixados por link direto, sem loja. Isso passa a existir com a Google Play ou com links com código de campanha.")}</div>
  </div>`;
}

function pRep() {
  const rg = range(), prg = prevRange(rg), ids = Object.keys(S.games);
  const rows = ids.map(g => ({ g, m: metrics(g, rg), p: metrics(g, prg), r: retention(g) }));
  const any = rows.some(x => x.m.connected);
  const topAct = [...rows].filter(x => x.m.connected).sort((a, b) => b.m.active - a.m.active)[0];
  const topRet = [...rows].filter(x => x.r[7].rate != null).sort((a, b) => b.r[7].rate - a.r[7].rate)[0];
  const cmp = (k, f = fmt) => { const a = metrics(null, rg)[k], b = metrics(null, prg)[k]; return `<tr><td>${{ active: "Jogadores ativos", newP: "Novos jogadores", sessions: "Sessões", avgS: "Tempo médio por sessão" }[k]}</td><td class="n">${a == null ? "—" : f(a)}</td><td class="n">${b == null ? "—" : f(b)}</td><td class="n">${a != null && b ? `<span class="${a >= b ? "up" : "down"}">${a >= b ? "▲" : "▼"} ${pct(Math.abs((a - b) / b * 100))}</span>` : "—"}</td></tr>`; };
  return `<div class="card"><h3><b>Relatório · ${pname()}</b><span class="muted">${new Date(rg.start).toLocaleDateString("pt-BR")} a ${new Date(rg.end).toLocaleDateString("pt-BR")}</span></h3>
    <div class="btnrow noprint"><button class="primary" id="csv">Exportar CSV</button><button class="ghost" id="pdf">Salvar em PDF</button></div>
    ${any ? "" : '<p class="note">Ainda não há dados coletados. O relatório é preenchido com dados reais assim que os jogos começarem a enviar.</p>'}</div>
  <div class="card"><h3><b>Comparação entre jogos</b>${any ? TAG.real : TAG.none}</h3><div class="tw"><table>
    <tr><th>Jogo</th><th class="n">Jogadores</th><th class="n">Novos</th><th class="n">Ativos</th><th class="n">Sessões</th><th class="n">Tempo médio</th><th class="n">Ret. D7</th><th class="n">Downloads</th></tr>
    ${rows.map(x => `<tr><td><b>${esc(S.games[x.g].name || x.g)}</b></td>${x.m.connected ? `<td class="n">${fmt(x.m.players)}</td><td class="n">${fmt(x.m.newP)}</td><td class="n">${fmt(x.m.active)}</td><td class="n">${fmt(x.m.sessions)}</td><td class="n">${x.m.avgS == null ? "—" : dur(x.m.avgS)}</td><td class="n">${pct(x.r[7].rate)}</td>` : '<td colspan="6" class="muted">Coleta não conectada</td>'}<td class="n">${x.m.dlKnown ? fmt(x.m.dl) : "—"}</td></tr>`).join("")}
  </table></div></div>
  <div class="grid2">
    <div class="card"><h3><b>Período atual vs anterior</b>${any ? TAG.real : TAG.none}</h3><div class="tw"><table><tr><th></th><th class="n">Atual</th><th class="n">Anterior</th><th class="n">Variação</th></tr>${cmp("active")}${cmp("newP")}${cmp("sessions")}${cmp("avgS", dur)}</table></div></div>
    <div class="card"><h3><b>Destaques</b></h3><table>
      <tr><td>Mais jogadores ativos</td><td class="n"><b>${topAct ? esc(S.games[topAct.g].name || topAct.g) + " (" + fmt(topAct.m.active) + ")" : "—"}</b></td></tr>
      <tr><td>Maior retenção (D7)</td><td class="n"><b>${topRet ? esc(S.games[topRet.g].name || topRet.g) + " (" + pct(topRet.r[7].rate) + ")" : "—"}</b></td></tr></table></div>
  </div>
  <div class="card"><h3><b>Ativos por dia em cada jogo</b>${any ? TAG.real : TAG.none}</h3><div class="chart">${any ? '<canvas id="cCmp"></canvas>' : emptyBox("Sem dados ainda")}</div></div>`;
}
pRep.after = () => {
  $("#csv").onclick = exportCSV; $("#pdf").onclick = () => window.print();
  const ids = Object.keys(S.games).filter(g => hasData(g)); if (!ids.length) return;
  const base = series(null);
  chart("cCmp", "line", base.labels, ids.map(g => ({ label: S.games[g].name || g, data: series(g).act, color: gcolor(g), nofill: true })));
};
function exportCSV() {
  const rg = range(), lines = [["Lumbra Games - Relatório Lumbra Control"], ["Período", new Date(rg.start).toLocaleString("pt-BR"), new Date(rg.end).toLocaleString("pt-BR")], ["Gerado em", new Date().toLocaleString("pt-BR")], [],
    ["Jogo", "Data", "Jogadores ativos", "Novos jogadores", "Sessões", "Tempo médio por sessão (min)", "Total de jogadores (acumulado)"]];
  Object.keys(S.games).forEach(g => { const s = series(g, rg); s.labels.forEach((l, i) => lines.push([S.games[g].name || g, s.keys[i], s.act[i], s.nw[i], s.sess[i], s.avg[i] ?? "", s.cum[i]])); });
  lines.push([], ["Resumo por jogo"], ["Jogo", "Jogadores", "Novos", "Ativos", "Sessões", "Tempo médio (s)", "Retenção D1 %", "Retenção D7 %", "Retenção D30 %", "Downloads"]);
  Object.keys(S.games).forEach(g => { const m = metrics(g, rg), r = retention(g); lines.push([S.games[g].name || g, m.players, m.newP, m.active, m.sessions, m.avgS == null ? "" : Math.round(m.avgS), r[1].rate?.toFixed(1) ?? "", r[7].rate?.toFixed(1) ?? "", r[30].rate?.toFixed(1) ?? "", m.dlKnown ? m.dl : ""]); });
  const csv = "﻿" + lines.map(r => r.map(c => { c = String(c ?? ""); return /[;"\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(";")).join("\n");
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = `lumbra-relatorio-${dkey(Date.now())}.csv`; a.click(); toast("CSV gerado");
}

// ---------------- alertas ----------------
function computeAlerts() {
  const out = [], now = serverNow();
  Object.entries(S.games).forEach(([g, info]) => {
    const name = info.name || g, ss = sessList(g), ps = playList(g);
    if (!ps.length) { out.push({ level: "info", ic: "🔌", t: `${name} ainda não está enviando dados`, d: "Conecte o jogo ao Lumbra Analytics para começar a coletar." }); return; }
    const firstEver = Math.min(...ps.map(p => p.first || now));
    if (now - firstEver < 7 * DAY) out.push({ level: "good", ic: "🎮", t: `${name} foi conectado`, d: `Primeiros dados recebidos ${ago(firstEver)}.`, at: firstEver });
    const today = new Set(ss.filter(s => s.l >= now - DAY).map(s => s.u)).size;
    const prev = []; for (let i = 1; i <= 7; i++) prev.push(new Set(ss.filter(s => s.l >= now - (i + 1) * DAY && s.s < now - i * DAY).map(s => s.u)).size);
    const avg = prev.reduce((a, b) => a + b, 0) / 7;
    if (avg >= 3 && today >= avg * 1.5) out.push({ level: "good", ic: "📈", t: `Aumento de jogadores no ${name}`, d: `${today} ativos nas últimas 24 h, contra média de ${avg.toFixed(1).replace(".", ",")} por dia na semana anterior.` });
    if (avg >= 3 && today <= avg * 0.5) out.push({ level: "warn", ic: "📉", t: `Queda de atividade no ${name}`, d: `${today} ativos nas últimas 24 h, contra média de ${avg.toFixed(1).replace(".", ",")} por dia na semana anterior.` });
    const last = Math.max(0, ...ss.map(s => s.l || 0));
    if (last && now - last > 3 * DAY) out.push({ level: "warn", ic: "⏸️", t: `${name} sem dados há ${Math.round((now - last) / DAY)} dias`, d: "Pode ser falta de jogadores ou problema na coleta. Abra o jogo para testar." });
    const errs = Object.values(S.diag[g] || {}).filter(e => now - e.t < 7 * DAY);
    if (errs.length) { const last = errs.sort((a, b) => b.t - a.t)[0]; out.push({ level: "bad", ic: "⚠️", t: `${errs.length} erro(s) de envio no ${name}`, d: `Último: ${last.w} · ${last.m} (${ago(last.t)})` }); }
  });
  if (S.ghError) out.push({ level: "warn", ic: "🔗", t: "Falha ao ler downloads do GitHub", d: S.ghError });
  const rank = { bad: 0, warn: 1, good: 2, info: 3 };
  return out.sort((a, b) => rank[a.level] - rank[b.level]);
}
const alertHtml = a => `<div class="alert lv-${a.level}"><div class="ai">${a.ic}</div><div><b>${esc(a.t)}</b><small>${esc(a.d)}</small></div></div>`;
function pAlert() { const al = computeAlerts(); return al.length ? al.map(alertHtml).join("") + '<p class="note">Os alertas são calculados com os dados reais sempre que o painel é atualizado.</p>' : `<div class="card">${emptyBox("Nenhum alerta", "Está tudo funcionando.")}</div>`; }

// ---------------- ajustes ----------------
function snippet(g) {
  return `<script src="https://lumbragames.github.io/sdk/lumbra-analytics.js"><\/script>
<script>
LumbraAnalytics.init({
  game: "${g}",
  version: "1.0",
  config: { apiKey: "${cfg.apiKey}", databaseURL: "${cfg.databaseURL}" }
});
// eventos personalizados, por exemplo:
// LumbraAnalytics.event("partida_inicio", { liga: "A" });
<\/script>`;
}
function pCfg() {
  const now = serverNow();
  return `<div class="btnrow" style="margin-bottom:12px"><button class="primary" id="addGame">+ Cadastrar jogo</button></div>
  <div class="card"><h3><b>Jogos cadastrados</b></h3><div class="tw"><table><tr><th>Jogo</th><th>ID</th><th>Coleta</th><th>Última sincronização</th><th>Erros (7 dias)</th><th></th></tr>
  ${Object.entries(S.games).map(([g, i]) => { const ss = sessList(g); const last = Math.max(0, ...ss.map(s => s.l || 0)); const errs = Object.values(S.diag[g] || {}).filter(e => now - e.t < 7 * DAY).length;
    return `<tr><td><b>${esc(i.name || g)}</b></td><td><code>${esc(g)}</code></td><td>${hasData(g) ? TAG.real.replace("Real", "Conectada") : TAG.off}</td><td>${last ? ago(last) : "—"}</td><td class="n">${errs}</td><td><button class="ghost sm" data-edit="${esc(g)}">Editar</button> <button class="ghost sm" data-code="${esc(g)}">Código</button></td></tr>`; }).join("") || '<tr><td colspan="6" class="muted">Nenhum jogo cadastrado.</td></tr>'}
  </table></div></div>
  <div class="card"><h3><b>Projeto</b></h3><table>
    <tr><td>Firebase</td><td class="n"><code>${esc(cfg.projectId)}</code></td></tr>
    <tr><td>Administrador</td><td class="n">${esc(user.email)}</td></tr>
    <tr><td>Dados carregados</td><td class="n">${new Date(S.loadedAt).toLocaleString("pt-BR")}</td></tr>
    <tr><td>Jogadores online (ao vivo)</td><td class="n">Conectado</td></tr></table>
    <p class="note">Política de privacidade: <a href="../privacidade/" style="color:var(--amber)">lumbragames.github.io/privacidade</a></p></div>`;
}
pCfg.after = () => {
  $("#addGame").onclick = () => gameForm();
  document.querySelectorAll("[data-edit]").forEach(b => b.onclick = () => gameForm(b.dataset.edit));
  document.querySelectorAll("[data-code]").forEach(b => b.onclick = () => modal(`<h3>Conectar ${esc(b.dataset.code)}</h3><p class="muted">Cole este código no final do arquivo principal do jogo (index.html), antes de &lt;/body&gt;.</p><pre class="code">${esc(snippet(b.dataset.code))}</pre><div class="btnrow"><button class="primary" id="cpy">Copiar</button><button class="ghost" data-close>Fechar</button></div>`) || ($("#cpy").onclick = () => navigator.clipboard.writeText(snippet(b.dataset.code)).then(() => toast("Código copiado"))));
};
function gameForm(g) {
  const i = g ? S.games[g] : { name: "", color: "#ffb347", status: "Em desenvolvimento", downloads: "", notes: "" };
  modal(`<h3>${g ? "Editar jogo" : "Cadastrar jogo"}</h3>
    <label>Nome<input id="fName" value="${esc(i.name)}" placeholder="Ex.: WILDFORGE"></label>
    <label>Identificador (não muda depois)<input id="fId" value="${esc(g || "")}" ${g ? "disabled" : ""} placeholder="Ex.: WILDFORGE"></label>
    <label>Cor<input id="fColor" type="color" value="${esc(i.color || "#ffb347")}" style="height:46px;padding:4px"></label>
    <label>Situação<select id="fStatus">${["Em desenvolvimento", "Lançado", "Pausado"].map(s => `<option ${s === i.status ? "selected" : ""}>${s}</option>`).join("")}</select></label>
    <label>Fontes de downloads (uma por linha, formato dono/repositório|arquivo.apk)<textarea id="fDl" placeholder="lumbragames/Prancheta|prancheta.apk">${esc(i.downloads || "")}</textarea></label>
    <label>Anotações (eventos do jogo, links…)<textarea id="fNotes">${esc(i.notes || "")}</textarea></label>
    <p class="err" id="fErr"></p>
    <div class="btnrow"><button class="primary" id="fSave">Salvar</button><button class="ghost" data-close>Cancelar</button></div>`);
  $("#fSave").onclick = async () => {
    const id = (g || $("#fId").value || $("#fName").value).toUpperCase().trim().replace(/[^A-Z0-9_]/g, "_");
    if (!id || !$("#fName").value.trim()) { $("#fErr").textContent = "Preencha nome e identificador."; return; }
    if (!g && S.games[id]) { $("#fErr").textContent = "Já existe um jogo com esse identificador."; return; }
    const data = { name: $("#fName").value.trim(), color: $("#fColor").value, status: $("#fStatus").value, downloads: $("#fDl").value.trim(), notes: $("#fNotes").value.trim(), updated: Date.now(), ...(g ? {} : { created: Date.now() }) };
    try { await update(ref(db, "games/" + id), data); S.games[id] = { ...(S.games[id] || {}), ...data }; $("#modal").classList.add("hide"); toast("Jogo salvo"); await loadDownloads(); render(); }
    catch (e) { $("#fErr").textContent = "Erro ao salvar: " + e.message; }
  };
}

// ---------------- versões e hábitos ----------------
const EVNAME = { partida_inicio: "Partida iniciada", partida_fim: "Partida terminada", carreira_nova: "Carreira nova", clube_criado: "Clube criado", saf_compra: "Compra de SAF",
  aviso_visto: "Aviso visto", aviso_clique: "Aviso: botão tocado", aviso_fechar: "Aviso fechado", evento_visto: "Evento visto", evento_clique: "Evento tocado", update_visto: "Pedido de atualização visto", update_clique: "Tocou em atualizar" };
const SCREEN = {};
const vnum = v => { const m = String(v || "").match(/(\d+)(?!.*\d)/); return m ? +m[1] : 0; };
function versionStats(g, rg = range()) {
  const out = {};
  sessList(g).filter(s => s.l >= rg.start && s.s <= rg.end).forEach(s => {
    const v = s.v || "?", o = out[v] ||= { v, users: new Set(), sess: 0, dur: 0, durN: 0, nw: 0, last: 0 };
    o.users.add(s.u); o.sess++; if (s.d > 0) { o.dur += s.d; o.durN++; } if (s.n) o.nw++; if (s.l > o.last) o.last = s.l;
  });
  const now = serverNow();
  Object.entries(S.online[g] || {}).forEach(([u, o]) => { if (now - o.l < ONLINE_WINDOW) { const x = out[o.v || "?"]; if (x) x.on = (x.on || 0) + 1; } });
  return Object.values(out).sort((a, b) => vnum(b.v) - vnum(a.v) || b.sess - a.sess);
}
function versionTable(g) {
  const vs = versionStats(g);
  if (!vs.length) return emptyBox("Nenhuma sessão no período");
  const tot = vs.reduce((a, b) => a + b.users.size, 0) || 1, newest = vnum(vs[0].v), mins = (S.remote[g]?.update?.on && S.remote[g].update.min) || 0;
  return `<div class="tw"><table><tr><th>Versão</th><th class="n">Jogadores</th><th class="n">% do público</th><th class="n">Online</th><th class="n">Sessões</th><th class="n">Tempo médio</th><th class="n">Novos</th><th class="n">Último uso</th></tr>
  ${vs.map(x => `<tr><td><b>${esc(x.v)}</b> ${vnum(x.v) === newest ? '<span class="tag t-real">Mais nova</span>' : mins && vnum(x.v) < mins ? '<span class="tag t-off">Abaixo da mínima</span>' : '<span class="tag t-na">Antiga</span>'}</td>
    <td class="n">${fmt(x.users.size)}</td><td class="n">${pct(x.users.size / tot * 100)}</td><td class="n">${fmt(x.on || 0)}</td><td class="n">${fmt(x.sess)}</td><td class="n">${x.durN ? dur(x.dur / x.durN) : "—"}</td><td class="n">${fmt(x.nw)}</td><td class="n">${ago(x.last)}</td></tr>`).join("")}</table></div>
  <p class="note">Quem está em versão antiga pode ser avisado em <a href="#/ctrl" style="color:var(--amber)">Controle → Versão mínima</a>.</p>`;
}
function peakConcurrent(only, rg = range()) {
  const pts = [];
  sessList(only).forEach(s => { const a = Math.max(s.s || 0, rg.start), b = Math.min((s.l || 0) + 30e3, rg.end); if (b > a) { pts.push([a, 1]); pts.push([b, -1]); } });
  pts.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  let c = 0, max = 0, at = 0; pts.forEach(([t, d]) => { c += d; if (c > max) { max = c; at = t; } });
  return { max, at };
}
function peakNote(g) {
  const p = peakConcurrent(g), hrs = hourDist(g), best = hrs.indexOf(Math.max(...hrs));
  return `<p class="note">Horário com mais sessões: <b style="color:var(--chalk)">${best}h às ${best + 1}h</b>. Pico de jogadores ao mesmo tempo: <b style="color:var(--chalk)">${p.max}</b>${p.at ? " (" + new Date(p.at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) + ")" : ""}.</p>`;
}
function hourDist(only, rg = range()) { const h = Array(24).fill(0); sessList(only).filter(s => s.s >= rg.start && s.s <= rg.end).forEach(s => h[new Date(s.s).getHours()]++); return h; }
function weekDist(only, rg = range()) { const w = Array(7).fill(0); sessList(only).filter(s => s.s >= rg.start && s.s <= rg.end).forEach(s => w[new Date(s.s).getDay()]++); return w; }
function drawHabits(g) {
  chart("cHour", "bar", [...Array(24).keys()].map(h => h + "h"), [{ label: "Sessões", data: hourDist(g), color: C_AMBER }]);
  chart("cWeek", "bar", ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"], [{ label: "Sessões", data: weekDist(g), color: C_VIOLET }]);
}

// ---------------- jogadores ----------------
function pPlayers() {
  const all = playList(null);
  if (!all.length) return `<div class="card">${emptyBox("Sem jogadores ainda", "A lista aparece quando os jogos começarem a enviar dados.")}</div>`;
  const now = serverNow();
  const loyal = all.filter(p => (p.sessions || 0) >= 5).length, gone = all.filter(p => p.last && now - p.last > 7 * DAY).length, nw = all.filter(p => p.first >= now - 7 * DAY).length;
  return `<div class="grid4">
    ${kpi("Jogadores", fmt(all.length), TAG.real, HELP.players)}
    ${kpi("Novos (7 dias)", fmt(nw), TAG.real, "Jogadores que abriram o jogo pela primeira vez nos últimos 7 dias.")}
    ${kpi("Fiéis", fmt(loyal), TAG.real, "Jogadores com 5 sessões ou mais.")}
    ${kpi("Sumidos", fmt(gone), TAG.real, "Jogadores que não abrem o jogo há mais de 7 dias.")}
  </div>
  <div class="card">
    <div class="filters">
      <select id="pfG"><option value="">Todos os jogos</option>${Object.entries(S.games).map(([g, i]) => `<option value="${esc(g)}" ${S.pf.g === g ? "selected" : ""}>${esc(i.name || g)}</option>`).join("")}</select>
      <select id="pfS">${[["last", "Jogou por último"], ["first", "Mais novos"], ["secs", "Mais tempo jogado"], ["sessions", "Mais sessões"]].map(([v, l]) => `<option value="${v}" ${S.pf.sort === v ? "selected" : ""}>${l}</option>`).join("")}</select>
      <input id="pfQ" placeholder="Buscar código, aparelho ou versão" value="${esc(S.pf.q)}">
    </div>
    <div id="plist"></div>
  </div>
  <p class="note">Cada jogador é um código anônimo. Nenhum nome, e-mail ou localização é coletado.</p>`;
}
function playersRows() {
  const now = serverNow(), q = S.pf.q.toLowerCase();
  let ps = playList(S.pf.g || null).filter(p => !q || [p.u, p.model, p.ver, p.os].some(x => String(x || "").toLowerCase().includes(q)));
  const k = S.pf.sort; ps.sort((a, b) => (b[k] || 0) - (a[k] || 0));
  const n = ps.length; ps = ps.slice(0, 150);
  if (!n) return emptyBox("Nenhum jogador encontrado");
  return `<p class="note" style="margin:0 0 8px">${fmt(n)} jogador(es)${n > 150 ? " · mostrando 150" : ""}</p><div class="plist">${ps.map(p => {
    const on = S.online[p.g]?.[p.u] && now - S.online[p.g][p.u].l < ONLINE_WINDOW;
    return `<button class="pitem" data-pl="${esc(p.g)}|${esc(p.u)}"><div class="pav" style="background:${esc(gcolor(p.g))}">${esc(p.u.slice(0, 2).toUpperCase())}</div>
    <div class="pm"><b>${on ? '<span class="live"></span> ' : ""}#${esc(p.u.slice(0, 6))}</b><small>${esc(S.games[p.g]?.name || p.g)} · ${esc(p.ver || "—")} · ${esc(p.model || p.os || "—")}</small></div>
    <div class="ps"><b>${dur(p.secs || 0)}</b><small>${fmt(p.sessions || 0)} sessões · ${on ? "jogando agora" : ago(p.last)}</small></div></button>`; }).join("")}</div>`;
}
pPlayers.after = () => {
  const el = $("#plist"); if (!el) return;
  const draw = () => { el.innerHTML = playersRows(); el.querySelectorAll("[data-pl]").forEach(b => b.onclick = () => { const [g, u] = b.dataset.pl.split("|"); playerModal(g, u); }); };
  $("#pfG").onchange = e => { S.pf.g = e.target.value; draw(); };
  $("#pfS").onchange = e => { S.pf.sort = e.target.value; draw(); };
  $("#pfQ").oninput = e => { S.pf.q = e.target.value; clearTimeout(S._pq); S._pq = setTimeout(draw, 200); };
  draw();
};
function playerModal(g, u) {
  const p = S.players[g]?.[u]; if (!p) return;
  const ss = Object.values(S.sessions[g] || {}).filter(s => s.u === u).sort((a, b) => b.s - a.s);
  const days = new Set(ss.map(s => dkey(s.s))).size;
  modal(`<h3>Jogador #${esc(u.slice(0, 6))}</h3>
  <table>
    <tr><td>Jogo</td><td class="n"><b>${esc(S.games[g]?.name || g)}</b></td></tr>
    <tr><td>Primeira vez</td><td class="n">${p.first ? new Date(p.first).toLocaleString("pt-BR") : "—"}</td></tr>
    <tr><td>Última vez</td><td class="n">${ago(p.last)}</td></tr>
    <tr><td>Sessões · dias diferentes</td><td class="n">${fmt(p.sessions || 0)} · ${days}</td></tr>
    <tr><td>Tempo total jogado</td><td class="n">${dur(p.secs || 0)}</td></tr>
    <tr><td>Versão</td><td class="n">${esc(p.ver || "—")}</td></tr>
    <tr><td>Aparelho</td><td class="n">${esc([p.model, p.os && p.os + " " + (p.osv || "")].filter(Boolean).join(" · ") || "—")}</td></tr>
    <tr><td>Tela · idioma</td><td class="n">${esc(p.scr || "—")} · ${esc(p.lang || "—")}</td></tr>
    <tr><td>Região estimada</td><td class="n">${esc(country(p))}</td></tr>
  </table>
  <p class="sec" style="margin:8px 0 0">Últimas sessões</p>
  <div class="tw"><table><tr><th>Início</th><th class="n">Duração</th><th>Versão</th></tr>${ss.slice(0, 12).map(s => `<tr><td>${new Date(s.s).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</td><td class="n">${dur(s.d)}</td><td>${esc(s.v || "—")}</td></tr>`).join("") || '<tr><td colspan="3" class="muted">Nenhuma sessão</td></tr>'}</table></div>
  <p class="sec" style="margin:8px 0 0">O que fez por último</p><div id="pev"><div class="empty">Carregando…</div></div>
  <button class="ghost" data-close>Fechar</button>`);
  get(query(ref(db, "events/" + g), orderByChild("u"), equalTo(u))).then(snap => {
    const ev = []; snap.forEach(x => { ev.push(x.val()); });
    ev.sort((a, b) => b.t - a.t);
    const el = $("#pev"); if (!el) return;
    el.innerHTML = ev.length ? `<div class="tl">${ev.filter(e => e.n !== "session_end").slice(0, 25).map(e => `<div><small>${new Date(e.t).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</small><span>${esc(evLabel(e))}</span></div>`).join("")}</div>` : emptyBox("Nenhum evento registrado");
  }).catch(e => { const el = $("#pev"); if (el) el.innerHTML = emptyBox("Não foi possível carregar", esc(e.message)); });
}
function evLabel(e) {
  if (e.n === "tela") return "Abriu a tela " + (e.p?.aba || e.p?.pagina || "?");
  if (e.n === "session_start") return e.p?.novo ? "Abriu o jogo pela primeira vez" : "Abriu o jogo";
  if (e.n === "ui") return "Tocou em " + (e.p?.botao || "botão");
  const extra = e.p ? Object.entries(e.p).filter(([k]) => k !== "id").map(([k, v]) => k + ": " + v).join(", ") : "";
  return (EVNAME[e.n] || e.n) + (extra ? " (" + extra + ")" : "");
}

// ---------------- controle dos jogos ----------------
const GAME_URL = { PRANCHETA: "https://lumbragames.github.io/Prancheta/", WILDFORGE: "https://lumbragames.github.io/" };
const KINDS = { info: ["Aviso", "#4cc9f0"], novidade: ["Novidade", "#3ddc84"], evento: ["Evento", "#ffb347"], alerta: ["Importante", "#ff5470"], update: ["Atualização", "#8b5cf6"] };
const rid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const toLocal = t => { if (!t) return ""; const d = new Date(t - new Date(t).getTimezoneOffset() * 6e4); return d.toISOString().slice(0, 16); };
const fromLocal = v => v ? new Date(v).getTime() : 0;
const when = t => new Date(t).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
function state(o) {
  if (!o || !o.on) return ["Desligado", "t-na"];
  const t = serverNow();
  if (o.from && t < o.from) return ["Agendado · " + when(o.from), "t-none"];
  if (o.to && t > o.to) return ["Terminou", "t-na"];
  return ["No ar" + (o.to ? " até " + when(o.to) : ""), "t-real"];
}
function newestVersion(g) { let best = 0, label = ""; Object.values(S.players[g] || {}).forEach(p => { const n = vnum(p.ver); if (n > best) { best = n; label = p.ver; } }); return { n: best, label }; }
function phone(kind, title, text, btn, hasUrl) {
  const k = KINDS[kind] || KINDS.info;
  return `<div class="phone"><div class="pbox"><div class="ptop" style="color:${k[1]}"><i></i>${k[0]}</div>${title ? `<h5>${esc(title)}</h5>` : ""}${text ? `<p>${esc(text)}</p>` : ""}
    <div class="pbtn">${hasUrl ? '<span class="no">Fechar</span>' : ""}<span class="ok">${esc(btn || (hasUrl ? "Ver agora" : "OK"))}</span></div></div></div>`;
}
function pCtrl() {
  const ids = Object.keys(S.games);
  if (!ids.length) return pHome();
  return `<p class="note" style="margin:-4px 0 14px">Tudo o que você liga aqui aparece dentro do jogo na próxima vez que o jogador abrir (ou em até 5 minutos para quem já está jogando). Só funciona nas versões com o Lumbra Control 1.1 ou mais novo.</p>` +
  ids.map(g => {
    const r = S.remote[g] || {}, info = S.games[g], nv = newestVersion(g);
    const n = r.notice, e = r.event, u = r.update;
    const [ns, nc] = state(n), [es, ec] = state(e);
    const us = u?.on ? [`Ligado · mínima ${u.min}${u.block ? " (bloqueia)" : ""}`, u.block ? "t-off" : "t-real"] : ["Desligado", "t-na"];
    const below = u?.on ? Object.values(S.players[g] || {}).filter(p => vnum(p.ver) && vnum(p.ver) < u.min && p.last > serverNow() - 30 * DAY).length : 0;
    return `<div class="card ctrl">
      <h3><span class="gt"><i style="background:${esc(info.color || C_AMBER)}"></i><b>${esc(info.name || g)}</b></span><span class="muted">versão mais nova vista: ${esc(nv.label || "—")}</span></h3>
      <div class="grid3c">
        <div class="cbox"><div class="ch"><b>📣 Aviso</b><span class="tag ${nc}">${ns}</span></div>
          ${n?.on || n?.title ? phone(n.kind, n.title, n.text, n.btn, !!n.url) + `<div class="cst" data-st="${esc(g)}|notice|${esc(n.id || "")}|${n.created || 0}">Carregando números…</div>` : '<p class="muted small">Uma mensagem que aparece na tela do jogador: novidade, manutenção, pedido de avaliação, link pro vídeo novo…</p>'}
          <div class="btnrow"><button class="primary sm" data-nf="${esc(g)}">${n?.title ? "Novo aviso" : "Criar aviso"}</button>${n?.on ? `<button class="ghost sm" data-ne="${esc(g)}">Editar</button><button class="ghost sm" data-off="${esc(g)}|notice">Desligar</button>` : ""}</div></div>
        <div class="cbox"><div class="ch"><b>🔥 Evento especial</b><span class="tag ${ec}">${es}</span></div>
          ${e?.name ? `<div class="pillprev"><i style="background:${esc(e.color || C_AMBER)}"></i>${esc((e.emoji ? e.emoji + " " : "") + e.name)}</div><p class="muted small">${esc(e.text || "")}</p>${e.from || e.to ? `<p class="muted small">${e.from ? "De " + when(e.from) : ""} ${e.to ? "até " + when(e.to) : ""}</p>` : ""}<div class="cst" data-st="${esc(g)}|event|${esc(e.id || "")}|${e.created || 0}">Carregando números…</div>` : '<p class="muted small">Uma faixa que aparece no topo do jogo durante o período do evento (ex.: "Semana do Clássico"). Tocando nela, o jogador vê os detalhes.</p>'}
          <div class="btnrow"><button class="primary sm" data-ef="${esc(g)}">${e?.name ? "Novo evento" : "Criar evento"}</button>${e?.on ? `<button class="ghost sm" data-off="${esc(g)}|event">Desligar</button>` : ""}</div></div>
        <div class="cbox"><div class="ch"><b>⬆️ Versão mínima</b><span class="tag ${us[1]}">${us[0]}</span></div>
          <p class="muted small">${u?.on ? `Quem estiver abaixo da versão ${u.min} recebe o pedido para atualizar${u.block ? " e não consegue jogar até atualizar" : ""}. ${below} jogador(es) ativo(s) nos últimos 30 dias ainda estão abaixo.` : "Peça para quem está numa versão antiga baixar a nova. Dá para só avisar ou bloquear até atualizar."}</p>
          ${u?.on ? `<div class="cst" data-st="${esc(g)}|update||${u.created || 0}">Carregando números…</div>` : ""}
          <div class="btnrow"><button class="primary sm" data-uf="${esc(g)}">${u?.on ? "Alterar" : "Configurar"}</button>${u?.on ? `<button class="ghost sm" data-off="${esc(g)}|update">Desligar</button>` : ""}</div></div>
      </div>
      ${histHtml(g)}
    </div>`;
  }).join("");
}
function histHtml(g) {
  const h = Object.values(S.rlog[g] || {}).sort((a, b) => b.at - a.at).slice(0, 8);
  if (!h.length) return "";
  const T = { notice: "📣", event: "🔥", update: "⬆️" };
  return `<details class="hist"><summary>Histórico (${h.length})</summary>${h.map(x => `<div><small>${when(x.at)}</small><span>${T[x.type] || "•"} ${esc(x.what)}</span></div>`).join("")}</details>`;
}
pCtrl.after = () => {
  document.querySelectorAll("[data-nf]").forEach(b => b.onclick = () => noticeForm(b.dataset.nf, false));
  document.querySelectorAll("[data-ne]").forEach(b => b.onclick = () => noticeForm(b.dataset.ne, true));
  document.querySelectorAll("[data-ef]").forEach(b => b.onclick = () => eventForm(b.dataset.ef));
  document.querySelectorAll("[data-uf]").forEach(b => b.onclick = () => updateForm(b.dataset.uf));
  document.querySelectorAll("[data-off]").forEach(b => b.onclick = async () => {
    const [g, k] = b.dataset.off.split("|");
    if (!confirm("Desligar agora? Os jogadores deixam de ver isso.")) return;
    await saveRemote(g, k, { ...(S.remote[g]?.[k] || {}), on: false }, { notice: "Aviso desligado", event: "Evento desligado", update: "Versão mínima desligada" }[k]);
  });
  loadCtrlStats();
};
async function loadCtrlStats() {
  const boxes = [...document.querySelectorAll("[data-st]")]; if (!boxes.length) return;
  const byG = {};
  boxes.forEach(b => { const [g, k, id, c] = b.dataset.st.split("|"); (byG[g] ||= []).push({ b, k, id, c: +c || 0 }); });
  for (const [g, list] of Object.entries(byG)) {
    const since = Math.min(...list.map(x => x.c || serverNow() - 30 * DAY));
    try {
      const snap = await get(query(ref(db, "events/" + g), orderByChild("t"), startAt(since), limitToLast(5000)));
      const cnt = {}; snap.forEach(x => { const e = x.val(); if (/^(aviso|evento|update)_/.test(e.n)) { const key = e.n + "|" + (e.p?.id ?? ""); (cnt[key] ||= new Set()).add(e.u); } });
      const c = (n, id) => (cnt[n + "|" + id]?.size || 0);
      list.forEach(({ b, k, id }) => {
        if (k === "notice") { const v = c("aviso_visto", id), cl = c("aviso_clique", id); b.innerHTML = `<span><b>${v}</b> viram</span><span><b>${cl}</b> tocaram no botão</span><span><b>${v ? pct(cl / v * 100) : "—"}</b> de cliques</span>`; }
        if (k === "event") { const v = c("evento_visto", id), cl = c("evento_clique", id); b.innerHTML = `<span><b>${v}</b> viram a faixa</span><span><b>${cl}</b> abriram detalhes</span>`; }
        if (k === "update") { let v = 0, cl = 0; Object.keys(cnt).forEach(key => { if (key.startsWith("update_visto|")) v += cnt[key].size; if (key.startsWith("update_clique|")) cl += cnt[key].size; }); b.innerHTML = `<span><b>${v}</b> receberam o pedido</span><span><b>${cl}</b> tocaram em atualizar</span>`; }
      });
    } catch (e) { list.forEach(({ b }) => b.textContent = "Números indisponíveis: " + e.message); }
  }
}
async function saveRemote(g, k, data, what) {
  try {
    await set(ref(db, `remote/${g}/${k}`), data);
    S.remote[g] = { ...(S.remote[g] || {}), [k]: data };
    const id = rid(), entry = { type: k, what, at: serverNow() };
    await set(ref(db, `admin/rlog/${g}/${id}`), entry).catch(() => {});
    (S.rlog[g] ||= {})[id] = entry;
    $("#modal").classList.add("hide"); toast("Salvo. Já vale para os jogadores."); render();
  } catch (e) { const el = $("#fErr"); if (el) el.textContent = "Erro ao salvar: " + e.message; else toast("Erro: " + e.message); }
}
function noticeForm(g, edit) {
  const cur = edit ? (S.remote[g]?.notice || {}) : {};
  const nv = newestVersion(g);
  modal(`<h3>${edit ? "Editar aviso" : "Novo aviso"} · ${esc(S.games[g].name || g)}</h3>
    <label>Tipo<select id="nK">${Object.entries(KINDS).filter(([k]) => k !== "update").map(([k, v]) => `<option value="${k}" ${cur.kind === k ? "selected" : ""}>${v[0]}</option>`).join("")}</select></label>
    <label>Título<input id="nT" maxlength="60" value="${esc(cur.title || "")}" placeholder="Ex.: Vídeo novo no canal!"></label>
    <label>Mensagem<textarea id="nX" maxlength="400" placeholder="Escreva o que o jogador vai ler">${esc(cur.text || "")}</textarea></label>
    <label>Link (opcional)<input id="nU" value="${esc(cur.url || "")}" placeholder="https://…"></label>
    <div class="btnrow tiny"><button class="ghost sm" type="button" data-fill="${esc(GAME_URL[g] || "https://lumbragames.github.io/")}">Página do jogo</button><button class="ghost sm" type="button" data-fill="https://www.tiktok.com/">TikTok</button><button class="ghost sm" type="button" data-fill="https://www.youtube.com/">YouTube</button><button class="ghost sm" type="button" data-fill="https://www.instagram.com/">Instagram</button></div>
    <label>Texto do botão<input id="nB" maxlength="24" value="${esc(cur.btn || "")}" placeholder="Ex.: Ver agora"></label>
    <div class="two"><label>Começa<input id="nF" type="datetime-local" value="${toLocal(cur.from)}"></label><label>Termina (opcional)<input id="nE" type="datetime-local" value="${toLocal(cur.to)}"></label></div>
    <label>Quantas vezes mostrar<select id="nQ"><option value="uma" ${cur.freq !== "sessao" ? "selected" : ""}>Uma vez para cada jogador</option><option value="sessao" ${cur.freq === "sessao" ? "selected" : ""}>Toda vez que abrir o jogo</option></select></label>
    <label>Para quem<select id="nV"><option value="">Todas as versões</option>${nv.n ? `<option value="old" ${cur.maxV ? "selected" : ""}>Só versões antigas (abaixo da ${nv.n})</option><option value="new" ${cur.minV ? "selected" : ""}>Só a versão mais nova (${nv.n})</option>` : ""}</select></label>
    ${edit ? '<label class="chk"><input type="checkbox" id="nR"> Mostrar de novo para quem já viu</label>' : ""}
    <p class="muted small">Prévia no celular:</p><div id="nP"></div>
    <p class="err" id="fErr"></p>
    <div class="btnrow"><button class="primary" id="nS">${edit ? "Salvar" : "Publicar aviso"}</button><button class="ghost" data-close>Cancelar</button></div>`);
  const prev = () => $("#nP").innerHTML = phone($("#nK").value, $("#nT").value, $("#nX").value, $("#nB").value, !!$("#nU").value.trim());
  ["#nK", "#nT", "#nX", "#nU", "#nB"].forEach(id => $(id).addEventListener("input", prev)); prev();
  document.querySelectorAll("[data-fill]").forEach(b => b.onclick = () => { $("#nU").value = b.dataset.fill; prev(); $("#nU").focus(); });
  $("#nS").onclick = () => {
    const title = $("#nT").value.trim(), text = $("#nX").value.trim(), url = $("#nU").value.trim();
    if (!title && !text) return $("#fErr").textContent = "Escreva pelo menos o título ou a mensagem.";
    if (url && !/^https:\/\//.test(url)) return $("#fErr").textContent = "O link precisa começar com https://";
    const from = fromLocal($("#nF").value), to = fromLocal($("#nE").value);
    if (to && to <= (from || serverNow())) return $("#fErr").textContent = "O fim precisa ser depois do começo.";
    const vf = $("#nV").value;
    const data = { on: true, id: edit && !$("#nR")?.checked && cur.id ? cur.id : rid(), kind: $("#nK").value, title, text, url, btn: $("#nB").value.trim(),
      from: from || 0, to: to || 0, freq: $("#nQ").value, minV: vf === "new" ? nv.n : 0, maxV: vf === "old" ? nv.n - 1 : 0, created: edit && cur.created ? cur.created : serverNow() };
    saveRemote(g, "notice", data, (edit ? "Aviso editado: " : "Aviso publicado: ") + (title || text.slice(0, 40)));
  };
}
function eventForm(g) {
  const COLORS = ["#ffb347", "#ff6a3d", "#3ddc84", "#4cc9f0", "#8b5cf6", "#ff5470"];
  modal(`<h3>Evento especial · ${esc(S.games[g].name || g)}</h3>
    <div class="two"><label style="flex:0 0 90px">Emoji<input id="eM" maxlength="4" value="🔥"></label><label>Nome do evento<input id="eN" maxlength="40" placeholder="Ex.: Semana do Clássico"></label></div>
    <label>Detalhes (aparecem quando o jogador toca na faixa)<textarea id="eX" maxlength="300" placeholder="Ex.: Essa semana tem clássico em todas as ligas. Mostra teu time!"></textarea></label>
    <label>Cor<div class="colors">${COLORS.map((c, i) => `<button type="button" class="cl ${i ? "" : "on"}" data-c="${c}" style="background:${c}"></button>`).join("")}</div></label>
    <div class="two"><label>Começa<input id="eF" type="datetime-local"></label><label>Termina<input id="eE" type="datetime-local"></label></div>
    <p class="muted small">O evento aparece como uma faixa no topo do jogo, uma vez por sessão, sem atrapalhar a partida. Efeitos dentro do jogo (prêmios em dobro, itens…) precisam ser programados no jogo antes.</p>
    <div id="eP"></div><p class="err" id="fErr"></p>
    <div class="btnrow"><button class="primary" id="eS">Ligar evento</button><button class="ghost" data-close>Cancelar</button></div>`);
  let color = COLORS[0];
  const prev = () => $("#eP").innerHTML = `<div class="pillprev"><i style="background:${color}"></i>${esc(($("#eM").value ? $("#eM").value + " " : "") + ($("#eN").value || "Nome do evento"))}</div>`;
  document.querySelectorAll(".cl").forEach(b => b.onclick = () => { color = b.dataset.c; document.querySelectorAll(".cl").forEach(x => x.classList.toggle("on", x === b)); prev(); });
  ["#eM", "#eN"].forEach(id => $(id).addEventListener("input", prev)); prev();
  $("#eE").value = toLocal(serverNow() + 7 * DAY);
  $("#eS").onclick = () => {
    const name = $("#eN").value.trim(), from = fromLocal($("#eF").value), to = fromLocal($("#eE").value);
    if (!name) return $("#fErr").textContent = "Dê um nome ao evento.";
    if (to && to <= (from || serverNow())) return $("#fErr").textContent = "O fim precisa ser depois do começo.";
    saveRemote(g, "event", { on: true, id: rid(), name, emoji: $("#eM").value.trim(), text: $("#eX").value.trim(), color, from: from || 0, to: to || 0, created: serverNow() }, "Evento ligado: " + name);
  };
}
function updateForm(g) {
  const cur = S.remote[g]?.update || {}, nv = newestVersion(g), vs = {};
  Object.values(S.players[g] || {}).forEach(p => { const n = vnum(p.ver); if (n && p.last > serverNow() - 30 * DAY) vs[n] = (vs[n] || 0) + 1; });
  modal(`<h3>Versão mínima · ${esc(S.games[g].name || g)}</h3>
    <p class="muted small">Jogadores ativos (30 dias) por versão: ${Object.entries(vs).sort((a, b) => b[0] - a[0]).map(([v, n]) => `<span class="chip">${v}: ${n}</span>`).join("") || "—"}</p>
    <label>Versão mínima (número)<input id="uM" type="number" min="1" value="${cur.min || nv.n || ""}"></label>
    <p class="muted small" id="uC"></p>
    <label>Título<input id="uT" maxlength="60" value="${esc(cur.title || "Nova versão disponível")}"></label>
    <label>Mensagem<textarea id="uX" maxlength="300">${esc(cur.text || "Baixe a versão mais recente para ter as novidades e as correções.")}</textarea></label>
    <label>Link para baixar<input id="uU" value="${esc(cur.url || GAME_URL[g] || "https://lumbragames.github.io/")}"></label>
    <label class="chk"><input type="checkbox" id="uB" ${cur.block ? "checked" : ""}> Bloquear o jogo até atualizar</label>
    <p class="warnbox small">⚠️ Com o bloqueio ligado, quem estiver em versão antiga não consegue jogar até baixar a nova. Use só se a versão antiga tiver um problema sério. Quem estiver sem internet continua jogando normalmente.</p>
    <p class="err" id="fErr"></p>
    <div class="btnrow"><button class="primary" id="uS">Salvar</button><button class="ghost" data-close>Cancelar</button></div>`);
  const cnt = () => { const m = +$("#uM").value || 0; const n = Object.entries(vs).filter(([v]) => +v < m).reduce((a, [, x]) => a + x, 0); $("#uC").textContent = m ? `${n} jogador(es) ativo(s) vão receber o pedido.` : ""; };
  $("#uM").oninput = cnt; cnt();
  $("#uS").onclick = () => {
    const min = +$("#uM").value, url = $("#uU").value.trim();
    if (!min) return $("#fErr").textContent = "Informe a versão mínima.";
    if (!/^https:\/\//.test(url)) return $("#fErr").textContent = "O link precisa começar com https://";
    const block = $("#uB").checked;
    if (block && !confirm("Tem certeza? Quem estiver abaixo da versão " + min + " não vai conseguir jogar até atualizar.")) return;
    saveRemote(g, "update", { on: true, min, title: $("#uT").value.trim(), text: $("#uX").value.trim(), url, block, created: serverNow() }, `Versão mínima ${min}${block ? " (com bloqueio)" : ""}`);
  };
}
