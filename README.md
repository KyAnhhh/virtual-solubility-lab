# Virtual Solubility Lab 3D — Phòng Thí Nghiệm Ảo Về Tính Tan

Ứng dụng web 3D mô phỏng trực quan các hiện tượng hòa tan, lơ lửng, phân tán và tách lớp trong cốc thí nghiệm dành cho học sinh và giáo viên.

Dự án được xây dựng trên nền tảng React 19, Three.js, React Three Fiber (R3F), Zustand và TypeScript. Toàn bộ logic khoa học và bảo toàn khối lượng được điều khiển bởi một động cơ độc lập (Headless Simulation Engine), tách biệt hoàn toàn với vòng lặp đồ họa 3D.

---

## 1. Cài Đặt và Khởi Chạy

### Yêu cầu môi trường
- **Node.js**: Phiên bản 22 trở lên.
- **Trình duyệt**: Hỗ trợ WebGL và ES Modules hiện đại (Chrome, Edge, Firefox, Safari).

### Cài đặt dependencies
Khi clone dự án hoặc thiết lập trên máy mới:
```bash
npm ci
```
*(Hoặc dùng `npm install` nếu chưa có tệp `package-lock.json` tương thích).*

### Khởi chạy môi trường phát triển (Dev Server)
```bash
npm run dev
```
Sau khi lệnh chạy, mở địa chỉ URL hiển thị trên terminal (thường là `http://localhost:5173/`).

### Các lệnh kiểm tra chất lượng (Quality Gates)
```bash
# Kiểm tra logic và kịch bản khoa học qua Vitest (29 test suites)
npm test

# Kiểm tra kiểu dữ liệu tĩnh TypeScript
npm run typecheck

# Kiểm tra cú pháp và định dạng mã nguồn ESLint
npm run lint

# Biên dịch gói sản phẩm production vào thư mục dist/
npm run build
```

### Chạy thử nghiệm bản Production tại máy cục bộ (Production Preview)
Sau khi chạy `npm run build`, bạn có thể kiểm tra trực tiếp bản build production qua máy chủ HTTP cục bộ bằng lệnh:
```bash
npm run preview
```
Mở URL hiển thị trên terminal (mặc định là `http://localhost:4173/`).

---

## 2. Hướng Dẫn Thao Tác Thí Nghiệm

### Thêm nguyên liệu vào cốc
- Bảng **NGUYÊN LIỆU** bên trái cung cấp 4 chất: **Nước** (ml), **Đường** (g), **Cát** (g), **Dầu ăn** (ml).
- Ô nhập liệu hỗ trợ cả định dạng dấu chấm (`.`) và dấu phẩy (`,`) theo chuẩn tiếng Việt và quốc tế (ví dụ: `10.5` hoặc `10,5`).
- Giới hạn thêm mỗi lần: Nước tối đa 500 ml, Dầu tối đa 200 ml, Đường tối đa 100 g, Cát tối đa 100 g. Tổng thể tích chất lỏng và thể tích chiếm chỗ của chất rắn không được vượt quá dung tích cốc (500 ml).
- Sau khi nhập số lượng, nhấn nút **+ Thêm** để đưa chất vào cốc thí nghiệm.

### Điều khiển thìa khuấy
Ứng dụng hỗ trợ hai phương thức khuấy:

1. **Khuấy tự động (Auto Mode):**
   - Chọn chế độ **Khuấy tự động** trên bảng ĐIỀU KHIỂN.
   - Chọn một trong 3 mức tốc độ: **Chậm** (1.0 rad/s), **Vừa** (3.0 rad/s), hoặc **Nhanh** (6.0 rad/s).
   - Nhấn nút **🌀 Bắt đầu khuấy tự động**. Thìa sẽ tự động quay quanh trục cốc để tạo dòng xoáy chất lỏng.

2. **Kéo thìa thủ công (Manual Mode):**
   - Chọn chế độ **Kéo thủ công**.
   - Di chuyển chuột vào vùng lòng cốc, nhấn giữ chuột trái trực tiếp lên thân thìa khuấy và kéo rê chuột theo vòng tròn quanh cốc.
   - Thao tác kéo chuột sẽ trực tiếp truyền lực khuấy vào dòng chất lỏng. Khi thả chuột ra, lực chủ động của thìa sẽ ngắt.

---

