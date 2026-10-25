const $app = document.getElementById("app");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const eur = (n) => "€" + Math.round(n).toLocaleString("fi-FI").replace(/ /g, " ");
const ago = (iso) => {
  const s = (Date.now() - new Date(iso)) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const pageUrl = (id) => `${location.origin}/p/${id}`;
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };

function route() {
  const h = location.hash.slice(1) || "/";
  if (h.startsWith("/d/")) return showDossier(h.slice(3));
  if (h.startsWith("/run/")) return showRun(decodeURIComponent(h.slice(5)));
  showHome();
}
window.addEventListener("hashchange", route);
route();

/* ---------------- home ---------------- */
async function showHome() {
  $app.innerHTML = `
  <section class="hero">
    <div class="mono muted">Proof before pitch</div>
    <h1>Every company publishes its manual work.<br><em>We read it back to them.</em></h1>
    <p>Type any company. In about two minutes you get the manual work they admit to in their own job ads, why now is the moment, a page made for exactly that company, and a reply-worthy email to its CEO.</p>
    <form class="search" id="f">
      <input id="q" placeholder="Company name or Y-tunnus, e.g. Ponsse Oyj" autocomplete="off" autofocus>
      <button class="btn">Find the hidden hours →</button>
    </form>
  </section>
  <section class="steps3">
    <div><span class="mono muted">01</span><b>Read</b><p>Trade register, open job ads, news, website. Live, with sources.</p></div>
    <div><span class="mono muted">02</span><b>Quote</b><p>Their own sentences about manual work, priced in hours and euros.</p></div>
    <div><span class="mono muted">03</span><b>Make it theirs</b><p>A one-of-one page and an email in English and Finnish.</p></div>
    <div><span class="mono muted">04</span><b>Rehearse</b><p>Pitch their simulated CEO before the real one replies.</p></div>
  </section>
  <section>
    <div class="row-between"><h2 style="margin:0">Pipeline</h2><span class="mono muted" id="count"></span></div>
    <div id="pipe"><p class="muted">Loading…</p></div>
  </section>`;
  document.getElementById("f").onsubmit = (e) => {
    e.preventDefault();
    const q = document.getElementById("q").value.trim();
    if (q) location.hash = `/run/${encodeURIComponent(q)}`;
  };
  const rows = await fetch("/api/dossiers").then((r) => r.json());
  document.getElementById("count").textContent = rows.length === 1 ? "1 company" : `${rows.length} companies`;
  document.getElementById("pipe").innerHTML = rows.length
    ? `<table class="pipe"><thead><tr><th>Company</th><th class="hide-m">Industry</th><th>Hidden h/wk</th><th>Their page</th><th class="hide-m">Created</th></tr></thead><tbody>
      ${rows.map((r) => {
        const opens = r.views.filter((v) => v.kind === "open");
        const last = opens.at(-1);
        const forwarded = r.views.some((v) => v.kind === "share");
        return `<tr onclick="location.hash='/d/${r.id}'"><td><b>${esc(r.name)}</b></td><td class="hide-m muted">${esc(r.industry)}</td><td>${r.hoursPerWeek}</td>
        <td>${opens.length ? `<span class="chip hot">opened ${opens.length}× · ${ago(last.at)}</span>` : `<span class="muted">not opened</span>`}${forwarded ? ` <span class="chip hot">forwarded</span>` : ""}</td><td class="hide-m muted">${ago(r.created)}</td></tr>`;
      }).join("")}</tbody></table>`
    : `<div class="card muted">No companies yet. Run the first one above.</div>`;
}

