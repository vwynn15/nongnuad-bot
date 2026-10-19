const express = require('express');
const line = require('@line/bot-sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// 1. ตั้งค่า LINE และ Gemini API Key
const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN || 'ใส่_Channel_Access_Token_ของพี่วิวตรงนี้',
  channelSecret: process.env.CHANNEL_SECRET || 'ใส่_Channel_Secret_ของพี่วิวตรงนี้',
};

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'ใส่_Gemini_API_Key_ของพี่วิวตรงนี้');
const client = new line.Client(config);
const app = express();

// Middleware สำหรับรับ Webhook จาก LINE
app.post('/webhook', line.middleware(config), (req, res) => {
  Promise.all(req.body.events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error(err);
      res.status(500).end();
    });
});

// 2. ฟังก์ชันแยกแยะประเภทสิ่งที่ผู้ใช้ส่งเข้ามา
async function handleEvent(event) {
  if (event.type !== 'message') return Promise.resolve(null);

  const userId = event.source.userId;
  const messageType = event.message.type;

  // ----------------------------------------------------
  // กรณีที่ 1: พี่วิวส่ง "รูปภาพสลิป" เข้ามา
  // ----------------------------------------------------
  if (messageType === 'image') {
    try {
      const messageId = event.message.id;
      
      // ดึงรูปภาพจาก LINE มาแปลงเป็น Buffer
      const stream = await client.getMessageContent(messageId);
      const chunks = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      const imageBuffer = Buffer.concat(chunks);

      // ส่งให้ AI Gemini ช่วยอ่านสลิป
      const slipData = await parseSlipWithAI(imageBuffer);

      if (!slipData.isValidSlip) {
        return client.replyMessage(event.replyToken, {
          type: 'text',
          text: '🐥 น้องเจี๊ยบ: "ภาพนี้ดูเหมือนไม่ใช่สลิปโอนเงินนะค้าบพี่วิว ลองส่งสลิปใหม่อีกทีน้า!"'
        });
      }

      // บันทึกลงฐานข้อมูล (จำลอง) & คำนวณเหรียญให้น้องหนวด
      const earnedCoins = 10; // ได้รับ 10 เหรียญจากการส่งสลิป

      const replyText = 
        `📸 **บันทึกสลิปอัตโนมัติสำเร็จ!**\n` +
        `--------------------------\n` +
        `💸 ประเภท: ${slipData.type === 'INCOME' ? 'รายรับ 🟢' : 'รายจ่าย 🔴'}\n` +
        `💰 จำนวน: ${slipData.amount} บาท\n` +
        `🏪 ร้านค้า/ผู้รับ: ${slipData.merchant}\n` +
        `📂 หมวดหมู่: ${slipData.category}\n\n` +
        `🪙 พี่วิวได้รับ +${earnedCoins} เหรียญทอง!\n` +
        `🐱 น้องหนวด: "เหมียว~ บันทึกบัญชีเรียบร้อย พุงกางเลยครับ!"`;

      return client.replyMessage(event.replyToken, { type: 'text', text: replyText });

    } catch (error) {
      console.error('Slip OCR Error:', error);
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: '😿 น้องหนวด: "อุ๊ย อ่านสลิปไม่สำเร็จ ลองถ่ายใหม่อีกรอบนะพี่วิว"'
      });
    }
  }

  // ----------------------------------------------------
  // กรณีที่ 2: พี่วิวพิมพ์ "ข้อความ" เข้ามา (เช่น -150 ค่ากาแฟ, +500 เงินเดือน)
  // ----------------------------------------------------
  if (messageType === 'text') {
    const text = event.message.text.trim();

    // ถ้ากดปุ่ม "ส่งสลิป" จาก Rich Menu
    if (text === 'ส่งสลิป') {
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: '📸 พี่วิวสามารถกดส่งรูปภาพสลิปโอนเงินเข้ามาในแชทนี้ได้เลยครับ น้องหนวดรออ่านอยู่เหมียว!'
      });
    }

    // ตรวจสอบว่าเป็นรูปแบบบันทึกรายรับ-รายจ่ายด้วยข้อความหรือไม่ (ขึ้นต้นด้วย + หรือ -)
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

    // ข้อความทักทายทั่วไป
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: `🐱 น้องหนวด: พี่วิวพิมพ์ว่า "${text}" น้า ถ้าจะจดบัญชีพิมพ์ "-ยอดเงิน รายละเอียด" เช่น "-100 ค่ากาแฟ" หรือส่งรูปสลิปมาได้เลยครับ!`
    });
  }
}

// 3. ฟังก์ชัน AI อ่านสลิปด้วย Gemini 1.5 Flash
async function parseSlipWithAI(imageBuffer) {
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  const imagePart = {
    inlineData: {
      data: imageBuffer.toString('base64'),
      mimeType: 'image/jpeg',
    },
  };

  const prompt = `
    คุณคือ AI ผู้ช่วยตรวจสอบสลิปโอนเงินไทย กรุณาอ่านข้อมูลจากรูปสลิปนี้แล้วตอบกลับเป็น JSON เท่านั้น (ห้ามมี markdown code block):
    {
      "type": "EXPENSE" หรือ "INCOME",
      "amount": จำนวนเงินตัวเลข float เช่น 150.00,
      "merchant": "ชื่อผู้รับเงิน หรือ ร้านค้า หรือ ธนาคารปลายทาง",
      "category": "หมวดหมู่ภาษาไทย เช่น อาหาร, เครื่องดื่ม, ช้อปปิ้ง, เดินทาง, ผ่อนบ้าน, น้ำมัน, ค่ารักษา, ครอบครัว",
      "isValidSlip": true หรือ false
    }
  `;

  const result = await model.generateContent([prompt, imagePart]);
  const responseText = result.response.text().trim();
  const cleanJson = responseText.replace(/```json|```/g, '').trim();
  return JSON.parse(cleanJson);
}

// เปิดรัน Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🐱 Nong Nuad Bot Server is running on port ${PORT}`);
});
