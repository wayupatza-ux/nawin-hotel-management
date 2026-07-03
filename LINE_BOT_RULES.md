# LINE OA Bot — กฎการทำงาน (Working Rules)

เอกสารนี้เป็น "กติกากลาง" สำหรับการพัฒนา LINE Official Account Bot ของบอสตอง
อ้างอิงจาก LINE Messaging API — https://developers.line.biz/en/docs/

> ทุกครั้งที่เขียน/แก้โค้ดที่เกี่ยวกับ LINE bot ให้ยึดกฎในไฟล์นี้เป็นหลัก

---

## 1. ภาพรวมสถาปัตยกรรม (Architecture)

```
ผู้ใช้ (LINE App)
   │  ส่งข้อความ / กดปุ่ม
   ▼
LINE Platform  ──POST webhook event──►  เซิร์ฟเวอร์ของเรา (Webhook URL, HTTPS)
   ▲                                         │
   │  เรียก Messaging API (reply/push)       │  ประมวลผล + ตอบกลับ
   └─────────────────────────────────────────┘
```

- การสื่อสารทั้งหมดเป็น **HTTPS + JSON**
- Bot ทำงานแบบ event-driven: LINE ยิง webhook มา เราตอบกลับผ่าน API
- **Webhook URL ต้องเป็น HTTPS เท่านั้น** (LINE ไม่รองรับ HTTP)

---

## 2. ข้อมูลลับ (Credentials) — ห้าม hardcode เด็ดขาด

| ตัวแปร | ใช้ทำอะไร | หาได้จาก |
|---|---|---|
| `LINE_CHANNEL_SECRET` | ตรวจลายเซ็น webhook (verify signature) | LINE Developers Console > Channel > Basic settings |
| `LINE_CHANNEL_ACCESS_TOKEN` | ยืนยันตัวตนตอนเรียก Messaging API | LINE Developers Console > Messaging API > Channel access token |
| `LINE_CHANNEL_ID` | ระบุ channel (ใช้กับ token v2.1 / login) | Basic settings |

**กฎเหล็ก:**
- อ่านค่าจาก **environment variable / `.env`** เท่านั้น — ห้ามใส่ค่าจริงในโค้ดหรือ commit ขึ้น git
- `.env` ต้องอยู่ใน `.gitignore` เสมอ
- ถ้าหลุด/สงสัยว่ารั่ว ให้ **reissue token และ regenerate channel secret** ทันทีในคอนโซล

---

## 3. ชนิดของ Channel Access Token (เลือกให้ถูก)

| ชนิด | อายุ | ต้องเก็บไหม | เหมาะกับ |
|---|---|---|---|
| Long-lived token (จากคอนโซล) | ไม่หมดอายุ (จนกว่าจะ reissue) | เก็บใน `.env` | เริ่มต้น/โปรเจกต์เล็ก (ที่เราใช้ตอนนี้) |
| Token v2.1 (JWT) | สูงสุด 30 วัน | ต้องต่ออายุเอง | production ที่ต้องการความปลอดภัยสูง |
| Stateless token | 15 นาที | **ไม่ต้องเก็บ** ขอใหม่ทุกครั้ง | serverless/ระบบ scale สูง |

> เริ่มต้นใช้ **long-lived token** ก่อน แล้วค่อยอัปเกรดเป็น v2.1/stateless เมื่อขึ้น production จริง

---

## 4. การรับ Webhook (Receiving) — บังคับทำทุกครั้ง

### 4.1 ตรวจลายเซ็น (Signature Validation) — **ห้ามข้าม**
LINE ส่ง header `x-line-signature` มาด้วยทุก request

ขั้นตอนตรวจ:
1. คำนวณ **HMAC-SHA256** ของ **raw request body** (ไบต์ดิบ ไม่ใช่ JSON ที่ parse แล้ว) โดยใช้ `LINE_CHANNEL_SECRET` เป็น key
2. เข้ารหัสผลลัพธ์เป็น **Base64**
3. เทียบกับค่าใน `x-line-signature`
4. ถ้าไม่ตรง → ตอบ **401/400 และทิ้ง request** (อาจเป็น request ปลอม)

> ต้องใช้ raw body ก่อน middleware แปลง JSON — ถ้า parse ก่อน ลายเซ็นจะเพี้ยน

### 4.2 ตอบ 200 OK เร็วที่สุด
- ต้องตอบ HTTP **200** กลับให้ LINE ทันที ไม่งั้น LINE จะ retry
- งานหนัก (เรียก DB, AI ฯลฯ) ให้ทำแบบ **async** หลังตอบ 200 แล้ว

