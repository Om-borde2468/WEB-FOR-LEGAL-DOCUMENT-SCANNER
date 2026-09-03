// ─────────────────────────────────────────────────────────────
//  Groq API Wrapper  –  Legal Document Scanner
// ─────────────────────────────────────────────────────────────

const GROQ_MODEL = "qwen/qwen3.8-27b";
const GROQ_BASE = "https://api.groq.com/openai/v1/chat/completions";

function getApiKey() {
  return localStorage.getItem("groq_api_key") || "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";
}

async function callGroq(prompt, systemInstruction = "") {
  const key = getApiKey();
  if (!key) throw new Error("NO_API_KEY");

  const messages = [];
  if (systemInstruction) messages.push({ role: "system", content: systemInstruction });
  messages.push({ role: "user", content: prompt });

  const resp = await fetch(GROQ_BASE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      temperature: 0.2,
      max_tokens: 8192,
    }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err?.error?.message || `HTTP ${resp.status}`);
  }
  const data = await resp.json();
  return data.choices?.[0]?.message?.content || "";
}

async function callGroqJSON(prompt, systemInstruction = "") {
  const raw = await callGroq(prompt, systemInstruction);
  try { return JSON.parse(raw); }
  catch { return JSON.parse(raw.replace(/```json|```/g, "").trim()); }
}

async function analyzeDocument(docText) {
  const sys = `You are an expert legal analyst. Respond ONLY with valid JSON.`;
  const prompt = `
Analyze the following legal document text. Identify all distinct clauses.
For each clause return a JSON array of objects with:
{
  "id": "<number>", "title": "<clause name>",
  "original": "<exact original text of the clause, max 600 chars>",
  "plain": "<plain English explanation, 2-3 sentences>",
  "risk": "High|Medium|Low", "riskReason": "<one sentence why>",
  "deviation": "<one sentence on how it deviates from a standard/fair contract, or 'Conforms to standard practice.'>",
  "category": "<one of: Payment, Termination, Liability, Confidentiality, IP, Dispute, Obligations, General>"
}
Return ONLY a JSON array. No markdown. No extra text.

DOCUMENT:
${docText.slice(0, 12000)}
`;
  return callGroqJSON(prompt, sys);
}

async function askQuestion(question, docText, history = []) {
  const sys = `You are a legal assistant. Answer ONLY based on the provided document.
If the answer is not in the document, say "This information is not in the uploaded document."
Be concise (max 5 sentences). Do NOT give legal advice.`;
  const historyStr = history
    .map(h => `${h.role === "user" ? "User" : "Assistant"}: ${h.text}`)
    .join("\n");
  const prompt = `
DOCUMENT:
${docText.slice(0, 12000)}

CONVERSATION HISTORY:
${historyStr}

USER QUESTION: ${question}
`;
  return callGroq(prompt, sys);
}

async function compareDocuments(doc1Text, doc2Text) {
  const sys = `You are a legal document comparison expert. Respond ONLY with valid JSON.`;
  const prompt = `
Compare the two legal document versions below.
Return a JSON array of changed clauses:
{"clauseTitle":"<name>","original":"<Version 1 text, max 400 chars>","revised":"<Version 2 text, max 400 chars>","changeType":"Added|Removed|Modified","impact":"Favorable|Unfavorable|Neutral","summary":"<one sentence>"}
Return ONLY a JSON array.

VERSION 1:
${doc1Text.slice(0, 6000)}

VERSION 2:
${doc2Text.slice(0, 6000)}
`;
  return callGroqJSON(prompt, sys);
}

async function translateAnalysis(clauses, targetLanguage) {
  const sys = `You are a professional translator and legal expert. Respond ONLY with valid JSON.`;
  const simplified = clauses.map(c => ({ id: c.id, title: c.title, plain: c.plain, riskReason: c.riskReason, deviation: c.deviation }));
  const prompt = `
Translate the following JSON data into ${targetLanguage}.
Translate only the string values (title, plain, riskReason, deviation).
Keep the JSON structure identical. Preserve the "id" field as-is.
Return ONLY valid JSON.

${JSON.stringify(simplified, null, 2)}
`;
  return callGroqJSON(prompt, sys);
}

async function summarizeDocument(clauses, docType = "legal contract") {
  const sys = `You are an expert legal analyst.`;
  const clauseSummary = clauses.map(c => `- ${c.title} [${c.risk}]: ${c.plain}`).join("\n");
  const prompt = `
Based on these clause analyses of a ${docType}, write a concise executive summary (4-6 sentences) for a non-lawyer:
1. What is this document about?
2. What are the main concerns?
3. Should they be cautious before signing?

Clauses:
${clauseSummary}
`;
  return callGroq(prompt, sys);
}