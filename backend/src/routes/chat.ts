import { Router } from 'express';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';


// 1. Fix lỗi thư viện pdf-parse (Ép nó chạy chuẩn cũ)
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfRaw = require('pdf-parse');
const pdf = pdfRaw.default || pdfRaw; // Bóc cái hàm ra khỏi hộp


// 2. Fix lỗi __dirname (Tự tạo lại __dirname cho ES Module)
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


const router = Router();


const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY || '',
  baseURL: "https://openrouter.ai/api/v1",
});


// Trỏ đúng vào thư mục src/data/pdf
const dataFolder = path.join(__dirname, '../data/pdf');
let botKnowledge = "";


async function loadAllData() {
    try {
        // BẢO HIỂM: Nếu thư mục chưa tồn tại thì tự động tạo luôn cho đỡ báo lỗi
        if (!fs.existsSync(dataFolder)){
            fs.mkdirSync(dataFolder, { recursive: true });
            console.log("📁 Đã tự động tạo thư mục src/data/pdf vì chưa có sẵn.");
        }


        const files = fs.readdirSync(dataFolder);
        console.log(`Đang quét thư mục data/pdf... Tìm thấy ${files.length} file.`);
       
        for (const file of files) {
            const filePath = path.join(dataFolder, file);
           
            // Nếu là file Text thì đọc luôn
            if (file.endsWith('.txt')) {
                const content = fs.readFileSync(filePath, 'utf-8');
                botKnowledge += `\n\n--- TÀI LIỆU (TXT): ${file} ---\n${content}`;
                console.log(`📄 Đã học thuộc file: ${file}`);
            }
            // Nếu là file PDF thì nhờ pdf-parse bóc chữ
            else if (file.endsWith('.pdf')) {
                const dataBuffer = fs.readFileSync(filePath);
                const pdfData = await pdf(dataBuffer);
                botKnowledge += `\n\n--- TÀI LIỆU (PDF): ${file} ---\n${pdfData.text}`;
                console.log(`📕 Đã bóc tách xong file: ${file}`);
            }
        }
        console.log("✅ ĐÃ NẠP TOÀN BỘ KIẾN THỨC VÀO NÃO AI!");
    } catch (err) {
        console.error("❌ Lỗi: Có vấn đề khi đọc thư mục data/pdf.", err);
    }
}


// Gọi hàm học bài ngay khi khởi động
loadAllData();


router.post('/chat', async (req, res) => {
  try {
    const userMessage = req.body.message;


    const response = await openai.chat.completions.create({
      model: "openai/gpt-oss-20b:free",
      messages: [
         {
            role: "system",
            content: `Bạn là một chuyên gia Địa lý và Bản đồ hành chính Việt Nam. Hãy tuân thủ tuyệt đối các nguyên tắc sau:

1. NGÔN NGỮ & VĂN PHONG (QUAN TRỌNG): 
   - Trả lời 100% bằng tiếng Việt TỰ NHIÊN, lưu loát, mang đậm văn phong người Việt bản xứ. 
   - KHÔNG dùng từ ngữ lủng củng, KHÔNG mang âm hưởng dịch thuật máy móc.
   - Khi tổng hợp thông tin, hãy xào nấu và nối các ý lại thành những đoạn văn hoặc danh sách mạch lạc, dễ hiểu. Tùyệt đối không ghép nối câu chữ một cách gượng ép, rời rạc.

2. NGUỒN DỮ LIỆU & TÍNH CHÍNH XÁC: 
   - CHỈ sử dụng thông tin từ KHO DỮ LIỆU bên dưới. 
   - Rà soát đúng tên tỉnh/thành để lấy dữ liệu. Không râu ông nọ cắm cằm bà kia.
   - Nếu KHO DỮ LIỆU không có thông tin, đáp đúng 1 câu: "Dạ, hiện tại hệ thống của tôi chưa có dữ liệu chi tiết về vấn đề này." KHÔNG tự bịa đặt.

3. TRÌNH BÀY (MARKDOWN): 
   - Trình bày câu trả lời thật đẹp mắt. 
   - Dùng gạch đầu dòng cho các danh sách.
   - In đậm (**từ khóa**) các địa danh hoặc con số quan trọng để người đọc dễ nắm bắt.

KHO DỮ LIỆU:
${botKnowledge}`
        },
        { role: "user", content: userMessage }
      ],
    });


    const aiReply = response.choices[0].message.content;
    res.json({ reply: aiReply });


  } catch (error) {
    console.error("Lỗi AI:", error);
    res.status(500).json({ error: "Server đang bận, bạn thử lại nhé!" });
  }
});


export default router;