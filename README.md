# Hidden Hours, by Velho

**Every company publishes its manual work. We read it back to them.**

Companies describe their own bottlenecks in public, mostly in job ads: *"compile weekly reports in Excel"*, *"enter email orders into the ERP"*, *"answer delivery enquiries by phone"*. Hidden Hours takes any company name, finds those sentences, prices them in hours and euros, and turns them into outreach a busy CEO actually reads.

## What it does (live, on any company, in ~2-3 minutes)

1. **Trade register:** looks the company up in the Finnish register (PRH/YTJ open data). Accepts a name or Y-tunnus.
2. **Research agent:** Claude with live web search and fetch reads open job ads (Duunitori, Työmarkkinatori, Oikotie, careers pages), news and the company website. Every step streams to the screen.
3. **Dossier:** for each process it gives the verbatim quote with its source, what happens today, the fix, and hours per week. Also included:
   - dated "why now" signals (new leadership, expansion, M&A, change negotiations)
   - the first thing Velho would build in two weeks
   - the right decision maker
   - likely objections
4. **One-of-one page:** a page made for exactly that company, at `/p/<id>`. It has their own quotes, a calculator they can adjust with their own numbers, and a "Book 20 minutes" button.
5. **Email and LinkedIn note, in English and Finnish:** the email leads with their own words and includes the page link.
6. **Engagement tracking:** shows when the prospect opens the page, uses the calculator, or clicks "book", so you know when to follow up.
7. **Rehearse:** practise on a simulated CEO/CFO/COO of that company, built from its real situation. You can send the draft email to it and press **Coach me** for a score.

Nothing is ever sent. Every output is a draft, which keeps the hackathon rule: no contacting real companies.

## Run it

```bash
npm install
cp .env.example .env      # add ANTHROPIC_API_KEY
npm start                 # http://localhost:4000
```

The key can be an Anthropic key (`sk-ant-…`) or an OpenRouter key (`sk-or-…`). The server's first lines say which one it's using:
- **Anthropic key:** uses Claude's built-in web search and fetch.
- **OpenRouter key:** uses `anthropic/claude-opus-5.5`, and the app does its own web search (DuckDuckGo) and page reading.

A fictional sample (`Nordvalve Oy (sample)`) is included, so the UI can be shown without an API key.

Settings in `.env`:
- `BOOKING_URL`: your calendar link
- `HOURLY_COST`: hourly cost used for the € estimates
- `RESEARCH_EFFORT` / `DOSSIER_EFFORT`: speed vs depth
- `CLAUDE_MODEL`: defaults to `claude-opus-5-5`

## Demo script (5 min)

1. **Hook (20 s):** "Generic AI outreach gets deleted. Show a CEO their own words and they read it. Companies publish their manual work every day, in job ads."
2. **Live run:** ask the judges to name any company and type it in. Talk over the live feed while it searches and reads pages.
3. **Evidence tab:** "This sentence is from *their* job ad, with the link. Here's the fix and the hours."
4. **Open their page:** scroll it and move the calculator. "This is what the CEO gets. Made for one company."
5. **Outreach:** switch to Finnish. Then **Test it on their simulated COO**, let the simulated COO push back, and press **Coach me**.
6. **Engagement:** open the page on a phone and show the "opened" event appear in the pipeline. "On Monday, Velho knows who to call."

## Stack

Node 22+, Express, the official `@anthropic-ai/sdk`:
- Claude Opus 5.5 with server-side `web_search` and `web_fetch`
- structured outputs (JSON schema) for the dossier
- streaming for the live feed and the simulator
- PRH open data API

Storage is JSON files in `data/`. There is no build step.
