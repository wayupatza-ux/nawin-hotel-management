// line-webhook — รับ webhook event จาก LINE Messaging API
// ตรวจ x-line-signature (HMAC-SHA256 บน raw body) ก่อนประมวลผลทุกครั้ง ตาม LINE_BOT_RULES.md
// verify_jwt = false เพราะ LINE ไม่ส่ง Supabase JWT มา — ใช้ signature ของ LINE แทน

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

let cachedChannelSecret: string | null = null;
async function getChannelSecret(): Promise<string> {
  if (cachedChannelSecret) return cachedChannelSecret;
  const { data, error } = await admin.rpc("get_secret", { p_name: "line_channel_secret" });
  if (error || !data) throw new Error("cannot load line_channel_secret from vault");
  cachedChannelSecret = data as string;
  return cachedChannelSecret;
}

let cachedAccessToken: string | null = null;
async function getAccessToken(): Promise<string> {
  if (cachedAccessToken) return cachedAccessToken;
  const { data, error } = await admin.rpc("get_secret", { p_name: "line_channel_access_token" });
  if (error || !data) throw new Error("cannot load line_channel_access_token from vault");
  cachedAccessToken = data as string;
  return cachedAccessToken;
}

async function verifySignature(rawBody: string, signature: string | null): Promise<boolean> {
  if (!signature) return false;
  const secret = await getChannelSecret();
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const expected = btoa(String.fromCharCode(...new Uint8Array(sig)));

  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return diff === 0;
}

async function replyMessage(replyToken: string, messages: unknown[]) {
  const token = await getAccessToken();
  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ replyToken, messages }),
  });
}

// deno-lint-ignore no-explicit-any
async function handleEvent(event: any) {
  // กันประมวลผลซ้ำถ้า LINE ส่ง event เดิมมาซ้ำ
  const eventId = event.webhookEventId as string | undefined;
  if (eventId) {
    const { error: insertErr } = await admin
      .from("line_webhook_events")
      .insert({ event_id: eventId });
    if (insertErr) return; // unique violation = เคยประมวลผลไปแล้ว ข้าม
  }

  if (event.type === "follow") {
    const lineUserId = event.source?.userId;
    if (lineUserId) {
      await admin
        .from("guests")
        .upsert({ line_user_id: lineUserId }, { onConflict: "line_user_id", ignoreDuplicates: true });
    }
    if (event.replyToken) {
      await replyMessage(event.replyToken, [
        {
          type: "text",
          text: "ยินดีต้อนรับสู่นาวิน โฮเทล ดอนเมือง 🏨\nกดเมนู \"จองห้องพัก\" ด้านล่างเพื่อเริ่มจองห้องได้เลยครับ",
        },
      ]);
    }
    return;
  }

  if (event.type === "message" && event.message?.type === "text" && event.replyToken) {
    await replyMessage(event.replyToken, [
      {
        type: "text",
        text: "ขอบคุณที่ทักมาครับ 🙏 กรุณาใช้เมนู \"จองห้องพัก\" ด้านล่างเพื่อจองห้องหรือดูสถานะการจองของคุณ",
      },
    ]);
  }
}

// deno-lint-ignore no-explicit-any
async function handleEvents(events: any[]) {
  for (const event of events) {
    try {
      await handleEvent(event);
    } catch (err) {
      console.error("line-webhook: event handling failed", err);
    }
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get("x-line-signature");

  const valid = await verifySignature(rawBody, signature).catch((err) => {
    console.error("line-webhook: signature check failed", err);
    return false;
  });

  if (!valid) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: { events?: unknown[] };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  const events = Array.isArray(body.events) ? body.events : [];

  // ตอบ 200 ให้ LINE ทันที แล้วประมวลผล event ต่อแบบ async (ไม่บล็อก response)
  const processing = handleEvents(events);
  // deno-lint-ignore no-explicit-any
  const edgeRuntime = (globalThis as any).EdgeRuntime;
  if (edgeRuntime?.waitUntil) {
    edgeRuntime.waitUntil(processing);
  } else {
    await processing;
  }

  return new Response("OK", { status: 200 });
});
