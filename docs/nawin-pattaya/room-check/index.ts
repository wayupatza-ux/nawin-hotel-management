// public-nawin-pattaya-room-check — room readiness checklist for The Nawin Pattaya
// GET  ?k=            -> { success, rooms, checks }
// POST {k, room_no, checked_by, items:[{key,status,note}]} -> { success, checks }
// Token: same staff link as the bed board (check_antai_beds_token / Vault antai_beds_token)
import { createClient } from "jsr:@supabase/supabase-js@2";

const ITEM_KEYS = new Set([
  "bed", "ac", "tv", "fridge", "furniture", "curtain", "light", "lamp", "socket", "floor", "door", "wall", "clean_room",
  "heater", "shower", "toilet", "bidet", "sink", "drain", "grout", "bathtub", "clean_bath",
]);
const STATUSES = new Set(["ok", "issue", "na"]);
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  let body: any = {};
  let k = new URL(req.url).searchParams.get("k") ?? "";
  if (req.method === "POST") {
    try { body = await req.json(); } catch { return json({ success: false, error: "bad json" }, 400); }
    k = String(body.k ?? "");
  }
  const { data: ok, error: tErr } = await sb.rpc("check_antai_beds_token", { t: k });
  if (tErr) return json({ success: false, error: tErr.message }, 500);
  if (!ok) return json({ success: false, error: "unauthorized" }, 401);

  if (req.method === "GET") {
    const [r, c] = await Promise.all([
      sb.from("antai_room_beds").select("room_no,floor,room_type,has_bathtub,base_35,base_5,base_6,mat_35,mat_5,mat_6,checked,note,sort")
        .not("room_type", "in", "(Stock,Spa)").order("sort"),
      sb.from("nawin_pattaya_room_checks").select("*"),
    ]);
    if (r.error || c.error) return json({ success: false, error: (r.error || c.error)!.message }, 500);
    return json({ success: true, rooms: r.data, checks: c.data });
  }

  if (req.method === "POST") {
    const room_no = String(body.room_no ?? "");
    const who = body.checked_by ? String(body.checked_by).slice(0, 60) : null;
    const items = Array.isArray(body.items) ? body.items : [];
    const { data: room } = await sb.from("antai_room_beds").select("room_no").eq("room_no", room_no).maybeSingle();
    if (!room) return json({ success: false, error: "ไม่พบห้อง" }, 400);
    const now = new Date().toISOString();
    const rows = [];
    for (const it of items) {
      const key = String(it?.key ?? ""), status = String(it?.status ?? "");
      if (!ITEM_KEYS.has(key) || !STATUSES.has(status)) return json({ success: false, error: `รายการไม่ถูกต้อง: ${key}` }, 400);
      const note = it?.note ? String(it.note).slice(0, 500) : null;
      if (status === "issue" && !note) return json({ success: false, error: `กรุณาใส่รายละเอียดปัญหา (${key})` }, 400);
      rows.push({ room_no, item_key: key, status, note, checked_by: who, checked_at: now });
    }
    if (!rows.length) return json({ success: false, error: "ไม่มีรายการ" }, 400);
    // upsert every submitted item (re-confirming refreshes checked_at); log only real changes
    const { data: prev } = await sb.from("nawin_pattaya_room_checks").select("item_key,status,note").eq("room_no", room_no);
    const pm = new Map((prev ?? []).map((p: any) => [p.item_key, p]));
    const changed = rows.filter((r) => { const p: any = pm.get(r.item_key); return !p || p.status !== r.status || (p.note ?? null) !== r.note; });
    const up = await sb.from("nawin_pattaya_room_checks").upsert(rows);
    if (up.error) return json({ success: false, error: up.error.message }, 500);
    if (changed.length) await sb.from("nawin_pattaya_room_check_log").insert(changed);
    const { data: checks } = await sb.from("nawin_pattaya_room_checks").select("*").eq("room_no", room_no);
    return json({ success: true, checks, changed: changed.length });
  }
  return json({ success: false, error: "method" }, 405);
});
