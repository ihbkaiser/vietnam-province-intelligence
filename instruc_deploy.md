# Hướng dẫn deploy EduGeo AI local/ngrok

File này dùng cho app chính `edugeo-ai` và các service phụ đang chạy cùng repo.

## 1. Các cổng đang dùng

- `3020`: EduGeo AI, app chính Next.js.
- `8020`: NotebookLM SGK, dùng cho RAG/Quiz/Flashcard/Summary.
- `8787`: VietGeoAI legacy backend/frontend.

Thông thường chỉ cần chạy app chính ở `3020`. Script của EduGeo sẽ tự gọi NotebookLM `8020`. VietGeoAI `8787` sẽ được tự khởi động khi mở tab VietGeoAI trong app.

## 2. Chạy localhost

Mở terminal tại repo:

```powershell
cd D:\vietnam-province-intelligence\edugeo-ai
npm install
npm run dev
```

Sau khi thấy log kiểu:

```text
Local: http://127.0.0.1:3020
Ready
```

mở:

```text
http://127.0.0.1:3020
```

Nếu muốn kiểm tra service phụ:

```text
http://127.0.0.1:8020
http://127.0.0.1:8787/api/health
```

## 3. Deploy tạm bằng ngrok cho app chính

Giữ terminal `npm run dev` đang chạy, mở terminal thứ hai:

```powershell
ngrok http 3020
```

Ngrok sẽ in ra URL dạng:

```text
https://xxxxx.ngrok-free.dev
```

Gửi URL này cho người khác để vào EduGeo AI.

## 4. Lưu ý về VietGeoAI khi dùng ngrok

EduGeo AI chạy qua `3020`, nhưng VietGeoAI cũ có backend riêng ở `8787`.

Khi chỉ tunnel `3020`, các chức năng chính của EduGeo vẫn chạy qua URL ngrok. Tuy nhiên phần VietGeoAI nhúng iframe có thể bị trình duyệt chặn nếu nó cố gọi trực tiếp:

```text
http://127.0.0.1:8787
```

Với test nội bộ trên cùng máy, hãy mở trực tiếp:

```text
http://127.0.0.1:8787
```

Nếu muốn public VietGeoAI qua internet, cần thêm một tunnel riêng cho `8787` hoặc proxy VietGeoAI qua chính app `3020`.

Ví dụ tunnel riêng:

```powershell
ngrok http 8787
```

Nếu tài khoản ngrok không cho chạy nhiều endpoint cùng lúc, hãy tắt tunnel `3020` trước hoặc cấu hình nhiều tunnel trong ngrok config.

## 5. Kiểm tra nhanh

Kiểm tra app chính:

```powershell
Invoke-WebRequest http://127.0.0.1:3020 -UseBasicParsing
```

Kiểm tra NotebookLM:

```powershell
Invoke-WebRequest http://127.0.0.1:8020 -UseBasicParsing
```

Kiểm tra VietGeoAI:

```powershell
Invoke-WebRequest http://127.0.0.1:8787/api/health -UseBasicParsing
```

## 6. Dừng server

Trong terminal đang chạy server hoặc ngrok, nhấn:

```text
Ctrl + C
```

Nếu còn process chiếm port, kiểm tra:

```powershell
Get-NetTCPConnection -LocalPort 3020,8020,8787 -ErrorAction SilentlyContinue
```

Sau đó tắt process theo `OwningProcess` nếu cần:

```powershell
Stop-Process -Id <PID>
```

## 7. Lệnh thường dùng

Chạy EduGeo:

```powershell
cd D:\vietnam-province-intelligence\edugeo-ai
npm run dev
```

Public EduGeo:

```powershell
ngrok http 3020
```

Public VietGeoAI riêng:

```powershell
ngrok http 8787
```
