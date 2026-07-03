import { Router, Request, Response } from 'express';
import { isAnyAIAvailable, generateText } from './shared.js';
import { rank, loadGuideIndex } from '../../services/helpbot-retrieve.js';
import { executeDSLQuery } from '../../db/backend.js';
import {
  DSL_COMMANDS,
  DSL_AGGREGATION_FUNCTIONS,
  DSL_CORE_FIELDS,
  DSL_COMMON_PATTERNS,
} from '../../data/dsl-reference.js';

const router = Router();

// Guide anchors deep-link into the in-app guide at /guide (the rendered guide is
// served at /user-guide.html; the iframe page lives at /guide).
const GUIDE_BASE = '/user-guide.html';

interface Citation {
  title: string;
  anchor: string;
  url: string;
  breadcrumb: string[];
}

// Heuristic: is the user asking about THEIR DATA ("how many errors today") vs
// asking HOW TO use LogNog ("how do I create an alert")?
function looksLikeDataQuestion(q: string): boolean {
  const s = q.toLowerCase();
  const howto = /\b(how (do|can|to)|where (is|do|can)|what is the .* (button|page|setting)|set up|configure|enable|create an? (alert|dashboard|report|api key)|install)\b/.test(s);
  if (howto) return false;
  const dataSignals = [
    /\bhow many\b/, /\bcount\b/, /\btop \d*/, /\bshow me\b/, /\blist (the )?/, /\bwhich (host|app|user|source)/,
    /\b(errors?|warnings?|logs?|events?|requests?)\b.*\b(today|yesterday|last (hour|day|week)|this (hour|day|week)|now)\b/,
    /\b(today|last hour|last 24|past hour)\b/, /\baverage|avg|median|p95|p99|rate\b/, /\bper (host|app|hour|minute|day)\b/,
    /\bbusiest|noisiest|most (active|errors)\b/, /\bany (errors|failures|outages)\b/,
  ];
  return dataSignals.some((re) => re.test(s));
}

function buildDslPrompt(question: string): string {
  const commandsList = DSL_COMMANDS.map((c) => `- ${c.name}: ${c.syntax}`).join('\n');
  const aggFunctions = DSL_AGGREGATION_FUNCTIONS.map((f) => f.name).join(', ');
  const fields = DSL_CORE_FIELDS.map((f) => f.name).join(', ');
  const examples = DSL_COMMON_PATTERNS.slice(0, 6).map((p) => `- "${p.name}" -> ${p.query}`).join('\n');
  return `You are a LogNog query generator. Convert the user's question into a single LogNog DSL query.

## Commands
${commandsList}

## Aggregation functions (use with stats/timechart)
${aggFunctions}

## Core fields
${fields}
Custom fields from structured_data are also available.

## Severity: 0=emergency 1=alert 2=critical 3=error 4=warning 5=notice 6=info 7=debug. Use severity<=3 for errors.

## Examples
${examples}

Respond with ONLY the DSL query on one line, no code fences, no explanation.

Question: ${question}
Query:`;
}

function extractQuery(text: string): string {
  const fenced = text.match(/```(?:\w+)?\n?([\s\S]*?)```/);
  let q = (fenced ? fenced[1] : text).trim();
  // Take the first line that looks like a query.
  const line = q.split('\n').find((l) => /\b(search|\*|stats|timechart)\b/i.test(l)) || q.split('\n')[0];
  q = (line || '').trim();
  if (q && !/^search\b/i.test(q) && !q.startsWith('*')) q = `search ${q}`;
  return q;
}

