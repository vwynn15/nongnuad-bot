// 3. ฟังก์ชัน AI อ่านสลิปด้วย Gemini 1.5 Flash (เวอร์ชัน Pure JSON Object รองรับทุกสภาพแวดล้อม 🛠️)
async function parseSlipWithAI(imageBuffer) {
  
  // 💡 เปลี่ยนมาใช้ String แทน Type.OBJECT เพื่อให้รองรับ library ได้ทุกเวอร์ชัน
  const jsonSchema = {
    type: "OBJECT", 
    properties: {
      type: { type: "STRING", description: "ประเภทรายการ เช่น INCOME หรือ EXPENSE" },
      amount: { type: "NUMBER", description: "จำนวนเงินสุทธิในสลิป (ทศนิยม 2 ตำแหน่ง)" },
      merchant: { type: "STRING", description: "ชื่อผู้รับเงิน หรือ ชื่อร้านค้าบนสลิป" },
      category: { type: "STRING", description: "หมวดหมู่ค่าใช้จ่าย เช่น อาหาร, เดินทาง, ทั่วไป" },
      isValidSlip: { type: "BOOLEAN", description: "ระบุว่าเป็นสลิปธนาคารที่ถูกต้อง (true/false)" }
    },
    required: ["type", "amount", "merchant", "category", "isValidSlip"],
  };

  const model = genAI.getGenerativeModel({ 
    model: "gemini-1.5-flash",
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: jsonSchema, // บังคับโครงสร้างออกมาเป็น JSON แบบเสถียร
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
  
  return JSON.parse(responseText);
}
