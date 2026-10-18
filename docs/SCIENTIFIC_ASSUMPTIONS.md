# Giả Định Khoa Học và Giới Hạn Mô Hình — Virtual Solubility Lab 3D

Tài liệu này tổng hợp các giả định vật lý, mô hình số học đã được triển khai trong ứng dụng và các giới hạn phạm vi giáo dục của mô hình hiện tại (tuân thủ theo [SCIENTIFIC_SPEC.md](SCIENTIFIC_SPEC.md)).

---

## 1. Các Mô Hình Đã Triển Khai Thực Tế

Trái với phiên bản tĩnh ban đầu (Ngày 1), hệ thống hiện tại đã tích hợp hoàn chỉnh động cơ tính toán khoa học độc lập ([`HeadlessSimulationEngine`](../src/simulation/core/HeadlessSimulationEngine.ts)):

1. **Bảo Toàn Khối Lượng Tuyệt Đối (Mass Ledger Invariants):**
   - Phân chia thành 10 ngăn khối lượng con chính xác: Nước ($W$), Đường rắn ($G_u$), Đường hòa tan ($G_d$), Đường tổng ($G_t$), Cát đáy ($S_b$), Cát lơ lửng ($S_s$), Cát tổng ($S_t$), Dầu tầng trên ($O_l$), Dầu phân tán thành giọt ($O_d$), Dầu tổng ($O_t$).
   - Bất biến khối lượng luôn được duy trì với sai số máy tính $\le 10^{-11}\text{ g}$ trong toàn bộ quá trình mô phỏng, kể cả khi chạy liên tục 36.000 bước tích phân (600 giây).

2. **Động Học Hòa Tan (Dissolution Kinetics):**
   - Đường hòa tan theo phương trình vi phân tốc độ phụ thuộc vào cường độ dòng chảy và tiếp xúc với thìa:
     $$\frac{dG_d}{dt} = k_{diss} \cdot (1 - \text{saturationRatio}) \cdot G_u$$
     với $k_{diss} = 0.08 \cdot I \cdot (1 + \text{contact})$.
   - Đường đã tan $G_d$ phân tán ở cấp độ phân tử và hoàn toàn không sinh hạt đại diện trong scene 3D.
   - Sức chứa bão hòa được xác định nghiêm ngặt theo lượng nước có mặt: $\text{capacity} = 2.0 \cdot W$. Vượt quá sức chứa, lượng đường dư $G_u$ đọng lại ở đáy cốc và không thể tan thêm cho đến khi được bổ sung thêm nước.

3. **Hỗn Dịch Cát & Lắng Tự Nhiên (Sand Suspension & Sedimentation):**
   - Cát là chất không tan ($S_d = 0$).
   - Khi khuấy, cát được nâng từ đáy cốc lên lơ lửng ($S_b \to S_s$).
   - Khi ngừng khuấy, dòng xoáy suy giảm theo quán tính và lực cản Stokes ($\exp(-4h)$), cát lắng dần về đáy cốc theo vận tốc giới hạn lắng tự nhiên ($v_{settle} = 0.08\text{ units/s}$), hoàn toàn không rơi tức thì hay dùng chuyển động giả tạo.

4. **Phân Tách Pha & Giọt Dầu (Oil Droplets Dispersion & Separation):**
   - Khối lượng riêng của dầu là $\rho_{oil} = 0.9\text{ g/ml}$, nhẹ hơn nước nên khi đứng yên dầu nổi hoàn toàn thành một tầng phía trên nước ($O_l$).
   - Khi khuấy mạnh, lớp dầu bị xé rách phân tán thành các giọt dầu lơ lửng trong lòng khối nước ($O_l \to O_d$).
   - Khi ngừng khuấy, lực nổi đẩy các giọt dầu nổi dần lên trên với tốc độ $v_{rise} = 0.06\text{ units/s}$ và tái hợp nhất vào tầng dầu trên mặt ($O_d \to O_l$).

