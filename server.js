import express from "express";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { lookupCompany } from "./lib/prh.js";
import { runResearch } from "./lib/research.js";
import { buildDossier, totals } from "./lib/dossier.js";
import { rehearse, coach } from "./lib/simulator.js";
import * as store from "./lib/store.js";
import { MODEL, OPENROUTER } from "./lib/claude.js";

const app = express();
const PORT = process.env.PORT || 4000;
const HOURLY_COST = Number(process.env.HOURLY_COST || 45);
const pub = path.resolve("public");

app.use(express.json({ limit: "1mb" }));
app.use(express.static(pub, { index: false }));

app.get("/", (_req, res) => res.sendFile(path.join(pub, "index.html")));
app.get("/p/:id", (_req, res) => res.sendFile(path.join(pub, "page.html")));

app.get("/api/config", (_req, res) => res.json({ bookingUrl: process.env.BOOKING_URL || "", hourlyCost: HOURLY_COST }));
app.get("/api/dossiers", (_req, res) => res.json(store.list()));
app.get("/api/dossier/:id", (req, res) => {
  const r = store.load(req.params.id);
  r ? res.json(r) : res.status(404).json({ error: "Not found" });
});

app.post("/api/view/:id", (req, res) => {
  store.recordView(req.params.id, { kind: String(req.body?.kind || "open").slice(0, 20), detail: String(req.body?.detail || "").slice(0, 100) });
  res.json({ ok: true });
});

function errorMessage(err) {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN && !process.env.OPENROUTER_API_KEY) return "No API key. Add ANTHROPIC_API_KEY to .env and restart.";
  if (err instanceof Anthropic.AuthenticationError) return `API key rejected by ${OPENROUTER ? "OpenRouter" : "Claude API"}. Check the key in .env.`;
  if (err instanceof Anthropic.PermissionDeniedError || err?.status === 402) return `${OPENROUTER ? "OpenRouter" : "Claude API"} refused the request (no credits or model not allowed for this key).`;
  if (err instanceof Anthropic.RateLimitError) return "Claude API rate limit hit. Wait a moment and retry.";
  if (err instanceof Anthropic.APIError) return `Claude API error ${err.status ?? ""}: ${err.message}`;
  return err?.message || String(err);
}

// Live pipeline, streamed to the browser as Server-Sent Events.
app.get("/api/run", async (req, res) => {
  const query = String(req.query.company || "").trim();
  if (!query) return res.status(400).end();

  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  const emit = (type, data = {}) => res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
  const ping = setInterval(() => res.write(": ping\n\n"), 15000);
  const today = new Date().toISOString().slice(0, 10);
  const started = Date.now();

  try {
    emit("step", { label: "Checking the Finnish trade register" });
    const register = await lookupCompany(query);
    emit("register", register || { notFound: true, query });

    emit("step", { label: "Reading their public footprint: job ads, news, website" });
    const research = await runResearch({ query, register, today, emit });
    emit("step", { label: `Evidence collected from ${research.sources.length} sources. Writing the dossier` });

    const dossier = await buildDossier({ register, research, today });
    const record = store.save({
      id: store.newId(dossier.company.name || query),
      query,
      created: new Date().toISOString(),
      seconds: Math.round((Date.now() - started) / 1000),
      register,
      research,
      dossier,
      totals: totals(dossier, HOURLY_COST),
      views: [],
    });
    emit("done", { id: record.id });
  } catch (err) {
    console.error(err);
    emit("fail", { message: errorMessage(err) });
  } finally {
    clearInterval(ping);
    res.end();
  }
});

app.post("/api/rehearse/:id", async (req, res) => {
  const record = store.load(req.params.id);
  if (!record) return res.status(404).end();
  const messages = (req.body?.messages || []).map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content) }));
  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" });
  try {
    const s = rehearse({ record, messages });
    s.on("text", (t) => res.write(t));
    await s.finalMessage();
  } catch (err) {
    console.error(err);
    res.write(`\n[${errorMessage(err)}]`);
  }
  res.end();
});

app.post("/api/coach/:id", async (req, res) => {
  const record = store.load(req.params.id);
  if (!record) return res.status(404).end();
  try {
    res.json({ text: await coach({ record, messages: req.body?.messages || [] }) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: errorMessage(err) });
  }
});

const server = app.listen(PORT, () => {
  console.log(`Hidden Hours running at http://localhost:${PORT}`);
  console.log(`Model: ${MODEL} via ${OPENROUTER ? "OpenRouter (own web search + page reader)" : "Claude API (built-in web search + fetch)"}`);
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN && !process.env.OPENROUTER_API_KEY) console.warn("Warning: no API key. Add ANTHROPIC_API_KEY to .env");
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already used by another program. Set a different port in .env, e.g. PORT=4100, and run npm start again.`);
    process.exit(1);
  }
  throw err;
});