/* ---------------- live run ---------------- */
function showRun(company) {
  $app.innerHTML = `
  <div class="mono muted">Researching</div>
  <h1 style="font-size:40px;margin:6px 0 24px;letter-spacing:-.02em">${esc(company)}</h1>
  <div class="run">
    <div class="feed" id="feed"></div>
    <aside class="list">
      <div class="card"><div class="mono muted">Elapsed</div><div class="timer" id="t">0:00</div></div>
      <div class="card" id="reg"><div class="mono muted">Trade register</div><p class="muted" style="margin:6px 0 0">Looking up…</p></div>
      <div class="card"><div class="mono muted">Searches · pages read</div><div class="timer" id="cnt" style="font-size:32px">0 · 0</div></div>
    </aside>
  </div>`;
  const feed = document.getElementById("feed");
  const add = (k, v, cls = "") => {
    feed.insertAdjacentHTML("beforeend", `<div class="row ${cls}"><span class="k">${esc(k)}</span><span class="v">${v}</span></div>`);
    feed.scrollTop = feed.scrollHeight;
  };
  let searches = 0, reads = 0;
  const t0 = Date.now();
  const tick = setInterval(() => {
    const s = Math.floor((Date.now() - t0) / 1000);
    document.getElementById("t").textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }, 250);

  const es = new EventSource(`/api/run?company=${encodeURIComponent(company)}`);
  const on = (type, fn) => es.addEventListener(type, (e) => fn(JSON.parse(e.data)));
  on("step", (d) => add("▸", esc(d.label), "step"));
  on("register", (d) => {
    document.getElementById("reg").innerHTML = d.notFound
      ? `<div class="mono muted">Trade register</div><p style="margin:6px 0 0">No exact Finnish match. Researching from the web instead.</p>`
      : `<div class="mono muted">Trade register</div><h3 style="margin-top:6px">${esc(d.name)}</h3><dl class="kv">
        <dt>Y-tunnus</dt><dd>${esc(d.businessId)}</dd><dt>Registered</dt><dd>${esc(d.registered)}</dd>
        <dt>Industry</dt><dd>${esc(d.industry)}</dd><dt>Address</dt><dd>${esc(d.address)}</dd></dl>`;
    add("register", d.notFound ? "no exact match" : `${esc(d.name)} · ${esc(d.businessId)}`);
  });
  on("search", (d) => { searches++; add("search", `“${esc(d.query)}”`); upd(); });
  on("results", (d) => add("", `<span style="opacity:.6">${d.count} results${d.top?.length ? " · " + d.top.map(esc).join(" · ") : ""}</span>`));
  on("fetch", (d) => { reads++; add("read", esc(d.url)); upd(); });
  on("done", (d) => { es.close(); clearInterval(tick); add("✓", "Dossier ready", "step"); setTimeout(() => (location.hash = `/d/${d.id}`), 600); });
  on("fail", (d) => { es.close(); clearInterval(tick); add("error", esc(d.message), "err"); add("", `<a href="#/" style="color:#fff">← back</a>`); });
  es.onerror = () => { if (es.readyState === EventSource.CLOSED) clearInterval(tick); };
  function upd() { document.getElementById("cnt").textContent = `${searches} · ${reads}`; }
}

/* ---------------- dossier ---------------- */
let cur = null;
async function showDossier(id) {
  const res = await fetch(`/api/dossier/${id}`);
  if (!res.ok) { $app.innerHTML = `<p>Not found. <a href="#/">Back</a></p>`; return; }
  cur = await res.json();
  const { dossier: d, totals: t, register: r } = cur;
  $app.innerHTML = `
  <a href="#/" class="mono muted" style="text-decoration:none">← Pipeline</a>
  <div class="dhead">
    <div>
      <div class="mono muted">${esc(d.company.industry)} · ${esc(d.company.hq)}</div>
      <h1>${esc(d.company.name)}</h1>
      <p>${esc(d.company.one_liner)}</p>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${r ? `<a class="chip" href="${esc(r.source)}" target="_blank">Y-tunnus ${esc(r.businessId)}</a><span class="chip">Est. ${esc(r.registered?.slice(0, 4))}</span>` : ""}
        <span class="chip">${esc(d.company.size)}</span>
        <span class="chip">${plural(cur.research.sources.length, "source")} · ${cur.seconds}s</span>
      </div>
    </div>
    <div class="big">
      <div class="mono muted">Manual work they admit to</div>
      <div class="n">~${t.hoursPerWeek}<small> h/week</small></div>
      <div class="e">costing ≈ ${eur(t.eurPerYear)} a year at ${eur(t.hourlyCost)}/h</div>
      <div class="actions">
        <a class="btn" href="/p/${cur.id}?preview=1" target="_blank">Open their page ↗</a>
        <button class="btn ghost" id="copyLink">Copy page link</button>
      </div>
    </div>
  </div>
  <nav class="tabs" id="tabs">
    ${["Evidence", "Why now", "Outreach", "Rehearse", "Engagement", "Sources"].map((x, i) => `<button data-t="${i}" class="${i ? "" : "on"}">${x}</button>`).join("")}
  </nav>
  <section id="tab"></section>`;
  document.getElementById("copyLink").onclick = (e) => copy(pageUrl(cur.id), e.target);
  const tabs = [tabEvidence, tabWhyNow, tabOutreach, tabRehearse, tabEngagement, tabSources];
  document.getElementById("tabs").onclick = (e) => {
    const b = e.target.closest("button"); if (!b) return;
    document.querySelectorAll("#tabs button").forEach((x) => x.classList.toggle("on", x === b));
    tabs[b.dataset.t]();
  };
  tabEvidence();
}

const $tab = () => document.getElementById("tab");