router.post('/ask-docs', async (req: Request, res: Response) => {
  try {
    const question = typeof req.body?.question === 'string' ? req.body.question.trim() : '';
    if (!question) return res.status(400).json({ error: 'question is required' });
    if (question.length > 1000) return res.status(400).json({ error: 'question too long (max 1000 chars)' });

    const index = loadGuideIndex();
    const hits = rank(question, index.sections, 4);
    const citations: Citation[] = hits.map((h) => ({
      title: h.title,
      anchor: h.anchor,
      url: `${GUIDE_BASE}#${h.anchor}`,
      breadcrumb: h.breadcrumb,
    }));

    const aiAvailable = await isAnyAIAvailable();
    const wantsData = looksLikeDataQuestion(question);

    // ---- DATA path: answer about the user's actual logs ----
    if (wantsData && aiAvailable) {
      let dslQuery = '';
      try {
        const gen = await generateText(buildDslPrompt(question), { useReasoning: false });
        dslQuery = extractQuery(gen.response);
      } catch { /* fall through to docs */ }

      if (dslQuery) {
        const earliest = '-24h';
        const latest = 'now';
        let rows: Record<string, unknown>[] = [];
        let runError: string | null = null;
        try {
          const result = await executeDSLQuery(dslQuery, { earliest, latest });
          rows = (result.results || []).slice(0, 50) as Record<string, unknown>[];
        } catch (e) {
          runError = e instanceof Error ? e.message : 'query failed';
        }

        const searchLink = `/search?q=${encodeURIComponent(dslQuery)}&earliest=${earliest}&latest=${latest}`;

        let answer: string;
        if (runError) {
          answer = `I tried to answer that from your logs with \`${dslQuery}\`, but the query errored (${runError}). Open it in Search to adjust it.`;
        } else {
          const interpret = `The user asked: "${question}"
I ran this LogNog query over the last 24h: ${dslQuery}
Results (${rows.length} rows):
${JSON.stringify(rows.slice(0, 20), null, 2)}

Answer the user's question in 1-3 short sentences using ONLY these results. Cite concrete numbers. If empty, say no matching events were found in the last 24h. Do not invent data.`;
          try {
            const summary = await generateText(interpret, { useReasoning: false });
            answer = summary.response.trim();
          } catch {
            answer = rows.length
              ? `Found ${rows.length} matching rows in the last 24h. Open the query in Search for the full breakdown.`
              : `No matching events in the last 24h.`;
          }
        }

        return res.json({
          answer,
          mode: 'data',
          data: { query: dslQuery, rowCount: rows.length, rows: rows.slice(0, 20), link: searchLink, error: runError },
          citations,
          provider: 'ai',
        });
      }
    }

    // ---- DOCS path: grounded, cited answer from the guide ----
    if (!hits.length) {
      return res.json({
        answer:
          "I couldn't find that in the LogNog guide. Try rephrasing, or ask about a specific feature like search, dashboards, alerts, or connecting an app.",
        mode: 'docs',
        citations: [],
        provider: aiAvailable ? 'ai' : 'retrieval',
      });
    }

    if (!aiAvailable) {
      // Fail-soft: no LLM configured — return the best-matching guide sections as links.
      const top = hits[0];
      return res.json({
        answer: `Here's the most relevant part of the guide: **${top.title}**. ${top.text.slice(0, 240).replace(/\s+/g, ' ')}…`,
        mode: 'docs',
        citations,
        provider: 'retrieval',
      });
    }

    const context = hits
      .map((h, i) => `[${i + 1}] ${(h.breadcrumb || []).join(' › ')}${h.breadcrumb?.length ? ' › ' : ''}${h.title} (anchor: ${h.anchor})\n${h.text}`)
      .join('\n\n---\n\n');

    const prompt = `You are the LogNog help assistant. Answer the user's question using ONLY the guide sections below. Be concise (2-5 sentences), practical, and use LogNog's real feature and page names. If the sections don't cover it, say you couldn't find it in the guide — do not invent features, prices, or steps. Refer to sections by their title when useful.

Guide sections:
${context}

Question: ${question}

Answer:`;

    let answer: string;
    try {
      const gen = await generateText(prompt, { useReasoning: false });
      answer = gen.response.trim();
    } catch {
      const top = hits[0];
      answer = `See **${top.title}** in the guide. ${top.text.slice(0, 240).replace(/\s+/g, ' ')}…`;
    }

    return res.json({ answer, mode: 'docs', citations, provider: 'ai' });
  } catch (error) {
    console.error('Error in /ask-docs:', error);
    return res.status(500).json({ error: 'Help bot failed to answer' });
  }
});

export default router;
