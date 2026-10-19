// 💡 จุดสำคัญ: ต้อง Object Destructuring เอา "Type" ออกมาจากไลบรารีด้วยที่ด้านบนสุดของไฟล์
const { GoogleGenerativeAI, Type } = require('@google/generative-ai'); 

// ... โค้ดส่วนอื่น ๆ คงเดิมไว้ ...

// 3. ฟังก์ชัน AI อ่านสลิปด้วย Gemini 1.5 Flash (ปรับปรุงให้รองรับ Schema อย่างสมบูรณ์ 🛠️)
async function parseSlipWithAI(imageBuffer) {
  // กำหนดโครงสร้างข้อมูลที่บังคับให้ AI ตอบกลับมา
  const jsonSchema = {
    type: Type.OBJECT,
    properties: {
      type: { type: Type.STRING, description: "ประเภทรายการ เช่น INCOME หรือ EXPENSE" },
      amount: { type: Type.NUMBER, description: "จำนวนเงินสุทธิในสลิป (ทศนิยม 2 ตำแหน่ง)" },
      merchant: { type: Type.STRING, description: "ชื่อผู้รับเงิน หรือ ชื่อร้านค้าบนสลิป" },
      category: { type: Type.STRING, description: "หมวดหมู่ค่าใช้จ่าย เช่น อาหาร, เดินทาง, ทั่วไป" },
      isValidSlip: { type: Type.BOOLEAN, description: "ระบุว่าเป็นสลิปธนาคารที่ถูกต้อง (true/false)" }
    },
    required: ["type", "amount", "merchant", "category", "isValidSlip"],
  };

  const model = genAI.getGenerativeModel({ 
    model: "gemini-1.5-flash",
    // 💡 บังคับให้ส่งค่ากลับมาเป็น JSON ตาม Schema ที่ระบุไว้ 100% ไร้กังวลเรื่องอักขระแถม
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: jsonSchema,
    }
  });

  const prompt = `คุณคือ AI ผู้ช่วยตรวจสอบและดึงข้อมูลจากสลิปโอนเงินหรือสลิปใช้จ่ายของประเทศไทย กรุณาอ่านข้อมูลจากรูปภาพสลิปนี้อย่างละเอียด แล้วสรุปผลลงฟิลด์ตามโครงสร้าง JSON`;

  const imagePart = {
    inlineData: {
      data: imageBuffer.toString('base64'),
      mimeType: 'image/jpeg'
    }
  };

  const result = await model.generateContent([prompt, imagePart]);
  const responseText = result.response.text().trim();
  
  // เมื่อใช้ responseSchema ผลลัพธ์จะเป็น JSON String แท้ๆ เสมอ สามารถ Parse ได้โดยตรงทันที ไม่ต้องพึ่งพา Regex ให้เสี่ยงพังครับ
  return JSON.parse(responseText);
}