## 3. Phân Biệt Các Nút Điều Khiển & Trạng Thái

Để hiểu đúng bản chất vật lý, người học cần phân biệt rõ các chức năng điều khiển:

- **Ngừng khuấy (⏹ Ngừng khuấy):**
  - Chỉ ngắt lực truyền cơ học của thìa khuấy (thìa đứng yên hoặc thôi tác dụng lực).
  - **Mô phỏng vẫn tiếp tục chạy:** Dòng xoáy suy giảm tự nhiên theo quán tính, cát lơ lửng lắng dần về đáy, và các giọt dầu phân tán nổi dần lên mặt.
- **Tạm dừng mô phỏng (⏸ Tạm dừng):**
  - Đóng băng toàn bộ đồng hồ mô phỏng và động học chất lưu ($\Delta t = 0$). Vận tốc và vị trí các hạt dừng lại ngay lập tức.
  - Khi tạm dừng, người dùng vẫn có thể thêm chất: thể tích và khối lượng cập nhật ngay trên màn hình nhưng thời gian mô phỏng không tăng.
- **Tiếp tục mô phỏng (▶ Tiếp tục):**
  - Đưa mô phỏng chạy tiếp từ trạng thái đã đóng băng.
  - Bước thời gian đầu tiên sau khi tiếp tục có $\Delta t = 0$, đảm bảo mô phỏng không chạy bù bước nhảy thời gian cho khoảng thời gian tạm dừng.
- **Làm mới cốc thí nghiệm (↺ Làm mới cốc thí nghiệm - Scientific Reset):**
  - Đưa toàn bộ các chất trong cốc về 0, thiết lập lại đồng hồ mô phỏng về 0 giây.
  - **Bảo toàn giao diện:** Góc nhìn camera hiện tại và lựa chọn Hiện/Ẩn thìa khuấy không bị thay đổi sau khi làm mới cốc.
- **Đặt lại góc nhìn (Camera Reset):**
  - Đưa góc quay 3D và khoảng cách zoom về vị trí chuẩn ban đầu. Thao tác này hoàn toàn không làm ảnh hưởng đến các chất hay tiến trình mô phỏng bên trong cốc.

---

## 4. Ba Kịch Bản Khám Phá Trọng Tâm

1. **Thí nghiệm 1: Nước và Đường (Hiện tượng Hòa tan)**
   - *Thao tác:* Thêm 40 ml nước và 100 g đường. Bật khuấy nhanh.
   - *Hiện tượng:* Với 40 ml nước, sức chứa bão hòa tối đa là 80 g đường ($2.0\text{ g/ml}$). 80 g đường sẽ tan dần vào nước thành dung dịch trong suốt (đường đã tan $G_d$ phân tán ở cấp độ phân tử và không còn hiển thị hạt đại diện). Khi khuấy, tốc độ hòa tan tăng nhanh. Khi đạt ngưỡng bão hòa 80 g, 20 g đường dư còn lại sẽ không thể tan thêm và đọng lại ở đáy cốc.
   - *Khám phá:* Nhấn "Tạm dừng", thêm tiếp 10 ml nước. Sức chứa bão hòa lập tức tăng thêm 20 g, cho phép 20 g đường đọng đáy tiếp tục hòa tan hoàn toàn!

2. **Thí nghiệm 2: Nước và Cát (Hỗn dịch & Lắng tự nhiên)**
   - *Thao tác:* Thêm 100 ml nước và 10 g cát. Bật khuấy nhanh, sau đó nhấn "Ngừng khuấy".
   - *Hiện tượng:* Cát là chất không tan trong nước. Khi khuấy mạnh, các hạt cát ở đáy cốc được nâng lên và xoáy lơ lửng trong toàn bộ thể tích nước. Khi nhấn "Ngừng khuấy", dòng chảy suy giảm dần do lực cản chất lỏng và cát lắng dần xuống đáy cốc tạo thành lớp trầm tích.

