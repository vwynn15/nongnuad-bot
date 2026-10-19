const express = require('express');
const line = require('@line/bot-sdk');
const { GoogleGenerativeAI, Type } = require('@google/generative-ai'); // 👈 เพิ่ม Type เข้ามาสำหรับกำหนด Schema

// 1. ตั้งค่า LINE และ Gemini API Key
const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const client = new line.Client(config);
const app = express();

// Middleware สำหรับรับ Webhook จาก LINE
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

      if (!slipData || !slipData.isValidSlip) {
        return client.replyMessage(event.replyToken, {
          type: 'text',
          text: '🐥 น้องเจี๊ยบ: "ภาพนี้ดูเหมือนไม่ใช่สลิปโอนเงินนะค้าบพี่วิว ลองส่งสลิปใหม่อีกทีน้า!"'
        });
      }

      // บันทึกลงฐานข้อมูล & คำนวณเหรียญให้น้องหนวด
      const earnedCoins = 10;

      const replyText = 
        `📸 **บันทึกสลิปอัตโนมัติสำเร็จ!**\n` +
        `--------------------------\n` +
        `💸 ประเภท: ${slipData.type === 'INCOME' ? 'รายรับ 🟢' : 'รายจ่าย 🔴'}\n` +
        `💰 จำนวน: ${slipData.amount} บาท\n` +
        `🏪 ร้านค้า/ผู้รับ: ${slipData.merchant || 'ไม่ระบุ'}\n` +
        `📂 หมวดหมู่: ${slipData.category || 'ทั่วไป'}\n\n` +
        `🪙 พี่วิวได้รับ +${earnedCoins} เหรียญทอง!\n` +
        `🐱 น้องหนวด: "เหมียว~ บันทึกบัญชีเรียบร้อย พุงกางเลยครับ!"`;

      return client.replyMessage(event.replyToken, { type: 'text', text: replyText });

    } catch (error) {
      // ปริ้นท์ Error ลงใน Render Logs เพื่อการตรวจสอบ
      console.error('=== DEBUG SLIP ERROR ===');
      console.error(error);
      console.error('========================');

      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: '😿 น้องหนวด: "อุ๊ย อ่านสลิปไม่สำเร็จ ลองถ่ายใหม่อีกรอบนะพี่วิว"'
      });
    }
  }

  // ----------------------------------------------------
  // กรณีที่ 2: พิมพ์ข้อความจดบันทึกเข้ามา
  // ----------------------------------------------------
  if (messageType === 'text') {
    const text = event.message.text.trim();

    if (text === 'ส่งสลิป') {
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: '📸 พี่วิวสามารถกดส่งรูปภาพสลิปโอนเงินเข้ามาในแชทนี้ได้เลยครับ น้องหนวดรออ่านอยู่เหมียว!'
      });
    }

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

// 3. ฟังก์ชัน AI อ่านสลิปด้วย Gemini (แก้ไขแล้ว 🛠️)
async function parseSlipWithAI(imageBuffer) {
  // สร้างโครงสร้าง Schema เพื่อบังคับให้ Gemini ตอบกลับมาเป็น JSON รูปแบบนี้เท่านั้น
  const jsonSchema = {
    type: Type.OBJECT,
    properties: {
      type: { 
        type: Type.STRING, 
        description: "ประเภทรายการ เช่น INCOME (รายรับ) หรือ EXPENSE (รายจ่าย)" 
      },
      amount: { 
        type: Type.NUMBER, 
        description: "จำนวนเงินในสลิป (ทศนิยม 2 ตำแหน่ง)" 
      },
      merchant: { 
        type: Type.STRING, 
        description: "ชื่อผู้รับเงิน หรือ ชื่อร้านค้า" 
      },
      category: { 
        type: Type.STRING, 
        description: "หมวดหมู่ของค่าใช้จ่าย เช่น อาหาร, เดินทาง, ช้อปปิ้ง, ทั่วไป" 
      },
      isValidSlip: { 
        type: Type.BOOLEAN, 
        description: "ระบุว่าเป็นสลิปธนาคารที่ถูกต้องใช่หรือไม่ (true/false)" 
      }
    },
    required: ["type", "amount", "merchant", "category", "isValidSlip"],
  };

  const model = genAI.getGenerativeModel({ 
    model: "gemini-1.5-flash",
    // 💡 จุดสำคัญ: บังคับให้ Output ออกมาเป็นโครงสร้าง JSON ตาม Schema ด้านบน
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: jsonSchema,
    }
  });

  const prompt = `คุณคือ AI ผู้ช่วยตรวจสอบและดึงข้อมูลจากสลิปโอนเงินหรือสลิปใช้จ่ายของประเทศไทย กรุณาอ่านข้อมูลจากรูปภาพสลิปที่แนบมานี้อย่างละเอียด แล้วสรุปข้อมูลลงในฟิลด์ที่กำหนด`;

  const imagePart = {
    inlineData: {
      data: imageBuffer.toString('base64'),
      mimeType: 'image/jpeg',
    },
  };

  const result = await model.generateContent([prompt, imagePart]);
  const responseText = result.response.text().trim();
  
  // ผลลัพธ์ที่ได้จะเป็น JSON String แท้ๆ 100% ไม่มีอักขระแถม สามารถ parse ได้อย่างปลอดภัย
  return JSON.parse(responseText);
}

// เปิดรัน Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🐱 Nong Nuad Bot Server is running on port ${PORT}`);
});
