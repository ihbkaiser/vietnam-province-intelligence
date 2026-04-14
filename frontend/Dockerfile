# 1. Vẫn dùng Node.js bản Alpine cho nhẹ
FROM node:20-alpine

# 2. Thư mục làm việc cho Frontend
WORKDIR /app

# 3. Copy file quản lý thư viện
COPY package*.json ./

# 4. Cài đặt thư viện (Vite, React, Tailwind...)
RUN npm install

# 5. Copy toàn bộ code giao diện vào
COPY . .

# 6. Mở cổng 5173 (Cổng mặc định của Vite)
EXPOSE 5173

# 7. Lệnh chạy: Cực kỳ quan trọng phải có thêm "-- --host"
# Nếu không có nó, Docker sẽ chạy nhưng bạn vào localhost:5173 sẽ bị trắng trang
CMD ["npm", "run", "dev", "--", "--host"]