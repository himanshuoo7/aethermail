import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config({ path: ".env.local" });
dotenv.config();

if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.includes("your-new-key")) {
  console.error("OPENAI_API_KEY is missing. Add a fresh key to .env.local or export it in your shell.");
  process.exit(1);
}

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";

try {
  const response = await client.responses.create({
    model,
    instructions: "Return only the word ok.",
    input: "OpenAI connectivity test",
    max_output_tokens: 16,
  });

  console.log(JSON.stringify({ ok: true, model, output: response.output_text }, null, 2));
} catch (error) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        model,
        message: error.message,
        status: error.status,
        code: error.code,
        type: error.type,
      },
      null,
      2,
    ),
  );
  process.exit(1);
}
