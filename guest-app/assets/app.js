// ฟังก์ชันร่วมสำหรับทุกหน้าใน guest-app
// ใช้ LIFF SDK สำหรับ login และ Supabase JS (anon key) สำหรับ query ข้อมูล catalog ที่เปิดสาธารณะ
// (branches/room_types/check_availability อ่านได้ด้วย anon key อยู่แล้วตาม RLS — ดู supabase/migrations/0007_rls.sql)

const { SUPABASE_URL, SUPABASE_ANON_KEY, LIFF_ID, GUEST_API_BASE } = window.APP_CONFIG;

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function initLiff() {
  if (!window.liff) throw new Error("liff SDK not loaded");
  await liff.init({ liffId: LIFF_ID });
  if (!liff.isLoggedIn()) {
    liff.login();
    // liff.login() จะ redirect ออกจากหน้า — โค้ดหลังจากนี้จะไม่ทำงานต่อในรอบนี้
    return null;
  }
  return liff.getIDToken();
}

async function getIdTokenOrRedirect() {
  const token = await initLiff();
  if (!token) {
    throw new Error("redirecting_to_login");
  }
  return token;
}

async function callGuestApi(route, body) {
  const res = await fetch(`${GUEST_API_BASE}/${route}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `request_failed_${res.status}`);
    err.detail = data.detail;
    err.status = res.status;
    throw err;
  }
  return data;
}

async function fetchBranches() {
  const { data, error } = await supabaseClient
    .from("branches")
    .select("id, name, address")
    .eq("is_active", true);
  if (error) throw error;
  return data;
}

async function fetchRoomTypes(branchId) {
  const { data, error } = await supabaseClient
    .from("room_types")
    .select("id, code, name, base_price, capacity, has_window")
    .eq("branch_id", branchId)
    .eq("is_active", true)
    .order("base_price");
  if (error) throw error;
  return data;
}

async function checkAvailability(branchId, roomTypeId, checkIn, checkOut) {
  const { data, error } = await supabaseClient.rpc("check_availability", {
    p_branch_id: branchId,
    p_room_type_id: roomTypeId,
    p_check_in: checkIn,
    p_check_out: checkOut,
  });
  if (error) throw error;
  return data;
}

function showMessage(el, text, type = "error") {
  el.textContent = text;
  el.className = `msg ${type}`;
  el.style.display = "block";
}

function hideMessage(el) {
  el.style.display = "none";
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      const base64 = result.substring(result.indexOf(",") + 1);
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