### 4.3 Deduplication
- ใช้ `webhookEventId` กันประมวลผลซ้ำ (LINE อาจส่ง event เดิมซ้ำได้)

### 4.4 Event types ที่ต้องรองรับ
- `message` (replyable) — ข้อความ/รูป/สติกเกอร์ ฯลฯ
- `follow` / `unfollow` — เพิ่ม/บล็อกเพื่อน
- `join` / `leave` — เข้า/ออกกลุ่ม
- `postback` (replyable) — กดปุ่มจาก template/rich menu
- `unsend`, `beacon`, `accountLink` — ตามต้องการ

---

## 5. การส่งข้อความ (Sending) — Endpoints

Base URL: `https://api.line.me/v2/bot`

| งาน | Method + Endpoint |
|---|---|
| ตอบกลับ (reply) | `POST /message/reply` |
| ส่งเชิงรุก (push) | `POST /message/push` |
| ส่งหลายคน | `POST /message/multicast` |
| ส่งทุกคน | `POST /message/broadcast` |
| ส่งตามกลุ่มเป้าหมาย | `POST /message/narrowcast` |

**Headers ที่ต้องมี:**
```
Authorization: Bearer {LINE_CHANNEL_ACCESS_TOKEN}
Content-Type: application/json
```

### กฎการส่ง
- **Reply**: ใช้ `replyToken` จาก webhook — token ใช้ได้ครั้งเดียว และต้องตอบ**ภายในเวลาสั้น ๆ (แนะนำภายใน 1 นาที)** ไม่งั้นหมดอายุ
- **Push**: ใช้ `userId`/`groupId`/`roomId` เป็นปลายทาง (มีค่าใช้จ่ายตามโควตาแพ็กเกจ)
- ส่งได้สูงสุด **5 message object ต่อ 1 request**
- ข้อความยาวสูงสุด **5,000 ตัวอักษร** ต่อ text message
- **Reply ฟรี ไม่กินโควตา** ส่วน push/multicast/broadcast **กินโควตา** — เน้น reply ก่อนถ้าทำได้

---

## 6. Rate Limits & โควตา
- API ส่วนใหญ่รองรับสูงสุด ~**2,000 requests/วินาที** ต่อ endpoint
- ถ้าโดน `429 Too Many Requests` → ทำ **retry แบบ exponential backoff**
- ตรวจโควตาข้อความที่เหลือได้ที่ `GET /message/quota`

---

## 7. Best Practices ด้านความปลอดภัย
1. Verify signature ทุก request — no exception
2. เก็บ secret/token ใน `.env` / secret manager เท่านั้น
3. Webhook endpoint เป็น HTTPS + ไม่เปิด log ที่พิมพ์ token ออกมา
4. ตั้ง IP allowlist/WAF ได้ยิ่งดี (LINE ยิงจากช่วง IP ของ LINE)
5. หมุนเวียน (rotate) token เป็นระยะ และ reissue ทันทีเมื่อสงสัยว่ารั่ว
6. Validate ขนาด/ชนิดข้อมูลก่อนประมวลผล (กัน payload แปลกปลอม)
7. อย่าเชื่อ `userId` จาก body ที่ยังไม่ verify signature

---

## 8. Checklist ก่อน deploy
- [ ] `.env` ตั้งค่าครบและ **ไม่ถูก commit**
- [ ] Webhook URL เป็น HTTPS และเปิดใช้งานใน console แล้ว
- [ ] "Use webhook" = ON, ปิด auto-reply/greeting ถ้าจะคุมเองผ่านโค้ด
- [ ] Signature validation ทำงานถูกต้อง (ทดสอบด้วย request ปลอมแล้วต้องถูกปฏิเสธ)
- [ ] ตอบ 200 เร็ว + งานหนักเป็น async
- [ ] จัดการ error/retry/backoff เรียบร้อย
- [ ] มี logging ที่ไม่รั่ว secret

---

## 9. อ้างอิง
- Messaging API Overview — https://developers.line.biz/en/docs/messaging-api/overview/
- Receiving messages / Webhooks — https://developers.line.biz/en/docs/messaging-api/receiving-messages/
- Sending messages — https://developers.line.biz/en/docs/messaging-api/sending-messages/
- Channel access tokens — https://developers.line.biz/en/docs/messaging-api/channel-access-tokens/
- API Reference — https://developers.line.biz/en/reference/messaging-api/
