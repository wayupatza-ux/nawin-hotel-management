// ค่าตั้งค่าฝั่ง client — ทั้งหมดนี้ปลอดภัยที่จะ public (ไม่ใช่ secret):
// - Supabase anon/publishable key ถูกออกแบบมาให้เปิดเผยได้ (ป้องกันด้วย RLS แล้ว)
// - LIFF ID เป็นค่าที่ฝังอยู่ใน client ของทุก LIFF app อยู่แล้วโดยธรรมชาติ
window.APP_CONFIG = {
  SUPABASE_URL: "https://loxhiqsutuboxyllmysw.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_Z0erMSeZVf5enAed_ZZYaQ_hvlys5EQ",
  // TODO: แทนที่ด้วย LIFF ID จริงหลังสร้าง LIFF app ใน LINE Developers Console
  // (Provider > Channel ประเภท LINE Login > LIFF > Add) — ดูขั้นตอนใน HANDOFF.md
  LIFF_ID: "REPLACE_WITH_REAL_LIFF_ID",
  GUEST_API_BASE: "https://loxhiqsutuboxyllmysw.supabase.co/functions/v1/guest-api",
};
