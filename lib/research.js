import Anthropic from "@anthropic-ai/sdk";
import { stream, textOf, OPENROUTER } from "./claude.js";
import { webSearch, fetchPage } from "./webtools.js";

const SYSTEM = `You are the research desk of Velho, a Finnish AI growth partner. Velho finds the manual work that slows established companies down, builds the fix, and makes sure people use it.

Your job: build an evidence file on ONE company so a Velho partner can write the most specific, credible first message that company's CEO/CFO/COO has ever received.

Research, in this order of importance:
1. THE COMPANY'S OWN WORDS ABOUT MANUAL WORK. The richest source is open job ads (company careers page, duunitori.fi, tyomarkkinatori.fi, oikotie.fi, LinkedIn jobs, jobly.fi). Job ads are confessions: "compile weekly sales reports in Excel", "manually enter orders into the ERP", "coordinate schedules by phone", "reconcile invoices". Fetch the actual ad pages and copy those sentences VERBATIM (keep the original language, Finnish is fine). Also look at the company website for manual customer-facing processes (PDF order forms, "email us your order", phone-only booking, quote requests by email).
2. WHY NOW signals from the last ~12 months: new CEO/CFO/COO or other leadership change, M&A, expansion, new sites/factories, funding, big contracts or tenders, ERP or system migrations, layoffs/change negotiations (muutosneuvottelut), strategy updates, results releases mentioning efficiency or cost programmes.
3. The basics: what they do, size (revenue, headcount), HQ, who leads the company (CEO/CFO/COO names, with source).

Rules:
- Job sites show sponsored ads from OTHER employers next to search results. Before using any job ad, confirm on the ad page itself that the employer is this company (or its subsidiary). Discard anything else.
- Every fact gets a source URL. Never invent a quote, a number, or a name. If you cannot find job ads, say so plainly and use the next-best evidence.
- Prefer sources from the last 12 months. Note dates.
- Be efficient: search broadly first, then fetch the 3-6 most valuable pages (especially individual job ads).
- Finish with RESEARCH NOTES in plain text, grouped under: BASICS, LEADERSHIP, WHY-NOW SIGNALS, MANUAL-WORK EVIDENCE (each with verbatim quote + URL + which role/page it came from), OTHER OBSERVATIONS, GAPS.`;

export async function runResearch({ query, register, today, emit }) {
  const intro = register
    ? `Company: ${register.name} (Finnish business ID ${register.businessId}).
Trade register data: ${JSON.stringify(register)}`
    : `Company: ${query} (not found in the Finnish trade register, so it may be foreign or the name may differ; identify it first).`;

  const messages = [{ role: "user", content: `${intro}\n\nToday is ${today}. Build the evidence file.` }];
  if (!OPENROUTER) return researchWithServerTools({ messages, emit });
  // Through OpenRouter, try Claude's built-in web tools first; fall back to our own
  // search + page reader if the provider rejects them or they find nothing.
  try {
    const r = await researchWithServerTools({ messages: [...messages], emit });
    if (r.sources.length) return r;
    emit("step", { label: "Built-in web search unavailable here, switching to own search" });
  } catch (err) {
    if (!(err instanceof Anthropic.BadRequestError || err instanceof Anthropic.UnprocessableEntityError)) throw err;
    emit("step", { label: "Built-in web search not supported by this provider, switching to own search" });
  }
  return researchWithOwnTools({ messages, emit });
}

