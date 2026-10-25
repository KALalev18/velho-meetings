import { stream, textOf, OPENROUTER } from "./claude.js";

const str = { type: "string" };
const num = { type: "number" };
const obj = (properties) => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });
const arr = (items) => ({ type: "array", items });
const oneOf = (...values) => ({ type: "string", enum: values });

const SCHEMA = obj({
  company: obj({
    name: str,
    one_liner: str,
    industry: str,
    hq: str,
    size: str,
    website: str,
  }),
  decision_maker: obj({
    role: str,
    name: { ...str, description: "Empty string if no source confirms a name." },
    name_source_url: str,
    why_them: str,
  }),
  why_now: arr(
    obj({
      signal: str,
      detail: str,
      date: str,
      source_url: str,
      strength: oneOf("high", "medium", "low"),
    }),
  ),
  hidden_work: arr(
    obj({
      area: { ...str, description: "Short name of the process, e.g. 'Order entry'." },
      evidence_quote: { ...str, description: "Verbatim text from the source. Original language." },
      quote_is_verbatim: { type: "boolean", description: "true only if evidence_quote is copied exactly from a page that was actually read. false for summaries, paraphrases or wording you could not confirm." },
      evidence_translation: { ...str, description: "English translation if the quote is not English, else empty." },
      source_label: { ...str, description: "e.g. 'Job ad: Sales Coordinator, Duunitori, Sept 2026'" },
      source_url: str,
      today: { ...str, description: "What probably happens today, concretely, in one sentence." },
      fix: { ...str, description: "The concrete automation Velho would build, in one sentence. No buzzwords." },
      hours_per_week_low: num,
      hours_per_week_high: num,
      confidence: oneOf("high", "medium", "low"),
      effort: { ...oneOf("small", "medium", "large"), description: "Build effort: small = ~2 weeks, medium = 1-2 months, large = a quarter or more." },
      weeks_to_value: { ...num, description: "Weeks until the team feels the time saving." },
    }),
  ),
  first_build: obj({
    title: str,
    pitch: str,
    plan: arr(str),
    impact: str,
    kpis: arr(obj({ metric: str, today: { ...str, description: "Estimated baseline, phrased as an estimate." }, target: str })),
    time_back_to: { ...str, description: "What the people doing this work today would spend the freed time on (growth work, customers). Never headcount cuts." },
    data_needed: { ...str, description: "What access Velho needs to build it, e.g. 'read access to the order inbox and ERP import'." },
    risks: arr(obj({ risk: str, safeguard: str })),
  }),
  microsite: obj({
    headline: str,
    subhead: str,
    opener: str,
    closing: str,
  }),
  outreach: obj({
    email_subject: str,
    email_en: str,
    email_fi: str,
    linkedin_note: str,
    why_it_works: str,
  }),
  objections: arr(obj({ objection: str, answer: str })),
  persona: obj({
    name_or_role: str,
    priorities: arr(str),
    skepticism: arr(str),
    style: str,
  }),
});

const SYSTEM = `You are Velho's head of growth. Velho is a Finnish strategic AI growth partner: it finds the manual work that slows a company down, builds the smallest useful fix in weeks, and stays until the team actually uses it every day.

From the research notes, produce the dossier JSON. The reader is a busy Finnish CEO/CFO/COO who is pitched constantly and deletes generic AI emails on sight. The bar: would they stop, read, and reply?

hidden_work (3-6 items, the core of everything):
- Only use evidence that appears in the notes. evidence_quote must be verbatim from the notes; never paraphrase into quotes. If the notes contain no job-ad evidence, use website/process evidence and set confidence lower.
- Set quote_is_verbatim honestly. If the wording came from an aggregator summary or could not be confirmed, set it to false; the page will then show it as a paraphrase, not a quote. Lead the headline and email with a verbatim item whenever one exists.
- Hours are a sober estimate of time spent on the manual part across the people doing it, per week. Be conservative; credibility beats drama.

why_now (0-4 items): only real, dated, sourced signals. An empty list is better than a weak one.

microsite: a page made for exactly this one company.
- headline: specific and slightly provocative, built on their own words. E.g. "Your job ads describe 30 hours a week of copy-paste." Not a slogan.
- opener: 2-3 sentences. Tell them how we found this (we read their public job ads and site) and why it matters to them now.
- closing: one sentence, a calm invitation to a 20-minute conversation.

outreach:
- email_en: max 110 words. First line is about THEM (quote their own job ad or a why-now signal), not about Velho. One concrete observation, one concrete idea, one soft question as the call to action (e.g. "Worth 20 minutes?"). Mention that we made a short page for them; use the literal placeholder {{PAGE_LINK}} where the link goes. Sign as "– Velho". No "I hope this finds you well", no "leverage", "unlock", "revolutionize", "cutting-edge", "AI-powered", no exclamation marks.
- email_fi: the same email in natural, direct Finnish business language (not a literal translation). Same placeholder.
- linkedin_note: max 280 characters.
- why_it_works: one line for the Velho partner on why this angle should land.

For each hidden_work item also rate effort and weeks_to_value honestly. The CEO uses them to decide what to do first.

first_build: what Velho would ship in two weeks to remove the item with the best value for the effort. plan = 3-5 short steps.
- kpis: 2-3 measurable numbers to track in the pilot (e.g. minutes per order, share of orders processed without retyping), each with today's estimated baseline and the target.
- time_back_to: where the freed hours go. Frame it as growth (customers, sales, quality), never as cutting people; Finnish executives are wary of anything that sounds like change negotiations.
- data_needed: the minimum access needed, in plain words.
- risks: the 3 risks this CEO would worry about (data security/GDPR, errors reaching customers, dependence on a vendor, staff adoption, EU AI Act if relevant) and the concrete safeguard for each (human approval step, shadow mode first, runs on their existing systems, they own the code, etc.).

objections: the 3 most likely pushbacks from this specific buyer and a short, honest answer to each.

persona: the decision maker as a realistic, skeptical executive for pitch practice, based on what the company is going through.

Write numbers and claims you can defend. If something is an estimate, phrase it as one.`;

