// Self-hosted web search + page reader, used when the model provider has no
// built-in web tools (e.g. Claude through OpenRouter).
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

const decode = (s) =>
  s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
const strip = (s) => decode(s.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();

// Search engines rate-limit scrapers, so try several and rest any engine that just blocked us.
const ENGINES = [
  { name: "bing", url: (q) => `https://www.bing.com/search?q=${encodeURIComponent(q)}&setlang=fi&cc=FI`, parse: parseBing },
  { name: "duckduckgo", url: (q) => `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}&kl=fi-fi`, parse: parseDdg },
  { name: "brave", url: (q) => `https://search.brave.com/search?q=${encodeURIComponent(q)}`, parse: parseBrave },
];
const restingUntil = {};

export async function webSearch(query) {
  const tried = [];
  for (const engine of ENGINES) {
    if ((restingUntil[engine.name] || 0) > Date.now()) continue;
    tried.push(engine.name);
    try {
      const res = await fetch(engine.url(query), {
        headers: { "User-Agent": UA, "Accept-Language": "fi,en;q=0.8", Accept: "text/html" },
        signal: AbortSignal.timeout(15000),
      });
      const results = res.status === 200 ? relevant(engine.parse(await res.text()), query) : [];
      if (results.length >= 2) return results;
      // Blocked (202/429/captcha) or empty: rest this engine for 10 minutes and try the next.
      if (res.status !== 200) restingUntil[engine.name] = Date.now() + 10 * 60 * 1000;
    } catch {
      restingUntil[engine.name] = Date.now() + 2 * 60 * 1000;
    }
  }
  if (!tried.length) throw new Error("all search engines are rate-limiting us; try again in a few minutes");
  return [];
}

// Engines sometimes serve unrelated filler to scrapers. Keep results that mention a query word.
function relevant(results, query) {
  const fold = (s) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
  const words = fold(query).split(/[^a-z0-9]+/).filter((w) => w.length >= 4);
  if (!words.length) return results;
  return results.filter((r) => {
    const hay = fold(`${r.title} ${r.url} ${r.snippet}`);
    return words.some((w) => hay.includes(w));
  });
}

function parseBing(html) {
  const results = [];
  for (const block of html.split('<li class="b_algo"').slice(1)) {
    const a = block.match(/<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!a) continue;
    let url = decode(a[1]);
    const u = url.match(/[?&]u=a1([^&]+)/); // bing.com/ck/a redirect: base64url target after "a1"
    if (u) {
      try { url = Buffer.from(u[1], "base64url").toString("utf8"); } catch { continue; }
    }
    if (!/^https?:\/\//.test(url) || /bing\.com\//.test(url)) continue;
    const snippet = (block.match(/<p[^>]*>([\s\S]*?)<\/p>/) || [])[1];
    results.push({ url, title: strip(a[2]), snippet: strip(snippet || "") });
    if (results.length >= 8) break;
  }
  return results;
}

function parseBrave(html) {
  const results = [];
  for (const block of html.split('data-type="web"').slice(1)) {
    const href = (block.match(/<a href="(https?:[^"]+)"/) || [])[1];
    if (!href || /brave\.com/.test(href)) continue;
    const title = (block.match(/class="title[^"]*"[^>]*>([\s\S]*?)<\/div>/) || [])[1];
    const desc = (block.match(/class="(?:snippet-description|generic-snippet|description)[^"]*"[^>]*>([\s\S]*?)<\/div>/) || [])[1];
    results.push({ url: decode(href), title: strip(title || href), snippet: strip(desc || "") });
    if (results.length >= 8) break;
  }
  return results;
}

function parseDdg(html) {
  const results = [];
  const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:class="result__snippet"[^>]*>([\s\S]*?)<\/a>)?/g;
  for (let m; (m = re.exec(html)) && results.length < 8; ) {
    let url = decode(m[1]);
    const u = url.match(/[?&]uddg=([^&]+)/);
    if (u) url = decodeURIComponent(u[1]);
    if (url.startsWith("//")) url = "https:" + url;
    if (/duckduckgo\.com\/y\.js|bing\.com\/aclick/.test(url)) continue; // ads
    results.push({ url, title: strip(m[2]), snippet: strip(m[3] || "") });
  }
  return results;
}

export async function fetchPage(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, "Accept-Language": "fi,en;q=0.8" },
    redirect: "follow",
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const type = res.headers.get("content-type") || "";
  if (!/html|text|json/.test(type)) throw new Error(`unsupported content type ${type}`);
  const html = await res.text();
  const title = strip((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || url);
  // JSON-LD often carries the full job posting text on job sites.
  const jsonLd = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).join("\n");
  const text = strip(
    html
      .replace(/<(script|style|noscript|svg|nav|footer|header)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<\/(p|div|li|h\d|br|tr|section)>/gi, "\n"),
  );
  const ld = jsonLd ? `\n\nSTRUCTURED DATA:\n${strip(jsonLd).slice(0, 6000)}` : "";
  const finalUrl = res.url || url;
  return { url: finalUrl, title, text: (text + ld).slice(0, 12000) + listLinks(html, finalUrl) };
}

// Links on the page, job-ad-like ones first, so the model can open individual ads from a listing.
function listLinks(html, base) {
  const seen = new Set(), links = [];
  for (const m of html.matchAll(/<a[^>]+href="([^"#]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    let href;
    try { href = new URL(decode(m[1]), base).href; } catch { continue; }
    const label = strip(m[2]).slice(0, 90);
    if (!/^https?:/.test(href) || seen.has(href) || label.length < 4 || /suosikkeihin|login|kirjaudu|cookie/i.test(href)) continue;
    seen.add(href);
    const rank = /tyopaikat\/tyo\/|\/jobs?\/[\w-]{6,}|\/job\/|\/position|vacanc|\/avoin-tyopaikka/i.test(href) ? 2
      : /careers?|rekry|avoimet|tyopaikat|ura\./i.test(href) ? 1 : 0;
    links.push({ href, label, rank });
  }
  const top = links.sort((a, b) => b.rank - a.rank).slice(0, 40);
  return top.length ? `\n\nLINKS ON PAGE:\n${top.map((l) => `- ${l.label}: ${l.href}`).join("\n")}` : "";
}
