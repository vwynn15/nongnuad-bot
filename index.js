const express = require('express');
const line = require('@line/bot-sdk');

// 1. ตั้งค่า LINE API Credentials
const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};

const client = new line.Client(config);
const app = express();

// URL เว็บไซต์หลักของพี่วิว
const WEBSITE_URL = 'https://summaryviw.ai.studio';

// Middleware สำหรับรับ Webhook จาก LINE
app.post('/webhook', line.middleware(config), (req, res) => {
  Promise.all(req.body.events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error('Webhook Error:', err);
      res.status(500).end();
    });
});

// 2. ฟังก์ชันจัดการ Event ทั้งหมดจาก LINE
async function handleEvent(event) {
  if (event.type !== 'message') return Promise.resolve(null);

  const messageType = event.message.type;

  // ----------------------------------------------------
  // กรณีที่ 1: พี่วิวส่ง "รูปภาพสลิป" เข้ามาในแชท
  // ----------------------------------------------------
  if (messageType === 'image') {
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: `📸 **เพื่อความแม่นยำและบันทึกเข้าสู่ระบบโดยตรง**\n\n` +
            `พี่วิวสามารถกดแนบสลิป/สแกนสลิปผ่านทางหน้าเว็บ **SpendWise x น้องหนวด** ได้เลยครับเหมียว! 🐱✨\n\n` +
            `👉 [คลิกสแกนสลิปบนเว็บที่นี่](${WEBSITE_URL})`
    });
  }

  // ----------------------------------------------------
  // กรณีที่ 2: กดปุ่มจาก Rich Menu หรือ พิมพ์ข้อความ
  // ----------------------------------------------------
  if (messageType === 'text') {
    const text = event.message.text.trim();

    // ปุ่ม: กระปุกเงินออม
    if (text === 'กระปุกเงินออม') {
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: `🐷 **กระปุกเงินออม - SpendWise x น้องหนวด**\n\n` +
              `ดูเป้าหมายเงินออมและยอดสะสมของพี่วิวได้ที่หน้าเว็บเลยครับเหมียว!\n\n` +
              `👉 [เปิดกระปุกเงินออม](${WEBSITE_URL})`
      });
    }

    // ปุ่ม: รับเงิน / รายรับ
    if (text === 'รับเงิน' || text === 'รายรับ') {
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: `💵 **บันทึกรายรับ - SpendWise x น้องหนวด**\n\n` +
              `บันทึกเงินเข้ากระเป๋าพี่วิวแบบรวดเร็วได้ที่หน้าเว็บเลยครับ!\n\n` +
              `👉 [เปิดหน้าบันทึกรายรับ](${WEBSITE_URL})`
      });
    }

    // ปุ่ม: เงินออก / รายจ่าย
    if (text === 'เงินออก' || text === 'รายจ่าย' || text === 'ส่งสลิป') {
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: '💳 **บันทึกรายจ่าย & สแกนสลิป**\n\n' +
              'สแกนสลิปโอนเงิน หรือบันทึกรายการจ่ายเงินด้วยตัวเองทางเว็บได้เลยครับ!\n\n' +
              `👉 [เปิดหน้าสแกนสลิป/บันทึกรายจ่าย](${WEBSITE_URL})`
      });
    }

    // ปุ่ม: สรุปรายรับ-รายจ่าย
    if (text === 'สรุปรายรับ-รายจ่าย' || text === 'สรุปรายวัน' || text === 'สรุปรายเดือน') {
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: `📊 **สรุปภาพรวมรายรับ-รายจ่าย**\n\n` +
              `ดูแดชบอร์ดสรุปยอดคงเหลือ งบประมาณ และกราฟการใช้จ่ายของพี่วิวได้เลยครับ!\n\n` +
              `👉 [ดูแดชบอร์ดสรุปบัญชี](${WEBSITE_URL})`
      });
    }

    // ปุ่ม: ความรู้สึก / สู่เป้าหมาย / ข้อความอื่นๆ
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: `🐱 **น้องหนวด (Mustache Cat):**\n\n` +
            `ยินดีต้อนรับพี่วิวเข้าสู่ระบบ **SpendWise x น้องหนวด - บันทึกรายรับรายจ่ายของพี่วิว** ครับ!\n\n` +
            `พี่วิวสามารถกดจัดการบัญชีและบันทึกรายการทั้งหมดได้ที่ลิงก์ด้านล่างนี้เลยครับเหมียว 🐾\n\n` +
            `👉 [เปิดหน้าเว็บ SpendWise](${WEBSITE_URL})`
    });
  }
}

// เปิดรัน Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🐱 Nong Nuad Bot Server is running on port ${PORT}`);
});
