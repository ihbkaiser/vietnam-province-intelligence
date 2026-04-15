# 1. Sử dụng Node.js phiên bản 20 (nhẹ và ổn định)
FROM node:20-alpine

# 2. Tạo thư mục làm việc trong 'thế giới' Docker
WORKDIR /app

# 3. Copy file quản lý thư viện vào trước
# Bước này cực quan trọng để tối ưu tốc độ build (Docker Layer Caching)
COPY package*.json ./

# 4. Cài đặt các thư viện cần thiết
RUN npm install --legacy-peer-deps

# 5. Copy toàn bộ code từ máy bạn vào trong Docker
COPY . .

# 6. Mở cổng 8787 (cổng mà Backend của bạn đang chạy)
EXPOSE 8787

# 7. Lệnh khởi chạy: Dùng 'npm run dev' để code tự cập nhật khi bạn sửa
CMD ["npm", "run", "dev"]