function tabEvidence() {
  const d = cur.dossier;
  $tab().innerHTML = `
  <div class="grid2">
    ${d.hidden_work.map((w) => `
    <article class="card ev">
      <div class="row-between" style="margin:0"><b>${esc(w.area)}</b><span class="chip ${w.confidence}">${w.confidence} confidence</span></div>
      ${w.quote_is_verbatim === false
        ? `<div><span class="chip medium">paraphrase · verify before quoting</span></div><blockquote style="font-style:italic">${esc(w.evidence_quote)}</blockquote>`
        : `<blockquote>“${esc(w.evidence_quote)}”</blockquote>`}
      ${w.evidence_translation ? `<div class="tr">${esc(w.evidence_translation)}</div>` : ""}
      <a class="src" href="${esc(w.source_url)}" target="_blank">${esc(w.source_label)} ↗</a>
      <div class="arrow"><b>TODAY</b><span>${esc(w.today)}</span><b>FIX</b><span>${esc(w.fix)}</span></div>
      <div class="foot"><span class="muted">Effort: ${esc(w.effort || "–")}${w.weeks_to_value ? ` · value in ~${w.weeks_to_value} wk` : ""}</span><b>${w.hours_per_week_low}–${w.hours_per_week_high} h/week</b></div>
    </article>`).join("")}
  </div>
  <div class="card" style="margin-top:16px;background:var(--navy);color:#fff;border:0">
    <div class="mono" style="color:var(--blue-soft)">What we'd build first · two weeks</div>
    <h2 style="margin:8px 0">${esc(d.first_build.title)}</h2>
    <p style="opacity:.85;margin:0 0 12px">${esc(d.first_build.pitch)}</p>
    <ol style="margin:0 0 12px;padding-left:20px;opacity:.9">${d.first_build.plan.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>
    <b>${esc(d.first_build.impact)}</b>
  </div>`;
}

function tabWhyNow() {
  const d = cur.dossier;
  $tab().innerHTML = d.why_now.length
    ? `<div class="list">${d.why_now.map((w) => `
      <div class="card"><div class="row-between" style="margin:0 0 6px"><b>${esc(w.signal)}</b><span><span class="mono muted">${esc(w.date)}</span> <span class="chip ${w.strength}">${w.strength}</span></span></div>
      <div>${esc(w.detail)}</div><a class="src" style="font-size:13px" href="${esc(w.source_url)}" target="_blank">${esc(host(w.source_url))} ↗</a></div>`).join("")}</div>`
    : `<div class="card muted">No strong, dated trigger found in public sources. Lead with the manual-work evidence instead.</div>`;
}

function tabOutreach() {
  const d = cur.dossier, o = d.outreach, dm = d.decision_maker;
  const fill = (s) => s.replaceAll("{{PAGE_LINK}}", pageUrl(cur.id));
  $tab().innerHTML = `
  <div class="grid2" style="grid-template-columns:2fr 1fr">
    <div>
      <div class="row-between">
        <div><span class="mono muted">Subject</span><div style="font-weight:600;font-size:18px">${esc(o.email_subject)}</div></div>
        <div class="seg" id="lang"><button class="on" data-l="en">English</button><button data-l="fi">Suomi</button></div>
      </div>
      <textarea class="email" id="em">${esc(fill(o.email_en))}</textarea>
      <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
        <button class="btn small" id="cpE">Copy email</button>
        <button class="btn small ghost" id="toSim">Test it on their simulated ${esc(dm.role)} →</button>
      </div>
      <h3 style="margin:28px 0 8px">LinkedIn note</h3>
      <div class="card">${esc(fill(o.linkedin_note))}</div>
      <button class="btn small ghost" style="margin-top:8px" id="cpL">Copy note</button>
    </div>
    <aside class="list">
      <div class="card"><div class="mono muted">Send to</div><h3 style="margin:6px 0 2px">${esc(dm.name || dm.role)}</h3>
        <div class="muted">${dm.name ? esc(dm.role) : "Name not confirmed in public sources"}</div>
        ${dm.name_source_url ? `<a style="font-size:13px" href="${esc(dm.name_source_url)}" target="_blank">source ↗</a>` : ""}
        <p style="margin:10px 0 0;font-size:14px">${esc(dm.why_them)}</p></div>
      <div class="card"><div class="mono muted">Why this lands</div><p style="margin:6px 0 0;font-size:14px">${esc(o.why_it_works)}</p></div>
      ${d.objections.length ? `<div class="card"><div class="mono muted">Likely objections</div>${d.objections.map((x) => `<p style="font-size:14px;margin:10px 0 0"><b>“${esc(x.objection)}”</b><br>${esc(x.answer)}</p>`).join("")}</div>` : ""}
    </aside>
  </div>`;
  document.getElementById("lang").onclick = (e) => {
    const b = e.target.closest("button"); if (!b) return;
    document.querySelectorAll("#lang button").forEach((x) => x.classList.toggle("on", x === b));
    document.getElementById("em").value = fill(b.dataset.l === "fi" ? o.email_fi : o.email_en);
  };
  document.getElementById("cpE").onclick = (e) => copy(`Subject: ${o.email_subject}\n\n${document.getElementById("em").value}`, e.target);
  document.getElementById("cpL").onclick = (e) => copy(fill(o.linkedin_note), e.target);
  document.getElementById("toSim").onclick = () => {
    chat = [];
    pendingDraft = document.getElementById("em").value;
    document.querySelector('#tabs button[data-t="3"]').click();
  };
}

