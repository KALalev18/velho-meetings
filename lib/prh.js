// Finnish Trade Register (PRH / YTJ) open data. Free, no key.
const BASE = "https://avoindata.prh.fi/opendata-ytj-api/v3/companies";

const english = (descs = []) =>
  (descs.find((d) => d.languageCode === "3") || descs.find((d) => d.languageCode === "1") || {}).description || "";

function currentName(c) {
  const n = (c.names || []).find((x) => x.type === "1" && !x.endDate);
  return n ? n.name : null;
}

function matchScore(name, query) {
  const a = name.toLowerCase();
  const q = query.toLowerCase().trim();
  if (a === q) return 4;
  const bare = a.replace(/\s+(oyj|oy|ab|ltd|ky|ay)$/i, "");
  if (bare === q) return 3;
  if (a.startsWith(q)) return 2;
  if (a.includes(q)) return 1;
  return 0;
}

function summarize(c) {
  const addr = (c.addresses || [])[0] || {};
  const city = english(addr.postOffices?.map((p) => ({ languageCode: p.languageCode, description: p.city })));
  return {
    businessId: c.businessId?.value,
    name: currentName(c),
    registered: c.businessId?.registrationDate || c.registrationDate,
    industry: english(c.mainBusinessLine?.descriptions),
    form: english((c.companyForms || []).find((f) => !f.endDate)?.descriptions),
    address: [addr.street && `${addr.street} ${addr.buildingNumber || ""}`.trim(), addr.postCode, city].filter(Boolean).join(", "),
    website: c.website?.url || null,
    situations: (c.companySituations || []).map((s) => english(s.descriptions)).filter(Boolean),
    tradeNames: (c.names || []).filter((n) => n.type === "3" && !n.endDate).map((n) => n.name).slice(0, 10),
    source: `https://tietopalvelu.ytj.fi/yritys/${c.businessId?.value}`,
  };
}

export async function lookupCompany(query) {
  const q = query.trim();
  const isId = /^\d{7}-\d$/.test(q);
  const url = `${BASE}?${isId ? "businessId" : "name"}=${encodeURIComponent(q)}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const json = await res.json();
    const live = (json.companies || []).filter((c) => currentName(c));
    if (!live.length) return null;
    if (isId) return summarize(live[0]);
    // Prefer the best name match; among equals, the oldest (most established) company.
    live.sort(
      (a, b) =>
        matchScore(currentName(b), q) - matchScore(currentName(a), q) ||
        String(a.businessId?.registrationDate).localeCompare(String(b.businessId?.registrationDate)),
    );
    return matchScore(currentName(live[0]), q) > 0 ? summarize(live[0]) : null;
  } catch {
    return null;
  }
}
