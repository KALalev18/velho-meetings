const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const eur = (n) => "€" + Math.round(n).toLocaleString("fi-FI").replace(/ /g, " ");
const id = location.pathname.split("/").pop();
const preview = new URLSearchParams(location.search).has("preview");
const track = (kind, detail = "") => {
  if (preview) return;
  fetch(`/api/view/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, detail }), keepalive: true }).catch(() => {});
};

Promise.all([fetch(`/api/dossier/${id}`), fetch("/api/config")]).then(async ([a, b]) => {
  if (!a.ok) { document.getElementById("root").innerHTML = `<p style="padding:40px">This page is no longer available.</p>`; return; }
  render(await a.json(), await b.json());
  track("open", document.referrer ? new URL(document.referrer).hostname : "direct");
});

const EFFORT = { small: { w: 1, label: "Small · ~2 weeks" }, medium: { w: 2.5, label: "Medium · 1–2 months" }, large: { w: 5, label: "Large · a quarter+" } };
// Internal research caveats ("confirm exact wording", ...) are for Velho, not the client.
const clientLabel = (s) => s.replace(/\s*\([^)]*(confirm|verify|research notes|not original|AI summary)[^)]*\)/gi, "").replace(/;\s*$/, "");
const mid = (w) => (w.hours_per_week_low + w.hours_per_week_high) / 2;

function render(rec, cfg) {
  const d = rec.dossier, t = rec.totals, m = d.microsite, fb = d.first_build;
  const who = d.decision_maker.name ? `${d.decision_maker.name}, ${d.decision_maker.role}` : d.decision_maker.role;
  const made = new Date(rec.created).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const book = cfg.bookingUrl || `mailto:?subject=${encodeURIComponent(`${d.company.name} × Velho: 20 minutes`)}`;
  const shareUrl = `${location.origin}/p/${id}`;
  const share = `mailto:?subject=${encodeURIComponent(`Worth a look: hidden hours at ${d.company.name}`)}&body=${encodeURIComponent(`Someone read our job ads and estimated ~${t.hoursPerWeek} hours a week of manual work, with sources. Two minutes to read:\n\n${shareUrl}`)}`;
  document.title = `${d.company.name} · Velho`;

  // Best value for the effort first: that's where a CEO starts.
  const ranked = d.hidden_work.map((w) => ({ ...w, score: mid(w) / (EFFORT[w.effort] || EFFORT.medium).w })).sort((a, b) => b.score - a.score);
  let n = 0;
  const num = () => String(++n).padStart(2, "0");

  document.getElementById("root").innerHTML = `
  <header class="hero"><div class="wrap">
    <nav><b>Velho</b><span>Prepared for ${esc(who)} · ${esc(d.company.name)}</span></nav>
    <div class="kicker">Made for exactly one company</div>
    <h1>${esc(m.headline)}</h1>
    <p class="sub">${esc(m.subhead)}</p>
    <p class="opener">${esc(m.opener)}</p>
    <div class="meter">
      <div><div class="n">${t.hoursPerWeek}</div><div class="l">hours a week, estimated</div></div>
      <div><div class="n">${d.hidden_work.length}</div><div class="l">${d.hidden_work.length === 1 ? "process" : "processes"}, in your own words</div></div>
      <div><div class="n">2</div><div class="l">weeks to remove the first one</div></div>
    </div>
    <div class="sharebar">
      <a class="btn ghost-dark" id="share" href="${esc(share)}">Forward to your ${/CFO|financ/i.test(d.decision_maker.role) ? "CEO / COO" : "CFO / COO"}</a>
      <button class="btn ghost-dark" id="pdf">Save as PDF</button>
    </div>
  </div></header>

  <section class="s"><div class="wrap">
    <div class="kicker">${num()} · In your own words</div>
    <h2 class="t">You've already described the work that's slowing you down.</h2>
    <p class="lead">These are sentences ${esc(d.company.name)} has published, mostly in its own job ads. Each one is part of someone's week spent on work a machine can do.</p>
    <div class="quotes">
      ${d.hidden_work.map((w) => `
      <div class="q">
        <div>
          ${w.quote_is_verbatim === false
            ? `<div class="lab">Paraphrased from the ad</div><p class="para">${esc(w.evidence_quote)}</p>`
            : `<blockquote>${esc(w.evidence_quote)}</blockquote>`}
          ${w.evidence_translation ? `<p class="tr">${esc(w.evidence_translation)}</p>` : ""}
          <div class="src">${esc(clientLabel(w.source_label))} · <a href="${esc(w.source_url)}" target="_blank" rel="noopener">source</a></div>
        </div>
        <div class="side">
          <div><div class="lab">Today, probably</div>${esc(w.today)}</div>
          <div><div class="lab">What we'd build</div>${esc(w.fix)}</div>
          <div class="h">${w.hours_per_week_low}–${w.hours_per_week_high} <small>hours / week</small></div>
        </div>
      </div>`).join("")}
    </div>
  </div></section>

  <section class="s"><div class="wrap">
    <div class="kicker">${num()} · Where to start</div>
    <h2 class="t">Ranked by hours saved for the effort.</h2>
    <p class="lead">Not everything is worth automating, and not all at once. Start with the item at the top, measure it, then decide on the next one.</p>
    <div class="prio">
      <div class="prow head"><span>#</span><span>Process</span><span>Hours / week</span><span>Effort</span><span>Time to value</span></div>
      ${ranked.map((w, i) => `
      <div class="prow${i === 0 ? " top" : ""}">
        <span class="rank">${i + 1}</span>
        <span><b>${esc(w.area)}</b>${i === 0 ? ` <em class="start">Start here</em>` : ""}<small>${esc(w.fix)}</small></span>
        <span data-l="Hours / week">${w.hours_per_week_low}–${w.hours_per_week_high}</span>
        <span data-l="Effort">${esc((EFFORT[w.effort] || EFFORT.medium).label)}</span>
        <span data-l="Time to value">${w.weeks_to_value ? `~${w.weeks_to_value} weeks` : "–"}</span>
      </div>`).join("")}
    </div>
  </div></section>

  <section class="s"><div class="wrap">
    <div class="kicker">${num()} · Your numbers</div>
    <h2 class="t">Check our maths, and the payback.</h2>
    <p class="lead">Our estimates are deliberately conservative. Move the sliders to match what you know, including what you'd be willing to spend on the first build.</p>
    <div class="calc">
      <div>
        <label>Manual hours per week <span id="hv"></span></label><input type="range" id="h" min="5" max="${Math.max(80, t.hoursPerWeek * 2)}" value="${t.hoursPerWeek}">
        <label>Loaded cost per hour <span id="cv"></span></label><input type="range" id="c" min="30" max="100" value="${cfg.hourlyCost}">
        <label>Share we can automate <span id="pv"></span></label><input type="range" id="p" min="30" max="90" step="5" value="60">
        <label>Cost of the first build <span id="bv"></span></label><input type="range" id="b" min="5000" max="80000" step="2500" value="20000">
      </div>
      <div class="out">
        <div class="n" id="eur"></div><div class="l">freed up every year</div>
        <div class="row"><span>Pays for itself in</span><b id="pay"></b></div>
        <div class="row"><span>Hours back per year</span><b id="hrs"></b></div>
        <div class="row"><span>What this work costs today</span><b id="all"></b></div>
      </div>
    </div>
  </div></section>

  ${d.why_now.length ? `
  <section class="s"><div class="wrap">
    <div class="kicker">${num()} · Why now</div>
    <h2 class="t">The moment matters as much as the idea.</h2>
    <div class="why">${d.why_now.map((w) => `<div><div class="d">${esc(w.date)}</div><div><b>${esc(w.signal)}</b>${esc(w.detail)}<br><a href="${esc(w.source_url)}" target="_blank" rel="noopener">source</a></div></div>`).join("")}</div>
  </div></section>` : ""}

  <section class="s"><div class="wrap">
    <div class="kicker">${num()} · The first two weeks</div>
    <h2 class="t">${esc(fb.title)}</h2>
    <p class="lead">${esc(fb.pitch)}</p>
    <div class="plan">${fb.plan.map((s, i) => `<div><div class="num">${String(i + 1).padStart(2, "0")}</div><p>${esc(s)}</p></div>`).join("")}</div>
    ${fb.kpis.length ? `
    <h3 class="sub3">How you'll know it worked</h3>
    <div class="kpis">
      <div class="krow head"><span>Measure</span><span>Today (est.)</span><span>Target</span></div>
      ${fb.kpis.map((k) => `<div class="krow"><span>${esc(k.metric)}</span><span data-l="Today">${esc(k.today)}</span><span data-l="Target"><b>${esc(k.target)}</b></span></div>`).join("")}
    </div>` : ""}
    <div class="duo">
      ${fb.time_back_to ? `<div><div class="lab">Where the hours go</div><p>${esc(fb.time_back_to)}</p></div>` : ""}
      ${fb.data_needed ? `<div><div class="lab">What we'd need from you</div><p>${esc(fb.data_needed)}</p></div>` : ""}
    </div>
    <p class="impact">${esc(fb.impact)}</p>
  </div></section>

  ${fb.risks.length ? `
  <section class="s"><div class="wrap">
    <div class="kicker">${num()} · Risks, data and people</div>
    <h2 class="t">What could go wrong, and how it's handled.</h2>
    <div class="risks">${fb.risks.map((r) => `<div><b>${esc(r.risk)}</b><p>${esc(r.safeguard)}</p></div>`).join("")}</div>
  </div></section>` : ""}

  <section class="s cta"><div class="wrap">
    <div class="kicker" style="color:var(--blue-soft)">Velho · AI growth partner</div>
    <h2 class="t">${esc(m.closing)}</h2>
    <p class="lead">We find the manual work that slows a company down, build the fix, and stay until your team actually uses it every day.</p>
    <a class="btn" id="book" href="${esc(book)}" target="_blank" rel="noopener">Book 20 minutes →</a>
  </div></section>

  <div class="wrap"><footer class="f"><span>Made for ${esc(d.company.name)} on ${made}, from public sources only. Estimates, not audits.</span><span>Velho</span></footer></div>`;

  const $ = (x) => document.getElementById(x);
  let touched = false;
  const calc = () => {
    const h = +$("h").value, c = +$("c").value, p = +$("p").value / 100, b = +$("b").value;
    $("hv").textContent = `${h} h`; $("cv").textContent = eur(c); $("pv").textContent = `${Math.round(p * 100)} %`; $("bv").textContent = eur(b);
    const hrs = h * 46 * p, saved = hrs * c;
    $("eur").textContent = eur(saved);
    $("hrs").textContent = Math.round(hrs).toLocaleString("en-GB");
    $("all").textContent = `${eur(h * 46 * c)} / year`;
    const months = saved > 0 ? (b / saved) * 12 : Infinity;
    $("pay").textContent = !isFinite(months) ? "–" : months < 1 ? "under a month" : months > 36 ? "over 3 years" : `${Math.ceil(months)} months`;
  };
  ["h", "c", "p", "b"].forEach((k) => $(k).addEventListener("input", () => {
    calc();
    if (!touched) { touched = true; track("calculator", "adjusted the numbers"); }
  }));
  ["h", "b"].forEach((k) => $(k).addEventListener("change", () => track("calculator", `${$("h").value} h · ${$("c").value} €/h · ${$("p").value} % · build ${eur(+$("b").value)} → ${$("pay").textContent}`)));
  $("book").addEventListener("click", () => track("book", "clicked Book 20 minutes"));
  $("share").addEventListener("click", () => track("share", "forwarded to a colleague"));
  $("pdf").addEventListener("click", () => { track("pdf", "saved as PDF"); window.print(); });
  calc();
}