let chat = [];
let pendingDraft = "";
function tabRehearse() {
  const p = cur.dossier.persona;
  $tab().innerHTML = `
  <div class="row-between"><div><span class="mono muted">You're pitching</span><h3 style="margin:2px 0 0">${esc(p.name_or_role)}, ${esc(cur.dossier.company.name)}</h3>
    <div class="muted" style="font-size:14px">Cares about: ${esc(p.priorities.join(" · "))}</div></div>
    <div style="display:flex;gap:8px"><button class="btn small ghost" id="reset">Start over</button><button class="btn small" id="coachBtn">Coach me</button></div></div>
  <div class="chat" id="chat"></div>
  <div class="composer"><textarea id="say" placeholder="Write your opening line, or paste your email…"></textarea><button class="btn" id="send">Send</button></div>
  <div id="coach"></div>`;
  const $chat = document.getElementById("chat"), $say = document.getElementById("say");
  const render = () => {
    $chat.innerHTML = chat.length
      ? chat.map((m) => `<div class="msg ${m.role}"><span class="who">${m.role === "user" ? "You · Velho" : esc(p.name_or_role)}</span>${esc(m.content)}</div>`).join("")
      : `<p class="muted" style="margin:auto;text-align:center">A skeptical ${esc(p.name_or_role)} built from this company's public situation.<br>Busy, pitched constantly, allergic to buzzwords.</p>`;
    $chat.scrollTop = $chat.scrollHeight;
  };
  render();
  if (pendingDraft) { $say.value = pendingDraft; pendingDraft = ""; }
  document.getElementById("reset").onclick = () => { chat = []; document.getElementById("coach").innerHTML = ""; render(); };
  document.getElementById("send").onclick = send;
  $say.onkeydown = (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) send(); };
  document.getElementById("coachBtn").onclick = async (e) => {
    if (!chat.length) return;
    e.target.disabled = true; e.target.textContent = "Coaching…";
    const r = await fetch(`/api/coach/${cur.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: chat }) }).then((x) => x.json());
    document.getElementById("coach").innerHTML = `<div class="coach">${esc(r.text || r.error)}</div>`;
    e.target.disabled = false; e.target.textContent = "Coach me";
  };
  async function send() {
    const text = $say.value.trim(); if (!text) return;
    $say.value = "";
    chat.push({ role: "user", content: text });
    const reply = { role: "assistant", content: "" };
    chat.push(reply); render();
    const bubble = $chat.lastElementChild;
    const res = await fetch(`/api/rehearse/${cur.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: chat.slice(0, -1) }) });
    const reader = res.body.getReader(), dec = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      reply.content += dec.decode(value, { stream: true });
      bubble.innerHTML = `<span class="who">${esc(p.name_or_role)}</span>${esc(reply.content)}`;
      $chat.scrollTop = $chat.scrollHeight;
    }
  }
}

function tabEngagement() {
  const v = cur.views || [];
  $tab().innerHTML = `
  <p class="muted" style="margin-top:0">Every time someone opens their page or plays with the calculator, it shows up here, so you know when to follow up. Your own previews are not counted.</p>
  ${v.length ? `<table class="pipe"><thead><tr><th>When</th><th>What</th><th>Detail</th></tr></thead><tbody>
    ${v.slice().reverse().map((x) => `<tr><td>${new Date(x.at).toLocaleString("en-GB")}</td><td>${esc(x.kind)}</td><td class="muted">${esc(x.detail)}</td></tr>`).join("")}</tbody></table>`
    : `<div class="card muted">Not opened yet.</div>`}`;
}

function tabSources() {
  $tab().innerHTML = `
  <div class="grid2">
    <div><h3>Sources (${cur.research.sources.length})</h3>${cur.research.sources.length ? "" : `<p class="muted">No sources recorded.</p>`}<div class="list" style="font-size:14px">${cur.research.sources.map((s) => `<div><a href="${esc(s.url)}" target="_blank">${esc(s.title)}</a><div class="muted" style="font-size:12px">${esc(host(s.url))}</div></div>`).join("")}</div></div>
    <div><h3>Research notes</h3><div class="notes">${esc(cur.research.notes)}</div></div>
  </div>`;
}

function copy(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    const old = btn.textContent; btn.textContent = "Copied ✓";
    setTimeout(() => (btn.textContent = old), 1400);
  });
}
