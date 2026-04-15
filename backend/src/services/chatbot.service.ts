import cron from "node-cron";
import fs from "fs";
import path from "path";
import { GoogleGenerativeAI } from "@google/generative-ai"; // Đã xóa duck-duck-scrape

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY as string);

const responseSchema: any = {
  type: "object",
  properties: {
    tinh_hinh_rung: { type: "string", description: "Thông tin cháy rừng, độ che phủ..." },
    tinh_hinh_bien: { type: "string", description: "Chất lượng nước, sạt lở bờ biển. Ghi 'Không có biển' nếu nội địa." },
    o_nhiem_tong_hop: { type: "string", description: "Các sự cố môi trường gần đây" },
  },
  required: ["tinh_hinh_rung", "tinh_hinh_bien", "o_nhiem_tong_hop"],
};

const model = genAI.getGenerativeModel({
  model: "gemini-1.5-flash",
  tools: [{ googleSearch: {} } as any], // BẬT GOOGLE SEARCH CHÍNH CHỦ CHO AGENT
  generationConfig: { responseMimeType: "application/json", responseSchema },
});

const PROVINCE_DATA_DIR = path.join(process.cwd(), "src/data/province_in4");

async function updateSingleProvince(filePath: string, fileName: string) {
  try {
    // 1. Đọc data cũ
    const rawData = fs.readFileSync(filePath, "utf-8").replace(/^\uFEFF/, "");
    const provinceData = JSON.parse(rawData);
    const provinceName = fileName.replace(".json", "").replace(/^\d+_/, "");
    
    // 2. Gọi AI tự động Search Google và trả về JSON (chỉ mất 3-5 giây)
    const prompt = `Hãy sử dụng Google Search để tìm kiếm tin tức mới nhất về tình hình môi trường, tài nguyên rừng, tài nguyên biển và ô nhiễm của tỉnh ${provinceName} hiện nay. Tổng hợp lại và trả về đúng định dạng JSON đã yêu cầu.`;
    
    const result = await model.generateContent(prompt);
    const newData = JSON.parse(result.response.text());

    // 3. Ghi đè file
    const updatedProvinceData = {
      ...provinceData,
      environmental_data: {
        last_updated: new Date().toISOString(),
        ...newData
      }
    };

    fs.writeFileSync(filePath, JSON.stringify(updatedProvinceData, null, 2), "utf-8");
    console.log(`✅ [Success] Đã cập nhật xong dữ liệu cho ${provinceName}`);

  } catch (error) {
    console.error(`❌ [Error] Lỗi khi xử lý file ${fileName}:`, error);
  }
}

export const startDataUpdaterJob = () => {
  runUpdater(); 
  cron.schedule("0 2 * * *", runUpdater);
};

async function runUpdater() {
  console.log("🚀 Bắt đầu tiến trình cập nhật bằng Google Search...");
  
  try {
    const files = fs.readdirSync(PROVINCE_DATA_DIR).filter(file => file.endsWith(".json"));
    const total = files.length;

    for (let i = 0; i < total; i++) {
      const file = files[i];
      const filePath = path.join(PROVINCE_DATA_DIR, file);
      
      console.log(`\n⏳ [${i + 1}/${total}] Đang nhờ Gemini search cho: ${file}...`);
      await updateSingleProvince(filePath, file);
      
      // Delay 5 giây để không bị chạm trần Rate Limit (15 request/phút)
      if (i < total - 1) {
        await new Promise(resolve => setTimeout(resolve, 5000)); 
      }
    }
    console.log("\n🎉 HOÀN THÀNH CẬP NHẬT TOÀN BỘ 34 TỈNH THÀNH!");
  } catch (error) {
    console.error("Lỗi khi đọc thư mục:", error);
  }
}