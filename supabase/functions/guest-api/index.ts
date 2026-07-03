// guest-api — API สำหรับ guest-app (LIFF) ทั้งหมด
// แขกไม่มี Supabase Auth account — ทุก request แนบ LIFF ID token มาแทน
// ฟังก์ชันนี้ verify id token กับ LINE ทุกครั้ง (stateless, ไม่เก็บ session เอง)
// แล้วใช้ service role ทำงานฝั่ง DB (bypass RLS โดยตั้งใจ — ตรวจสิทธิ์เองในโค้ดนี้)
//
// Endpoints (ทั้งหมดเป็น POST, ส่ง idToken มาด้วยทุกครั้ง):
//   /guest-api/book         — สร้างการจอง + อัปโหลดเอกสาร ID (ถ้ามี)
//   /guest-api/my-bookings  — ดูรายการจองของตัวเอง
//   /guest-api/cancel       — ยกเลิกการจอง (เฉพาะที่ยังไม่ check-in)
//
// verify_jwt = false เพราะ guest ไม่มี Supabase JWT — ยืนยันตัวตนด้วย LINE ID token เอง

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

let cachedLoginChannelId: string | null = null;
async function getLoginChannelId(): Promise<string> {
  if (cachedLoginChannelId) return cachedLoginChannelId;
  const { data, error } = await admin.rpc("get_secret", { p_name: "line_login_channel_id" });
  if (error || !data) {
    throw new Error(
      "line_login_channel_id ยังไม่ถูกตั้งค่าใน Vault — ต้องสร้าง LINE Login channel ก่อน (ดู HANDOFF.md)",
    );
  }
  cachedLoginChannelId = data as string;
  return cachedLoginChannelId;
}

interface LineVerifyResult {
  sub: string; // line_user_id
  name?: string;
  picture?: string;
}

async function verifyIdToken(idToken: string): Promise<LineVerifyResult> {
  const channelId = await getLoginChannelId();
  const res = await fetch("https://api.line.me/oauth2/v2.1/verify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ id_token: idToken, client_id: channelId }),
  });
  if (!res.ok) {
    throw new Error("invalid_id_token");
  }
  return (await res.json()) as LineVerifyResult;
}

