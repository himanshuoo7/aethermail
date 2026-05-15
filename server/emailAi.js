import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

const urgentTerms = ["urgent", "today", "tomorrow", "asap", "invoice", "security", "password", "deadline", "approve"];

let openaiClient;
let anthropicClient;

function getOpenAiClient() {
  if (!process.env.OPENAI_API_KEY) return null;
  openaiClient ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openaiClient;
}

function getAnthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.anthropic_API_key;
  if (!apiKey) return null;
  anthropicClient ??= new Anthropic({ apiKey });
  return anthropicClient;
}

export function summarizeMessage({ subject = "", text = "" }) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return subject ? `Message about ${subject}.` : "No readable message body was available.";
  const firstSentence = clean.split(/(?<=[.!?])\s+/)[0] ?? clean;
  return firstSentence.length > 180 ? `${firstSentence.slice(0, 177)}...` : firstSentence;
}

export function scorePriority({ subject = "", from = "", text = "", flags = [] }) {
  const haystack = `${subject} ${from} ${text}`.toLowerCase();
  const termBoost = urgentTerms.reduce((score, term) => score + (haystack.includes(term) ? 12 : 0), 0);
  const unreadBoost = flags.includes("\\Seen") ? 0 : 12;
  const directBoost = haystack.includes("reply") || haystack.includes("confirm") ? 8 : 0;
  return Math.min(99, 35 + termBoost + unreadBoost + directBoost);
}

export function suggestReply(message) {
  if ((message.subject ?? "").toLowerCase().includes("password")) {
    return "Thanks. I will update the app password and confirm once sync is healthy.";
  }
  return `Thanks for the note. I read this and will follow up on "${message.subject}" shortly.`;
}

function fallbackAiFields(message) {
  return {
    aiSummary: summarizeMessage({ subject: message.subject, text: message.body }),
    priority: scorePriority({ ...message, text: message.body, flags: message.unread ? [] : ["\\Seen"] }),
    suggestedReply: suggestReply(message),
    aiProvider: "local",
  };
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : null;
  }
}

function buildEmailPayload(message) {
  return {
    from: message.from,
    fromEmail: message.fromEmail,
    subject: message.subject,
    preview: message.preview,
    body: String(message.body || "").slice(0, 6000),
    unread: message.unread,
    labels: message.labels,
  };
}

function normalizeModelFields(parsed, provider, message) {
  if (!parsed?.aiSummary || !parsed?.suggestedReply) return fallbackAiFields(message);

  return {
    aiSummary: String(parsed.aiSummary).slice(0, 300),
    priority: Math.max(1, Math.min(99, Number(parsed.priority) || 50)),
    suggestedReply: String(parsed.suggestedReply).slice(0, 1200),
    aiProvider: provider,
  };
}

async function enrichWithAnthropic(message) {
  const anthropic = getAnthropicClient();
  if (!anthropic) return null;

  const response = await anthropic.messages.create({
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
    max_tokens: 400,
    system:
      "You are an email copilot. Return only compact JSON with aiSummary, priority, and suggestedReply. priority must be an integer from 1 to 99. Do not invent facts.",
    messages: [
      {
        role: "user",
        content: JSON.stringify(buildEmailPayload(message)),
      },
    ],
  });

  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");

  return normalizeModelFields(parseJson(text), "anthropic", message);
}

async function enrichWithOpenAi(message) {
  const openai = getOpenAiClient();
  if (!openai) return null;

  const response = await openai.responses.create({
    model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
    instructions:
      "You are an email copilot. Return only compact JSON with aiSummary, priority, and suggestedReply. priority must be an integer from 1 to 99. Do not invent facts.",
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: JSON.stringify(buildEmailPayload(message)),
          },
        ],
      },
    ],
    max_output_tokens: 300,
  });

  return normalizeModelFields(parseJson(response.output_text || ""), "openai", message);
}

export async function enrichMessageWithAi(message) {
  const provider = (process.env.AI_PROVIDER || (process.env.ANTHROPIC_API_KEY || process.env.anthropic_API_key ? "anthropic" : "openai")).toLowerCase();

  try {
    if (provider === "anthropic") {
      return (await enrichWithAnthropic(message)) ?? fallbackAiFields(message);
    }

    if (provider === "openai") {
      return (await enrichWithOpenAi(message)) ?? fallbackAiFields(message);
    }

    return fallbackAiFields(message);
  } catch (error) {
    return {
      ...fallbackAiFields(message),
      aiError: error.message,
    };
  }
}
