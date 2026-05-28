// import OpenAI from "openai";
// import { DENTIST_SYSTEM_PROMPT } from "@/lib/system-prompt";

// const openai = new OpenAI({
//   baseURL: "https://openrouter.ai/api/v1",
//   apiKey: process.env.OPENROUTER_API_KEY,
// });

// export async function getAIResponse(
//   messages: { role: "user" | "assistant"; content: string }[]
// ) {
//   const completion = await openai.chat.completions.create({
//     model: process.env.AI_MODEL || "anthropic/claude-sonnet-4-20250514",
//     messages: [
//       {
//         role: "system",
//         content: DENTIST_SYSTEM_PROMPT,
//       },
//       ...messages,
//     ],
//   });

//   return completion.choices[0]?.message?.content || "Sorry, I couldn't generate a response.";
// }
import { DENTIST_SYSTEM_PROMPT } from "@/lib/system-prompt";

const FREE_MODELS = [
  "google/gemma-4-31b-it:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "qwen/qwen3-coder:free",
];

async function callOpenRouter(model: string, messages: object[]) {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://localhost:3000",
      "X-Title": "WhatsApp Agent",
    },
    body: JSON.stringify({ model, messages }),
  });

  const data = await response.json();
  if (!response.ok || data.error) {
    const code = data.error?.code;
    throw { code, message: data.error?.message, model };
  }
  return data.choices?.[0]?.message?.content || "Sorry, I couldn't generate a response.";
}

export async function getAIResponse(
  messages: { role: "user" | "assistant"; content: string }[]
) {
  const fullMessages = [
    { role: "system", content: DENTIST_SYSTEM_PROMPT },
    ...messages,
  ];

  for (const model of FREE_MODELS) {
    try {
      console.log("Trying model:", model);
      const result = await callOpenRouter(model, fullMessages);
      console.log("Success with model:", model);
      return result;
    } catch (err: unknown) {
      const error = err as { code?: number; message?: string; model?: string };
      console.warn(`Model ${model} failed (${error.code}): ${error.message}`);
      // Try next model on rate limit or provider error
      if (error.code === 429 || error.code === 404 || error.code === 503) {
        continue;
      }
      throw err;
    }
  }

  return "I'm currently experiencing high demand. Please try again in a moment.";
}