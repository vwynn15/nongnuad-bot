const express = require('express');
const line = require('@line/bot-sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// 1. ตั้งค่า LINE และ Gemini API Key
const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const client = new line.Client(config);
const app = express();

// Middleware รับ Webhook จาก LINE
app.post('/webhook', line.middleware(config), (req, res) => {
  Promise.all(req.body.events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error('Webhook Main Error:', err);
      res.status(500).end();
    });
});

// 2. ฟังก์ชันจัดการ Event จาก LINE
async function handleEvent(event) {
  if (event.type !== 'message') return Promise.resolve(null);

  const messageType = event.message.type;

  // ----------------------------------------------------
  // กรณีที่ 1: ส่ง "รูปภาพสลิป" เข้ามา
  // ----------------------------------------------------
  if (messageType === 'image') {
    try {
      const messageId = event.message.id;
      
      // ดึงรูปภาพจาก LINE API เป็น Stream แล้วรวมเป็น Buffer
      const stream = await client.getMessageContent(messageId);
      const chunks = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      const imageBuffer = Buffer.concat(chunks);

      // ส่งภาพไปให้ Gemini ประมวลผล
      const slipData = await parseSlipWithAI(imageBuffer);

      if (!slipData || slipData.isValidSlip === false) {
        return client.replyMessage(event.replyToken, {
          type: 'text',
          text: '🐥 น้องเจี๊ยบ: "ภาพนี้ดูเหมือนไม่ใช่สลิปโอนเงินนะค้าบพี่วิว หรืออ่านข้อมูลไม่ชัดเจน ลองส่งใหม่อีกทีน้า!"'
        });
      }

      // คำนวณเหรียญและตอบกลับ
      const earnedCoins = 10;
      const isIncome = slipData.type === 'INCOME';

      const replyText = 
        `📸 **บันทึกสลิปอัตโนมัติสำเร็จ!**\n` +
        `--------------------------\n` +
        `💸 ประเภท: ${isIncome ? 'รายรับ 🟢' : 'รายจ่าย 🔴'}\n` +
        `💰 จำนวน: ${slipData.amount} บาท\n` +
        `🏪 ร้านค้า/ผู้รับ: ${slipData.merchant || 'ไม่ระบุ'}\n` +
        `📂 หมวดหมู่: ${slipData.category || 'ทั่วไป'}\n\n` +
        `🪙 พี่วิวได้รับ +${earnedCoins} เหรียญทอง!\n` +
        `🐱 น้องหนวด: "เหมียว~ บันทึกบัญชีเรียบร้อย พุงกางเลยครับ!"`;

      return client.replyMessage(event.replyToken, { type: 'text', text: replyText });

    } catch (error) {
      console.error('=== DEBUG SLIP OCR ERROR ===');
      console.error(error.message || error);
      console.error('============================');

      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: '😿 น้องหนวด: "อุ๊ย อ่านสลิปไม่สำเร็จ ลองถ่ายใหม่อีกรอบนะพี่วิว"'
      });
    }
  }

  // ----------------------------------------------------
  // กรณีที่ 2: พิมพ์ข้อความ หรือ กดปุ่ม Rich Menu
  // ----------------------------------------------------
  if (messageType === 'text') {
    const text = event.message.text.trim();

    // ปุ่มแรก: บันทึกรายรับรายจ่าย / SpendWise
    if (text === 'กระปุกเงินออม' || text === 'SpendWise' || text === 'บันทึกรายรับรายจ่าย') {
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: '🌐 **SpendWise x น้องหนวด - บันทึกรายรับรายจ่ายของพี่วิว**\n\n' +
              'พี่วิวสามารถเข้าไปทำรายการบันทึกรายรับ-รายจ่าย ดูสรุปภาพรวม และจัดการกระปุกเงินออมด้วยตัวเองได้ทางเว็บไซต์เลยครับเหมียว! 🐱🪙\n\n' +
              '👉 [คลิกเพื่อเปิดเว็บ SpendWise](https://nongnuad-bot.onrender.com)'
      });
    }

    if (text === 'ส่งสลิป') {
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: '📸 พี่วิวสามารถกดส่งรูปภาพสลิปโอนเงินเข้ามาในแชทนี้ได้เลยครับ น้องหนวดรออ่านอยู่เหมียว!'
      });
    }

    // จดบันทึกด้วยข้อความ (เช่น -150 ค่าอาหาร, +5000 เงินเดือน)
    if (text.startsWith('+') || text.startsWith('-')) {
      const isIncome = text.startsWith('+');
      const parts = text.slice(1).trim().split(' ');
      const amount = parseFloat(parts[0]);
      const note = parts.slice(1).join(' ') || (isIncome ? 'รายรับทั่วไป' : 'ค่าใช้จ่ายทั่วไป');

      if (isNaN(amount)) {
        return client.replyMessage(event.replyToken, {
          type: 'text',
          text: '🐥 น้องเจี๊ยบ: "รูปแบบตัวเลขไม่ถูกต้องนะพี่วิว ลองพิมพ์แบบนี้ดูน้า เช่น `-120 ค่าข้าว` หรือ `+500 เงินเดือน` ครับ"'
        });
      }

      const earnedCoins = isIncome ? Math.floor(amount * 0.1) : 5;

      const replyText = 
        `✍️ **บันทึกรายการสำเร็จ!**\n` +
        `--------------------------\n` +
        `💸 รายการ: ${note}\n` +
        `💰 จำนวน: ${isIncome ? '+' : '-'}${amount} บาท\n\n` +
        `🪙 พี่วิวได้รับ +${earnedCoins} เหรียญทอง!\n` +
        `🐱 น้องหนวด: "เก่งมากครับพี่วิว บันทึกยอดนี้เรียบร้อย!"`;

      return client.replyMessage(event.replyToken, { type: 'text', text: replyText });
    }

    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: `🐱 น้องหนวด: พี่วิวพิมพ์ว่า "${text}" น้า ถ้าจะจดบัญชีพิมพ์ "-ยอดเงิน รายละเอียด" เช่น "-100 ค่ากาแฟ" หรือส่งรูปสลิปมาได้เลยครับ!`
    });
  }
}