3. **Thí nghiệm 3: Nước và Dầu ăn (Chất lỏng không trộn lẫn & Phân tách pha)**
   - *Thao tác:* Thêm 100 ml nước và 20 ml dầu ăn.
   - *Hiện tượng ban đầu:* Dầu ăn không tan trong nước và có khối lượng riêng nhỏ hơn nước ($0.9\text{ g/ml}$ so với $1.0\text{ g/ml}$), do đó nổi hoàn toàn thành một lớp màu vàng phía trên mặt nước.
   - *Hiện tượng khi khuấy:* Khuấy mạnh làm lớp dầu trên mặt bị xé rách và phân tán thành hàng loạt giọt dầu nhỏ lơ lửng trong lòng khối nước.
   - *Hiện tượng khi ngừng khuấy:* Nhấn "Ngừng khuấy", lực nổi sẽ đẩy các giọt dầu nổi dần lên bề mặt và hợp nhất trở lại thành lớp dầu phân tầng phía trên.

---

## 5. Giới Hạn Của Mô Hình Khoa Học & Lưu Ý Dữ Liệu

- **Mục đích giáo dục:** Mô hình được thiết kế nhằm phục vụ việc trực quan hóa khái niệm khoa học phổ thông (hòa tan, bão hòa, lơ lửng, phân tách pha), không phải là phần mềm mô phỏng động lực học chất lưu tính toán (CFD) hay nhiệt động học phân tử chuyên sâu.
- **Chưa qua hiệu chuẩn thực nghiệm (Uncalibrated):** Các hệ số tốc độ khuấy, độ nhớt, tốc độ lắng và tốc độ tách lớp sử dụng các tham số sư phạm mặc định được chuẩn hóa số học để học sinh dễ quan sát, không phản ánh chính xác từng thông số động học chất lưu đo lường trong phòng thí nghiệm chuyên nghiệp.
- **Không có yếu tố nhiệt độ:** Mô hình hiện tại sử dụng độ tan danh định mặc định của đường trong nước ($2.0\text{ g/g-nước}$) và không mô phỏng sự biến thiên của độ tan theo nhiệt độ.
- **Lưu trữ dữ liệu:** Toàn bộ dữ liệu thí nghiệm được lưu trong bộ nhớ tạm (in-memory) của phiên làm việc hiện tại trên trình duyệt. Việc tải lại toàn bộ trang web (F5 hoặc Refresh) sẽ khởi tạo lại ứng dụng từ đầu và xóa dữ liệu thí nghiệm.

---

## 6. Xử Lý Khi Đồ Họa 3D Gặp Sự Cố (WebGL Failure & Recovery)

- **Khi không gian 3D bị lỗi hoặc gián đoạn:**
  - Nếu trình duyệt bị mất kết nối đồ họa (WebGL Context Lost) hoặc lỗi tải tài nguyên 3D, mô phỏng sẽ **tự động chuyển sang trạng thái Tạm dừng**.
  - **Bảo toàn dữ liệu:** Toàn bộ khối lượng các chất đã thêm, bảng điều khiển và bảng kết quả bên ngoài vẫn hoạt động bình thường, không bị xóa.
  - **Thử lại hiển thị:** Nhấn nút **↺ Thử lại hiển thị 3D** (hoặc "↺ Thử lại tải 3D"). Hệ thống sẽ tạo lại khung vẽ đồ họa và nạp lại mô hình từ dữ liệu thí nghiệm hiện tại mà không làm mới trang.
  - **Sau khi khôi phục:** Mô phỏng sẽ tiếp tục ở trạng thái "Tạm dừng" để người học chủ động kiểm tra trạng thái trước khi nhấn nút "Tiếp tục mô phỏng".

---

## 7. Bằng Chứng Kiểm Nghiệm & Các Khía Cạnh Đang Hoàn Thiện

- **Đã kiểm nghiệm hoàn tất (Core / Unit Integration):**
  - Toàn bộ 548 bài kiểm tra tự động thuộc 29 test suites đều đạt kết quả tuyệt đối (100% pass qua Vitest).
  - Bảo toàn khối lượng nghiêm ngặt ($10^{-11}\text{ g}$) qua 36.000 bước mô phỏng (600 giây).
  - Thao tác kéo thìa thủ công đã được người dùng kiểm chứng thực tế trên trình duyệt máy tính.
- **Các khía cạnh đang tiếp tục hoàn thiện (Pending / Open Gates):**
  - Bộ kiểm thử tự động toàn diện trên trình duyệt (Browser E2E) và bài kiểm tra hiệu năng 30 FPS dài hạn trên các dòng card đồ họa khác nhau hiện đang ở trạng thái chờ kiểm chứng trên trình duyệt thực tế.
