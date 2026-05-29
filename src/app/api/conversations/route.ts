// import { supabase } from "@/lib/supabase";

// export async function GET() {
//   // Get all conversations with their latest message
//   const { data: conversations, error } = await supabase
//     .from("conversations")
//     .select("*")
//     .order("updated_at", { ascending: false });

//   if (error) {
//     return Response.json({ error: error.message }, { status: 500 });
//   }

//   // Fetch last message for each conversation
//   const withLastMessage = await Promise.all(
//     (conversations || []).map(async (convo) => {
//       const { data: messages } = await supabase
//         .from("messages")
//         .select("content, role, created_at")
//         .eq("conversation_id", convo.id)
//         .order("created_at", { ascending: false })
//         .limit(1);

//       return {
//         ...convo,
//         last_message: messages?.[0]?.content || null,
//       };
//     })
//   );

//   return Response.json(withLastMessage);
// }
import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { getAIResponse } from "@/lib/ai";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;

async function sendTelegramMessage(chat_id: number, text: string) {
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id, text }),
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  const message = body?.message;
  if (!message || !message.text) {
    return Response.json({ status: "no_message" });
  }

  const chat_id = message.chat.id;
  const text = message.text;
  const name = message.from?.first_name || "User";
  const phone = String(chat_id);

  try {
    let { data: conversation } = await supabase
      .from("conversations")
      .select("*")
      .eq("phone", phone)
      .single();

    if (!conversation) {
      const { data: newConvo } = await supabase
        .from("conversations")
        .insert({ phone, name })
        .select()
        .single();
      conversation = newConvo;
    }

    if (!conversation) {
      return Response.json({ error: "Failed to create conversation" }, { status: 500 });
    }

    await supabase.from("messages").insert({
      conversation_id: conversation.id,
      role: "user",
      content: text,
    });

    await supabase
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversation.id);

    if (conversation.mode === "human") {
      return Response.json({ status: "stored_for_human" });
    }

    const { data: history } = await supabase
      .from("messages")
      .select("role, content")
      .eq("conversation_id", conversation.id)
      .order("created_at", { ascending: true })
      .limit(20);

    const aiResponse = await getAIResponse(
      (history || []).map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }))
    );

    await sendTelegramMessage(chat_id, aiResponse);

    await supabase.from("messages").insert({
      conversation_id: conversation.id,
      role: "assistant",
      content: aiResponse,
    });

    await supabase
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversation.id);

    return Response.json({ status: "replied" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Webhook error:", message);
    return Response.json({ status: "error", message }, { status: 500 });
  }
}

export async function GET() {
  return Response.json({ status: "Telegram webhook active" });
}