// 3. ฟังก์ชัน AI อ่านสลิปด้วย Gemini 1.5 Flash (สกัด JSON แบบคลีนปลอดภัย)
async function parseSlipWithAI(imageBuffer) {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const prompt = `
    คุณคือระบบ OCR วิเคราะห์สลิปโอนเงินธนาคารของประเทศไทย 
    โปรดอ่านข้อมูลจากรูปภาพที่แนบมานี้อย่างละเอียด และตอบกลับเป็น JSON เท่านั้น โดยมีโครงสร้างดังนี้:
    {
      "type": "EXPENSE", 
      "amount": 12.00,
      "merchant": "ชื่อผู้รับเงิน หรือ ชื่อร้านค้า",
      "category": "หมวดหมู่ภาษาไทย (เช่น อาหาร, ช้อปปิ้ง, ค่าเดินทาง, ทั่วไป)",
      "isValidSlip": true
    }

    เงื่อนไข:
    1. ถ้าเป็สลิปโอนเงิน/ชำระเงิน ให้ "type" เป็น "EXPENSE" และ "isValidSlip" เป็น true
    2. "amount" ต้องเป็นตัวเลขถอน/จ่ายจริง (ทศนิยม)
    3. ตอบกลับเป็น JSON เท่านั้น ห้ามใส่ข้อความอธิบายใดๆ นอกเหนือจาก JSON
  `;

  const imagePart = {
    inlineData: {
      data: imageBuffer.toString('base64'),
      mimeType: 'image/jpeg'
    }
  };

  const result = await model.generateContent([prompt, imagePart]);
  const responseText = result.response.text();

  // ดึงสกัดเอาเฉพาะก้อน JSON { ... }
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("ไม่สามารถดึงโครงสร้าง JSON จากคำตอบของ Gemini ได้");
  }

  const parsedData = JSON.parse(jsonMatch[0]);
  return parsedData;
}

// เปิด Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🐱 Nong Nuad Bot Server is running on port ${PORT}`);
});