async function upsertGuest(profile: LineVerifyResult): Promise<string> {
  const { data, error } = await admin
    .from("guests")
    .upsert(
      { line_user_id: profile.sub, display_name: profile.name ?? null },
      { onConflict: "line_user_id" },
    )
    .select("id")
    .single();
  if (error || !data) throw new Error("cannot upsert guest");
  return data.id as string;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function handleBook(req: Request): Promise<Response> {
  const payload = await req.json().catch(() => null);
  if (!payload?.idToken) return jsonResponse({ error: "idToken required" }, 400);

  const {
    idToken,
    branch_id,
    room_type_id,
    check_in,
    check_out,
    num_guests,
    first_name,
    last_name,
    phone,
    nationality,
    doc_type,
    doc_number,
    id_photo_base64,
    id_photo_mime,
  } = payload;

  if (!branch_id || !room_type_id || !check_in || !check_out || !num_guests) {
    return jsonResponse({ error: "missing booking fields" }, 400);
  }

  const profile = await verifyIdToken(idToken);
  const guestId = await upsertGuest(profile);

  // อัปเดตข้อมูลแขก (ชื่อ-สกุล/เบอร์/สัญชาติ) ถ้าส่งมา
  if (first_name || last_name || phone || nationality) {
    await admin
      .from("guests")
      .update({
        ...(first_name ? { first_name } : {}),
        ...(last_name ? { last_name } : {}),
        ...(phone ? { phone } : {}),
        ...(nationality ? { nationality } : {}),
      })
      .eq("id", guestId);
  }

  const { data: booking, error: bookingErr } = await admin.rpc("create_guest_booking", {
    p_guest_id: guestId,
    p_branch_id: branch_id,
    p_room_type_id: room_type_id,
    p_check_in: check_in,
    p_check_out: check_out,
    p_num_guests: num_guests,
  });

  if (bookingErr) {
    const msg = bookingErr.message ?? "";
    if (msg.includes("no_availability")) return jsonResponse({ error: "no_availability" }, 409);
    if (msg.includes("invalid_dates")) return jsonResponse({ error: "invalid_dates" }, 400);
    return jsonResponse({ error: "booking_failed", detail: msg }, 500);
  }

  // อัปโหลดรูปเอกสาร ID ถ้าแนบมา (ไม่บล็อกการจองถ้าอัปโหลดไม่สำเร็จ — แจ้ง warning กลับไปแทน)
  let documentWarning: string | null = null;
  if (doc_type && id_photo_base64) {
    try {
      const bytes = Uint8Array.from(atob(id_photo_base64), (c) => c.charCodeAt(0));
      const ext = (id_photo_mime as string | undefined)?.includes("png") ? "png" : "jpg";
      const path = `guests/${guestId}/${booking.id}-${doc_type}.${ext}`;
      const { error: uploadErr } = await admin.storage
        .from("id-documents")
        .upload(path, bytes, { contentType: id_photo_mime || "image/jpeg", upsert: true });

      if (uploadErr) {
        documentWarning = `upload_failed: ${uploadErr.message}`;
      } else {
        await admin.from("guest_documents").insert({
          guest_id: guestId,
          doc_type,
          doc_number: doc_number ?? null,
          file_path: path,
        });
      }
    } catch (err) {
      documentWarning = `upload_error: ${(err as Error).message}`;
    }
  }

  return jsonResponse({
    booking_ref: booking.booking_ref,
    status: booking.status,
    total_amount: booking.total_amount,
    document_warning: documentWarning,
  });
}

async function handleMyBookings(req: Request): Promise<Response> {
  const payload = await req.json().catch(() => null);
  if (!payload?.idToken) return jsonResponse({ error: "idToken required" }, 400);

  const profile = await verifyIdToken(payload.idToken);
  const guestId = await upsertGuest(profile);

  const { data, error } = await admin
    .from("bookings")
    .select(
      "id, booking_ref, check_in, check_out, num_guests, status, total_amount, room_types(name, code), branches(name)",
    )
    .eq("guest_id", guestId)
    .order("created_at", { ascending: false });

  if (error) return jsonResponse({ error: "query_failed", detail: error.message }, 500);
  return jsonResponse({ bookings: data });
}

async function handleCancel(req: Request): Promise<Response> {
  const payload = await req.json().catch(() => null);
  if (!payload?.idToken || !payload?.booking_id) {
    return jsonResponse({ error: "idToken and booking_id required" }, 400);
  }

  const profile = await verifyIdToken(payload.idToken);
  const guestId = await upsertGuest(profile);

  const { data: booking, error: fetchErr } = await admin
    .from("bookings")
    .select("id, guest_id, status")
    .eq("id", payload.booking_id)
    .single();

  if (fetchErr || !booking) return jsonResponse({ error: "booking_not_found" }, 404);
  if (booking.guest_id !== guestId) return jsonResponse({ error: "forbidden" }, 403);
  if (!["pending", "confirmed"].includes(booking.status)) {
    return jsonResponse({ error: "cannot_cancel_in_current_status" }, 409);
  }

  const { error: updateErr } = await admin
    .from("bookings")
    .update({ status: "cancelled" })
    .eq("id", payload.booking_id);

  if (updateErr) return jsonResponse({ error: "cancel_failed", detail: updateErr.message }, 500);
  return jsonResponse({ ok: true });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const url = new URL(req.url);
  const route = url.pathname.split("/").filter(Boolean).pop();

  try {
    switch (route) {
      case "book":
        return await handleBook(req);
      case "my-bookings":
        return await handleMyBookings(req);
      case "cancel":
        return await handleCancel(req);
      default:
        return jsonResponse({ error: "unknown_route" }, 404);
    }
  } catch (err) {
    const message = (err as Error).message ?? "internal_error";
    if (message === "invalid_id_token") return jsonResponse({ error: "invalid_id_token" }, 401);
    console.error("guest-api error", err);
    return jsonResponse({ error: "internal_error", detail: message }, 500);
  }
});
