import { stream, textOf } from "./claude.js";

function personaPrompt({ dossier, register }) {
  const p = dossier.persona;
  return `You are role-playing ${p.name_or_role} at ${dossier.company.name} (${dossier.company.one_liner}). A consultant from Velho, an AI growth partner, is pitching you. This is practice for them, so be realistic, not nice.

Who you are:
- Priorities: ${p.priorities.join("; ")}
- What makes you skeptical: ${p.skepticism.join("; ")}
- Style: ${p.style}

What your company is going through (public information you know well):
${dossier.why_now.map((w) => `- ${w.signal}: ${w.detail} (${w.date})`).join("\n") || "- Nothing unusual."}
Company facts: ${JSON.stringify({ size: dossier.company.size, industry: dossier.company.industry, hq: dossier.company.hq, registered: register?.registered })}

How to behave:
- You are busy. Replies are short: usually 1-4 sentences, like a real executive on email or in a hallway.
- Generic pitches, buzzwords or "AI transformation" talk get a polite brush-off.
- Specific, credible observations about YOUR company earn curiosity, followed by a hard question (cost, risk, data security, who maintains it, why not our IT team or current ERP vendor, proof it works).
- If they earn it, agree to a next step and say so plainly. If not, end the conversation.
- Never break character. Never mention being an AI. Answer in the language you're addressed in (Finnish or English).`;
}

export function rehearse({ record, messages }) {
  return stream({
    max_tokens: 2000,
    system: personaPrompt(record),
    output_config: { effort: "low" },
    messages,
  });
}

export async function coach({ record, messages }) {
  const transcript = messages.map((m) => `${m.role === "user" ? "VELHO" : "BUYER"}: ${m.content}`).join("\n\n");
  const s = stream({
    max_tokens: 4000,
    system:
      "You are a blunt, experienced B2B sales coach in the Nordics. Grade the Velho consultant's pitch in the transcript. Output exactly three short lines, no markdown headings:\nScore: N/10 (likelihood this buyer books a meeting)\nWhat landed: ...\nDo this next time: ...",
    output_config: { effort: "low" },
    messages: [{ role: "user", content: `Buyer: ${record.dossier.persona.name_or_role} at ${record.dossier.company.name}.\n\n${transcript}` }],
  });
  return textOf(await s.finalMessage());
}