5. **Phân Vùng Không Gian 4 Trường Hợp (Four-Case Beaker Regions):**
   - Bố cục hình học chia thành 3 phân vùng độc lập: Vùng đáy (`bed`), Vùng nước (`aqueous`), Vùng dầu (`oil`), xử lý chính xác theo 4 trường hợp: Cốc khô (`dry`), Chỉ có nước (`waterOnly`), Chỉ có dầu (`oilOnly`), và Hỗn hợp (`mixed`).
   - Đặt chỗ thể tích (volume reservation): Đường rắn chiếm $0.65\text{ ml/g}$, cát chiếm $0.60\text{ ml/g}$, chất lỏng $1.0\text{ ml/g}$ (nước) và $1.111\text{ ml/g}$ (dầu).

---

## 2. Giới Hạn Mô Hình & Phạm Vi Giáo Dục

1. **Mục Đích Trực Quan Hóa Sư Phạm:**
   - Ứng dụng được thiết kế nhằm phục vụ việc giảng dạy trực quan các khái niệm khoa học phổ thông về tính tan, sự bão hòa, hỗn dịch và sự phân tầng chất lỏng.
   - Ứng dụng **không phải** là một phần mềm mô phỏng động lực học chất lưu tính toán (CFD - Computational Fluid Dynamics) hay phần mềm mô phỏng động học phân tử (Molecular Dynamics).

2. **Chưa Qua Hiệu Chuẩn Định Lượng Thực Nghiệm (Uncalibrated Parameters):**
   - Các hằng số tốc độ hòa tan ($0.08$), tốc độ lắng ($0.08\text{ units/s}$), tốc độ nổi ($0.06\text{ units/s}$), và hệ số cản dòng xoáy ($4.0\text{ s}^{-1}$) là các tham số sư phạm mặc định được chuẩn hóa số học để học sinh có thể quan sát diễn biến hiện tượng một cách rõ ràng và trực quan trong thời gian học tập (10–60 giây).
   - Các tham số này chưa được hiệu chuẩn (calibrated) theo điều kiện thí nghiệm hóa học chuyên nghiệp với các loại hạt hay độ nhớt cụ thể ngoài đời thực.

3. **Không Xét Yếu Tố Biến Thiên Nhiệt Độ:**
   - Mô hình sử dụng độ tan danh định mặc định của đường ở điều kiện tiêu chuẩn ($2.0\text{ g/g-nước}$).
   - Ứng dụng **không mô phỏng** sự biến thiên của độ tan theo nhiệt độ (không có hệ thống đun nóng hay làm lạnh).

4. **Đại Diện Trực Quan Của Hạt (Visual Representative Particles):**
   - Số lượng hạt tinh thể đường, hạt cát và giọt dầu trong không gian 3D là các phần tử đại diện trực quan (visual representative particles), được giới hạn theo ngân sách đồ họa tối ưu (tối đa 100–700 hạt cho mỗi nhóm chất) nhằm đảm bảo tốc độ khung hình mượt mà trên mọi thiết bị.
   - Mỗi hạt 3D mang một trọng số khối lượng đại diện; số lượng hạt không phản ánh 1:1 số lượng phân tử hay hạt vi mô thực tế.
   - Khi khối lượng còn lại trong một phân vùng nhỏ hơn $0.001\text{ g}$ ($1\text{ mg}$), các hạt đại diện sẽ tự động ẩn khỏi khung nhìn để tránh nhiễu hình ảnh, nhưng khối lượng vô hướng trên sổ cái (mass ledger) vẫn được bảo toàn nguyên vẹn với độ chính xác cao.

5. **Lưu Trữ Dữ Liệu:**
   - Trạng thái thí nghiệm được lưu trữ in-memory trong phiên làm việc hiện tại của trình duyệt. Ứng dụng không sử dụng cơ sở dữ liệu backend hay lưu trữ cục bộ dài hạn (localStorage); thao tác tải lại trang (Reload / F5) sẽ xóa sạch dữ liệu và khởi động lại cốc thí nghiệm từ đầu.
