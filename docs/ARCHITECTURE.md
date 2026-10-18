# Kiến trúc Giai đoạn 1

> Tài liệu này mô tả source hiện tại của Ngày1. Kiến trúc **đề xuất chưa triển khai** xem [MASTER_PLAN.md](MASTER_PLAN.md); trạng thái từng task chỉ trong [IMPLEMENTATION_TASKS.md](IMPLEMENTATION_TASKS.md).

Plan v3 chốt early owner/bridge ở V2-10, không đợi Phase 4. Một engine ngoài Canvas, control flush độc lập fixed step, scalar snapshot detached và copy render buffers sang memory của renderer. Đây là **thiết kế tương lai**; source dưới đây chưa có runtime đó. Call path hiện tại: form submit → Zustand add/reject → quantities → LaboratoryScene; camera reset remount Canvas.

- `app`: composition, lazy-load scene bằng Suspense; `main.tsx`: entry point.
- `components/{layout,ingredients,controls,results}`: giao diện và thao tác người dùng.
- `scene`: cốc hình trụ hở, đáy, vành, vạch chia, nhãn; thể tích nước/dầu, hạt instanced, thìa, bàn và ánh sáng. Không tải model hoặc font từ CDN.
- `stores/experimentStore.ts`: nguồn trạng thái duy nhất, lượng tích lũy, lịch sử, validation, reset, camera và hiển thị thìa. Selector chỉ đăng ký phần trạng thái cần dùng.
- `types`: định nghĩa chất, đơn vị, lượng, lần thêm.
- `simulation/core`: interface state/engine/command/model/clock phục vụ triển khai sau. Không có engine runtime.
- `simulation/constants`: dữ liệu nguyên liệu và quy đổi chiếm chỗ minh họa.
- `simulation/models`: interface riêng cho bốn mô hình tương lai. `interactions`, `workers`, `app/providers`: giữ chỗ bằng README, không tạo runtime rỗng hoặc chức năng giả.
- `public/models`: dành cho tài nguyên sau này; giai đoạn 1 dùng geometry procedural.

Luồng: form → Zustand action → kiểm tra lượng/capacity → state → bảng thành phần và scene. Scene dùng render theo nhu cầu, hạt instancing có giới hạn, DPR tối đa 1.75; không cập nhật React trong animation loop. Không persistence hoặc network runtime.