async function researchWithServerTools({ messages, emit }) {
  const sources = new Map();
  let notes = "";

  for (let turn = 0; turn < 5; turn++) {
    const s = stream({
      max_tokens: 64000,
      system: SYSTEM,
      thinking: { type: "adaptive" },
      output_config: { effort: process.env.RESEARCH_EFFORT || "medium" },
      tools: [
        { type: "web_search_20260209", name: "web_search", max_uses: 10, user_location: { type: "approximate", country: "FI" } },
        { type: "web_fetch_20260209", name: "web_fetch", max_uses: 8, max_content_tokens: 15000 },
      ],
      messages,
    });

    s.on("contentBlock", (block) => {
      if (block.type === "server_tool_use") {
        if (block.name === "web_search") emit("search", { query: block.input?.query });
        if (block.name === "web_fetch") emit("fetch", { url: block.input?.url });
      } else if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
        for (const r of block.content) if (r.url) sources.set(r.url, r.title || r.url);
        emit("results", { count: block.content.length, top: block.content.slice(0, 3).map((r) => r.title) });
      } else if (block.type === "web_fetch_tool_result" && block.content?.type === "web_fetch_result") {
        sources.set(block.content.url, block.content.content?.title || block.content.url);
      }
    });

    const msg = await s.finalMessage();
    notes += textOf(msg);
    if (msg.stop_reason === "refusal") throw new Error("The research request was declined by the model.");
    if (msg.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: msg.content });
  }

  return { notes, sources: [...sources].map(([url, title]) => ({ url, title })) };
}

// Same research, with the search and page reading done by this server (for providers
// without Claude's built-in web tools). Manual tool-use loop.
const OWN_TOOLS = [
  {
    name: "web_search",
    description: "Search the web. Returns up to 8 results with url, title and snippet. Finnish and English queries both work.",
    input_schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"], additionalProperties: false },
  },
  {
    name: "fetch_page",
    description: "Read a web page as plain text (first ~14k characters). Use for job ads, news and company pages found via web_search.",
    input_schema: { type: "object", properties: { url: { type: "string" } }, required: ["url"], additionalProperties: false },
  },
];
const LIMITS = { web_search: 10, fetch_page: 8 };

async function researchWithOwnTools({ messages, emit }) {
  const sources = new Map();
  const used = { web_search: 0, fetch_page: 0 };
  let notes = "";

  for (let turn = 0; turn < 24; turn++) {
    const msg = await stream({
      max_tokens: 16000,
      system: SYSTEM + `\n\nTool budget: at most ${LIMITS.web_search} web_search and ${LIMITS.fetch_page} fetch_page calls in total. Call several tools in parallel when you can.`,
      tools: OWN_TOOLS,
      messages,
    }).finalMessage();

    const text = textOf(msg);
    notes = text.length > 400 ? text : notes + text;
    if (msg.stop_reason === "refusal") throw new Error("The research request was declined by the model.");
    const calls = msg.content.filter((b) => b.type === "tool_use");
    if (msg.stop_reason !== "tool_use" || !calls.length) break;
    messages.push({ role: "assistant", content: msg.content });

    const results = await Promise.all(
      calls.map(async (call) => {
        const kind = call.name;
        if (!(kind in LIMITS) || used[kind] >= LIMITS[kind]) {
          return { type: "tool_result", tool_use_id: call.id, is_error: true, content: `Budget for ${kind} used up. Write the research notes now.` };
        }
        used[kind]++;
        try {
          if (kind === "web_search") {
            emit("search", { query: call.input.query });
            const r = await webSearch(String(call.input.query));
            for (const x of r) sources.set(x.url, x.title);
            emit("results", { count: r.length, top: r.slice(0, 3).map((x) => x.title) });
            return { type: "tool_result", tool_use_id: call.id, content: r.length ? r.map((x) => `${x.title}\n${x.url}\n${x.snippet}`).join("\n\n") : "No results." };
          }
          emit("fetch", { url: call.input.url });
          const page = await fetchPage(String(call.input.url));
          sources.set(page.url, page.title);
          return { type: "tool_result", tool_use_id: call.id, content: `TITLE: ${page.title}\nURL: ${page.url}\n\n${page.text}` };
        } catch (err) {
          return { type: "tool_result", tool_use_id: call.id, is_error: true, content: `Failed: ${err.message}` };
        }
      }),
    );
    const exhausted = used.web_search >= LIMITS.web_search && used.fetch_page >= LIMITS.fetch_page;
    messages.push({ role: "user", content: exhausted ? [...results, { type: "text", text: "Tool budget used up. Write the RESEARCH NOTES now." }] : results });
  }

  return { notes, sources: [...sources].map(([url, title]) => ({ url, title })) };
}
