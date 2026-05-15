import Anthropic from "@anthropic-ai/sdk";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

const apiKey = process.env.ANTHROPIC_API_KEY || process.env.anthropic_API_key;

if (!apiKey || apiKey.includes("your-new-key")) {
  console.error("ANTHROPIC_API_KEY is missing. Add it to .env.local or export it in your shell.");
  process.exit(1);
}

const client = new Anthropic({ apiKey });
const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

try {
  const response = await client.messages.create({
    model,
    max_tokens: 16,
    system: "Return only the word ok.",
    messages: [{ role: "user", content: "Anthropic connectivity test" }],
  });

  const output = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");

  console.log(JSON.stringify({ ok: true, model, output }, null, 2));
} catch (error) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        model,
        message: error.message,
        status: error.status,
        type: error.error?.type,
      },
      null,
      2,
    ),
  );
  process.exit(1);
}