export async function buildDossier({ register, research, today }) {
  // Without native structured outputs, the schema goes into the prompt instead.
  const system = OPENROUTER
    ? `${SYSTEM}\n\nRespond with ONLY one JSON object (no prose, no code fences) that validates against this JSON Schema:\n${JSON.stringify(SCHEMA)}`
    : SYSTEM;
  const s = stream({
    max_tokens: 32000,
    system,
    thinking: { type: "adaptive" },
    output_config: {
      effort: process.env.DOSSIER_EFFORT || "high",
      format: { type: "json_schema", schema: SCHEMA },
    },
    messages: [
      {
        role: "user",
        content: `Today is ${today}.\n\nTRADE REGISTER:\n${JSON.stringify(register)}\n\nRESEARCH NOTES:\n${research.notes}\n\nSOURCES SEEN:\n${research.sources.map((x) => `- ${x.title}: ${x.url}`).join("\n")}`,
      },
    ],
  });
  const msg = await s.finalMessage();
  if (msg.stop_reason === "refusal") throw new Error("The dossier request was declined by the model.");
  if (msg.stop_reason === "max_tokens") throw new Error("The dossier was cut off (max_tokens). Try again.");
  return normalize(parseJson(textOf(msg)));
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{"), end = text.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("The model did not return a dossier. Try again.");
    // Without native structured outputs, models sometimes put raw line breaks or tabs inside strings.
    return JSON.parse(escapeControlChars(text.slice(start, end + 1)));
  }
}

function escapeControlChars(json) {
  let out = "", inString = false, escaped = false;
  for (const ch of json) {
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      else if (ch < " ") {
        out += ch === "\n" ? "\\n" : ch === "\r" ? "\\r" : ch === "\t" ? "\\t" : "\\u" + ch.charCodeAt(0).toString(16).padStart(4, "0");
        continue;
      }
    } else if (ch === '"') inString = true;
    out += ch;
  }
  return out;
}

// Fill anything missing so the UI never renders "undefined" or crashes on a partial reply.
function normalize(d) {
  const s = (v) => (typeof v === "string" ? v : v == null ? "" : String(v));
  const a = (v) => (Array.isArray(v) ? v : []);
  const o = (v) => (v && typeof v === "object" ? v : {});
  const c = o(d.company), dm = o(d.decision_maker), fb = o(d.first_build), m = o(d.microsite), out = o(d.outreach), p = o(d.persona);
  const level = (v) => (["high", "medium", "low"].includes(v) ? v : "medium");
  return {
    company: { name: s(c.name), one_liner: s(c.one_liner), industry: s(c.industry), hq: s(c.hq), size: s(c.size), website: s(c.website) },
    decision_maker: { role: s(dm.role) || "CEO", name: s(dm.name), name_source_url: s(dm.name_source_url), why_them: s(dm.why_them) },
    why_now: a(d.why_now).map((w) => ({ signal: s(w.signal), detail: s(w.detail), date: s(w.date), source_url: s(w.source_url), strength: level(w.strength) })),
    hidden_work: a(d.hidden_work).map((w) => ({
      area: s(w.area), evidence_quote: s(w.evidence_quote), quote_is_verbatim: w.quote_is_verbatim !== false,
      evidence_translation: s(w.evidence_translation), source_label: s(w.source_label),
      source_url: s(w.source_url), today: s(w.today), fix: s(w.fix),
      hours_per_week_low: Number(w.hours_per_week_low) || 0, hours_per_week_high: Number(w.hours_per_week_high) || Number(w.hours_per_week_low) || 0,
      confidence: level(w.confidence),
      effort: ["small", "medium", "large"].includes(w.effort) ? w.effort : "medium",
      weeks_to_value: Number(w.weeks_to_value) || 0,
    })),
    first_build: {
      title: s(fb.title), pitch: s(fb.pitch), plan: a(fb.plan).map(s), impact: s(fb.impact),
      kpis: a(fb.kpis).map((k) => ({ metric: s(k.metric), today: s(k.today), target: s(k.target) })),
      time_back_to: s(fb.time_back_to), data_needed: s(fb.data_needed),
      risks: a(fb.risks).map((r) => ({ risk: s(r.risk), safeguard: s(r.safeguard) })),
    },
    microsite: { headline: s(m.headline), subhead: s(m.subhead), opener: s(m.opener), closing: s(m.closing) || "Worth 20 minutes?" },
    outreach: { email_subject: s(out.email_subject), email_en: s(out.email_en), email_fi: s(out.email_fi), linkedin_note: s(out.linkedin_note), why_it_works: s(out.why_it_works) },
    objections: a(d.objections).map((x) => ({ objection: s(x.objection), answer: s(x.answer) })),
    persona: { name_or_role: s(p.name_or_role) || s(dm.role) || "CEO", priorities: a(p.priorities).map(s), skepticism: a(p.skepticism).map(s), style: s(p.style) },
  };
}

export function totals(dossier, hourlyCost = 45) {
  const mid = dossier.hidden_work.reduce((sum, w) => sum + (w.hours_per_week_low + w.hours_per_week_high) / 2, 0);
  const hours = Math.round(mid);
  return { hoursPerWeek: hours, eurPerYear: Math.round((hours * 46 * hourlyCost) / 100) * 100, hourlyCost };
}
