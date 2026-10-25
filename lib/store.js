import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const DIR = path.resolve("data");
fs.mkdirSync(DIR, { recursive: true });

const file = (id) => path.join(DIR, `${id.replace(/[^a-z0-9-]/gi, "")}.json`);

export function newId(name) {
  const slug = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  return `${slug || "company"}-${crypto.randomBytes(3).toString("hex")}`;
}

export function save(record) {
  fs.writeFileSync(file(record.id), JSON.stringify(record, null, 2));
  return record;
}

export function load(id) {
  try {
    return JSON.parse(fs.readFileSync(file(id), "utf8"));
  } catch {
    return null;
  }
}

export function list() {
  return fs
    .readdirSync(DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => load(f.slice(0, -5)))
    .filter(Boolean)
    .sort((a, b) => b.created.localeCompare(a.created))
    .map(({ id, created, dossier, totals, views }) => ({
      id,
      created,
      name: dossier.company.name,
      industry: dossier.company.industry,
      hoursPerWeek: totals.hoursPerWeek,
      views: views || [],
    }));
}

export function recordView(id, event) {
  const r = load(id);
  if (!r) return;
  r.views = [...(r.views || []), { at: new Date().toISOString(), ...event }].slice(-200);
  save(r);
}
