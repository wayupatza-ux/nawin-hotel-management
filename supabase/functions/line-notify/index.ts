// line-notify — ส่ง LINE push message เมื่อการจองได้รับการยืนยัน (status = confirmed)
// เรียกจาก DB trigger `notify_booking_confirmed` (ดู migrations/0011) ผ่าน pg_net
// verify_jwt = false: ผู้เรียกคือ Postgres เอง ไม่ใช่ user ที่ login — ตรวจสิทธิ์ด้วย
// header `x-internal-secret` เทียบกับค่าใน Vault แทน (รูปแบบเดียวกับ webhook secret)

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

let cachedInternalSecret: string | null = null;
async function getInternalSecret(): Promise<string> {
  if (cachedInternalSecret) return cachedInternalSecret;
  const { data, error } = await admin.rpc("get_secret", { p_name: "internal_functions_secret" });
  if (error || !data) throw new Error("cannot load internal_functions_secret from vault");
  cachedInternalSecret = data as string;
  return cachedInternalSecret;
}

let cachedAccessToken: string | null = null;
async function getAccessToken(): Promise<string> {
  if (cachedAccessToken) return cachedAccessToken;
  const { data, error } = await admin.rpc("get_secret", { p_name: "line_channel_access_token" });
  if (error || !data) throw new Error("cannot load line_channel_access_token from vault");
  cachedAccessToken = data as string;
  return cachedAccessToken;
}

async function logNotification(bookingId: string | null, status: "sent" | "failed", error: string | null) {
  await admin.from("notifications_log").insert({
    booking_id: bookingId,
    channel: "line",
    event_type: "booking_confirmed",
    status,
    error,
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const provided = req.headers.get("x-internal-secret");
  const expected = await getInternalSecret().catch((err) => {
    console.error("line-notify: cannot load internal secret", err);
    return null;
  });
  if (!expected || provided !== expected) {
    return new Response("Unauthorized", { status: 401 });
  }

  let payload: { booking_id?: string };
  try {
    payload = await req.json();
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  const bookingId = payload.booking_id;
  if (!bookingId) {
    return new Response("booking_id required", { status: 400 });
  }

  const { data: booking, error } = await admin
    .from("bookings")
    .select("id, booking_ref, check_in, check_out, guests(line_user_id)")
    .eq("id", bookingId)
    .single();

  if (error || !booking) {
    await logNotification(bookingId, "failed", error?.message ?? "booking not found");
    return new Response("booking not found", { status: 404 });
  }

  // deno-lint-ignore no-explicit-any
  const lineUserId = (booking as any).guests?.line_user_id as string | undefined;
  if (!lineUserId) {
    await logNotification(bookingId, "failed", "guest has no line_user_id (walk-in/OTA booking)");
    return new Response("guest has no line_user_id", { status: 200 });
  }

  const text =
    `จองห้องสำเร็จ ✅\n` +
    `รหัสการจอง: ${booking.booking_ref}\n` +
    `เช็คอิน: ${booking.check_in}\n` +
    `เช็คเอาท์: ${booking.check_out}\n` +
    `ขอบคุณที่ใช้บริการนาวิน โฮเทล ดอนเมืองครับ`;

  const token = await getAccessToken();
  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ to: lineUserId, messages: [{ type: "text", text }] }),
  });

  if (!res.ok) {
    const errText = await res.text();
    await logNotification(bookingId, "failed", `LINE push failed: ${res.status} ${errText}`);
    return new Response("line push failed", { status: 502 });
  }

  await logNotification(bookingId, "sent", null);
  return new Response("OK", { status: 200 });
});
