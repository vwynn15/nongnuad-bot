// ============================================================
//  LINE Expense Bot — Cloudflare Worker
//  บัญชีรายรับรายจ่ายผ่าน LINE พร้อม OCR สลิป + กราฟสรุป (LIFF)
// ============================================================
import { Hono } from "hono";

const app = new Hono();

// ---------- เลขหมวดหมู่ default ----------
const DEFAULT_EXPENSE_CATS = {
  1: "อาหาร", 2: "เดินทาง", 3: "ช้อปปิ้ง", 4: "ที่พัก",
  5: "สุขภาพ", 6: "ความบันเทิง", 7: "อื่นๆ",
};
const DEFAULT_INCOME_CATS = { 8: "เงินเดือน", 9: "โบนัส", 10: "อื่นๆ" };

// ---------- ช่วยแปลงตัวเลขไทย/จุด/คอมม่า ----------
function parseAmount(str) {
  if (!str) return null;
  const cleaned = String(str).replace(/[฿,]/g, "").replace(/[๐-๙]/g, (d) => "๐๑๒๓๔๕๖๗๘๙".indexOf(d));
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

function fmt(n) {
  return Number(n).toLocaleString("th-TH", { maximumFractionDigits: 2 });
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// ---------- ตรวจ signature LINE webhook ----------
async function verifySignature(body, signature, channelSecret) {
  if (!channelSecret || !signature) return false;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(channelSecret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  const expected = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return expected === signature;
}

// ---------- เรียก LINE Reply / Push ----------
async function lineReply(env, replyToken, messages) {
  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({ replyToken, messages }),
  });
}

async function linePush(env, userId, messages) {
  await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({ to: userId, messages }),
  });
}

// ---------- ดึงรูปจาก LINE content API ----------
async function getLineContent(env, messageId) {
  const r = await fetch(`https://api-data.line.me/v2/bot/message/${messageId}/content`, {
    headers: { Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}` },
  });
  if (!r.ok) return null;
  return await r.arrayBuffer();
}

// ---------- OCR สลิปด้วย Workers AI ----------
async function ocrReceipt(env, imageBuffer) {
  const blob = new Blob([imageBuffer], { type: "image/jpeg" });
  const formData = new FormData();
  formData.append("image", blob, "receipt.jpg");

  const r = await env.AI.run("@cf/llava-v1.5-7b-hf", formData);
  const desc = r.description || "";
  const nums = desc.match(/(\d[\d,]*\.?\d*)/g) || [];
  let amount = null;
  if (nums.length) {
    amount = Math.max(...nums.map((s) => parseAmount(s) || 0));
  }
  return { description: desc, amount };
}

// ---------- ดึง/สร้าง user ----------
async function getOrCreateUser(env, userId, displayName) {
  const existing = await env.DB.prepare("SELECT line_user_id FROM users WHERE line_user_id = ?")
    .bind(userId).first();
  if (!existing) {
    await env.DB.prepare("INSERT INTO users (line_user_id, display_name) VALUES (?, ?)")
      .bind(userId, displayName || "").run();
  }
}

// ---------- แปลงข้อความเป็นธุรกรรม ----------
function parseTransaction(text) {
  const t = text.trim();
  let type = "expense";
  let rest = t;

  const incomePrefix = /^(รับ|รายได้|รายรับ|income|in)\s+/i;
  if (incomePrefix.test(rest)) {
    type = "income";
    rest = rest.replace(incomePrefix, "");
  }

  const parts = rest.split(/\s+/);
  let category = null;
  let amount = null;
  let noteParts = [];
  let amountIdx = -1;

  for (let i = 0; i < parts.length; i++) {
    const a = parseAmount(parts[i]);
    if (a !== null && amountIdx === -1) {
      amount = a;
      amountIdx = i;
    }
  }

  if (amount === null) return null;

  const cats = type === "expense" ? DEFAULT_EXPENSE_CATS : DEFAULT_INCOME_CATS;
  const catMap = Object.fromEntries(Object.entries(cats).map(([k, v]) => [v, k]));
  for (let i = 0; i < parts.length; i++) {
    if (i === amountIdx) continue;
    const p = parts[i];
    for (const [name, id] of Object.entries(catMap)) {
      if (p === name || p.includes(name)) {
        category = parseInt(id);
        break;
      }
    }
    if (category) break;
  }

  for (let i = 0; i < parts.length; i++) {
    if (i === amountIdx) continue;
    noteParts.push(parts[i]);
  }
  if (category) {
    const catName = cats[category];
    noteParts = noteParts.filter((p) => p !== catName);
  }

  return {
    type,
    amount,
    categoryId: category || (type =
