import cron from "node-cron";
import fs from "fs";
import path from "path";
import { search } from "duck-duck-scrape";
import { GoogleGenerativeAI } from "@google/generative-ai";

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
  generationConfig: { responseMimeType: "application/json", responseSchema },
});

// ĐƯỜNG DẪN CHUẨN XÁC: Đi từ thư mục backend -> src -> data -> province_in4
const PROVINCE_DATA_DIR = path.join(process.cwd(), "src/data/province_in4");

async function updateSingleProvince(filePath: string, fileName: string) {
  try {
    // 1. Đọc data cũ từ file JSON và cắt bỏ ký tự tàng hình BOM (nếu có)
    const rawData = fs.readFileSync(filePath, "utf-8").replace(/^\uFEFF/, "");
    const provinceData = JSON.parse(rawData);
    
    // Trích xuất tên tỉnh từ tên file (Ví dụ: 01_HaNoi.json -> HaNoi)
    const provinceName = fileName.replace(".json", "").replace(/^\d+_/, "");
    
    console.log(`[Job] Bắt đầu tìm kiếm dữ liệu trên Web cho: ${provinceName}...`);

    // 2. Search Web
    const searchResults = await search(`tin tức môi trường tài nguyên rừng biển ô nhiễm tỉnh ${provinceName} mới nhất`);
    const searchContext = searchResults.results
      .slice(0, 5)
      .map((item: { title: string; description: string }) => `Tiêu đề: ${item.title} \nNội dung: ${item.description}`)
      .join("\n\n");

    // 3. Trích xuất JSON bằng AI
    const prompt = `Dựa vào các tin tức sau, hãy tổng hợp tình hình môi trường của tỉnh ${provinceName}:\n\n${searchContext}`;
    const result = await model.generateContent(prompt);
    const newData = JSON.parse(result.response.text());

    // 4. Gộp data mới vào data cũ và ghi đè lại file
    const updatedProvinceData = {
      ...provinceData,
      environmental_data: {
        last_updated: new Date().toISOString(),
        ...newData
      }
    };

    fs.writeFileSync(filePath, JSON.stringify(updatedProvinceData, null, 2), "utf-8");
    console.log(`[Success] Đã cập nhật xong cho file ${fileName}`);

  } catch (error) {
    console.error(`[Error] Lỗi khi xử lý file ${fileName}:`, error);
  }
}

export const startDataUpdaterJob = () => {
  // Hàm này sẽ chạy thử 1 lần ngay khi bạn bật server
  runUpdater(); 

  // Và lên lịch chạy tự động lúc 2h sáng mỗi ngày
  cron.schedule("0 2 * * *", runUpdater);
};

async function runUpdater() {
  console.log("Bắt đầu tiến trình cập nhật 34 tỉnh thành...");
  
  try {
    // Quét thư mục province_in4 để lấy danh sách 34 file
    const files = fs.readdirSync(PROVINCE_DATA_DIR).filter(file => file.endsWith(".json"));

    // Tạm thời chạy thử 2 file đầu tiên (01_HaNoi.json, 02_HaGiang.json) để test trước
    // Nếu ok thì bạn xóa ".slice(0, 2)" đi để nó chạy hết 34 file nhé
    const testFiles = files.slice(0, 2); 

    for (const file of testFiles) {
      const filePath = path.join(PROVINCE_DATA_DIR, file);
      await updateSingleProvince(filePath, file);
      // Delay 10s để không bị khóa IP
      await new Promise(resolve => setTimeout(resolve, 10000)); 
    }
    console.log("Hoàn thành tiến trình cập nhật!");
  } catch (error) {
    console.error("Lỗi khi đọc thư mục. Vui lòng kiểm tra lại đường dẫn!", error);
  }
}