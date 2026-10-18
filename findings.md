# Findings

## Khắc Phục Lỗi Bàn Thí Nghiệm Treo "Đang Chuẩn Bị Bàn Thí Nghiệm..." (React 19 Suspense & Lazy Loop) — 2026-10-18
- **Hiện tượng người dùng gặp:** Khi mở ứng dụng trên trình duyệt (`localhost:5173`), khu vực bàn thí nghiệm 3D ở giữa bị kẹt vô hạn ở trạng thái `Đang chuẩn bị bàn thí nghiệm...`, hoàn toàn không hiển thị cốc 3D và bàn thí nghiệm.
- **Nguyên nhân cốt lõi (Root Cause):**
  - Trong đợt triển khai SC-W05 trước đó, component [`RetryableLaboratoryScene`](src/app/App.tsx) đã được tạo ra để bọc hàm nạp động `lazy(() => import('../scene/LaboratoryScene'))` bên trong hook `useMemo` và đặt nó làm con trực tiếp của `<Suspense fallback={<div className="scene-fallback">Đang chuẩn bị bàn thí nghiệm…</div>}>`.
  - Trong React 19, khi một component con nằm *bên trong* `<Suspense>` kích hoạt suspension ở lần mount đầu tiên, React sẽ tạm thời hủy (discard) fiber của component đó trong thời gian hiển thị fallback.
  - Khi Promise nạp module động (`import()`) hoàn tất và Suspense cố gắng render lại component con, React mount lại `RetryableLaboratoryScene` từ đầu. Việc mount từ đầu khiến hook `useMemo` chạy lại và tạo ra một đối tượng `React.lazy()` hoàn toàn mới với trạng thái ban đầu là `Uninitialized`.
  - Đối tượng lazy mới này lại kích hoạt `import()` và ném Promise vào `<Suspense>` một lần nữa $\rightarrow$ tạo thành một vòng lặp tái render vô hạn (infinite re-render loop) hàng ngàn lần mỗi giây, khiến `<Suspense>` không bao giờ thoát khỏi trạng thái fallback `"Đang chuẩn bị bàn thí nghiệm…"`.
- **Giải pháp xử lý:**
  - Loại bỏ hoàn toàn component trung gian `RetryableLaboratoryScene` khỏi vùng con của `<Suspense>`.
  - Di chuyển tham chiếu lazy component vào state `SceneComponent` của class Error Boundary [`AppSceneBoundary`](src/app/App.tsx).
  - Vì `AppSceneBoundary` nằm *bên ngoài* `<Suspense>`, component và state của nó không bao giờ bị React unmount hay hủy fiber khi Suspense chuyển trạng thái.
  - Khi module 3D tải xong, React tái sử dụng đúng tham chiếu lazy component đã được resolve trong state của boundary, mount thẳng `<LaboratoryScene />` và khởi tạo Canvas WebGL 3D tức thì.
  - Khi có lỗi tải mạng thực tế và người dùng nhấn "Thử lại tải 3D", hàm `handleRetry` trong boundary sẽ chủ động tạo một thể hiện `lazy()` mới vào state và kích hoạt lại quy trình nạp module mà vẫn bảo toàn 100% dữ liệu khoa học.
- **Kiểm chứng:**
  - 548/548 tests pass qua 29 test suites (`npm test`).
  - `npm run typecheck`, `npm run lint`, `npm run build` đều đạt mã thoát 0 sạch sẽ.
  - Kiểm tra DOM & WebGL runtime trong trình duyệt: Thẻ `<canvas>` mount thành công, bảng điều khiển và toàn bộ nhãn 3D hiển thị đầy đủ, không còn vòng lặp vô hạn.

## Chuẩn Bị Bàn Giao Local, Sửa Phân Loại Evidence & Rà Soát Regression (V4-07, V4-08, V4-09, V4-10) — 2026-10-18
- **Tình trạng tổng quan:** Hoàn thành đợt chuẩn bị bàn giao cục bộ (local handoff) với 4 nhiệm vụ trọng tâm: V4-07 (sửa lỗi regression production call paths), V4-08 (hoàn thiện tài liệu sử dụng & giới hạn mô hình), V4-09 (nghiệm thu production artifact qua HTTP preview server), và V4-10 (chuẩn hóa phân loại bằng chứng WebGL recovery).
- **1. Sửa phân loại Evidence & Chuẩn hóa Trạng thái V4-10 (PARTIAL):**
  - Chuyển trạng thái V4-10 từ `COMPLETED_VERIFIED` về **`PARTIAL`** do acceptance catalog yêu cầu kiểm nghiệm trên trình duyệt thực tế nhưng automated headless runner chưa có bằng chứng thực nghiệm real context loss/restore.
  - Tuyệt đối bảo toàn browser requirement trong catalog; không hạ chuẩn hay xóa yêu cầu trình duyệt để hợp thức hóa nhãn hoàn tất.
  - Phân định rõ: Extension `WEBGL_lose_context` chỉ liên quan tới việc kích hoạt synthetic context loss phục vụ kiểm thử tự động, hoàn toàn không phải là điều kiện tiên quyết cho mọi ca E2E khác.
  - Không kết luận môi trường headless thiếu extension nếu chưa có bằng chứng truy vấn năng lực (capability-query evidence) rõ ràng.
  - Chuẩn hóa định nghĩa khoa học: Lệnh gọi `e.preventDefault()` trong sự kiện `webglcontextlost` cho phép trình duyệt kích hoạt tiến trình phục hồi context (`webglcontextrestored`) theo hợp đồng chuẩn của WebGL; điều này **không đồng nghĩa** toàn bộ tài nguyên GPU (buffers, textures, shaders) được giữ nguyên trong bộ nhớ phần cứng (Three.js và ứng dụng phải rebind/re-upload buffers).
  - Không nâng các nhiệm vụ browser khác (V1-03, V1-06, V4-02, V4-03, V4-04, V4-05) lên verified từ unit tests.
- **2. Rà soát Production Call Paths & Sửa Lỗi Regression (V4-07):**
  - *Lỗi 1 (Chặn lệnh Resume khi Context Lost):* Phát hiện `dispatchIntent({ type: 'resume' })` trước đây vẫn có thể chuyển `paused` thành `false` dù context đang mất. Đã bổ sung guard trong [`SimulationBridge.ts`](src/simulation/bridge/SimulationBridge.ts) lập tức từ chối lệnh resume với mã lỗi `reason: 'CONTEXT_LOST'` khi `isContextLost === true`.
  - *Lỗi 2 (Fencing Callback Stale Canvas Revision):* Bổ sung kiểm tra `activeCanvasRevision` trong [`LaboratoryScene.tsx`](src/scene/LaboratoryScene.tsx). Nếu sự kiện `webglcontextlost` hay `webglcontextrestored` bắn ra từ một Canvas cũ đang trong quá trình unmount, callback bị bỏ qua hoàn toàn, không làm lệch trạng thái của Canvas mới.
  - *Lỗi 3 (Lazy Chunk Failure & Retryable Loader):* Phát hiện `React.lazy` lưu cache vĩnh viễn Promise bị reject khi nạp module động qua mạng (`import()`). Tạo component [`RetryableLaboratoryScene`](src/app/App.tsx) sử dụng `useMemo` phụ thuộc vào `retryRevision`; khi người dùng nhấn "Thử lại tải 3D", một lazy wrapper mới được tạo ra và kích hoạt gọi lại `import()` thật qua mạng mà không dùng lại Promise lỗi và không phải reload toàn trang.
  - *Lỗi 4 (Vô hiệu hóa UI khi 3D gián đoạn):* Trong [`ControlPanel.tsx`](src/components/controls/ControlPanel.tsx), gắn `disabled={isContextBlocked}` cho nút Tiếp tục / Bắt đầu mô phỏng và nút Bắt đầu khuấy tự động khi `webglStatus !== 'ready'`, ngăn người dùng vô tình thúc đẩy mô phỏng khi khung nhìn 3D chưa sẵn sàng.
  - *Bổ sung Unit/Integration Tests:* Thêm 2 tests mới vào [`contextFailure.test.ts`](src/simulation/tests/contextFailure.test.ts) (nâng tổng số lên 11 tests), nâng tổng số bài kiểm tra dự án lên **548 tests** (toàn bộ 29 test suites đều PASS).
- **3. Hoàn thiện Tài liệu Sử dụng & Giới hạn Mô hình (V4-08 — COMPLETED_VERIFIED):**
  - Viết lại toàn diện [`README.md`](README.md) bằng tiếng Việt sư phạm, sáng sủa, không lộ protocol nội bộ. Bao gồm hướng dẫn đầy đủ: `npm ci`, `npm run dev`, `npm test`, `npm run preview`, cú pháp nhập số phẩy/chấm, phân biệt Auto/Manual, phân biệt Stop vs Pause vs Resume vs Reset vs Camera Reset, 3 kịch bản học tập trọng tâm, giới hạn mô hình giáo dục uncalibrated, in-memory persistence và hướng dẫn xử lý lỗi đồ họa 3D.
  - Cập nhật [`docs/SCIENTIFIC_ASSUMPTIONS.md`](docs/SCIENTIFIC_ASSUMPTIONS.md) đồng bộ 100% với động cơ tính toán hiện hành (10 ngăn khối lượng, động học hòa tan, cát lơ lửng, tách lớp giọt dầu, phân vùng hình học).
- **4. Nghiệm thu Local Production HTTP Artifact (V4-09 — PARTIAL):**
  - Bổ sung script `"preview": "vite preview"` vào [`package.json`](package.json).
  - Khởi chạy máy chủ Vite preview phục vụ thư mục `dist/` tại cổng cục bộ `http://localhost:4173/` (máy chủ HTTP thực tế, không dùng giao thức `file://`).
  - Viết scratch script kiểm tra toàn diện mã phản hồi và MIME type:
    * `GET http://localhost:4173/` -> **HTTP 200**, MIME: `text/html` (577 bytes).
    * `GET http://localhost:4173/assets/index-DtmTHrwQ.css` -> **HTTP 200**, MIME: `text/css` (17.380 bytes).
    * `GET http://localhost:4173/assets/index-BCaY_v1o.js` -> **HTTP 200**, MIME: `text/javascript` (324.488 bytes).
    * `GET http://localhost:4173/assets/LaboratoryScene-BCaU3Bol.js` (lazy chunk) -> **HTTP 200**, MIME: `text/javascript` (929.123 bytes).
  - Tắt tiến trình máy chủ ngay sau khi kiểm tra xong, bảo đảm không để background process chạy ngầm.
  - Phân định rõ: Mã phản hồi HTTP 200 chỉ chứng minh static asset delivery chuẩn xác, không tự chứng minh React mount hay tương tác 3D thành công trên trình duyệt; ghi nhận phần production browser smoke là PENDING.

## Triển khai V4-10 — WebGL failure, context loss/restore và resize & Tiếp nhận User Evidence — 2026-10-18
- Hoàn thành V4-10 (Xử lý khởi tạo WebGL thất bại, mất/khôi phục context `webglcontextlost`/`webglcontextrestored`, thay đổi kích thước Canvas/DPR, bảo toàn nguyên vẹn 100% mass ledger, thời gian mô phỏng, và thế hệ khoa học mà không tạo engine mới; cô lập callback giữa các session Canvas; bổ sung test suite `contextFailure.test.ts` 9/9 pass) và kiểm chứng toàn diện (COMPLETED_VERIFIED — Core/unit verified 546/546 tests pass across 29 test suites, typecheck/lint/build exit 0).
- **Ghi nhận bằng chứng người dùng & Phân định ranh giới nghiệm thu:**
  1. *Bằng chứng người dùng:* Ghi nhận chính xác: "Người dùng xác nhận đã thực hiện được thao tác kéo thìa thủ công." Đây là bằng chứng thực tế cho tương tác kéo thìa thủ công qua trình duyệt của người dùng.
  2. *Ranh giới không suy diễn:* Không suy diễn rằng camera ownership trên toàn bộ các exit path (con trỏ chuột rời màn hình, pointer cancel, nút chuột phụ), toàn bộ checklist 7 bước, bài test đo tải 30 FPS benchmark, hoặc khôi phục context trên trình duyệt thực tế đã được pass. Giữ nguyên trạng thái `PARTIAL` cho V4-05.
  3. *Môi trường Headless Runner:* Trên môi trường headless automated runner hiện tại, extension WebGL `WEBGL_lose_context` không khả dụng; case kiểm thử qua extension trên browser runner này được ghi nhận chính xác là `BLOCKED`. Toàn bộ hợp đồng vòng đời phần mềm, error boundary, store reactions, buffer upload, pause-fencing và first delta 0 được kiểm chứng đầy đủ thông qua 9 test suites trong `contextFailure.test.ts`.
- **Kết quả triển khai kỹ thuật V4-10:**
  1. *Khởi tạo WebGL thất bại (SC-W01) & Fallback View:*
     - Vùng hiển thị 3D được bọc bởi `SceneBoundary` và component fallback `WebGLFallbackView`.
     - Nếu WebGL không được hỗ trợ hoặc khởi tạo thất bại, giao diện hiển thị thông báo tiếng Việt sư phạm rõ ràng ("Không thể hiển thị không gian 3D (WebGL không khả dụng hoặc bị gián đoạn)"), giữ nguyên các bảng điều khiển bên ngoài (`IngredientPanel`, `ControlPanel`, `ContentsPanel`).
     - Nút "↺ Thử lại hiển thị 3D": Kích hoạt `retryCanvas()`, tăng `canvasRevision`, tạo lại Canvas và Three.js WebGLRenderer thông qua key động `key={`${cameraRevision}-${canvasRevision}`}` mà **hoàn toàn không tạo mới engine** hay xóa dữ liệu thí nghiệm ngầm.
     - Nút "Tải lại trang": Nêu rõ cảnh báo đỏ "(Lưu ý: Thao tác này sẽ làm mất dữ liệu thí nghiệm hiện tại)".
  2. *Xử lý Context Lost (`webglcontextlost` - SC-W02):*
     - Sự kiện `webglcontextlost` gọi ngay `e.preventDefault()` để trình duyệt cho phép phục hồi sau đó.
     - Gọi `SimulationBridge.handleContextLost()` và `experimentStore.reportWebGLContextLost()`:
       * Tự động chuyển trạng thái mô phỏng sang `paused = true`.
       * Dừng vòng lặp scheduler RAF (`stopScheduler()`), không tiếp tục gọi `stepFrame` hay gửi lệnh upload buffer vào WebGL context đã hỏng.
       * Gọi `ManualStirAdapter.onContextLost()`: lập tức hủy bỏ thao tác kéo chuột (`isDragActive() = false`), giải phóng pointer capture (`releasePointerCapture`), mở khóa trả lại quyền điều khiển cho `OrbitControls` (`cameraTarget.setEnabled(true)`).
       * Khối lượng các ngăn ($W, G_t, G_d, G_u, S_t, S_b, S_s, O_t, O_l, O_d$), thời gian trôi qua (`elapsedSeconds`), và thế hệ mô phỏng (`generation`) được giữ nguyên bất biến tuyệt đối.
  3. *Khôi phục Context (`webglcontextrestored` - SC-W02) & First Delta 0:*
     - Sự kiện `webglcontextrestored` kích hoạt `SimulationBridge.handleContextRestored()` và `reportWebGLContextRestored()`.
     - Không tự động chạy tiếp mô phỏng: trạng thái giữ nguyên `paused = true` theo đúng yêu cầu SPEC §6, chờ người dùng chủ động nhấn nút "Tiếp tục" (`resume()`).
     - Tái liên kết render buffers: gọi `copyRenderFrame` đọc lại chính xác trạng thái từ `HeadlessSimulationEngine` hiện hữu.
     - Không hồi sinh thao tác kéo chuột cũ (drag/capture): con trỏ chuột không bị kẹt hay tự ý lái thìa khi chưa có `pointerdown` mới.
     - **First Frame Delta = 0**: Nhờ cơ chế `lastTimestampMs = null` của `SimulationClock` khi paused, bước frame đầu tiên sau khi người dùng resume không chạy bù khoảng thời gian gián đoạn context (cho dù mất context kéo dài 10 giây).
  4. *Thay đổi kích thước Canvas/DPR & 20 Chu kỳ Remount (SC-W03):*
     - Resize khung nhìn và thay đổi Device Pixel Ratio (DPR) kích hoạt cập nhật camera aspect ratio nhưng không kích hoạt reset engine hay hủy hoại khối lượng.
     - Kiểm chứng 20 chu kỳ remount/retry Canvas liên tiếp: duy trì duy nhất 1 thể hiện engine, 0 rò rỉ bộ lắng nghe sự kiện, 0 trùng lặp scheduler loop.
  5. *Cách ly Fencing Callback giữa các phiên Canvas:*
     - Unsubscribe sạch các bộ lắng nghe `subscribeInvalidate` khi Canvas unmount, ngăn chặn callback cũ ghi đè lên phiên làm việc mới.

## Chẩn đoán, Dừng tác vụ & Bàn giao trạng thái V4-05 (Browser E2E / Runtime MVP) — 2026-10-18
- **Tình trạng:** Quá trình mở rộng tự động hóa đã được dừng lại theo chỉ đạo; toàn bộ background tasks đã được giải phóng; workspace sạch, không còn tiến trình nào treo hoặc tiêu hao tài nguyên.
- **Phân loại Evidence hiện có:**
  1. *2 Screenshots (`edge_scene_screenshot.png`, `edge_scene_screenshot2.png`):* Bằng chứng thực nghiệm xác thực việc khởi tạo WebGL 3D render thành công trên Edge headless tại viewport 1366×768, vị trí 4 cốc nguồn và nhãn tiếng Việt Drei Html. Không thể suy diễn hành vi tương tác động (auto/manual stirring, flow decay, settling, separation, camera orbit hay 20 reset cycles) từ 2 ảnh này.
  2. *537 unit & integration tests:* Bằng chứng tự động đạt 100% trong phạm vi kiểm thử logic, invariant và kịch bản số học của Vitest.
  3. *Tương tác thực tế người dùng, benchmark 30s/FPS, resource lifecycle:* Hiện trạng là NOT_RUN / BLOCKED do chưa có bằng chứng chạy trên browser.
- **Kết quả chẩn đoán nguyên nhân treo tác vụ:**
  1. *Nguyên nhân đã xác nhận:* Script CDP tự viết sử dụng `new Promise()` trần trong hàm `send()` mà không có timeout guard. Khi lệnh gọi CDP WebSocket không trả về kết quả, tiến trình `task-5523` bị block vĩnh viễn ở trạng thái chờ.
  2. *Giả thuyết:* Việc `Page.captureScreenshot` không phản hồi do chờ sự kiện paint trong Edge headless Windows được phân loại là một giả thuyết khả dĩ (chưa có request/response log chi tiết ở mức frame).
  3. *Hành động dọn dẹp:* Di chuyển runner sang thư mục `scratch/` để khôi phục chất lượng workspace (`npm run lint` đạt mã 0), không phải bằng chứng lỗi tự động hóa đã được giải quyết.
  4. *Capability thực tế còn thiếu:* Thiếu runner browser automation có timeout chuẩn và cơ chế đồng bộ sự kiện DOM/WebGL an toàn.
- **Các cải tiến thực tế đã hoàn thành và kiểm chứng trực quan:**
  1. *Khắc phục lỗi phông chữ tiếng Việt (h1 heading):* Chuyển `h1` sang font hệ thống `"Segoe UI",-apple-system,BlinkMacSystemFont,Arial,sans-serif` với `letter-spacing: -0.2px`, khắc phục hoàn toàn lỗi phân tách ký tự có dấu thanh ("Một chiếc cốc. Nhiều khám phá.") trên Windows browser.
  2. *Tối ưu bố cục 4 cốc nguồn 3D:* Tinh chỉnh dải vòng cung `STOCK_VESSELS_CONFIG` (`water: [-2.6, 0, -0.6]`, `sugar: [-2.7, 0, 0.4]`, `sand: [-2.5, 0, 1.4]`, `oil: [-2.1, 0, 2.3]`). Từ góc nhìn camera mặc định `[3.7, 3.1, 5.2]`, cốc nước không còn bị thành cốc thủy tinh 500ml che khuất; cả 4 cốc nguồn và các nhãn Drei Html nổi đều phân tách rõ ràng.
- **Phân loại trạng thái V4-05:**
  - Status: `PARTIAL` / `BLOCKED` đối với browser automated runner. Không đánh dấu hoàn tất khi chưa có bằng chứng tương tác thực tế từ người dùng hoặc runner đạt chuẩn.

## Triển khai V1-06 — Bổ sung bốn cốc chứa nguyên liệu 3D & Đính chính báo cáo V4-04 — 2026-10-18
- Hoàn thành V1-06 (Bổ sung 4 cốc chứa nguyên liệu 3D trên bàn thí nghiệm: Nước, Đường, Cát, Dầu ăn; tái sử dụng Beaker an toàn với scaling và không hiển thị vạch 500ml; procedural volume cho chất lỏng và static representation lượng giác xác định cho chất rắn; nhãn tiếng Việt Drei Html; toàn bộ mesh có `raycast={() => null}`; hoàn toàn độc lập với mass ledger thí nghiệm; đính chính checklist bão hòa theo fixture UC1 chuẩn và sửa footer App.tsx; bổ sung test suite `stockVessels.test.ts` 6/6 pass) và kiểm chứng toàn diện (PARTIAL — Core verified 537/537 tests pass qua 28 test suites, typecheck/lint/build exit 0, Browser QA pending do thiếu môi trường trình duyệt tự động).
- **Kết quả xác minh các nguyên lý và kỹ thuật cốt lõi:**
  1. *Đính chính các mô tả nghiệm thu trong báo cáo V4-04:*
     - *Checklist bão hòa & giới hạn thêm:*
       * Báo cáo V4-04 trước đây hướng dẫn "Thêm 200g đường vào 100ml nước (vượt sức chứa 200g)". Đây là lỗi mô tả văn bản trong báo cáo: với 100ml nước, sức chứa tối đa là $2.0 \times 100 = 200\text{g}$, nên $200\text{g}$ đường thêm vào là bằng sức chứa (equality), không phải vượt sức chứa.
       * Hơn nữa, giới hạn nhập tối đa mỗi lần thêm (`maxAddition` tại `src/simulation/constants/ingredients.ts`) của đường là $100\text{g}$. Giao diện chặn không cho phép nhập $200\text{g}$ trong một lần thêm.
       * Mã nguồn production tại `contentsHelpers.ts` (`hasExcess = mass.W > 0 && mass.Gt > capacityG + eps`) hoàn toàn chuẩn xác: khi $G_t == \text{capacity}_G$, `hasExcess` trả về `false`.
       * Chuẩn hóa checklist thử nghiệm theo **Fixture UC1 chuẩn**: Thêm $40\text{ml}$ nước $+ 100\text{g}$ đường (trong giới hạn $100\text{g}$/lần thêm). Sức chứa là $40 \times 2 = 80\text{g}$. Lượng đường vượt sức chứa là $20\text{g}$ ($100 - 80$). Thể tích đặt chỗ chiếm chỗ là $40 + 100 \times 0.65 = 105\text{ml}$. Khi tạm dừng, thêm tiếp $10\text{ml}$ nước nâng sức chứa lên $100\text{g}$, điều kiện đường dư vượt sức chứa lập tức triệt tiêu (`hasExcess = false`), bảo toàn $G_d$ và thời gian.
     - *Phạm vi mô hình & Bỏ tuyên bố nhiệt độ phòng $25^\circ\text{C}$:*
       * Dự án không có mô hình biến thiên nhiệt độ hay hiệu chuẩn định lượng thực nghiệm; các hệ số là tham số giáo khoa mặc định. Đã loại bỏ hoàn toàn câu chữ tuyên bố "nhiệt độ phòng $25^\circ\text{C}$" khỏi báo cáo.
     - *Cập nhật chân trang (Footer App.tsx):*
       * Đã thay câu chữ mang tính kỹ thuật nội bộ "Đồng hồ mô phỏng authoritative" thành câu tiếng Việt tự nhiên, phù hợp với học sinh/giáo viên: "Mô hình giáo dục tương tác 3D. Đồng hồ và trạng thái vật lý thống nhất."
     - *Phân định bằng chứng Responsive:*
       * Media query CSS `@media (max-width: 480px)` cho `.ingredient-list` được xác minh qua source code review và static bundle production (`vite build`), nhưng các số đo pixel/ảnh chụp trình duyệt thực tế ở $1366 \times 768$ và $390 \times 844$ được ghi nhận rõ ràng là PENDING browser verification.
  2. *Triển khai Bốn Cốc Nguồn 3D (V1-06 — IngredientVessels.tsx):*
     - Bốn cốc nguồn gồm: Cốc Nước (`#66bce0`), Cốc Đường (`#e8e3d4`), Cốc Cát (`#c89757`), Cốc Dầu ăn (`#e4bd49`).
     - Bố trí không gian xác định trên mặt bàn ($y = 0$): Xếp thành dải vòng cung nhẹ bên trái bàn thí nghiệm ($x \in [-2.5, -2.2]$, $z \in [-1.5, 1.5]$). Khoảng cách giữa các cốc nguồn liền kề $\approx 1.044$ (lớn hơn đường kính $0.76$, để lại khoảng trống $\ge 0.28$).
     - Khoảng cách từ tâm cốc nguồn đến tâm cốc thí nghiệm $(0, 0, 0)$ đều $\ge 2.55$ đơn vị, để lại hơn $1.25$ đơn vị không gian mở xung quanh thành cốc thí nghiệm $500\text{ml}$ ($R = 0.91$), bảo đảm không che khuất thìa khuấy, các vạch chia độ bên phải hay mặt phẳng kéo chuột.
     - Tái sử dụng `Beaker` an toàn: Bổ sung `BeakerProps` (`radius`, `height`, `showGraduations`, `opacity`) để co nhỏ cốc nguồn ($R = 0.38$, $H = 1.05$), đồng thời bỏ toàn bộ vạch chia độ $500\text{ml}$ trên cốc nguồn để người học không hiểu nhầm dung tích. Khi gọi `<Beaker />` không truyền props, cốc thí nghiệm $500\text{ml}$ giữ nguyên 100% tham số hình học ban đầu.
     - Thể hiện chất bên trong trực quan:
       * Nước: Khối trụ chất lỏng xanh lơ trong suốt (`opacity=0.65`) kèm bề mặt meniscus láng mịn.
       * Dầu ăn: Khối trụ chất lỏng vàng óng (`opacity=0.82`) kèm bề mặt meniscus láng mịn.
       * Đường: Khối trụ kết tinh trắng ngà + chóp nón và 14 tinh thể bề mặt tính toán bằng lượng giác góc vàng xác định (`STATIC_GRAIN_OFFSETS`), không dùng `Math.random()` hay làm lệch seed RNG của science.
       * Cát: Khối trụ trầm tích nâu vàng + chóp nón và 14 hạt cát bề mặt xác định.
     - Nhãn tiếng Việt thanh thoát: Dùng Drei `<Html>` đặt phía trên miệng cốc ($y = 1.23$), hiển thị pill badge có chấm màu nhận diện và tên tiếng Việt rõ ràng, kèm dòng chữ nhỏ trên bàn "Thêm nguyên liệu bằng bảng điều khiển".
     - Miễn nhiễm Raycast: Đặt `raycast={() => null}` trên tất cả các mesh của cốc nguồn, bảo đảm chuột tương tác xuyên qua tự do tới thìa khuấy và `OrbitControls`.
     - Độc lập hoàn toàn với mass ledger: Cốc nguồn là đối tượng trực quan thường trực trên bàn, không có kho tồn, không bị trừ hao khi người dùng thêm chất vào cốc thí nghiệm, và không bị xóa khi nhấn Thiết lập lại (Scientific Reset).

## Triển khai V4-04 — Kết quả, giải thích và responsive controls — 2026-10-18
- Hoàn thành V4-04 (Kết quả pha tiếng Việt sạch không lộ ký hiệu biến thô; N/A khi W=0; format khối lượng nhỏ <0,1g; tiến độ hòa tan có xét đường dư vượt sức chứa; hysteresis hai chiều nearSaturation [0.98, 0.99) và nearComplete L(Gt); phase rates liên tục không phụ thuộc 10Hz finite differencing và triệt tiêu khi paused; thứ tự ưu tiên giải thích hiện tượng bảo đảm cát lắng và dầu tách lớp ghi nhận đồng thời; bảng chú giải màu sắc và mục mở rộng "Về mô hình"; gỡ bỏ badge "Giai đoạn 1"; layout responsive mobile 390px và a11y id/htmlFor không spam aria-live; bổ sung test suite `resultsAndControls.test.ts` 16/16 pass cùng UC1, UC2, UC3 trên engine/store thật) và kiểm chứng toàn diện (PARTIAL — Core verified 531/531 tests pass qua 27 test suites, typecheck/lint/build exit 0, Browser QA pending do thiếu môi trường trình duyệt tự động).
- **Kết quả xác minh các nguyên lý và kỹ thuật cốt lõi:**
  1. *Xác minh Sai lệch Mô tả Báo cáo V4-03:*
     - Khẳng định 6 điểm sai lệch được chỉ ra đều là lỗi mô tả văn bản trong báo cáo V4-03, mã nguồn runtime luôn chuẩn xác:
       * $S_0 = 2.0\text{ g/g-water}$ (`SOLUBILITY_SUGAR_DEFAULT = 2.0` tại `science.ts`), báo cáo trước viết nhầm $S_0 = 2.0\text{ g/ml}$.
       * Fixture L1: $O_t = 18\text{g}, O_l = 9\text{g}, O_d = 9\text{g}$, với $\rho_{oil} = 0.9\text{g/ml}$, thể tích dầu phân tán là $V_{Od} = 9 / 0.9 = 10\text{ml}$; báo cáo trước ghi nhầm "10g".
       * Fixture X: Dầu $70\text{ml} \implies O_t = 70 \times 0.9 = 63\text{g}$ (tổng khối lượng $563\text{g}$, thể tích $495\text{ml}$); báo cáo trước ghi nhầm "70g".
       * Tiệm cận hòa tan/lắng: Mô hình số học tuân theo phương trình hàm số mũ liên tục tiệm cận, không cam kết bằng 0 tại một thời điểm hữu hạn tùy ý.
       * Phạm vi raycast: `raycast={() => null}` trên các mesh lỏng và cốc chỉ nhằm giải phóng chuột để tương tác với thìa khuấy và `OrbitControls`, không thay đổi logic camera.
       * Guard chiều cao chất lỏng: `height <= 0.0001` thuần túy là guard hiển thị đồ họa 3D để triệt tiêu mesh rác (phantom mesh), không làm thay đổi trạng thái khối lượng vô hướng trên mass ledger.
  2. *Định dạng Tiếng Việt & Ngữ Nghĩa Biên Sư Phạm (SC-U01, SC-U02):*
     - Không hiển thị các ký hiệu mã biến thô (`W, Gt, Gu, Gd, St, Sb, Ss, Ot, Ol, Od`) ra UI; thay thế bằng các thuật ngữ tiếng Việt sư phạm rõ ràng: "Nước", "Sức chứa tối đa của nước", "Đường đã tan", "Đường chưa tan", "Cát đọng đáy", "Cát lơ lửng", "Dầu tách lớp trên mặt", "Dầu phân tán thành giọt".
     - Khi $W=0$ (hệ khô hoặc chỉ dầu), sức chứa và tỷ lệ bão hòa hiển thị `N/A`, tránh gây hiểu lầm là dung môi có sức chứa $0\text{g}$.
     - Khối lượng pha nhỏ hơn $0.1\text{g}$ (ví dụ $0.05\text{g}$) được hiển thị dạng `<0,1 g`, tuyệt đối không làm tròn sớm thành $0\text{g}$ khiến người học nhầm là đã tan hết hoặc biến mất.
     - Tiến độ hòa tan được tính theo lượng tối đa có thể tan: $G_d / \min(G_t, \text{capacity}_G)$. Khi $G_t > \text{capacity}_G$, tiến độ hòa tan vẫn phản ánh trung thực mức độ hòa tan tối đa của dung dịch. Nếu còn headroom hòa tan ($> 10^{-8}$), giá trị hiển thị được chặn ở `99,9%` để tránh làm tròn lên `100%`.
  3. *Cơ chế Hysteresis Hai Chiều (Near-Saturation & Near-Complete) (SPEC §8):*
     - Triển khai hàm thuần túy `updateHysteresisState(prev, snapshot)`:
       * Near-Saturation: Bật khi $\text{ratio} \ge 0.99$, duy trì trong $[0.98, 0.99)$, tắt khi $< 0.98$.
       * Near-Complete: Bật khi $G_u \le L(G_t)$ với $L = \max(0.01\text{g}, 0.01 \times G_t)$, duy trì trong $(L, 1.2L]$, tắt khi $> 1.2L$.
       * Khi có đường dư vượt sức chứa ($G_t > \text{capacity}_G$), vô hiệu hóa cưỡng bức `nearComplete = false`, bảo đảm tính nhất quán sư phạm.
  4. *Tốc Độ Pha Vô Hướng Liên Tục (Pure Continuous Phase Rates):*
     - Dẫn xuất tốc độ trực tiếp từ phương trình vi phân mô hình: $dG/dt = k_G \cdot \text{available}$, $dSs/dt = k_{suspend} \cdot I \cdot S_b - k_{settle} \cdot S_s$, và $dOd/dt = k_{disperse} \cdot I \cdot O_l - k_{separate} \cdot O_d$.
     - Khi tạm dừng (`paused = true`), mọi tốc độ trả về $0$ tuyệt đối, tránh sai số và nhiễu vi phân hữu hạn ở tần số 10Hz.
     - Vị từ "đang lắng" và "đang tách lớp" được tính toán độc lập, cho phép hệ ghi nhận đồng thời hiện tượng cát lắng và dầu tách lớp mà không che khuất lẫn nhau.
  5. *Thứ Tự Ưu Tiên Giải Thích & Tinh Chỉnh Giao Diện:*
     - Phân cấp ưu tiên logic giải thích: Cốc rỗng $\to$ Chỉ có nước $\to$ Tạm dừng $\to$ Hệ khô / Chỉ có dầu $\to$ Động học đang diễn ra (Khuấy mạnh, Lắng, Tách lớp) $\to$ Trạng thái ổn định / bão hòa.
     - Bổ sung bảng chú giải màu sắc nhận diện (Color Legend) và mục mở rộng "Về mô hình mô phỏng".
     - Gỡ bỏ hoàn toàn badge "Giai đoạn 1 · Khám phá" cũ, cập nhật thành "Mô phỏng tương tác" và nhấn mạnh đồng hồ authoritative.
     - Giao diện đáp ứng (responsive) trên màn hình di động $390\text{px}$ qua media query `.ingredient-list { grid-template-columns: 1fr; }`.
     - Tối ưu khả năng truy cập (accessibility): gán `id` và `htmlFor` cho các trường nhập liệu số lượng; không gán `aria-live` polling 10Hz lên container số liệu để tránh làm phiền thiết bị đọc màn hình.
  6. *Kiểm Chứng Toàn Diện Ba Kịch Bản Người Học (UC1, UC2, UC3):*
     - UC1 (Đường): Tốc độ khuấy nhanh đẩy nhanh tốc độ hòa tan; bão hòa $80\text{g}$ để lại đường dư $\ge 20\text{g}$; thêm nước khi paused nâng sức chứa ngay mà không đổi khối lượng đã tan hay thời gian.
     - UC2 (Cát): Khuấy đưa $S_b \to S_s$; ngừng khuấy đồng hồ tiếp tục chạy và cát lắng dần $S_s \to S_b$; cát không bao giờ tan; pause đóng băng tiến trình.
     - UC3 (Bốn chất): Chuỗi thao tác phức hợp giữ vững bất biến khoa học; reset tăng generation, xóa sạch khối lượng và thời gian nhưng bảo toàn cấu hình camera và thìa.

## Triển khai V4-03 — Render nước và dầu layer/droplets & Đính chính công thức hòa tan — 2026-10-18
- Hoàn thành V4-03 (Xác minh sai lệch công thức hòa tan là lỗi văn bản báo cáo V4-02; hoàn thành 3 regressions hòa tan bắt buộc và fixtures độc lập W10/Gt30 ở I=0 và I=1; kiểm chứng 4 fixtures hình học SPEC §4 (L0, L1, O, X); động học trao đổi giọt dầu Ol <-> Od bảo toàn khối lượng và thể tích phong bì; giọt dầu nằm nghiêm ngặt trong regions.aqueous, cát trong hệ chỉ dầu nằm trong regions.oil; triệt tiêu phantom mesh bằng guard height <= 0.0001; chuẩn hóa bán kính dầu r=0.87; gắn raycast={() => null} cho WaterVolume, OilVolume và Beaker để giải phóng chuột kéo thìa; bổ sung test suite renderLiquids.test.ts 17/17 pass) và kiểm chứng toàn diện (PARTIAL — Core verified 515/515 tests pass across 26 test suites, typecheck/lint/build exit 0, Browser QA pending do thiếu môi trường trình duyệt tự động).
- **Kết quả xác minh các nguyên lý và kỹ thuật cốt lõi:**
  1. *Xác minh Sai lệch Công thức Hòa tan & Nền tảng Khoa học:*
     - Khẳng định: Công thức $k_{diss} = 0.08 \cdot I \cdot (1 + \text{contact})$ CHƯA TỪNG tồn tại trong bất kỳ tệp mã nguồn nào của dự án. Đây thuần túy là lỗi mô tả dạng văn bản trong báo cáo V4-02.
     - Mã nguồn runtime tại [`src/simulation/models/Dissolution.ts`](file:///d:/IdeaProjects/virtual-solubility-lab/src/simulation/models/Dissolution.ts) và [`src/simulation/constants/science.ts`](file:///d:/IdeaProjects/virtual-solubility-lab/src/simulation/constants/science.ts) luôn tuân thủ chuẩn xác SPEC §5.2:
       $$k_G = 0.025 + 0.25 \cdot I, \quad \text{capacity}_G = 2 \cdot W, \quad \text{available} = \min(G_u, \max(0, \text{capacity}_G - G_d)), \quad dG = \text{available} \cdot (1 - e^{-k_G \cdot h})$$
     - Đã kiểm chứng 3 regressions bắt buộc trong `renderLiquids.test.ts`:
       * *Regression 1:* Có nước, không khuấy ($I=0$): đường vẫn tan ở tốc độ nền $k_{G0} = 0.025\text{ s}^{-1}$.
       * *Regression 2:* Có nước, thìa ở trên không hoặc không chạm chất lỏng ($contact = 0$): đường vẫn tiếp tục tan ở tốc độ nền $k_{G0} = 0.025\text{ s}^{-1}$.
       * *Regression 3:* Hệ không có nước ($W=0$, kể cả khi có nhiều dầu và khuấy cực mạnh $I=1$): tuyệt đối không tan ($k_G = 0, dG = 0, G_d = 0$).
     - Đã kiểm chứng số học độc lập với fixture $W=10\text{g}, G_t=30\text{g}$ sau $1\text{s}$ ($60$ ticks, $h=1/60\text{s}$):
       * Cố định $I=0$: $G_d \approx 20 \cdot (1 - e^{-0.025 \cdot 1}) \approx 0.493801759\text{g}$ (sai lệch số học $< 10^{-8}\text{g}$).
       * Cố định $I=1$: $G_d \approx 20 \cdot (1 - e^{-0.275 \cdot 1}) \approx 4.808557536\text{g}$ (sai lệch số học $< 10^{-8}\text{g}$).
     - Phân định rõ dung sai: Mốc hiển thị $20.00\text{g}$ hoặc dung sai $\le 0.05\text{g}$ là dung sai quan sát sư phạm (educational observation tolerance) cho học sinh/giáo viên; hoàn toàn KHÔNG PHẢI epsilon bảo toàn khối lượng của mass ledger ($\max(10^{-8}\text{g}, 10^{-9} \times \text{totalMass})$).
  2. *Đính chính các Mô tả Chưa Chuẩn trong Báo cáo V4-02:*
     - Trao đổi pha cát ($Sb \leftrightarrow Ss$) hoàn toàn do mô hình vô hướng scalar model (`SandSuspension.ts`) điều phối theo $k_{suspend} = 0.20 \cdot I$ và $k_{settle} = 0.15\text{ s}^{-1}$; vận tốc particle transport chỉ là lớp hiển thị trực quan đại diện (`visual transport`).
     - Lực cản $\text{drag} = 4.0\text{ s}^{-1}$ trong transport hạt chỉ là hệ số suy giảm vận tốc hạt của giao diện trực quan, không phải định luật Stokes hiệu chuẩn vật lý thực.
     - Lắng cát là quá trình tiệm cận theo hàm số mũ liên tục, không cam kết $Sb = St$ hoặc $Ss = 0$ tại một thời điểm hữu hạn tùy ý.
     - Hàm `Math.max(0, ...)` trong visual adapters chỉ là cơ chế phòng thủ sai số làm tròn số thực dấu phẩy động (float roundoff); engine lõi luôn kiểm tra chặt chẽ bất biến và fail nếu khối lượng $< -\varepsilon$.
     - Các lớp con của bed: lớp cát $[0.12, 0.12 + h_{sand}]$ và lớp đường $[0.12 + h_{sand}, regions.bed.top]$ có tổng chiều cao $h_{sand} + h_{sugar} = regions.bed.height$, không chiếm toàn bộ chiều cao bed riêng lẻ.
     - Khi khuấy hệ chỉ dầu, cát được nâng lên phân tán vào phong bì dầu, làm lớp cát lắng dưới đáy co lại tương ứng trong thời gian khuấy.
  3. *Cải tiến Hình học 3D, Phân Vùng Lỏng và Miễn nhiễm Raycast (V4-03):*
     - `WaterVolume.tsx`: Bổ sung `raycast={() => null}` và height guard `if (height <= 0.0001) return null`, triệt tiêu hoàn toàn phantom meshes khi không có nước hoặc thể tích siêu mỏng.
     - `OilVolume.tsx`: Chuẩn hóa bán kính hình trụ từ $0.872$ về đúng `BEAKER_INNER_RADIUS` ($0.87$), bổ sung `raycast={() => null}` và height guard `if (height <= 0.0001) return null`.
     - `Beaker.tsx`: Bổ sung `raycast={() => null}` cho thành cốc thủy tinh, đáy cốc và các vạch chia độ (graduation markings). Nhờ đó, thao tác kéo chuột thủ công (manual drag) và điều khiển camera (`OrbitControls`) không bị các mesh lỏng/thủy tinh chặn raycast.
     - Kiểm chứng 4 fixtures hình học chuẩn SPEC §4 trong `renderLiquids.test.ts`:
       * *Fixture L0 (Không khuấy, $W=100\text{ml}, O=20\text{ml}$):* Nước $[0.12, 0.540]$, Dầu $[0.540, 0.624]$, Bed $= 0$.
       * *Fixture L1 (Khuấy mạnh, $W=100\text{ml}, O=20\text{ml}, Od=10\text{g}$):* Thể tích dầu co lại còn $10\text{ml}$, phong bì nước dâng lên $110\text{ml}$ chứa giọt dầu ($[0.12, 0.582]$), lớp dầu trên mặt $[0.582, 0.624]$. Tổng mức $liquidTop = 0.624$ bất biến tuyệt đối.
       * *Fixture O (Chỉ dầu + cát, $O=100\text{ml}, S=10\text{g}$):* Bed $= 0.010$ ($2.4\text{ml}$), Phong bì dầu $[0.130, 0.565]$ ($103.6\text{ml}$ bao gồm cát lơ lửng), Phân vùng nước $=\text{null}$.
       * *Fixture X (Hỗn hợp tối đa $495\text{ml}$, $W=300\text{g}, G=100\text{g}, S=100\text{g}, O=70\text{g}$):* Bed $= 0.311$ ($74\text{ml}$), Nước $[0.431, 1.990]$ ($371\text{ml}$), Dầu $[1.990, 2.200]$ ($50\text{ml}$).
     - Động học giọt dầu: Khuấy nhanh làm tăng $Od$, giảm $V_{oil}$ và tăng $V_{aqueous}$; ngừng khuấy cho phép tách pha tự nhiên ($Od \to Ol$) theo hàm số mũ của mô hình khoa học, không dùng solver coalescence giả. Toàn bộ giọt dầu $Od$ nằm nghiêm ngặt bên trong $regions.aqueous$.

## Triển khai V4-02 — Render sugar và sand theo compartments — 2026-10-18
- Hoàn thành V4-02 (Render đường và cát theo compartments authoritative; phân chia Gu thành Gu_bed và Gu_susp; khẳng định đường đã tan Gd không sinh hạt đại diện; phân chia cát thành Sb ở đáy và Ss lơ lửng với động học lắng dòng chảy thật khi ngừng khuấy; làm rõ 2 điểm rà soát báo cáo V4-01 về động học bão hòa 60-100s và mức chất lỏng 113ml do đặt chỗ thể tích đáy; bổ sung lớp phủ bán trong suốt 65% cho khối trụ trầm tích đáy để không che khuất các hạt rời rạc bên trong; kiểm chứng co tỷ lệ bán kính hữu hiệu trong lớp mỏng; miễn nhiễm raycast trên toàn bộ hạt; và thêm bộ test toàn diện `renderCompartments.test.ts`) và kiểm chứng toàn diện (PARTIAL — Core verified 498/498 tests pass across 25 test suites, typecheck/lint/build exit 0, Browser QA pending do thiếu môi trường trình duyệt tự động).
- **Kết quả xác minh các nguyên lý và kỹ thuật cốt lõi:**
  1. *Làm rõ hai điểm rà soát báo cáo V4-01:*
     - *Điểm 1 (Thời gian bão hòa sau 10s auto fast):* Đo lường số học thực tế tại fixture $W=10\text{ml}, G=30\text{g}$ dưới chế độ auto fast ($6.0\text{ rad/s}$): tại $t=0\text{s}$, $Gd=0\text{g}, \text{capacity}=20\text{g}$; tại $t=10\text{s}$ (600 ticks), $Gd = 8.44\text{g}$ ($42.2\%$ sức chứa); tại $t=20\text{s}$, $Gd = 17.89\text{g}$ ($89.4\%$); tại $t=40\text{s}$, $Gd = 19.71\text{g}$ ($98.6\%$); tại $t=60\text{s}$, $Gd = 19.96\text{g}$ ($99.8\%$); tại $t=100\text{s}$, $Gd = 20.00\text{g}$ ($100.00\%$). Quá trình hòa tan tuân thủ đúng phương trình vi phân $k_{diss} = 0.08 \cdot I \cdot (1 + \text{contact})$, cần khoảng $60\text{--}100\text{s}$ để đạt bão hòa trong dung sai $\le 0.05\text{g}$. Câu văn "sau 10s đạt bão hòa 20g" trong báo cáo trước thuần túy là diễn đạt thiếu chính xác trong văn bản báo cáo; mã nguồn mô hình vật lý hoàn toàn chuẩn xác. Tuyệt đối không thay đổi phương trình hay ép khối lượng.
     - *Điểm 2 (Mức chất lỏng sau khi thêm đường):* Đối với hỗn hợp $W=100\text{ml} + G=20\text{g}$ tại $t=0$ khi tạm dừng: theo mô hình đặt chỗ thể tích ($0.65\text{ ml/g}$ cho đường), 20g đường đóng góp $13\text{ml}$ thể tích lớp đáy ($V_{bed} = 13\text{ml}$, cao độ đáy $y \in [0.12, 0.1746]$). Lớp nước $100\text{ml}$ nằm ngay phía trên đáy ($y \in [0.1746, 0.5946]$). Tổng mức thể tích đặt chỗ là $113\text{ml}$, tương ứng mức chất lỏng trong cốc dâng lên đến vạch $113\text{ml}$ chứ không dừng ở vạch $100\text{ml}$. Câu checklist trước đây đã nhầm lẫn giữa lượng nước ban đầu thêm vào ($100\text{ml}$) với tổng mức chất lỏng thực tế của cốc ($113\text{ml}$). Mô hình hình học không có lỗi, tuân thủ đúng SCIENTIFIC_SPEC §4.
  2. *Phân chia Compartment Đường & Không Vẽ Hạt Cho Đường Đã Tan:*
     - Đường rắn $Gu$ được phân chia chính xác thành $Gu_{bed} = Gu \times (1 - f_{Gu})$ và $Gu_{susp} = Gu \times f_{Gu}$.
     - Đường đã tan $Gd$ phân tán ở cấp độ phân tử, tuyệt đối không sinh hạt đại diện trong bất kỳ pool nào (`activeCount = 0`).
     - Số hạt đường giảm dần theo sự suy giảm của $Gu$ trong quá trình hòa tan ($Gu \to Gd$).
     - Trong hệ khô (chỉ đường) hoặc chỉ dầu (đường trong dầu), $W = 0 \implies Gd = 0$ tại mọi tick, toàn bộ đường tồn tại ở pha rắn.
     - Khi $Gu < 0.1\text{g}$ (ví dụ $0.05\text{g}$), giao diện hiển thị `<0,1 g` theo đúng tiêu chuẩn, không làm tròn thành $0\text{g}$ hay đánh đồng với đã tan hoàn toàn.
     - Khi $Gu < 0.001\text{g}$ (ngưỡng ẩn trực quan $1\text{mg}$), hạt đại diện ẩn khỏi khung nhìn (`activeCount = 0`) nhưng khối lượng vô hướng trên ledger được bảo toàn nguyên vẹn đến $10^{-14}\text{g}$.
  3. *Phân chia Compartment Cát & Động học Lắng Thật Khi Ngừng Khuấy:*
     - Khối lượng cát được chia sẻ nghiêm ngặt giữa cát đọng đáy ($Sb$) và cát lơ lửng ($Ss$).
     - Cát không bao giờ tan ($Sd$ không tồn tại).
     - Khi khuấy, cát được nâng từ đáy lên lơ lửng ($Sb \to Ss$); khi ngừng khuấy (`releaseDrive` hoặc `stopAuto`), dòng xoáy suy giảm tự nhiên theo quán tính và cát lắng dần về đáy ($Ss \to Sb$).
     - Tuyệt đối không có hiện tượng rơi tức thì về đáy hay dùng chuyển động hàm sin/cos giả tạo; động học hạt tuân thủ tích phân vận tốc giới hạn lắng $v_{settle} = 0.08\text{ units/s}$ và lực cản Stokes $decay = \exp(-4h)$.
     - Bất biến bảo toàn khối lượng cát $Sb + Ss = St$ duy trì sai số $< 10^{-11}\text{g}$ ở mọi bước.
  4. *Hình học Đáy & Lớp Phủ Bán Trong Suốt Cho Khối Trầm Tích:*
     - Chiều cao lớp cát đáy $h_{sand} = \text{volumeToHeight}(Sb \times 0.6)$ và lớp đường đáy $h_{sugar} = \text{volumeToHeight}(Gu_{bed} \times 0.65)$ khớp chính xác với $regions.bed.height$.
     - Khối trụ thể tích trầm tích đáy được tinh chỉnh vật liệu bán trong suốt (`transparent opacity={0.65}`) thay vì mờ đục hoàn toàn, giải quyết triệt để rủi ro khối trụ đặc che khuất các hạt tinh thể đường và hạt cát rời rạc bên trong.
     - Phân tầng không gian chính xác: cát nằm sát đáy $[bedBottom, bedBottom + h_{sand}]$, đường nằm đè lên trên cát $[bedBottom + h_{sand}, regions.bed.top]$, không có khe hở hay chồng lấn thể tích ra ngoài phân vùng cốc.
  5. *Hệ Chỉ Dầu (Oil-Only Carrier Envelope):*
     - Khi hệ không có nước ($W = 0$) nhưng có dầu ($O > 0$), chất lỏng mang là pha dầu. Cát lơ lửng $Ss$ và đường lơ lửng $Gu_{susp}$ bị giới hạn hoàn toàn trong phong bì dầu $[regions.oil.bottom, regions.oil.top]$.
     - Phân vùng nước $regions.aqueous$ có thể tích bằng 0 và không chứa bất kỳ hạt nào.
  6. *Tỷ lệ Bán kính Hữu hiệu & Khả năng Tương tác:*
     - Trong các lớp mỏng có bề dày nhỏ hơn đường kính hạt ($height < 2 \cdot r_{particle}$), bán kính hữu hiệu $r_{eff}$ được co lại thành $height / 2$ và đặt hạt tại trung điểm, loại bỏ nguy cơ hạt bị lồi ra ngoài đáy hoặc thành cốc.
     - Toàn bộ 5 `InstancedMesh` của hạt đại diện đều có thuộc tính `raycast={() => null}`, bảo đảm sự kiện chuột luôn xuyên qua hạt để tương tác trực tiếp với thìa khuấy và thành cốc.

## Triển khai V4-01 — Mở rộng early bridge cho đầy đủ phase/render outputs — 2026-10-18
- Hoàn thành V4-01 (Mở rộng bridge authoritative cho đầy đủ phase compartments và render outputs; xác nhận tính toàn vẹn kiến trúc một owner và một scheduler duy nhất; kiểm chứng buffer isolation và zero aliasing theo SC-B01; snapshot xuất bản đầy đủ 10 mass compartments cùng các chỉ số vật lý; ngữ nghĩa nullable khi W=0; freeze dev bảo vệ snapshot; forced publish tức thời khi nhận lệnh kết hợp throttled 10Hz khi tick động; đồng bộ thế hệ metadata handshake SC-B03; bổ sung hiển thị pha cát trong `ContentsPanel.tsx`; và kiểm chứng 4 chuỗi tương tác tương tác cốt lõi: dissolution vs speed, saturation & water addition SC-D05, sand/oil kinetics, controls/watchdog lifecycle) và kiểm chứng toàn diện (COMPLETED_VERIFIED, 484/484 tests pass across 24 test suites, typecheck/lint/build exit 0).
- **Kết quả xác minh các nguyên lý và kỹ thuật cốt lõi:**
  1. *Làm rõ các điểm rà soát báo cáo V3-08:*
     - Tốc độ khuấy Auto (`AUTO_LEVEL_SPEEDS`): Xác minh mã nguồn hằng số tại [`flow.ts`](file:///d:/IdeaProjects/virtual-solubility-lab/src/simulation/constants/flow.ts) từ đầu luôn định nghĩa `slow: 1.0, medium: 3.0, fast: 6.0 rad/s`. Chữ viết "medium 4.0 rad/s" trong văn bản báo cáo V3-08 thuần túy là lỗi typo trong văn bản giải trình.
     - Fixture và dung sai trong bài kiểm tra timestep ($h=1/60$ vs $h=1/120$): Bài test trong `stability.test.ts` đã dùng custom fixture ($W=100\text{ml}, G=20\text{g}, S=20\text{g}, O=18\text{g}$), do đó $1\% \times 20\text{g} = 0.2\text{g}$ và $1\% \times 18\text{g} = 0.18\text{g}$, hoàn toàn tuân thủ đúng yêu cầu SC-N05 (sai lệch $\le 1\%$ lượng chất thêm vào).
     - Ranh giới hạt trong long-run: Bài kiểm tra long-run 36,000 ticks kiểm tra ranh giới bao quát toàn cốc ($r \le 0.87, y \in [regions.bed.bottom, regions.oil.top]$) để bảo đảm không có hạt bay ra ngoài hay xuyên đáy cốc; các phong bì phân vùng pha cụ thể từng pool đã được kiểm chứng độc lập và chặt chẽ trong `transport.test.ts` (SC-P01, SC-P04, SC-R01, SC-R04).
  2. *Toàn vẹn Kiến trúc Bridge & State Ownership:*
     - Không di chuyển hay viết lại engine / renderer vì các thành phần này đã được nối từ sớm (early integration) tại V2-10, V3-05 và V4-02/V4-03.
     - Single Owner: `HeadlessSimulationEngine` là nguồn sự thật duy nhất cho toàn bộ trạng thái khoa học, mass ledger, input ticks, tọa độ thìa và mảng hạt đại diện.
     - Single Scheduler: Chỉ duy nhất 1 vòng lặp RAF tại `SimulationBridge.startScheduler()` thúc đẩy simulation time qua `advanceTimestamp`. R3F `useFrame` trong Canvas chỉ đóng vai trò consumer thụ động đọc pose và gọi `copyRenderFrame`.
     - Zustand Store (`experimentStore.ts`): Chỉ lưu trữ UI flags, actions, acks và detached `ScalarSnapshot`. Hoàn toàn không lưu mảng hạt trong Zustand.
  3. *Hợp đồng Render Copy & Cô lập Buffer (SC-B01):*
     - `copyRenderFrame(target: RenderTarget)` sao chép trực tiếp dữ liệu hạt vào mảng tiền cấp phát của caller (~77KB) trong `ParticleRenderer.tsx`.
     - Tuyệt đối không trả về tham chiếu mảng nội bộ của engine (`no alias`).
     - Caller tự do ghi đè hay biến đổi target buffer (`target.positions.fill(999.0)`, `weights.fill(-99.0)`) không làm hỏng hay ảnh hưởng đến core engine và các frame render tiếp theo.
     - Cung cấp `poolRanges` cho đầy đủ 5 pools: `sugarBed`, `sugarSusp`, `sandBed`, `sandSusp`, `oilDroplet`.
  4. *Xuất bản Đầy đủ 10 Ngăn Khối lượng & Ngữ nghĩa Nullable:*
     - Snapshot cung cấp đầy đủ 10 mass compartments: Nước ($W$), Đường ($Gt, Gu, Gd$), Cát ($St, Sb, Ss$), Dầu ($Ot, Ol, Od$), cùng phân số lơ lửng $f_{Gu}$.
     - Ngữ nghĩa nullable: Khi không có nước ($W=0$), $capacityG = 0$, $saturationRatio = null$, $dissolutionProgress = null$. Khi có nước ($W > 0$), các trường này mang giá trị số học chuẩn xác.
     - Đóng băng `Object.freeze` các đối tượng snapshot và nested objects trong môi trường test/dev để ngăn chặn triệt để mutation ngoài ý muốn từ React components.
     - Bổ sung hiển thị `Pha cát (Mô hình khoa học)` gồm $St, Sb, Ss$ trong [`ContentsPanel.tsx`](file:///d:/IdeaProjects/virtual-solubility-lab/src/components/results/ContentsPanel.tsx), hoàn thiện hiển thị cả 4 chất trong giao diện.
  5. *Cơ chế Xuất bản: Forced Publish Tức Thời vs Throttled 10Hz:*
     - Lệnh điều khiển đồng bộ (`add`, `reset`, `pause`, `resume`, `releaseDrive`, `setMode`, `setAutoLevel`) kích hoạt publish snapshot tức thời (`forced publish`) và phát tín hiệu `notifySceneInvalidate()`, bảo đảm UI cập nhật ngay trong tick 0.
     - Trong quá trình chạy mô phỏng liên tục, snapshot vô hướng được điều tiết xuất bản tại chu kỳ $\approx 10\text{Hz}$ ($100\text{ms}$ interval) để UI React không bị render dư thừa, trong khi scene 3D vẫn được invalidate trên từng tick.
  6. *Đồng bộ Thế hệ Metadata Handshake (SC-B03):*
     - `resetCamera` chỉ tăng `cameraRevision` độc lập ở UI, giữ nguyên hoàn toàn generation, stateVersion, tickIndex và mass của engine.
     - Lệnh reset khoa học tăng generation, đặt lại tick 0, làm sạch toàn bộ pools hạt.
     - Store và Renderer tự động loại bỏ các snapshot / render frame mang thế hệ cũ (`generation < current.generation`).
  7. *Kiểm chứng Bốn Chuỗi Tương Tác Cốt Lõi (Four Key Interaction Flows):*
     - *Flow 1 (Tốc độ hòa tan đường theo vận tốc khuấy):* Cùng điều kiện ban đầu ($W=100\text{ml}, G=20\text{g}$), lượng đường tan $Gd$ sau 1 giây tuân thủ thứ tự: Fast ($6.0\text{ rad/s}$) > Medium ($3.0\text{ rad/s}$) > Slow ($1.0\text{ rad/s}$) > Rest ($0\text{ rad/s}$).
     - *Flow 2 (Bão hòa và thêm nước tiếp tục hòa tan - SC-D05):* Hòa tan đạt giới hạn sức chứa ban đầu ($20\text{g}$ đường / $10\text{ml}$ nước); thêm $10\text{ml}$ nước nhân đôi sức chứa lên $40\text{g}$, làm giảm tỷ lệ bão hòa và hòa tan tiếp tục lượng đường dư; thêm dầu không làm tăng sức chứa hòa tan đường.
     - *Flow 3 (Động học nâng/lắng cát và phân tán/tách pha dầu):* Khuấy nhanh làm tăng cát lơ lửng $Ss$ và giọt dầu phân tán $Od$; ngừng khuấy làm dòng chảy suy giảm theo quán tính, cát lắng về đáy ($Sb$) và dầu tách về lớp dầu ($Ol$), bảo toàn khối lượng nghiêm ngặt $Sb + Ss = St$, $Ol + Od = Ot$.
     - *Flow 4 (Controls, Stale Watchdog 150ms và Vòng đời hiển thị thìa - SC-J02, SC-J03):* Kéo thìa thủ công cập nhật pose và vận tốc góc; ngừng di chuột quá $150\text{ms}$ kích hoạt watchdog tự động giải phóng lực truyền; ẩn thìa (`toggleRod`) tự động hủy lực truyền trước khi ẩn; tạm dừng mô phỏng đóng băng dòng chảy và ngừng tăng thời gian.

## Triển khai V3-08 — Stability và independence của render rate — 2026-10-18
- Hoàn thành V3-08 (Khắc phục triệt để state ownership, bảo vệ engine core bằng detached clone và scalar accessors; long-run 36,000 ticks mass invariants < 1e-11g và particle bounds; 30/60/120 FPS replay convergence <= 1e-6 g/rad; so sánh timestep h=1/60 vs h=1/120 theo SC-N05; visual budget N10/100/700 independence; timing edge cases; 1,000 seeded randomized commands SC-N03) và kiểm chứng toàn diện (COMPLETED_VERIFIED, 466/466 tests pass across 23 test suites, typecheck/lint/build exit 0).
- **Kết quả xác minh các nguyên lý và kỹ thuật cốt lõi:**
  1. *Khắc phục triệt để State Ownership và Memory Isolation:*
     - Bổ sung hàm `cloneScienceState(state: ScienceState): ScienceState` trong [`SimulationState.ts`](file:///d:/IdeaProjects/virtual-solubility-lab/src/simulation/core/SimulationState.ts#L200) thực hiện deep clone toàn bộ 16 trường vô hướng và các nested objects (`input`, `mass`, `rod`), bảo đảm không chia sẻ bất kỳ tham chiếu mutable nào.
     - `HeadlessSimulationEngine.getState()` trả về đối tượng độc lập được sao chép hoàn toàn qua `cloneScienceState`.
     - Bổ sung các scalar accessors trực tiếp trên engine: `getMode()`, `getTickIndex()`, `getElapsedSeconds()`, `getStateVersion()`, `getOmegaRod()`, `getOmegaFlow()`, `getOmegaDrive()`.
     - Thay thế toàn bộ call sites gọi `getState()` trong production code (`ManualStirAdapter.ts`, `SimulationBridge.ts`, `ReplayHarness.ts`) sang scalar accessors và `isPaused()`, loại bỏ hoàn toàn việc deep clone trong các vòng lặp hot loop của render và pointer move.
     - Bộ test tại [`stability.test.ts`](file:///d:/IdeaProjects/virtual-solubility-lab/src/simulation/tests/stability.test.ts) xác nhận:
       * Caller mutate nested objects (`copy.mass.W = 999999`) không ảnh hưởng đến core engine.
       * Snapshot cũ (`capturedAtT0`) giữ nguyên giá trị tại t=0 khi engine tiến triển 60 ticks.
       * Mutate capture không làm đổi quỹ đạo bước tiếp theo (bit-identical giữa 2 engine A và B).
       * Đọc snapshot hoặc gọi `copyRenderFrame` không làm thay đổi quỹ đạo khoa học hay PRNG stream.
  2. *Long-run 600s Đúng Clock (SC-N02):*
     - Mixed fixture M: Water 300ml, Sugar 100g, Sand 100g, Oil 70ml ($V_{reserve} = 495\text{ ml} \le 500\text{ ml}$), seed 1729.
     - Chạy 36,000 ticks sim-time liên tục ($h = 1/60\text{ s}$): 300s khuấy auto medium ($4.0\text{ rad/s}$) + 300s thả trôi dòng chảy (`releaseDrive` decay và tách dầu).
     - Kiểm định bất biến bảo toàn khối lượng tại **từng tick một** trong suốt 36,000 steps:
       * Nước: $\max \text{err} = 0\text{ g}$
       * Đường: $\max \text{err} < 10^{-11}\text{ g}$
       * Cát: $\max \text{err} < 10^{-11}\text{ g}$
       * Dầu: $\max \text{err} < 10^{-11}\text{ g}$
     - Checkpoints (tick 0, 600, 18000, 36000) qua `copyRenderFrame`: 100% tọa độ hạt hữu hạn, nằm trong bán kính lòng cốc $r \le 0.87$ và phân vùng $[regions.bed.bottom, regions.oil.top]$.
     - Cuối chu trình (600s): dòng chảy suy giảm về $\omega_{flow} < 0.001\text{ rad/s}$, giọt dầu $Od < 1.0\text{ g}$ đã tách hầu hết về lớp dầu $Ol > 62.0\text{ g}$.
     - Kiểm tra đại diện visual budget $N=700$ trên 600 ticks duy trì tính ổn định và bounds.
  3. *Tái Hiện Lịch Sử Lệnh trên các Tốc Độ Khung Hình 30/60/120 FPS (SC-N01, SC-T01):*
     - Ghi nhận chuỗi 12 lệnh điều khiển tại các mốc tick logic (0, 120, 240, 360).
     - Replay trên 3 engine độc lập mô phỏng các chu kỳ render 30 FPS (`frameDt = 1/30`), 60 FPS (`frameDt = 1/60`), và 120 FPS (`frameDt = 1/120`).
     - Cả 3 trường hợp hoàn thành chính xác 600 scientific ticks ($10.0\text{ s}$), sai khác trạng thái vô hướng $\le 10^{-6}\text{ g/rad}$.
     - Danh sách acks, generation, seq, version và tickIndex trùng khớp 100%.
  4. *So Sánh Timestep h=1/60 vs h=1/120 (SC-N05, SC-T03):*
     - Chạy cùng 10 sim-seconds: $h=1/60$ (600 steps) so với $h=1/120$ (1200 steps) trên cùng fixture M và lịch sử điều khiển.
     - Bất biến khối lượng nghiêm ngặt ($< 10^{-12}\text{ g}$) cho mỗi bước tích phân.
     - Sai khác nồng độ pha tại 10s: $|Gd_{60} - Gd_{120}| \le 0.2\text{ g} (\le 1\%)$, $|Ss_{60} - Ss_{120}| \le 0.2\text{ g} (\le 1\%)$, $|Od_{60} - Od_{120}| \le 0.18\text{ g} (\le 1\%)$.
     - Độ lệch vị trí thìa RMS $\le 0.05$ scene units.
  5. *Độc Lập Ngân Sách Hạt N=10/100/700 (SC-P01, SC-B02):*
     - Replay cùng trace qua 300 ticks với $N=10, 100, 700$: quỹ đạo vô hướng vật lý bit-identical 100%.
     - Cô lập buffer: caller corrupt buffer mục tiêu (`target.positions.fill(999.0)`) không làm hỏng dữ liệu các frame render tiếp theo.
  6. *Kiểm Định Biên Thời Gian (Timing Edge Cases):*
     - $dt=0$: no-op time, không tăng tick hay thời gian.
     - $dt < 0$, NaN, Infinity: trả về kết quả lỗi `INVALID_DELTA` không đột biến clock.
     - advance 5s tại $h=1/60$ chạy tối đa 6 steps, bỏ 4.9s vào `droppedActiveWallTime`; tại $h=1/120$ chạy tối đa 12 steps, bỏ 4.9s.
     - Pause / hidden: dọn sạch remainder tích lũy; thời gian ẩn (5s) không bị tính dồn vào `droppedActiveWallTime`.
  7. *1,000 Lệnh Ngẫu Nhiên Sinh Xác Định (SC-N03):*
     - Sử dụng PRNG Mulberry32 (seed 1729) sinh 1,000 lệnh ngẫu nhiên có kiểm soát.
     - Phân bổ: add hợp lệ/vô hiệu/vượt ngưỡng, controls khuấy auto/manual, pause/resume/reset.
     - Mọi lệnh bị reject đều giữ nguyên tuyệt đối state/mass/input; mọi lệnh accepted đều bảo toàn 100% bất biến; $\max \text{err} < 10^{-10}\text{ g}$, không xuất hiện NaN hay Infinity.
  8. *Đính Chính & Làm Rõ Báo Cáo V3-07:*
     - 72 scenarios trong V3-07 được sinh xác định bởi: 16 subsets + 24 hoán vị paused + 24 hoán vị interleaved + 8 capacity/transition scenarios = 72 scenarios, được thực thi trên 18 test blocks trong `combinations.test.ts`.
     - 16 subsets ở V3-07 chỉ chạy 60 ticks sim-time ($1.0\text{ s}$) để kiểm định bất biến của mọi tổ hợp, không phải bài kiểm tra long-run. Long-run 600s đầy đủ (36,000 ticks) được chính thức thực thi và nghiệm thu trong V3-08 (SC-N02).
- Hoàn thành V3-07 (Ma trận tổ hợp 16 subsets SC-M01, 24 hoán vị SC-M02 cả khi paused và interleaved, ma trận dung tích under/at/over SC-IN03/SC-M05, chuyển tiếp pha dry/oil-only/mixed, khắc phục điểm biên V3-06 gồm SC-A01 canonical, buffer capacity derived từ array length và guard hasStarted trên store) và kiểm chứng toàn diện (COMPLETED_VERIFIED, 450/450 tests pass across 22 test suites, typecheck/lint/build exit 0).
- **Kết quả xác minh các nguyên lý và kỹ thuật cốt lõi:**
  1. *Ma trận 16 Subsets Đầy đủ (SC-M01):*
     - Sinh xác định toàn bộ 16 tập con ($2^4$) từ empty `[]` đến cả 4 chất `[water, sugar, sand, oil]`.
     - Mỗi kịch bản khởi tạo trên một engine hoàn toàn mới (fresh instance). Chạy 60 ticks sim-time ($1.0\text{ s}$) dưới auto fast ($6.0\text{ rad/s}$).
     - Bảo đảm kiểm định nghiêm ngặt: khi không có nước ($W = 0$) thì $Gd = 0$ và $Od = 0$; khi hệ khô thì $f_{Gu} = 0, Ss = 0$; cát không bao giờ tan ($Sb + Ss = St$); thể tích các phân vùng bằng đúng $V_{reserve}$; tọa độ hạt đại diện hữu hạn và nằm trong bounds.
  2. *Ma trận 24 Hoán vị Đủ 4 Chất (SC-M02):*
     - Loại A (Paused at $t=0$): Cả 24 thứ tự thêm khi tạm dừng đều được xử lý đồng bộ, giữ nguyên $t=0, \text{tick}=0$. Trạng thái pha ban đầu và dung tích đặt chỗ $132,500\text{ milli-ml}$ hoàn toàn giống hệt nhau. Sau đó unpause chạy 60 ticks: cả 24 hoán vị tiến triển đến cùng một trạng thái vô hướng đồng nhất tuyệt đối.
     - Loại B (Interleaved steps at $t=0, 30, 60, 90, 120$ ticks): Thêm chất xen kẽ dòng chảy đang chạy. Bất biến bảo toàn khối lượng được thỏa mãn tại từng bước. Trạng thái quá độ thể hiện tính phụ thuộc lịch sử rõ rệt: hoán vị thêm nước trước (ví dụ `water > sugar > sand > oil`) có $Gd(120)$ cao hơn đáng kể so với hoán vị thêm nước cuối cùng (`sugar > sand > oil > water`) do thời gian tiếp xúc dung môi dài hơn.
  3. *Ma trận Dung tích và Cơ chế Từ chối Nguyên tử (Capacity & Rejection Matrix):*
     - Nước $500\text{ ml}$ (5 lần 100ml) được nhận; lần thêm tiếp $0.1\text{ ml}$ bị từ chối với `CAPACITY_EXCEEDED`.
     - Nước $499.9\text{ ml} + 0.1\text{ ml}$ đạt đúng $500,000\text{ milli-ml}$; lần thêm tiếp bị từ chối.
     - Hỗn hợp Fixture X ($495\text{ ml}$) thêm $5\text{ ml}$ nước đạt đúng $500,000\text{ milli-ml}$; thêm tiếp $0.1\text{ ml}$ dầu ($100\text{ milli-ml}$) bị từ chối ngay lập tức.
     - Quá trình hòa tan đường ($Gu \to Gd$) không làm giảm dung tích đặt chỗ $V_{reserve}$ (không mở chỗ giả trong cốc).
     - Lệnh thêm vượt quá giới hạn liều mỗi lần thêm (`maxAddition`) bị từ chối chính xác với `EXCEEDS_MAX_ADDITION`.
     - Lệnh bị từ chối bảo toàn 100% mass ledger, input ticks, version và không làm thay đổi lịch sử.
  4. *Chuỗi Chuyển tiếp Pha (Phase Transition Timelines):*
     - Dry $\to$ Oil-only $\to$ Mixed: Hệ khô không dòng chảy ($I = 0$); thêm dầu tạo dòng chảy và nâng cát lơ lửng trong dầu nhưng đường không tan và dầu không tạo giọt; thêm nước bắt đầu hòa tan đường và phân tán giọt dầu.
     - Oil-only với cát lơ lửng: Các hạt cát lơ lửng nằm hoàn toàn trong phong bì dầu $[regions.oil.bottom, regions.oil.top]$, trong khi cát đáy nằm ở $[regions.bed.bottom, regions.bed.top]$.
     - Saturated multi-phase (SC-M04): $W=10\text{ ml}, G=30\text{ g}$ (sức chứa 20g), $S=10\text{ g}, O=20\text{ ml}$ chạy 600 ticks auto-stir, kiểm chứng đồng thời giới hạn bão hòa đường, nâng/lắng cát và phân tán/tách dầu mà không sinh lỗi số học hay trôi dạt bất biến.
     - Ngừng khuấy khi đồng hồ chạy: Lực thìa về 0, dòng chảy suy giảm liên tục theo quán tính, cát lắng dần và dầu tách lớp.
     - Thêm chất đồng bộ nhanh (SC-C02): Trả về các acks có `stateVersion` tăng đơn điệu và giữ nguyên tick 0.
  5. *Đính chính & Hiệu chỉnh Điểm Rà soát V3-06:*
     - Khẳng định mã nguồn kiểm thử V3-06 đã sử dụng chính xác canonical SC-A01 ($Gu=5, Gd=5, f_{Gu}=0.4, St=10, Ot=18$). Lỗi ghi chép `Gu6, Gd4, fGu0.5` ở báo cáo trước thuần túy là lỗi typo trong văn bản báo cáo, đã được đính chính.
     - Trong `ParticleRenderer.tsx`, điều kiện cấp phát lại buffer được xác định trực tiếp từ độ dài mảng (`targetRef.current.radii.length < requiredCapacity`) thay vì trường `count`, loại bỏ hoàn toàn sự nhập nhằng giữa dung lượng cấp phát và số hạt active `stamp.count`. Đã kiểm chứng buffer giữ nguyên tham chiếu qua các frames khi budget cố định (zero allocation).
     - Trong `experimentStore.ts`, cờ `hasStarted` được bảo vệ chặt chẽ: chỉ chuyển sang `true` khi lệnh `start`, `resume` hoặc `startAuto` được chấp nhận (`ack.accepted`), ngăn chặn việc bật cờ khi lệnh bị từ chối.

## Triển khai V3-06 — Compose models và thêm chất mọi thời điểm — 2026-10-18
- Hoàn thành V3-06 (Compose simulation models, điều phối orchestration duy nhất trong engine, giao dịch thêm chất nguyên tử mọi thời điểm, bảo toàn SC-A01 tuyệt đối, xử lý hasStarted tại tick 0 và tự động co giãn buffer capacity renderer) và kiểm chứng toàn diện (COMPLETED_VERIFIED, 432/432 tests pass across 21 test suites, typecheck/lint/build exit 0).
- **Kết quả xác minh các nguyên lý và kỹ thuật cốt lõi:**
  1. *Chu trình Orchestration Duy nhất trong `HeadlessSimulationEngine.stepFixedTick`:*
     - Không tạo engine song song hay orchestrator riêng lẻ ngoài kiến trúc chuẩn. Toàn bộ chu trình tick $h$ được thực thi tuần tự, xác định tuyệt đối:
       1. Cập nhật controller thìa tự động (`AutoStirController.step` nếu ở chế độ `auto`).
       2. Tính toán tiếp xúc cơ học và phân vùng cốc (`computeBeakerRegions`, `computeMechanicalContact`).
       3. Tích phân dòng chảy (`stepStirringFlow` $\to \omega_{drive}, \omega_{flow}, I$).
       4. Động học hòa tan đường (`stepDissolution` $\to Gu \to Gd$).
       5. Động học cát và lơ lửng đường rắn (`stepSandSuspension` $\to Sb \leftrightarrow Ss$, cập nhật $f_{Gu}$ theo dòng chảy $I$).
       6. Động học tách pha và phân tán giọt dầu (`stepOilSeparation` $\to Ol \leftrightarrow Od$).
       7. Cập nhật lại hình học cốc và ràng buộc thìa (`recalculateGeometryAndConstraints`).
       8. Tích phân chuyển động hạt đại diện (`ParticleTransportSystem.step`).
       9. Kiểm định toàn diện 8 bất biến bảo toàn khối lượng (`assertMassInvariants`).
       10. Cam kết tick: tăng `tickIndex`, cập nhật thời gian mô phỏng $t = \text{tickIndex} \times h$.
  2. *Giao dịch Thêm chất Nguyên tử (Atomic Addition Transaction):*
     - Xác thực đầu vào: chuyển đổi sang `deciTicks` nguyên dương an toàn, kiểm tra dung tích tối đa $500,000\text{ milli-ml}$.
     - Phân bổ pha ban đầu: đường mới vào $Gu$ (rắn, chưa tan), cát mới vào $Sb$ (đáy), dầu mới vào $Ol$ (lớp dầu), nước vào $W$.
     - Ràng buộc & Ánh xạ lại:
       * Pha loãng $f_{Gu}$: $f_{Gu,new} = f_{Gu,old} \times \frac{Gu_{old}}{Gu_{old} + \Delta Gu}$.
       * Cập nhật tức thời hình học cốc (`computeBeakerRegions`) và cao độ thìa (`computeTipY`).
       * Ánh xạ lại các hạt hiện có qua phép chiếu (`projection-only`), bảo toàn bán kính và tọa độ tương đối, không kéo dãn affine hay xáo trộn danh tính hạt.
     - Kiểm định bất biến: chạy `assertMassInvariants` trước khi cam kết.
     - Phát snapshot tức thời (`publishSnapshot(true)`), đồng bộ trạng thái sang store/UI mà không làm trôi dạt thời gian $t$ hoặc `tickIndex` khi đang tạm dừng (`paused`).
  3. *Xác minh Thực nghiệm Fixture SC-A01:*
     - Khởi tạo hỗn hợp SC-A01 canonical: $W = 100\text{ ml} (100\text{ g}), Gt = 10\text{ g} (Gu = 5\text{ g}, Gd = 5\text{ g}, f_{Gu} = 0.4), St = 10\text{ g} (Sb = 7\text{ g}, Ss = 3\text{ g}), O = 20\text{ ml} (Ot = 18\text{ g}, Ol = 9\text{ g}, Od = 9\text{ g})$.
     - Thêm đường 1g (10 deciTicks): $Gt: 10 \to 11\text{ g}$, $Gu: 5 \to 6\text{ g}$, $Gd = 5\text{ g}$ giữ nguyên, $f_{Gu} = 0.4 \times (5/6) = 1/3 \approx 0.3333333333$ (pha loãng chính xác theo SPEC §3.5).
     - Thêm cát 1g (10 deciTicks): $St: 10 \to 11\text{ g}$, $Sb: 7 \to 8\text{ g}$, $Ss = 3\text{ g}$ giữ nguyên.
     - Thêm dầu 1ml (10 deciTicks = 0.9g dầu): $Ot: 18 \to 18.9\text{ g}$, $Ol: 9 \to 9.9\text{ g}$, $Od = 9\text{ g}$ giữ nguyên.
     - Thêm nước 1ml (10 deciTicks = 1.0g nước): $W: 100 \to 101\text{ g}$, các pha giữ nguyên, sức chứa mở rộng tương ứng $202\text{ g}$.
  4. *Khắc phục Trạng thái UI tại Tick 0 (`hasStarted`):*
     - Trước đây, logic `tickIndex === 0 && elapsedSeconds === 0 ? 'Chưa chạy' : 'Tạm dừng'` gây nhầm lẫn khi người dùng vừa bấm bắt đầu/tiếp tục rồi tạm dừng ngay ở tick 0.
     - Đã bổ sung cờ `hasStarted: boolean` trong `ExperimentStore`: khởi tạo `!initialSnapshot.paused`, chỉ bật `true` khi `start()`, `resume()` hoặc `startAuto()` được chấp nhận (`ack.accepted`), tắt về `false` khi `reset()`, và đồng bộ hóa qua `snapshot.generation`.
     - `ControlPanel.tsx`: Badge hiển thị "Chưa chạy" khi `!hasStarted && paused`, "Tạm dừng" khi `hasStarted && paused`, "Đang chạy" khi `!paused`. Nút chính chuyển đổi linh hoạt giữa "▶ Bắt đầu mô phỏng" và "▶ Tiếp tục mô phỏng".
  5. *Tự động Co giãn Buffer và Chống Spam Cảnh báo Renderer:*
     - Phân định rạch ròi: `stamp.count` là số hạt active thực tế, trong khi dung lượng cấp phát của buffer phải suy từ độ dài mảng (`targetRef.current.radii.length`).
     - `ParticleRenderer.tsx` chỉ cấp phát lại khi dung lượng mảng thực tế nhỏ hơn yêu cầu (`radii.length < budgetPerPool * 5`). Khi budget không đổi (mặc định 100 hoặc tối đa 700 hạt/pool), buffer giữ nguyên tham chiếu qua các frames (zero reallocation/zero GC).
     - Đã thêm `warnedPools: Set<string>` trong `particleMeshHelpers.ts` để mỗi pool bị vượt ngưỡng chỉ ghi cảnh báo 1 lần duy nhất, triệt tiêu 100% spam console 60 FPS.
  6. *Tính Độc lập của Replay Harness và Frame Rate:*
     - Kiểm thử replay vết lệnh (trace) ở các tần số 30, 60, và 120 FPS qua `TickBoundaryReplayHarness` cho kết quả scalar vật lý hoàn toàn đồng nhất.
     - Lệnh thêm chất hoặc điều khiển tại tick 0 được flush chuẩn xác trước khi tick tiến triển, tránh deadlock khi bắt đầu từ trạng thái tạm dừng.

## Triển khai V2-09 — UI pause/resume/stop/reset thống nhất — 2026-10-18
- Hoàn thành V2-09 (UI controls thống nhất, phân tách 3 chiều trạng thái độc lập: clock / mode / driver, phân biệt dừng khuấy với tạm dừng mô phỏng, bảo toàn cấu hình khi resume, add khi pause flush ngay không tăng time, reset fence generation sạch hóa học nhưng giữ camera/showRod, sửa typo tài liệu tách pha dầu và chẩn đoán renderer) và kiểm chứng toàn diện (PARTIAL — Core verified 412/412 tests pass across 20 test suites, typecheck/lint/build exit 0, Browser QA pending do thiếu môi trường trình duyệt tự động).
- **Kết quả xác minh và chuẩn hóa các nguyên lý:**
  1. *Ba chiều trạng thái giao diện độc lập (3-Dimension State Architecture):*
     - Simulation Clock: `Chưa chạy` (`tickIndex === 0 && elapsedSeconds === 0`), `Đang chạy` (`!paused`), `Tạm dừng` (`paused`).
     - Chế độ tương tác (`mode`): `Quan sát` (`observe`), `Khuấy tự động` (`auto`), `Kéo thủ công` (`manual`).
     - Trạng thái truyền lực (`driver`): `Đang khuấy: X rad/s` (auto active), `Đã ngừng khuấy (thìa ở trạng thái nghỉ)` (auto drive released), `Thìa tạm dừng — đứng yên` (auto drive enabled khi simulation paused), `Chế độ quan sát — mô phỏng đang chạy/tạm dừng` (observe).
     - Tuyệt đối không gộp chung clock và driver vào một cờ boolean `isRunning`.
  2. *Sự khác biệt cốt lõi giữa "Ngừng khuấy" (`stopAuto`) và "Tạm dừng" (`pause`):*
     - "Ngừng khuấy" (`stopAuto` / `releaseDrive`): ngắt lực truyền động cơ học của thìa ($\omega_{rod} = 0$, `autoDriveEnabled = false`), nhưng giữ nguyên đồng hồ mô phỏng tiếp tục chạy (`paused = false`). Dòng xoáy $\omega_{flow}$ suy giảm liên tục và tự nhiên theo quán tính, các quá trình hòa tan, lắng cát và tách pha dầu vẫn diễn ra. Badge trạng thái vẫn hiển thị "Đang chạy".
     - "Tạm dừng" (`pause`): đóng băng toàn bộ tiến trình mô phỏng, dừng đồng hồ, dừng các mô hình động học và particle transport, đồng thời tự động giải phóng phiên kéo chuột thủ công (`endManualDrag`), nhả pointer capture và khôi phục quyền điều khiển camera `OrbitControls`.
     - Bổ sung ghi chú giáo dục trực quan: "* Ngừng khuấy chỉ ngắt lực của thìa. Tạm dừng đóng băng toàn bộ mô phỏng."
  3. *Hành vi Thêm chất khi Tạm dừng (Paused Add Contract):*
     - Khi thêm chất trong trạng thái `paused`, lệnh `add` được xác thực và cam kết đồng bộ vào mass ledger.
     - Kích hoạt cập nhật tức thì hình học cốc (`computeBeakerRegions`), chiều cao thìa (`computeTipY`), và dải hạt đại diện (`reconcile`).
     - Phát snapshot ngay lập tức cho UI (`publishSnapshot`), trong khi `tickIndex` và `elapsedSeconds` giữ nguyên vẹn 0 hoặc mốc tạm dừng, hoàn toàn không chạy trước thời gian.
     - Bảo toàn nguyên vẹn lượng đường đã tan ($Gd$), cát lơ lửng ($Ss$) và giọt dầu phân tán ($Od$) hiện hữu.
  4. *Khôi phục và Bảo toàn Cấu hình (Configuration Preservation & Reset Fencing):*
     - Stop $\to$ Pause $\to$ Resume: không tự ý kích hoạt lại khuấy tự động (`autoDriveEnabled` vẫn là `false`).
     - Pause Auto $\to$ Resume: bảo toàn đúng cấu hình tốc độ auto (`AUTO_LEVEL_SPEEDS[autoLevel]`) và tự động quay lại khi unpause.
     - Manual Drag $\to$ Pause $\to$ Resume: yêu cầu con trỏ chuột phải thực hiện `pointerdown` mới, không tiếp tục kéo ngầm.
     - Reset thí nghiệm: tăng thế hệ `generation`, dọn sạch lịch sử thêm chất và state hóa học, nhưng bảo toàn góc nhìn camera (`cameraRevision`) và tùy chọn hiển thị thìa (`showRod`).
     - High-water mark + LRU cache loại bỏ các lệnh `reset` trùng lặp (`duplicate: true` hoặc `accepted: false`), ngăn chặn việc double reset hoặc stale callback hồi sinh state cũ.
  5. *Đính chính sai lệch Typo về Động học Tách Pha Dầu:*
     - Xác minh mã nguồn `src/simulation/constants/science.ts` và `src/simulation/models/OilSeparation.ts` đã triển khai chính xác công thức SPEC §5.4: $k_{Break} = 0.5 \cdot I^2 \cdot w_f$ và $k_{Separate} = 0.10 / (1 + 3I)$.
     - Số liệu $0.15\text{ s}^{-1}$ xuất hiện trong ghi chú của báo cáo V2-08 trước đó là lỗi typo gõ nhầm với hệ số lắng của cát trong nước ($k_{settle} = 0.15\text{ s}^{-1}$ trong `SAND_SETTLE_WATER`), mã nguồn runtime hoàn toàn chuẩn xác.
  6. *Truy cập State Khoa học & Chẩn đoán Renderer:*
     - Cập nhật `SimulationBridge.getGeneration()` gọi trực tiếp `this.engine.getCurrentGeneration()` thay vì truy cập qua `getState().generation`.
     - Bổ sung phương thức `isPaused(): boolean` trên `HeadlessSimulationEngine`, `CommandEngineCore` và `SimulationBridge`.
     - Bổ sung cảnh báo chẩn đoán `console.warn` trong `particleMeshHelpers.ts` khi `range.count > maxMeshCapacity` và `console.error` trong `ParticleRenderer.tsx` khi `copyRenderFrame` ném ngoại lệ.

## Triển khai V2-08 — Vòng đời tick, pose thìa và regression của renderer — 2026-10-18
- Hoàn thành V2-08 (Vòng đời tick duy nhất ngoài Canvas, pose thìa authoritative, generation fencing render path, mapping effective radius cho thin layers, 20 chu kỳ camera reset bất biến và tách `particleMeshHelpers.ts`) và kiểm chứng toàn diện (PARTIAL — Core verified 392/392 tests pass across 19 test suites, typecheck/lint/build exit 0, Browser QA pending do thiếu môi trường trình duyệt tự động).
- **Kết quả kiểm tra và hiệu chỉnh Renderer:**
  1. *Effective Radius & Instance Scale:*
     - Xác minh hình học cơ sở `InstancedMesh` có bán kính đơn vị $r_0 = 1.0$. Ma trận biến đổi thiết lập `scale = r`, trong đó $r$ được đọc từ `target.radii[offset + i]`.
     - Tuyệt đối không có hiện tượng nhân đôi bán kính (không có $scale \times r$).
     - Trong các lớp mỏng ($height < 2 \cdot r_{particle}$), `computeParticleBounds` tính $r_{eff} = \min(r_{particle}, height / 2)$. Giá trị này được sao chép vào `target.radii` và ánh xạ chính xác vào ma trận scale của từng hạt, ngăn hạt lồi ra ngoài biên cốc.
     - Chuẩn hóa các hằng số bán kính mặc định theo `PARTICLE_RADIUS.sand` (0.026), `PARTICLE_RADIUS.sugar` (0.022), và `PARTICLE_RADIUS_OIL_DROPLET` (0.028).
  2. *Authoritative Generation Fencing qua Render Path:*
     - Phát hiện vấn đề: Kiểm tra cũ so sánh `stamp.generation !== snapshot.generation`. Vì snapshot UI bị throttle ở tần số 10Hz, trong khoảng thời gian giữa tick và lúc snapshot cập nhật, renderer có thể drop frame authoritative mới.
     - Giải pháp chuẩn hóa: Render path đọc trực tiếp từ `bridge.copyRenderFrame(target)`, lấy `stamp.generation` có thẩm quyền từ engine. Dùng `lastRenderedGenerationRef` để từ chối các frame cũ bị hồi quy thế hệ (`stamp.generation < lastRenderedGen`).
     - Khi reset thí nghiệm, engine thiết lập `activeCount = 0` trên thế hệ mới. Khi render, `stamp.count === 0` lập tức đặt `mesh.count = 0` trên toàn bộ 5 `InstancedMesh`, xóa sạch ghost particles ngay tức khắc kể cả khi đang tạm dừng (`paused`).
  3. *An toàn Buffer & Tách Module Tránh React Refresh Warning:*
     - Buffer `MAX_BUFFER_CAPACITY = 3500` (700 hạt $\times$ 5 pools) đủ cho toàn bộ ngân sách hạt hiện tại.
     - Hàm `updatePoolInstancedMesh` kẹp số lượng an toàn: `count = Math.min(range.count, mesh.instanceMatrix.count)`, ngăn tràn buffer Three.js.
     - Tách toàn bộ hàm helper `updatePoolInstancedMesh` và các hằng số `MAX_POOL_CAPACITY`, `MAX_BUFFER_CAPACITY` sang [`src/scene/particleMeshHelpers.ts`](file:///d:/IdeaProjects/virtual-solubility-lab/src/scene/particleMeshHelpers.ts), giữ cho [`ParticleRenderer.tsx`](file:///d:/IdeaProjects/virtual-solubility-lab/src/scene/ParticleRenderer.tsx) chỉ xuất React component duy nhất, triệt tiêu hoàn toàn cảnh báo `react-refresh/only-export-components`.
  4. *Độ chính xác biểu diễn (Double-count & Mô tả khoa học):*
     - Không vẽ trùng lặp pha dầu: thể tích lớp dầu phân tách $V_{oil} = O_l / \rho_O$ co lại tương ứng khi dầu phân tán vào pha nước thành các giọt $O_d$.
     - Hạt rắn trong hệ chỉ dầu (`oil-only`) được chứa hoàn toàn trong phong bì dầu `[regions.oil.bottom, regions.oil.top]`.
     - Hiệu chỉnh mô tả khoa học: Làm rõ quá trình giọt dầu nổi và tách pha là mô hình động học nổi vận tốc giới hạn ($v_{rise} = 0.06\text{ units/s}$) và trao đổi tỷ lệ vô hướng giải tích ($k_{sep} = 0.15\text{ s}^{-1}$), không phải solver sức căng bề mặt Navier-Stokes CFD.
- **Vòng đời một Owner và một Scientific Loop:**
  1. *Kiến trúc một chủ sở hữu ngoài Canvas:*
     - Engine duy nhất `HeadlessSimulationEngine` được sở hữu bởi `SimulationBridge` bên trong Zustand store `useExperimentStore`.
     - Chỉ có RAF scheduler của `SimulationBridge` (quản lý qua `attachLifecycle`) mới được phép gọi `stepFrame` và `engine.advanceTimestamp()`.
     - Các hook `useFrame` trong Canvas chỉ đọc pose (`bridge.getRodPose()`) và hạt (`bridge.copyRenderFrame(target)`), tuyệt đối không tự tích phân chuyển động hay nhân đôi scientific step.
  2. *Tính lũy đẳng React StrictMode:*
     - `attachLifecycle` có cờ dọn dẹp `lifecycleCleanup`. Khi React StrictMode chạy chu trình `mount -> unmount -> remount`, phiên đầu được hủy triệt để trước khi khởi tạo phiên thứ hai, bảo đảm chính xác duy nhất 1 active RAF loop và 0 rò rỉ bộ nhớ.
  3. *Bảo toàn trạng thái qua 20 chu kỳ Camera Reset:*
     - Thử nghiệm 20 lần reset camera liên tục: đối tượng engine giữ nguyên định danh (`===`), khối lượng các chất, thời gian trôi qua và thế hệ simulation hoàn toàn bất biến.
     - Khi camera reset giữa lúc đang kéo thủ công: `adapter.detach()` tự động giải phóng pointer capture, khôi phục OrbitControls camera, ngắt drive của phiên cũ và bảo toàn dòng chảy phân rã liên tục `omegaFlow`.

## Tích hợp Visual Particle Transport vào Renderer 3D — 2026-10-18
- Hoàn thành kết nối particle transport có thẩm quyền (`ParticleTransportSystem`) vào renderer 3D (`ParticleRenderer.tsx`) và cải thiện khả năng quan sát (COMPLETED_VERIFIED, 376/376 tests pass across 18 test suites, typecheck/lint/build exit 0).
- **Nguyên nhân gốc rễ khiến hạt và giọt dầu bị đứng yên / không hiển thị trước đó:**
  1. *Renderer tĩnh:* `ParticleRenderer.tsx` trước đây chỉ tạo xoắn ốc toán học tĩnh trong `useLayoutEffect` ($r = \sqrt{i/N} \cdot R, \theta = 2.4 \cdot i$) một lần lúc mount và không bao giờ đọc dữ liệu từ engine mỗi frame.
  2. *Thiếu liên kết pha hạt:* `LaboratoryScene.tsx` trước đây chỉ gọi `ParticleRenderer` cho đáy cát `Sb` và đáy đường `guBed`, hoàn toàn bỏ qua cát lơ lửng `Ss`, đường lơ lửng `Gu_susp`, và giọt dầu phân tán `Od`.
  3. *Hàm `copyRenderFrame` bị cô lập:* Thuật toán transport và hàm `copyRenderFrame` đã được xây dựng và kiểm thử trong V3-05 nhưng chưa bao giờ được phơi bày qua `SimulationBridge` hay được scene gọi đến.
  4. *Độ mờ đục của chất lỏng che khuất:* Thể tích nước (`opacity={0.56}`) và dầu (`opacity={0.75}`) quá đục và dày, cản trở gần như hoàn toàn việc nhìn thấy các hạt bên trong cốc.
- **Giải pháp kiến trúc và dữ liệu:**
  1. *Caller-owned buffer isolation:* `ParticleRenderer` giữ buffers tái sử dụng (`positions: Float32Array(10500)`, `radii: Float32Array(3500)`, `poolIds: Uint8Array(3500)`) trong React `useRef`, kích thước cố định khoảng 77 KB bộ nhớ heap, không cấp phát lại mỗi frame (zero GC pressure).
  2. *Cầu nối có thẩm quyền:* `SimulationBridge.copyRenderFrame(target)` chuyển tiếp trực tiếp vào `engine.copyRenderFrame(target)` duy nhất ngoài Canvas.
  3. *Hàng rào thế hệ (`generation fencing`):* Kiểm tra `stamp.generation === snapshot.generation`. Nếu phát hiện generation lệch (như sau khi simulation bị `reset`), renderer bỏ qua frame vẽ hiện tại để tránh hiển thị hạt cũ trước khi state mới đồng bộ.
  4. *Loại trừ đường đã tan (`Gd`):* Đường đã tan phân tán ở cấp độ phân tử, không sinh hạt đại diện, đảm bảo bảo toàn khối lượng và tính khoa học.
  5. *Phân cấp `renderOrder` và độ trong suốt:*
     - Các hạt rắn / giọt phân tán: `renderOrder={1}`, `depthWrite={true}`.
     - Thể tích chất lỏng trong suốt (nước `opacity={0.32}`, dầu `opacity={0.48}`): `renderOrder={2}`, `depthWrite={false}`.
     - Cốc thủy tinh bên ngoài: `renderOrder={3}`, `depthWrite={false}`.
     - Nhờ đó, người dùng có thể nhìn xuyên thấu từ ngoài cốc qua chất lỏng đến các hạt và giọt xoáy bên trong mà không bị z-fighting hay depth clipping.
  6. *Miễn nhiễm tương tác chuột (Raycast Immunity):*
     - Mọi `InstancedMesh` của hạt đều có thuộc tính `raycast={() => null}`, ngăn chặn hoàn toàn việc các hạt bay lơ lửng chặn sự kiện chuột khi người dùng nhấp vào thìa khuấy hoặc cốc.
  7. *Mở rộng schema `SimulationState`:*
     - Bổ sung `PoolKind = 'sugarBed' | 'sugarSusp' | 'sandBed' | 'sandSusp' | 'oilDroplet'`.
     - Bổ sung `RenderPoolRange = { offset: number; count: number }`.
     - Mở rộng `RenderTarget` với trường tùy chọn `poolIds?: Uint8Array`.
     - Mở rộng `RenderStamp` với trường tùy chọn `poolRanges?: Record<PoolKind, RenderPoolRange>`.
     - Cập nhật `ParticleTransportSystem.copyRenderFrame` để ghi dải offset/count cho từng pool và ghi `poolIds` (0..4).

## Triển khai V2-07 — Pointer ownership và chuyển mode — 2026-10-18
- Hoàn thành V2-07 (Interaction state machine 4 trạng thái, single pointer owner, pointer capture & release lifecycle, camera control synchronization với OrbitControls, stale watchdog lock preservation, rollback khi capture thất bại, session fencing và hỗ trợ 4 góc phần tư) và kiểm chứng toàn diện (COMPLETED_VERIFIED, 367/367 tests pass across 17 test suites, typecheck/lint/build exit 0).
- **Kết quả xác minh các nguyên lý và chính sách tương tác:**
  1. *Interaction State Machine (4 trạng thái chuẩn):*
     - `observe`: Cho phép xoay/zoom OrbitControls bình thường; chuột không thể tương tác với thìa.
     - `auto`: Controller tự động điều khiển thìa theo quỹ đạo tròn 3 tốc độ; chuột không thể chiếm quyền thìa; camera OrbitControls hoạt động bình thường.
     - `manual-idle`: Ở chế độ thủ công nhưng chuột chưa nhấn vào thìa; camera OrbitControls hoạt động bình thường, thìa giữ nguyên vị trí chờ.
     - `manual-drag`: Người dùng nhấn chuột trái vào thìa; OrbitControls bị khóa (`enabled = false`), con trỏ bị bắt (`setPointerCapture`), thìa nhận mẫu tọa độ và ước lượng vận tốc góc để truyền động vào động học dòng chảy.
  2. *Single Pointer Ownership:*
     - Chỉ duy nhất một con trỏ (`capturedPointerId`) được phép sở hữu phiên kéo thìa tại một thời điểm. Mọi con trỏ thứ hai khi nhấn vào đều bị từ chối ngay lập tức (`accepted: false`).
     - Thiết bị không phải chuột (`pointerType !== 'mouse'`) hoặc nút chuột phụ (`button !== 0`) đều bị chặn theo đúng đặc tả MVP (chưa hỗ trợ touch/pen cho manual stirring).
  3. *Đồng bộ quyền sở hữu Camera (OrbitControls Synchronization):*
     - Ngay khi `pointerdown` hợp lệ trên thìa, `cameraTarget.setEnabled(false)` được gọi đồng bộ TRƯỚC KHI cử chỉ xoay của OrbitControls kịp bắt đầu.
     - Trong suốt phiên `manual-drag`, OrbitControls bị vô hiệu hóa hoàn toàn, ngăn hiện tượng giật/xoay góc nhìn camera khi đang khuấy cốc.
     - Trên MỌI nhánh thoát (`pointerup`, `pointercancel`, `lostpointercapture`, `blur`, `hidden`, `hideRod`, `pause`, `reset`, `mode`, `unmount`), `cameraTarget.setEnabled(true)` luôn được phục hồi an toàn.
  4. *Quản lý Pointer Capture & Khả năng chịu lỗi (Rollback on Capture Failure):*
     - Sử dụng `element.setPointerCapture(pointerId)` trên Canvas DOM element để nhận sự kiện chuột ngay cả khi di chuyển ra ngoài biên canvas.
     - Nếu phương thức `setPointerCapture` ném ngoại lệ (như môi trường không hỗ trợ, con trỏ đã mất hiệu lực), adapter thực hiện rollback: khôi phục `cameraTarget.setEnabled(true)`, kết thúc drag session trong controller, trả về `{ accepted: false }` và không để engine bị treo trạng thái.
  5. *Tính lũy đẳng khi nhả Pointer (Idempotent Release across lostpointercapture):*
     - Trong chuẩn W3C Pointer Events, khi gọi `releasePointerCapture()`, trình duyệt sẽ kích hoạt sự kiện `lostpointercapture`.
     - Nhờ biến cờ chống tái nhập `isCleaningUp` và kiểm tra `!controller.isDragActive()`, việc xử lý sự kiện dọn dẹp diễn ra hoàn toàn lũy đẳng (idempotent), không gây vòng lặp đệ quy, không phát trùng lặp lệnh `releaseDrive` vào engine.
  6. *Bảo toàn khóa khi Watchdog Stale kích hoạt:*
     - Khi người dùng giữ chuột đứng yên $\ge 150\text{ ms}$, stale watchdog phát lệnh `releaseDrive` để triệt tiêu lực khuấy ($\omega_{rod} = 0$), nhưng KHÔNG giải phóng pointer capture và KHÔNG mở khóa camera OrbitControls. Trạng thái tương tác vẫn được duy trì là `'manual-drag'` vì người dùng vẫn đang đè chuột vào thìa.
  7. *Hàng rào phiên (Session Fencing & Stale Callbacks):*
     - Khi chuyển mode từ manual sang auto, phiên kéo manual được dọn dẹp dứt điểm trước khi mode auto được kích hoạt. Các callback trễ từ phiên cũ (như `lostpointercapture` với pointerId cũ) hoàn toàn không thể hủy bỏ `autoDriveEnabled` của chế độ auto mới.
     - Lệnh `manualSample` mang `captureGeneration` cũ (sau khi simulation bị `reset`) bị engine từ chối với lý do `'STALE_GENERATION'`.
  8. *Hỗ trợ tọa độ âm và góc trên 4 góc phần tư:*
     - Khẳng định tọa độ $x < 0, z < 0$ và góc $\theta = \text{atan2}(z, x) \in [-\pi, \pi]$ hoàn toàn hợp lệ trên cả 4 góc phần tư (II, III, IV, I), không bị hạn chế bởi bất kỳ điều kiện âm nào. Chỉ có mốc thời gian input clock $inputTimeMs < 0$ mới bị coi là không hợp lệ.
     - Schema của `manualSample` chỉ chấp nhận trường chính thức `omegaRod?: number`, trường lỗi thời `omega` bị loại bỏ và từ chối nghiêm ngặt với mã lỗi `'INVALID_PAYLOAD'`.

## Triển khai V2-06 — Suy ra vận tốc và hướng manual — 2026-10-18
- Hoàn thành V2-06 (Bộ ước lượng vận tốc góc manual `AngularVelocityEstimator`, bộ lọc exponential smoothing $\tau = 0.08\text{ s}$, unwrap $\pm\pi$, deadzone $R_{dead} = 0.0435$ scene units, stale watchdog timeout $150\text{ ms}$, rollback trên engine rejection và bảo toàn residual flow decay) và kiểm chứng toàn diện (COMPLETED_VERIFIED, 347/347 tests pass across 16 test suites, typecheck/lint/build exit 0).
- **Kết quả xác minh các nguyên lý toán học và chính sách khoa học:**
  1. *Toán học ước lượng vận tốc góc thuần túy (`AngularVelocityEstimator.ts`):*
     - Unwrap góc trên khoảng $(-\pi, \pi]$: $\Delta\theta = \text{atan2}(\sin(\theta_{now} - \theta_{prev}), \cos(\theta_{now} - \theta_{prev}))$.
     - Chiều dương $\Delta\theta > 0$ ứng với chuyển động quay từ trục $+X$ sang $+Z$.
     - Đồng hồ host input monotonic: các mẫu có $\Delta t \le 0$ hoặc out-of-order đều bị loại bỏ ngay lập tức mà không làm bẩn lịch sử góc hay cập nhật mốc thời gian hợp lệ cuối (`lastValidSampleTimeMs`).
     - Tọa độ hoặc mốc thời gian NaN, $\pm\infty$, số âm bị drop an toàn (`accepted: false`).
  2. *Bộ lọc làm mượt hàm mũ bậc nhất (First-order exponential smoothing):*
     - Hệ số suy giảm: $\alpha = 1 - e^{-\Delta t / \tau}$ với $\tau = 0.08\text{ s}$ theo SCIENTIFIC_SPEC §6 (tuyệt đối không gọi sai là "Butterworth" vì đây là exponential smoothing bậc nhất).
     - Công thức truy hồi: $\omega_{next} = \omega_{prev} + \alpha \cdot (\omega_{raw} - \omega_{prev})$.
  3. *Thứ tự kẹp vận tốc chuẩn (Capping Order):*
     - **Thứ tự bắt buộc:** Kẹp vận tốc thô $\omega_{raw} = \Delta\theta / \Delta t$ về khoảng $[-8.0, 8.0]\text{ rad/s}$ **TRƯỚC KHI** đưa vào bộ lọc exponential smoothing, sau đó kẹp đầu ra một lần nữa về $[-8.0, 8.0]\text{ rad/s}$.
     - Rationale: Nếu đưa giá trị nhảy chuột cực lớn (mouse jump/teleport spike, e.g. $\omega_{raw} = 300\text{ rad/s}$) trực tiếp vào bộ lọc rồi mới kẹp đầu ra, biến trạng thái nội bộ của bộ lọc sẽ bị nhiễm giá trị khổng lồ và mất rất nhiều frame mới phân rã trở lại bình thường. Kẹp thô trước khi lọc ngăn ngừa triệt để hiện tượng này.
  4. *Xử lý vùng chết tâm cốc (Deadzone Contract):*
     - Bán kính vùng chết: $R_{dead} = 0.0435$ scene units (SCIENTIFIC_SPEC §6).
     - Khi con trỏ đi vào vùng chết ($r < 0.0435$): lập tức gán $\omega = 0$, xóa sạch lịch sử góc và bộ lọc (`hasAnchor = false, prevTheta = null, smoothedOmega = 0`).
     - Khi con trỏ thoát ra khỏi vùng chết: mẫu đầu tiên bên ngoài vùng chết hoạt động như một mẫu tái neo (`isAnchor = true, omega = 0`), chỉ từ mẫu thứ hai mới bắt đầu suy ra vận tốc góc.
     - Rationale: Quét thẳng qua tâm cốc từ $-X$ sang $+X$ đi qua vùng chết hoàn toàn không sinh bất kỳ spike vận tốc góc nào.
  5. *Tái neo khi khoảng cách thời gian lớn (Long Gap Re-anchoring):*
     - Nếu khoảng cách giữa 2 mẫu di chuyển $\Delta t > 150.0\text{ ms}$, mẫu mới được coi là mốc tái neo mới (`isAnchor = true, omega = 0`), ngăn việc suy ra vận tốc giả trên quãng nghỉ chuột dài.
     - Kiểm thử biên cực hạn: tại $\Delta t = 149.9\text{ ms}$ và $150.0\text{ ms}$ tính vận tốc hợp lệ; tại $\Delta t = 150.1\text{ ms}$ tái neo với $\omega = 0$.
  6. *Bộ giám sát quá hạn con trỏ (Stale Input Watchdog):*
     - Theo dõi thời gian host clock: nếu con trỏ chuột dừng yên tại chỗ $\ge 150\text{ ms}$ mà không có sự kiện move/up, watchdog kích hoạt lệnh `releaseDrive` vào engine.
     - Chỉ kích hoạt duy nhất 1 lần cho mỗi khoảng nghỉ (`isStaleReleased = true`), không spam lệnh vào engine.
     - Động tác di chuyển sau khi bị stale sẽ tự động tái neo ở mẫu đầu tiên (`omega = 0`) rồi mới suy ra vận tốc ở mẫu tiếp theo.
     - Phiên stale cũ bị khóa: không thể giải phóng nhầm auto driver hoặc thế hệ simulation mới (`state.generation !== captureGeneration` hoặc `state.mode !== 'manual'`).
  7. *Chính sách khôi phục lịch sử khi engine từ chối lệnh (Rollback Contract):*
     - Nếu engine từ chối lệnh `manualSample` (ví dụ do lệnh hết hạn thế hệ `STALE_GENERATION`), adapter gọi `controller.rollback(result.snapshot, prevPose)`, hoàn nguyên trạng thái controller và bộ ước lượng về mốc cam kết hợp lệ trước đó.
  8. *Bảo toàn dòng chảy còn dư (Residual Flow Decay Policy):*
     - Khi nhả thìa hoặc watchdog kích hoạt hoặc người dùng dừng khuấy ($\omega_{rod} = 0$), lực truyền động $\omega_{drive} = 0$.
     - Nếu trong cốc có chất lỏng dẫn dòng (nước hoặc dầu, `hasCarrier === true`), dòng xoáy $\omega_{flow}$ không bị giật về 0 ngay lập tức mà phân rã liên tục giải tích theo $\omega_{flow}(t) = \omega_{flow}(0) \cdot e^{-(a + b) \cdot t}$ ($a+b = 2.8\text{ s}^{-1}$). Dòng chảy chỉ bị ép về 0 khi cốc hoàn toàn khô / không có chất lỏng.
  9. *Tính tất định khi Replay qua các tần số khung hình (Deterministic Replay across 30/60/120 FPS):*
     - Sự kiện giải phóng drive từ watchdog được record tại mốc `(appliedAtTick, seq)` cụ thể.
     - Sử dụng `TickBoundaryReplayHarness` để phát lại chuỗi sự kiện gồm thêm nước, thêm đường, khuấy manual và release drive tại các mức 30, 60, và 120 FPS: kết quả trạng thái cuối cùng (`tickIndex`, `elapsedSeconds`, `omegaFlow`, khối lượng hòa tan `Gd`, `stateVersion`) giống nhau 100%.

## Triển khai V2-05 — Ray-plane projection và clamp thìa — 2026-10-18
- Hoàn thành V2-05 (Ray-plane projection, drag offset, radial clamp thìa, ManualStirController và ManualStirAdapter) và kiểm chứng đầy đủ (COMPLETED_VERIFIED, 319/319 tests pass across 15 test suites).
- **Kết quả xác minh các điểm transport liên quan (từ yêu cầu mục 2):**
  1. *`sugarSusp` trong hệ dầu đơn (oil-only):*
     - Kiểm toán mã nguồn `ParticleTransport.ts` (dòng 239–244): Khi `regions.category === 'oil-only'`, hàm `computePoolBounds` cho `sugarSusp` trả về `computeParticleBounds(regions.oil.bottom, regions.oil.top, PARTICLE_RADIUS.sugar)`.
     - `sugarSusp` nằm trọn vẹn trong oil envelope, giống hệt `sandSusp`, tuyệt đối không dùng empty aqueous region.
  2. *Động học suy giảm vận tốc bằng exponential drag:*
     - Kiểm toán `stepPoolTransport` (dòng 407, 440–447):
       $$v_{next} = v_{target} + (v - v_{target}) \times e^{-k_{drag} \cdot h} \quad (k_{drag} = 4.0\text{ s}^{-1})$$
       $$p_{next} = p + v_{next} \times h$$
       Đây là phương pháp tích phân bán ẩn (semi-implicit / symplectic Euler) với phân rã cản nhớt số mũ giải tích chính xác theo SCIENTIFIC_SPEC §9.
  3. *Đơn vị đo lường tọa độ:*
     - Toàn bộ vị trí và kích thước đều tính theo scene units (bán kính trong cốc $0.87$, đáy cốc $0.12$, đỉnh cốc $2.22$), không phải mét.
  4. *Bản chất của `sugarBed`:*
     - `sugarBed` là hạt đường rắn chưa tan nằm ở đáy cốc ($M = Gu_{bed} = Gu \times (1 - f_{Gu})$), không phải đường kết tủa (MVP không có quá trình kết tủa do không có bốc hơi hay làm nguội).
  5. *Độ chính xác tổng trọng số Float32:*
     - Tổng trọng số hạt $\sum w_i$ của mỗi pool biểu diễn trong mảng `Float32Array` khớp khối lượng pha trên ledger với sai số số thực tiêu chuẩn ($\approx 10^{-6}\text{ g}$ do đơn độ chính xác IEEE 754), ngoại trừ trường hợp các pool bị ẩn trực quan (`activeCount = 0` khi $M_{phase} < 0.001\text{ g}$).
- **Quyết định thiết kế và kiến trúc V2-05:**
  1. *Phép chiếu Ray–Plane thuần túy (`src/interactions/RayPlaneProjection.ts`):*
     - Hệ tọa độ: $+Y$ hướng lên, mặt phẳng kéo ngang $X/Z$ tại độ cao $Y = planeY$.
     - Vector tia: $\vec{O} = (ox, oy, oz), \vec{D} = (dx, dy, dz)$.
     - Chuẩn hóa: $\hat{D} = \vec{D} / |\vec{D}|$. Nếu $|\hat{D}_y| < 10^{-5}$ (tia gần song song với mặt phẳng kéo), loại bỏ mẫu (`return null`).
     - Giao điểm sau lưng tia: $t = (planeY - oy) / dy < 0 \implies$ loại bỏ mẫu (`return null`).
     - Mẫu không hợp lệ (NaN, Infinity, vector 0, tia hướng lên khi mặt phẳng ở dưới) đều trả về `null`; tuyệt đối không gán điểm $(0, 0, 0)$ hoặc tâm cốc giả tạo.
     - Hàm hoàn toàn độc lập với Three.js/DOM; cung cấp helper `rayFromThreeRay` để trích xuất dữ liệu số thực thuần túy.
  2. *Drag Offset và bảo toàn vị trí tại $t_0$ (`src/interactions/ManualStirController.ts`):*
     - Tại `pointerdown`: Chốt `activePointerId`, `captureGeneration`, và `planeY = currentPose.tipY`.
     - Thiết lập độ lệch kéo: $\vec{\Delta}_{drag} = \vec{r}_{rod, XZ} - \vec{p}_{plane, XZ}$.
     - Vị trí thìa tại $t_0$ được bảo toàn tuyệt đối: $|x - x_0| < 10^{-9}, |z - z_0| < 10^{-9}$ scene units, loại bỏ triệt để hiện tượng dịch chuyển đột ngột (teleportation/jump).
     - Con trỏ thứ hai không thể chiếm quyền điều khiển phiên kéo đang diễn ra (`params.pointerId !== activePointerId` bị từ chối).
  3. *Kẹp biên bán kính và xử lý góc tại tâm cốc:*
     - Tại `pointermove`: Áp dụng độ lệch trước khi kẹp: $\vec{p}_{cand} = \vec{p}_{plane} + \vec{\Delta}_{drag}$.
     - Kẹp xuyên tâm: Nếu $r = |\vec{p}_{cand}| > 0.74$, chiếu hướng tâm về bán kính cực đại $0.74$: $\vec{p} = \vec{p}_{cand} \times (0.74 / r)$. Tuyệt đối không kẹp riêng rẽ từng trục $x, z$ (không tạo hình vuông).
     - Tại tâm ($r < 10^{-6}$): Giữ nguyên góc $\theta$ hợp lệ trước đó, ngăn ngừa hiện tượng chia cho 0, NaN hoặc góc nhảy giật về 0.
  4. *Tính bất biến của `planeY` khi đáy cốc thay đổi:*
     - Mặt phẳng chiếu $planeY$ được chốt cố định theo `tipY` tại thời điểm `pointerdown` và không đổi trong suốt phiên kéo.
     - Nếu có thao tác thêm chất làm thay đổi độ cao đáy cốc, `tipY` của thìa vẫn cập nhật theo hình học mới nhưng mặt phẳng chiếu của tia chuột không bị nhảy giật.
  5. *Adapter và chính sách tích hợp engine (`src/interactions/ManualStirAdapter.ts`):*
     - Position-only: Trong V2-05, việc kéo thìa chỉ cập nhật tọa độ $(x, z, r, \theta)$, đặt $\omega_{rod} = 0 \implies \omega_{drive} = 0$, không tạo dòng xoáy giả tạo trước khi có bộ suy luận vận tốc V2-06.
     - Chính sách khi tạm dừng (Paused Policy): Khi `engine.getState().paused === true`, sự kiện di chuột `onPointerMove` bị từ chối và không gửi lệnh `manualSample` vào engine, bảo toàn trạng thái khoa học theo SCIENTIFIC_SPEC §6.
     - Chống lệnh cũ (Stale Generation): Khi engine reset hoặc chuyển thế hệ, `captureGeneration` cũ không thể gửi lệnh vào engine mới (`STALE_GENERATION`).
     - Tách biệt UI an toàn: Chưa bật trực tiếp tương tác kéo chuột trên `LaboratoryScene.tsx` để tránh xung đột gesture với `OrbitControls` khi chưa có cơ chế pointer capture và camera ownership của V2-07.
- **Bằng chứng kiểm thử `manualPosition.test.ts` (22 test cases):**
  - Ca 1: Tia thẳng đứng từ trên xuống giao mặt phẳng tại điểm chính xác theo giải tích.
  - Ca 2: Tia nghiêng với nghiệm giải tích độc lập: giao điểm $[1.9, 0.2, 2.1]$ tại $t = 1.8$.
  - Ca 3: Tia song song và gần song song ($|\hat{d}_y| < 10^{-5}$) bị từ chối nghiêm ngặt.
  - Ca 4: Giao điểm sau lưng tia ($t < 0$) bị từ chối.
  - Ca 5: NaN, Infinity, vector 0 trả về `null` an toàn.
  - Ca 6: Hai góc nhìn camera khác nhau hội tụ về cùng một điểm thế giới trên mặt phẳng.
  - Ca 7: Pointerdown bảo toàn vị trí ban đầu trong sai số $< 10^{-9}$ scene units (SC-J01).
  - Ca 8: Move áp drag offset trước khi kẹp bán kính.
  - Ca 9: Kẹp hình trụ tròn ngoài thành cốc ($r \le 0.74$), không bị lỗi hộp vuông.
  - Ca 10: Di chuyển về tâm cốc bảo tồn góc $\theta$, không sinh NaN hay divide-by-zero.
  - Ca 11: PointerId khác không thể can thiệp hoặc thay đổi phiên kéo (SC-J04).
  - Ca 12: Mẫu di chuyển không hợp lệ không làm mất độ lệch kéo (drag offset).
  - Ca 13: Mặt phẳng kéo `planeY` giữ nguyên khi `tipY` của engine thay đổi (SC-R04).
  - Ca 14: Kết thúc và reset phiên kéo xóa sạch offset cũ, phiên mới bắt đầu độc lập.
  - Ca 15: Cập nhật vị trí hợp lệ qua engine thật và tăng `stateVersion`.
  - Ca 16: Kéo vị trí thuần túy giữ nguyên $\omega_{rod} = 0, \omega_{drive} = 0, \omega_{flow} = 0$.
  - Ca 17: Generation cũ sau reset bị từ chối (SC-C05).
  - Ca 18: Di chuột khi đang pause không làm thay đổi vị trí khoa học theo policy.
  - Ca 19: Lệnh trùng hoặc không hợp lệ giữ nguyên trạng thái.
  - Ca 20: Chuyển từ manual sang auto giữ nguyên tính liên tục của vị trí tại $t_0$, sau đó bán kính mượt mà tiến về $0.4$ trong $0.25\text{ s}$ (SC-J01).
  - Ca 21: Kéo thìa qua 50 vị trí không làm thay đổi khối lượng, input ticks, hay dung tích đặt chỗ.
  - Ca 22: Helper `rayFromThreeRay` chuyển đổi chính xác cấu trúc tia 3D.
- **Kết quả nghiệm thu chất lượng:**
  - Vitest: **319/319 passed** across 15 test suites.
  - TypeScript (`tsc --noEmit`): exit 0.
  - ESLint (`eslint .`): exit 0.
  - Vite build: exit 0 (621 modules, 4.79s).
- Hoàn thành V3-05 (Transport hạt đại diện có bounds, private buffers, copyRenderFrame) và xác minh, kiểm chứng sai lệch numeric trong báo cáo V3-04 (COMPLETED_VERIFIED, 297/297 tests pass across 14 test suites).
- **Kết quả xác minh sai lệch numeric V3-04:**
  1. *Nguyên nhân:* Giống như trường hợp V3-03, sai lệch hoàn toàn là lỗi mô tả văn bản trong báo cáo tóm tắt (reporting discrepancy), không phải lỗi thuật toán runtime hay công thức tính toán:
     - Trong báo cáo tóm tắt V3-04, văn bản viết ca lắng đọng (Settling SC-O03) với $Od_0 = 10\text{ g}$, nhưng mã nguồn test `oil.test.ts` chạy Fixture L1 ($Ot = 18\text{ g}, Od_0 = 9\text{ g}$) nên ra $8.1435367623\text{ g}$ ($9 \times e^{-0.10}$). Nếu $Od_0 = 10\text{ g}$ thì $Od(1\text{ s}) = 10 \times e^{-0.10} \approx 9.0483741804\text{ g}$.
     - Trong ca phân tán khuấy tối đa (SC-O02), văn bản viết $Ot = 10\text{ g}, wf = 0.90$, trong khi mã test chạy $Ot = 18\text{ g}, W = 100\text{ g} \implies wf = 5/6 \approx 0.8333$ nên ra $6.0628768124\text{ g}$. Nếu $Ot = 10\text{ g}, wf = 0.90$ thì $kBreak = 0.45, kSeparate = 0.025, \lambda_O = 0.475, Od_{eq} = 180/19 \approx 9.4736842105\text{ g}$, và $Od(1\text{ s}) = \frac{180}{19}(1 - e^{-0.475}) \approx 3.5821415703\text{ g}$.
  2. *Hành động khắc phục:*
     - Bổ sung 2 test cases độc lập `2b` và `3b` trong `src/simulation/tests/oil.test.ts` kiểm chứng trực tiếp cả 2 trường hợp đúng với các thông số ghi trong báo cáo:
       * Test 2b: $I = 0, Od_0 = 10.0\text{ g} \implies Od(1\text{ s}) = 9.0483741804\text{ g}$ (sai số $< 10^{-6}\text{ g}$).
       * Test 3b: $I = 1.0, W = 100\text{ g}, Ot = 10.0\text{ g}, Od_0 = 0 \implies Od(1\text{ s}) = 3.5821415703\text{ g}$ (sai số $< 10^{-6}\text{ g}$).
     - Khẳng định mô hình `OilSeparation.ts` hoàn toàn chuẩn xác theo vi phân giải tích liên tục SC-O01…SC-O05.
- **Kiến trúc Transport hạt đại diện V3-05 (`src/simulation/models/ParticleTransport.ts`):**
  1. *Nguyên lý thiết kế khoa học:*
     - Khối lượng pha trên scalar ledger là nguồn chân lý duy nhất (sole source of truth). Số lượng hạt hiển thị ($N$) và vị trí các hạt tuyệt đối không sinh ra hoặc thay đổi khối lượng khoa học (SC-P01, SC-B02).
     - Quỹ đạo vật lý vô hướng của hệ thống ($W, Gd, Gu, Sb, Ss, Ol, Od, \omega_{flow}$) hoàn toàn đồng nhất khi $N = 10$, $N = 100$ hay $N = 700$.
  2. *5 particle pools độc lập:*
     - `sugarBed`: hạt đường nằm trong vùng đáy kết tủa (`region: bed`, $M = Gu_{bed} = Gu \times (1 - f_{Gu})$).
     - `sugarSusp`: hạt đường lơ lửng trong vùng dung dịch nước (`region: aqueous`, $M = Gu_{susp} = Gu \times f_{Gu}$).
     - `sandBed`: hạt cát lắng đọng ở đáy (`region: bed`, $M = Sb$).
     - `sandSusp`: hạt cát lơ lửng trong chất lỏng (`region: aqueous` trong mixed/water-only hoặc `region: oil` trong oil-only, $M = Ss$).
     - `oilDroplet`: giọt dầu phân tán trong pha nước (`region: aqueous`, $M = Od$). Dầu lớp $Ol$ không dùng hạt đại diện mà được thể hiện bằng khối hình học lớp lỏng.
  3. *Bộ băm không trạng thái `hash32`:*
     - Triển khai 32-bit FNV-1a kết hợp MurmurHash3 finalizer deterministic không dựa vào RNG hay Math.random.
     - Khởi tạo vị trí hạt trong vùng hình trụ bằng sampling phân bố thể tích đều (bán kính $\sqrt{u} \cdot R_{eff}$, góc $2\pi v$, độ cao $Y_{min} + w \cdot H$).
     - Mỗi hạt giữ một `birthOrdinal` duy nhất; khi điều chỉnh khối lượng/reconcile, các hạt hiện hữu được giữ nguyên vị trí và vận tốc (không co giãn affine giả tạo), chỉ reweight trọng số $w_i = M_{phase} / N$.
  4. *Trường động học và tích phân vận tốc:*
     - Thành phần xoáy ngang: vận tốc tiếp tuyến $v_{swirl} = 0.25 \cdot \omega_{flow} \cdot (-z, x) \cdot \text{falloff}(r)$ với độ suy giảm theo bán kính.
     - Thành phần thẳng đứng: nhiễu loạn hỗn loạn $0.1 \cdot I \cdot v_{turb}$, kết hợp vận tốc chìm lắng tự nhiên ($v_{settle} = 0.08$ trong nước, $0.03$ trong dầu cho hạt rắn) hoặc vận tốc nổi tự nhiên ($v_{rise} = 0.06$ cho giọt dầu).
     - Cản nhớt: hồi quy số mũ vận tốc hướng về trường dòng cục bộ với $k_{drag} = 4.0\text{ s}^{-1}$ theo $(1 - e^{-k_{drag} \cdot h})$.
  5. *Ràng buộc biên hình học và phản xạ vận tốc:*
     - Ràng buộc xuyên tâm thành cốc: nếu $r > R - r_{eff}$, kẹp vị trí về bán kính biên, bảo toàn vận tốc tiếp tuyến $v_\theta$ và triệt tiêu vận tốc pháp tuyến hướng ra ngoài ($v_r = \min(0, v_r)$).
     - Ràng buộc đáy/mặt thoáng: kẹp trong $[Y_{min} + r_{eff}, Y_{max} - r_{eff}]$, triệt tiêu vận tốc hướng ra ngoài.
     - Xử lý vùng mỏng ($H < 2 \cdot r_0$): tự động co bán kính hiệu dụng $r_{eff} = H / 2$ và kẹp hạt vào mặt phẳng chính giữa $Y$, ngăn ngừa tuyệt đối hiện tượng hạt nổi ra ngoài thể tích mỏng (như lớp cát 10g cao $0.0252\text{ m} < 2 \cdot 0.023\text{ m}$).
  6. *Ngưỡng ẩn trực quan $0.001\text{ g}$:*
     - Khi $M_{phase} < 0.001\text{ g}$, đặt `activeCount = 0` để ẩn trực quan, trong khi khối lượng vi lượng trong mass ledger vẫn được bảo toàn nguyên vẹn.
  7. *Cách ly bộ nhớ và hợp đồng `copyRenderFrame`:*
     - Engine sở hữu các `Float32Array` private (`positions`, `velocities`, `weights`, `radii`, `birthOrdinals`).
     - Giao diện `copyRenderFrame(target)` sao chép nguyên tử dữ liệu sang buffer do caller cấp phát, kiểm tra nghiêm ngặt chống aliasing (không trùng buffer với engine) và xác minh việc caller mutate buffer trả về tuyệt đối không làm biến đổi trạng thái nội bộ của engine.
- **Bằng chứng kiểm thử `transport.test.ts` (20 test cases):**
  - Ca 1: $N=10, 100, 700$ cho kết quả scalar physics trajectory hoàn toàn đồng nhất sau 120 ticks ($< 10^{-12}\text{ g}$).
  - Ca 2: Deterministic replay: cùng lệnh, tick, seed cho chính xác từng bit buffer vị trí.
  - Ca 3: Retained birthOrdinal: thay đổi budget hoặc reweighting không làm nhảy seed/ordinal của các hạt cũ.
  - Ca 4: Command idempotency: gọi getRenderFrame lặp lại không làm biến đổi physics.
  - Ca 5: Phân bổ đúng 5 pool tương ứng với các pha vật chất.
  - Ca 6: Zero bounds: khi vùng rỗng hoặc mass $= 0$, activeCount $= 0$, không sinh NaN.
  - Ca 7: Radial và axial bounds clamp triệt tiêu vận tốc pháp tuyến hướng ra ngoài và bảo toàn vận tốc tiếp tuyến.
  - Ca 8: Tổng trọng số hạt khớp chính xác khối lượng từng pha trên ledger ($\sum w_i = M_{phase}$).
  - Ca 9: Dissolution reweighting: hạt đường tan giảm trọng số $w_i$, không kéo giãn tọa độ.
  - Ca 10: Sand suspension & sedimentation: hạt cát được nâng lơ lửng khi khuấy và chìm xuống đáy khi dừng.
  - Ca 11: Oil droplets transport: giọt dầu lơ lửng trong aqueous và nổi lên mặt thoáng khi ngừng khuấy.
  - Ca 12: Thêm chất khi đang pause không làm dịch chuyển hạt ngoài ràng buộc chiếu.
  - Ca 13: Pause đóng băng hoàn toàn vị trí và vận tốc hạt.
  - Ca 14: Reset đưa toàn bộ activeCount về 0; duplicate reset an toàn.
  - Ca 15: Mutate caller buffer không ảnh hưởng đến engine internal state.
  - Ca 16: Phát hiện và từ chối buffer aliasing khi target trỏ vào private buffer của engine.
  - Ca 17: Kiểm tra an toàn khi target buffer có kích thước không đủ.
  - Ca 18: Độ ổn định 36,000 continuous ticks (600 giây mô phỏng) trên hỗn hợp mixed fixture: mọi tọa độ luôn hữu hạn và nằm nghiêm ngặt trong bounds cốc.
  - Ca 19: Tính tương thích timestep: $h = 1/60\text{ s}$ và $h = 1/120\text{ s}$ hội tụ sai số vị trí trung bình $< 0.005\text{ m}$.
  - Ca 20: Hệ dầu đơn (oil-only): hạt rắn $Sb, Ss$ nằm trọn vẹn trong vùng dầu $L1$.
- **Kết quả nghiệm thu chất lượng:**
  - Vitest: **297/297 passed** across 14 test suites.
  - TypeScript (`tsc --noEmit`): exit 0.
  - ESLint (`eslint .`): exit 0.
  - Vite build: exit 0 (618 modules, 4.57s).
- **Kết quả xác minh sai lệch numeric V3-03:**
  1. *Nguyên nhân:* Lỗi hoàn toàn nằm ở khâu ghi chép tài liệu / bảng báo cáo lượt trước (reporting discrepancy), KHÔNG phải lỗi thuật toán runtime hay công thức trong source code:
     - Giá trị $Ss(1.0\text{ s}) = 8.607079764\text{ g}$ trong nước và $9.417645336\text{ g}$ trong dầu là kết quả chính xác của quá trình **LẮNG ĐỌNG** (Settling: $I = 0$, $Ss_0 = 10\text{ g}$) theo công thức $10 \times e^{-0.15}$ và $10 \times e^{-0.06}$.
     - Tuy nhiên, tiêu đề bảng báo cáo lượt trước ghi nhầm điều kiện ban đầu thành quá trình nâng cát ($I = 1.0, Sb_0 = 10\text{ g}, Ss_0 = 0\text{ g}$).
  2. *Giá trị nâng cát (Lifting) lý thuyết chuẩn theo SCIENTIFIC_SPEC §5.3:*
     - Trong nước ($W = 100\text{ ml}, I = 1.0, St = 10\text{ g}, Ss_0 = 0$): $kLift = 0.6$, $kSettle = 0.15 / 3 = 0.05$, $\lambda = 0.65\text{ s}^{-1}$, $Ss_{eq} = 10 \times (0.6 / 0.65) = 120/13 \approx 9.2307692308\text{ g}$.
       $$Ss(1.0\text{ s}) = \frac{120}{13} \times (1 - e^{-0.65}) \approx 4.4118851376\text{ g}$$
     - Trong dầu ($W = 0, Ot = 90\text{ g} = 100\text{ ml}, I = 1.0, St = 10\text{ g}, Ss_0 = 0$): $kLift = 0.6$, $kSettle = 0.06 / 3 = 0.02$, $\lambda = 0.62\text{ s}^{-1}$, $Ss_{eq} = 10 \times (0.6 / 0.62) = 300/31 \approx 9.6774193548\text{ g}$.
       $$Ss(1.0\text{ s}) = \frac{300}{31} \times (1 - e^{-0.62}) \approx 4.4715054426\text{ g}$$
     - Tỷ lệ lơ lửng đường rắn $f_{Gu}$ trong nước ($Gu = 10\text{ g}, f_{Gu,0} = 0, I = 1.0$):
       $$f_{Gu}(1.0\text{ s}) = \frac{12}{13} \times (1 - e^{-0.65}) \approx 0.4411885138$$
  3. *Hành động đã khắc phục:*
     - Bổ sung 3 test cases độc lập `1b`, `2b`, `9b` trong `src/simulation/tests/sand.test.ts` kiểm chứng trực tiếp cả 3 trường hợp Lifting tại $t = 1.0\text{ s}$ với sai số $< 10^{-6}\text{ g}$.
     - Sửa rõ tiêu đề test `1` và `2` thành `(Settling)` để phân định dứt khoát giữa hai trường hợp.
  4. *Kiểm tra độ choán chỗ $0.60 \times Ss$ trong phân vùng cốc:*
     - Kiểm toán mã nguồn `src/simulation/constants/beaker.ts` xác nhận hàm `computeBeakerRegions`:
       * $V_{aqueous} = W_{ml} + 0.65 Gd + 0.65 GuSusp + 0.60 Ss$ (trong water-only và mixed).
       * $V_{oil} = O_{ml} + 0.65 GuSusp + 0.60 Ss$ (trong oil-only).
       * Mã nguồn đã chứa đầy đủ thành phần $0.60 \times Ss$ từ V1-05; chỉ có đoạn tóm tắt markdown ở báo cáo trước viết vắn tắt $V_{aq}$.
  5. *Đánh giá ngưỡng dry gate $10^{-9}\text{ ml}$:*
     - Ngưỡng $totalLiquidMl \le 10^{-9}$ là chốt bảo vệ số học chống sai số làm tròn số thực dương khi $W = 0$ và $Ot = 0$. Vì lượng thêm tối thiểu của người dùng là $1\text{ deciTick} = 0.1\text{ ml}$ ($0.1\text{ ml} \gg 10^{-9}\text{ ml}$), ngưỡng này tuyệt đối không làm thay đổi ngữ nghĩa vật lý của bất kỳ thao tác thêm chất hợp lệ nào.
- **Mô hình động học dầu droplets và separation V3-04 (`src/simulation/models/OilSeparation.ts`):**
  + Tỷ lệ thể tích chất mang: $W_{ml} = W$, $O_{ml} = Ot / 0.9$ (sử dụng tổng khối lượng dầu $Ot$, không dùng riêng $Ol$). $waterFraction = W_{ml} / (W_{ml} + O_{ml})$ khi có cả nước và dầu.
  + Cổng pha dầu: Nếu $W_{ml} = 0$ hoặc $Ot = 0 \implies Od_{next} = 0, Ol_{next} = Ot$. Dầu không thể phân tán thành giọt trong không khí khô hoặc trong hệ dầu đơn không nước. Mọi giọt dầu tồn dư (nếu có) sẽ tự động hồi nhập vào pha lớp $Ol$.
  + Tốc độ phân tán và tách lớp (SCIENTIFIC_SPEC §5.4):
    * $kBreak = 0.5 \times I^2 \times waterFraction$
    * $kSeparate = 0.10 / (1 + 3 \times I)$
    * $\lambda_O = kBreak + kSeparate$
    * $Od_{eq} = Ot \times (kBreak / \lambda_O)$
    * $Od_{next} = Od_{eq} + (Od - Od_{eq}) \times \exp(-\lambda_O \cdot h)$
    * $Ol_{next} = Ot - Od_{next}$
  + Chuyển pha nguyên tử qua `applyPairedTransfer` với `oil_dispersion` ($Ol \to Od$) và `oil_separation` ($Od \to Ol$). Dầu không bao giờ tan trong nước ($Od$ là pha phân tán cơ học, không phải dissolved oil).
  + Nghiệm giải tích oracle tại $1.0\text{ s}$ ($60\text{ ticks}$ at $h = 1/60\text{ s}$, $W = 100\text{ ml}, O = 20\text{ ml}, Ot = 18\text{ g}$):
    * Nghỉ khuấy ($I = 0, Od_0 = 9\text{ g}$): $kBreak = 0, kSeparate = 0.10, \lambda_O = 0.10\text{ s}^{-1}$.
      $$Od(1.0\text{ s}) = 9 \times e^{-0.10} \approx 8.1435367623\text{ g}$$
    * Khuấy tối đa ($I = 1.0, Od_0 = 0\text{ g}$): $wf = 5/6, kBreak = 5/12, kSeparate = 0.025, \lambda_O = 53/120\text{ s}^{-1}, Od_{eq} \approx 16.9811320755\text{ g}$.
      $$Od(1.0\text{ s}) = Od_{eq} \times (1 - e^{-53/120}) \approx 6.0628768124\text{ g}$$
- **Kiểm soát thể tích phân vùng cốc và chống double-counting (SC-R03 / SPEC §4):**
  + Trong hệ mixed: giọt dầu phân tán $Od$ nằm hoàn toàn trong phân vùng aqueous ($V_{aqueous} = W_{ml} + 0.65 Gd + 0.65 GuSusp + 0.60 Ss + Od/0.9$).
  + Lớp dầu nổi trên cùng chỉ chiếm thể tích của lớp $Ol$ ($V_{oil} = Ol / 0.9$).
  + Fixture L0 ($Ol = 18\text{ g}, Od = 0$): $V_{bed} = 0, V_{aq} = 100\text{ ml}, V_{oil} = 20\text{ ml}$, tổng $120\text{ ml}$.
  + Fixture L1 ($Ol = 9\text{ g}, Od = 9\text{ g}$): $V_{bed} = 0, V_{aq} = 110\text{ ml}, V_{oil} = 10\text{ ml}$, tổng $120\text{ ml}$.
  + Tổng dung tích luôn bằng tổng reservation từ đầu vào deciTicks.
- **Tích hợp giao diện `ContentsPanel.tsx`:**
  + Khi $Ot > 0$, hiển thị phân vùng pha dầu: "Tổng lượng dầu (Ot)", "Dầu thành lớp (Ol)", "Dầu phân tán (Od)" sử dụng `formatPhaseMass`. Tuyệt đối không dùng "Dầu đã tan".
- **Bằng chứng kiểm thử:**
  + 23 test cases trong `src/simulation/tests/oil.test.ts` (10 pure model unit tests, 13 engine integration tests).
  + Chạy 3,600 ticks liên tục kiểm tra invariants tại mọi tick: max error $< 10^{-11}\text{ g}$.
  + Độc lập 30, 60, 120 FPS: sai số $< 10^{-6}\text{ g}$.
- **Kết quả kiểm chứng:**
  + Vitest: 275/275 tests pass across 13 suites.
  + TypeScript (`tsc --noEmit`): exit 0.
  + ESLint (`eslint .`): exit 0.
  + Vite build: exit 0 (dist/ 617 modules, 4.68s).

## Triển khai V3-03 — 2026-10-17
- Hoàn thành V3-03 (Cát suspension và sedimentation, động học fGu) với đầy đủ bằng chứng kiểm thử (COMPLETED_VERIFIED).
- Mô hình phân vùng chất mang và động học lơ lửng/lắng đọng cát (`src/simulation/models/SandSuspension.ts`):
  + Cổng chất lỏng & tỷ lệ thể tích chất mang (Carrier fractions, SCIENTIFIC_SPEC §4.2, §5.3):
    * Thể tích nước: $W_{ml} = W$ (vì $\rho_W = 1.0\text{ g/ml}$).
    * Thể tích dầu: $O_{ml} = Ot / 0.9$ (vì $\rho_O = 0.9\text{ g/ml}$).
    * Tổng thể tích chất mang lỏng: $carrierTotal = W_{ml} + O_{ml}$.
    * Tỷ lệ nước trong chất mang: $waterFraction = W_{ml} / carrierTotal$ khi $carrierTotal > 0$, ngược lại $0$.
    * Điều kiện khô ($carrierTotal \le 10^{-9}$): không có chất lỏng để duy trì lơ lửng; cát lơ lửng $Ss = 0$, toàn bộ cát nằm ở đáy $Sb = St$, tỷ lệ lơ lửng đường rắn $f_{Gu} = 0$.
  + Hằng số động học giáo khoa (`src/simulation/constants/science.ts`):
    * $kLiftMax = 0.6\text{ s}^{-1}$ (`SAND_LIFT_MAX`).
    * $kSettleWater = 0.15\text{ s}^{-1}$ (`SAND_SETTLE_WATER`).
    * $kSettleOil = 0.06\text{ s}^{-1}$ (`SAND_SETTLE_OIL`).
  + Tốc độ nâng và lắng:
    * $kLift = kLiftMax \times I^2 = 0.6 \times I^2$ (với flow intensity $I \in [0, 1]$).
    * $kSettleBase = 0.15 \times waterFraction + 0.06 \times (1 - waterFraction)$.
    * $kSettle = kSettleBase / (1 + 2I)$ (dòng chảy mạnh làm giảm tốc độ lắng).
    * $\lambda = kLift + kSettle$.
  + Động học trao đổi pha cát ($Sb \leftrightarrow Ss$):
    * Cát KHÔNG bao giờ tan ($Sd = 0$, không có trường dissolved sand).
    * Cân bằng tiệm cận: $SsEq = St \times (kLift / \lambda)$.
    * Chuyển pha số học liên tục: $SsNext = SsEq + (Ss - SsEq) \times \exp(-\lambda \cdot h)$ với $-Math.expm1(-\lambda \cdot h)$.
    * Áp dụng nguyên tử qua V3-01 `applyPairedTransfer`: nếu $SsNext > Ss \implies$ transfer `sand_suspension` ($Sb \to Ss$); nếu $SsNext < Ss \implies$ transfer `sand_sedimentation` ($Ss \to Sb$); bảo toàn $Sb + Ss = St$ chính xác tuyệt đối.
  + Động học tỷ lệ lơ lửng đường rắn $f_{Gu}$:
    * Phương trình vi phân: $df_{Gu}/dt = kLift \times (1 - f_{Gu}) - kSettle \times f_{Gu}$.
    * Cân bằng: $f_{Gu,eq} = kLift / \lambda$.
    * Cập nhật bước $h$: $f_{Gu,next} = f_{Gu,eq} + (f_{Gu} - f_{Gu,eq}) \times \exp(-\lambda \cdot h)$.
    * Bị kẹp chặt $f_{Gu} \in [0, 1]$; khi $Gu = 0$ hoặc hệ khô $\implies f_{Gu} = 0$.
    * Pha loãng $f_{Gu}$ khi thêm đường rắn: $f_{Gu,new} = f_{Gu,old} \times (Gu_{old} / (Gu_{old} + \Delta Gu))$.
  + Nghiệm giải tích độc lập:
    * `computeAnalyticSandSuspension(t, St, initialSs, I, wf)` và `computeAnalyticFGu(t, initialFGu, I, wf)` làm oracle độc lập tại thời điểm $t \ge 0$ dưới flow $I$ cố định.
    * Khớp tuyệt đối với SCIENTIFIC_SPEC §5.3 tại $t = 1.0\text{ s}$ ($60\text{ ticks}$ at $h = 1/60\text{ s}$, $St = 10\text{ g}$, initial $Ss = 0$, $I = 1.0$):
      - Trong nước ($W = 100\text{ ml}$): $\lambda = 0.65\text{ s}^{-1}$, $SsEq = 120/13 \approx 9.230769231\text{ g}$, $Ss(1\text{ s}) = 8.607079764\text{ g}$ (sai số $< 10^{-6}\text{ g}$).
      - Trong dầu ($Ot = 90\text{ g} = 100\text{ ml}$): $\lambda = 0.62\text{ s}^{-1}$, $SsEq = 300/31 \approx 9.677419355\text{ g}$, $Ss(1\text{ s}) = 9.417645336\text{ g}$ (sai số $< 10^{-6}\text{ g}$).
- Tích hợp Engine Headless (`src/simulation/core/HeadlessSimulationEngine.ts`):
  + Trình tự trong `stepFixedTick`:
    1. `AutoStirController.step` (nếu auto).
    2. Phân vùng chất lỏng và tiếp xúc thìa (`computeBeakerRegions`, `computeMechanicalContact`).
    3. `stepStirringFlow` tính $\omega_{drive}, \omega_{flow}, I$.
    4. `stepDissolution` tính hòa tan đường khả dụng $Gu \to Gd$.
    5. `stepSandSuspension` tính trao đổi cát $Sb \leftrightarrow Ss$ và cập nhật $f_{Gu}$ theo flow intensity $I$.
    6. `recalculateGeometryAndConstraints()` cập nhật phân vùng cốc và cao độ mũi thìa $tipY$ theo khối lượng lớp đáy thực tế ($0.65 GuBed + 0.60 Sb$).
    7. Tăng tick/time/version và kiểm định toàn diện 8 bất biến bảo toàn khối lượng (`assertMassInvariants`).
- Tích hợp 3D Scene (`src/scene/LaboratoryScene.tsx`):
  + Đáy cốc thích ứng: lượng hạt đường ở đáy truyền $GuBed = Gu \times (1 - f_{Gu})$, cát ở đáy dùng $Sb$.
  + Thể tích lớp đáy $V_{bed} = 0.65 \times GuBed + 0.60 \times Sb$, thể tích aqueous $V_{aq} = W + 0.65 \times Gd + 0.65 \times GuSusp$.
  + Xác nhận giới hạn: Lớp hạt 3D hiện tại phản chiếu lượng lắng đáy $Sb$ và $GuBed$; mô hình chuyển động các hạt lơ lửng trong không gian 3D thuộc phạm vi V3-05 (Particle transport / render buffers) và V4-02 (Full phase rendering).
- Bằng chứng kiểm thử tự động toàn diện (`src/simulation/tests/sand.test.ts` - 26 test cases):
  + 1-4: Nghiệm giải tích nước ($Ss(1\text{ s}) \approx 8.607079764\text{ g}$) và dầu ($Ss(1\text{ s}) \approx 9.417645336\text{ g}$); $f_{Gu}$ giải tích tại 1s trong nước và dầu.
  + 5-8: Lắng đọng khi ngừng khuấy ($I = 0$); hỗn hợp nước + dầu nội suy tuyến tính $kSettleBase$; hệ khô ($W = 0, Ot = 0$) ép $Ss = 0, f_{Gu} = 0$; cát không tan ($Sd = 0$).
  + 9-11: Pha loãng $f_{Gu}$ khi thêm đường lúc tạm dừng; Fixture O (Oil-only SPEC §4.1) bảo toàn ranh giới đáy $0.120$, bedTop $0.13008$, aqTop $0.13008$, oilTop $0.56520$, tipY $0.15008$; tính độc lập timestep $h = 1/60$ vs $h = 1/120$.
  + 12-16: Tích hợp engine fixed step: auto khuấy nâng cát và $f_{Gu}$; stop auto dòng suy giảm và cát lắng dần; pause đóng băng timeline/mass; resume tiếp tục mượt mà; reset đưa $Sb = 0, Ss = 0, f_{Gu} = 0$.
  + 17-21: Thêm cát khi đang chạy phân bổ vào $Sb$; thêm đường khi đang khuấy pha loãng $f_{Gu}$ đúng công thức; tính độc lập frame rate $30/60/120\text{ FPS}$ (sai số $< 10^{-6}\text{ g}$); snapshot phản ánh trung thực $Sb, Ss, f_{Gu}$; mũi thìa thích ứng theo độ cao lớp đáy cát.
  + 22-26: Thử nghiệm bền vững (robustness): zero/tiny addition, độ bền số học 3600 ticks liên tục với sai số bảo toàn khối lượng cực đại $< 10^{-11}\text{ g}$, an toàn khi inputs âm/NaN/Infinity, tính độc lập giữa 2 engine instances song song.
- Kết quả kiểm chứng thực tế:
  + Vitest: 249/249 tests pass across 12 test suites.
  + TypeScript (`tsc --noEmit`): exit 0.
  + ESLint (`eslint .`): exit 0.
  + Vite build: exit 0 (dist/ 616 modules).

## Hiệu chỉnh V2-11 — 2026-10-17
- Hoàn thành hiệu chỉnh toàn diện V2-11 (Nghiệm thu lát cắt nước–đường chạy thật) về tính đúng đắn khoa học, hiển thị UX/UI và các kịch bản nghiệm thu (PARTIAL - Core calibrated & verified 223/223 tests, Browser QA pending).
- Làm rõ và khắc phục 5 điểm mấu chốt:
  1. **Visual hide vs $Gu = 0$ (A):**
     * Ngưỡng $Gu < 0.001\text{ g}$ chỉ là ngưỡng ẩn trực quan của 3D ParticleRenderer (`ParticleRenderer.tsx` trả về `null`).
     * Ledger và ScalarSnapshot bảo lưu chính xác phần dư số thực dương nhỏ ($10^{-11}\text{ g}$), không bao giờ snap về 0.
     * Hàm định dạng `formatPhaseMass`: mọi số thực dương $< 0.1\text{ g}$ định dạng nghiêm ngặt là `"<0,1 g"`, tuyệt đối không làm tròn thành `"0 g"`. Chỉ khi $Gu = 0$ chính xác mới hiển thị `"0 g"`.
     * Nhãn "Đã tan hoàn toàn" chỉ xuất hiện khi $Gu = 0$ tuyệt đối (fixture khởi tạo hoặc dung dịch không còn đường rắn). Trong mô phỏng thời gian hữu hạn liên tục ($e^{-kt}$), lượng đường dư nhỏ $\le L(Gt) = \max(0.01\text{ g}, 0.01 \times Gt)$ được phân loại chính xác là "Đã tan gần hết" (near complete).
  2. **Tiến độ hòa tan vs Mục tiêu có thể tan (B):**
     * Tiến độ hòa tan $\text{progress} = Gd / \min(Gt, \text{capacityG})$ đo lường tiến độ của *lượng có thể tan*.
     * Không dùng điều kiện $Gu > 0$ để chặn tiến độ ở mức 99,9%! Trong hỗn hợp bão hòa có đường dư (ví dụ $W = 10\text{ ml}, Gt = 30\text{ g}, \text{capacityG} = 20\text{ g}$), $Gu$ luôn duy trì $\ge 10\text{ g}$, nhưng tiến độ của lượng có thể tan (20g) phải đạt 100% khi $Gd = 20\text{ g}$.
     * Chống làm tròn sớm lên 100% bằng cách kiểm tra dung sai còn lại (headroom): $\text{headroom} = \max(0, \min(Gt, \text{capacityG}) - Gd)$. Khi $\text{headroom} > 10^{-8}$ và phần trăm thô $\ge 99.95\%$, hiển thị bị chặn ở `"99,9%"`. Khi $\text{headroom} \le 10^{-8}$, hiển thị `"100%"`.
     * Giao diện `ContentsPanel.tsx` đổi nhãn thành "Tiến độ lượng có thể tan", đồng thời hiển thị tách biệt rõ ràng $Gt$ (Tổng lượng đường đã thêm), $Gd$ (Đường đã tan), $Gu$ (Đường rắn còn lại).
  3. **Bão hòa & Thời điểm nghiệm thu (C):**
     * Hysteresis gần bão hòa: vào khi $\text{saturationRatio} \ge 0.99$, ra khi $< 0.98$.
     * Tách biệt rành mạch hai huy hiệu: "Đạt giới hạn hòa tan (trong sai số)" (chỉ khi $\text{gap} = \text{capacityG} - Gd \le \epsilon$) và "Gần bão hòa" (khi $!isSaturated\ \&\&\ hysteresis.nearSaturation$).
     * Mô phỏng động học liên tục $e^{-kt}$ không đạt cân bằng số học tuyệt đối tại giây tùy ý ở thời gian hữu hạn nếu không có snap giải tích; test assertions không ép buộc đẳng thức $Gu = 0$ hay $Gd = \text{capacityG}$ tại finite time.
  4. **Đơn vị & Mô tả hằng số $S_0$ (D):**
     * $S_0 = 2.0\text{ g đường / g nước}$ (`g/g-water`), $\text{capacityG} = S_0 \times W$.
     * Với $\rho_W = 1.0\text{ g/ml}$, $1\text{ ml}$ nước tương đương $1\text{ g}$ nước.
     * Loại bỏ khẳng định thực nghiệm "ở 20°C" trong claims/labels vì MVP chưa mô phỏng nhiệt độ. Ghi rõ đây là mô hình giáo khoa mặc định (teaching model default).
  5. **Chính sách nút thao tác khuấy tự động (E):**
     * Kiểm toán source `ControlPanel.tsx`: nút "Bắt đầu khuấy tự động" có `disabled={!showRod}`. Nút KHÔNG bị disable khi paused.
     * Khi gọi `startAuto` từ trạng thái paused, `SimulationBridge.startAuto()` tự động gọi `this.resume()`, khởi động scheduler và chuyển sang mode auto mượt mà.
     * Xác nhận việc báo cáo trước ghi "disabled khi tạm dừng" là sai lệch tài liệu (doc discrepancy), mã nguồn thực tế đã hoạt động đúng thiết kế.
- Bằng chứng kiểm thử tự động toàn diện (`src/simulation/tests/sliceWaterSugar.test.ts` - 15 test cases độc lập):
  1. $Gu > 0$ và $< 0.001\text{ g}$: hạt 3D ẩn trực quan, ledger bảo lưu chính xác phần dư.
  2. Số dương nhỏ $Gu$: `formatPhaseMass` xuất `"<0,1 g"`, không bao giờ xuất `"0 g"`.
  3. Nhãn "Đã tan gần hết" không đồng nghĩa với $Gu = 0$.
  4. Fixture $Gu = 0$ cho trạng thái tan hoàn toàn: nhãn "Đã tan hoàn toàn" và tiến độ 100%.
  5. $Gt = 0$ (có nước, chưa có đường): không có nhãn tan hoàn thành hay bão hòa, giải thích rõ "chưa thêm đường".
  6. Hỗn hợp bão hòa ($W=10, Gt=30$): tiến độ đo trên 20g đích, đạt 100% khi headroom = 0 dù $Gu = 10\text{ g}$.
  7. $W = 0 \implies$ sức chứa, độ bão hòa, tiến độ đều là `"N/A"`.
  8. Hysteresis gần bão hòa hai chiều ($\ge 0.99$ vào, $< 0.98$ ra).
  9. Nhãn "Đạt giới hạn hòa tan (trong sai số)" tách biệt hoàn toàn với "Gần bão hòa".
  10. Sức chứa co giãn động theo nước thật ($S_0 \times W$) và không tăng khi thêm dầu.
  11. Thêm nước khi tạm dừng bảo toàn $Gd$ và elapsed time, nhân đôi sức chứa, cập nhật tỷ lệ bão hòa.
  12. Làm mới cốc (reset) xóa sạch hysteresis cũ và đưa state về baseline rỗng.
  13. Chuỗi thao tác auto khớp chính sách nút (resume khi auto từ pause, guard `showRod`).
  14. Mô phỏng thời gian hữu hạn không yêu cầu $Gu = 0$ hay $Gd = \text{capacityG}$ tuyệt đối.
  15. UC1 standard smoke test ($W = 40\text{ ml} + G = 100\text{ g}$, sức chứa 80g, dư 20g).
- Kết quả kiểm chứng thực tế:
  * Vitest: 223/223 tests pass across 11 test suites.
  * TypeScript (`tsc --noEmit`): exit 0.
  * ESLint (`eslint .`): exit 0.
  * Vite build: exit 0 (dist/ 615 modules, 6.08s).

## Triển khai V2-11 — 2026-10-17
- Hoàn thành V2-11 (Nghiệm thu lát cắt nước–đường chạy thật) phần Core và kiểm chứng qua automated integration suite (PARTIAL - Core verified 220/220 tests, Browser QA pending).
- Kiến trúc luồng dữ liệu thông suốt (End-to-End Data Flow):
  + Đường truyền dữ liệu chuẩn hóa: `Engine -> Bridge -> Store -> UI (ContentsPanel) & 3D Scene (LaboratoryScene + ParticleRenderer)`.
  + `ScalarSnapshot`: Bổ sung trường `fGu: number` đại diện tỷ lệ lơ lửng của đường chưa tan, deep-freeze detached clone bảo đảm tính bất biến.
  + `LaboratoryScene.tsx`: Đọc trực tiếp `snapshot.mass` và `snapshot.fGu` để dựng `PhaseMasses`, truyền vào `computeBeakerRegions(phases)` thích ứng động:
    * Chiều cao lớp đường rắn ở đáy cốc co lại theo thời gian thực khi $Gu$ giảm do hòa tan.
    * Thể tích dung dịch nước mở rộng chính xác theo định luật thể tích: $V_{aq} = W + 0.65 \times Gd$.
    * Đáy đặt thìa `rod.tipY` thích ứng hạ thấp dần theo độ cao lớp đường rắn.
  + `ParticleRenderer.tsx`:
    * Cố định cấp phát bộ đệm GPU InstancedMesh: `<instancedMesh args={[undefined, undefined, 700]}>`, cập nhật số lượng hiển thị thực tế qua `ref.current.count = count`, loại bỏ hoàn toàn việc hủy và tạo lại buffer GPU trên từng tick.
    * Áp dụng ngưỡng ẩn trực quan chuẩn SPEC §8: Khi $Gu < 0.001\text{ g}$, component trả về `null` (ẩn toàn bộ 700 instances và cylinder đáy), trong khi ledger vẫn giữ nguyên phần dư khối lượng thực tế.
- Khắc phục triệt để các phản hồi kiểm toán từ V3-02:
  + Trong `src/simulation/models/MassLedger.ts`: Bỏ hoàn toàn cơ chế snap residual mass khi $Gu \le 10^{-9}\text{ g}$. Chỉ đặt $f_{Gu} = 0$ khi $Gu = 0$ tuyệt đối. Mọi phần dư dương nhỏ ($10^{-11}\text{ g}$) được bảo lưu nguyên vẹn trong ledger và tiếp tục tham gia hòa tan theo tỷ lệ.
  + Trong `src/simulation/constants/science.ts`: Làm rõ $S_0 = 2.0\text{ g/ml}$ là mô hình giáo khoa giả định tại 20°C (teaching model default), không phải hằng số thực nghiệm đã hiệu chuẩn.
  + Sử dụng nghiệm giải tích và công thức độc lập trong oracles kiểm thử thay vì dùng lại helper sản xuất cho cả hai vế actual và expected.
- Giao diện kết quả khoa học `ContentsPanel.tsx` & `contentsHelpers.ts`:
  + Hiển thị đầy đủ phân vùng pha: Nước ($W$), Đường đã tan ($Gd$), Đường chưa tan ($Gu$), Sức chứa dung môi ($S_0 \cdot W$), Độ bão hòa ($Gd / \text{capacityG}$), và Tiến độ hòa tan ($Gd / \min(Gt, \text{capacityG})$).
  + Định dạng nhất quán: Khối lượng $< 0.1\text{ g}$ hiển thị `"<0,1 g"`, chính xác $0$ hiển thị `"0 g"`, số thực dùng dấu phẩy tiếng Việt.
  + Sức chứa và độ bão hòa hiển thị `"N/A"` khi không có nước ($W = 0$).
  + Tiến độ hòa tan: Bị chặn tối đa `"99,9%"` khi vẫn còn đường rắn chưa tan ($Gu > 0$ và progress $\ge 99.95\%$), chỉ hiển thị `"100%"` khi $Gu = 0$.
  + Hysteresis hai ngưỡng (SPEC §8):
    * Gần bão hòa: kích hoạt khi saturationRatio $\ge 0.99$, chỉ thoát khi saturationRatio $< 0.98$.
    * Đã tan gần hết: kích hoạt khi $Gu \le L(Gt) = \max(0.01\text{ g}, 0.01 \times Gt)$, chỉ thoát khi $Gu > 1.2 \times L(Gt)$.
  + Hộp nhận xét sư phạm: Phân tích trạng thái động của hệ (cốc rỗng, chưa có nước, tạm dừng, đang khuấy, dòng chảy suy giảm sau khi ngừng khuấy, nghỉ khuấy hòa tan tự nhiên, bão hòa có đường dư, hoặc hòa tan hoàn toàn).
- Bằng chứng kiểm thử tự động toàn diện (`src/simulation/tests/sliceWaterSugar.test.ts` - 12 test cases):
  + Part 1 (Unit formatters & hysteresis - 6 tests): định dạng khối lượng, sức chứa, độ bão hòa, tiến độ, hysteresis gần bão hòa và gần tan hết.
  + Part 2 (Scenario A - 1 test): W100ml + G1g khuấy auto fast hòa tan hoàn toàn về $Gu < 0.001\text{ g}$ sau 45s, hạt biến mất trên 3D, dung tích nở $100.65\text{ ml}$, chuyển trạng thái $Gu = 0 \implies$ "Đã tan hoàn toàn", progress 100%.
  + Part 3 (Scenario B - 1 test): Hòa tan tự nhiên không khuấy khớp nghiệm giải tích độc lập tại $1\text{ s}$ ($Gd \approx 0.02469\text{ g}$, sai số $< 10^{-6}\text{ g}$).
  + Part 4 (Scenario C - 1 test): Bão hòa và đường dư W10ml + G30g ($Gt=30\text{ g}$, sức chứa $20\text{ g}$), $Gd \to 20\text{ g}$, $Gu \ge 10\text{ g}$, lớp đường rắn duy trì ở đáy, tiến độ chặn 99.9%, nhãn "Có đường dư" và "Đã bão hòa".
  + Part 5 (Scenario D - 1 test): Tạm dừng đóng băng $t$ và $Gd$, thêm đường 0.1g khi paused cập nhật ngay lập tức $Gu$ với $0\text{ s}$ delta thời gian, tiếp tục mô phỏng hòa tan mượt mà.
  + Part 6 (Scenario E - 1 test): Làm mới cốc đưa toàn bộ mass về 0, $t = 0$, generation tăng, UI reset sạch sẽ.
  + Part 7 (Regression - 1 test): Bảo lưu phần dư cực nhỏ $Gu = 10^{-11}\text{ g}$ và $f_{Gu} > 0$ không bị snap.
- Kết quả kiểm chứng thực tế:
  + Vitest: 220/220 tests pass across 11 test suites.
  + TypeScript (`tsc --noEmit`): exit 0.
  + ESLint (`eslint .`): exit 0.
  + Vite build: exit 0 (dist/ 615 modules, 5.07s).
- Đánh giá Gate: Do môi trường không có công cụ trình duyệt WebGL tương tác để chụp ảnh/tương tác chuột thực tế, task được phân loại chính xác là `PARTIAL` (Core verified, Browser QA pending) theo đúng quy tắc Gate evidence.

## Triển khai V3-02 — 2026-10-17
- Hoàn thành V3-02 (Dissolution bounded theo nước và bão hòa) với đầy đủ bằng chứng kiểm thử (COMPLETED_VERIFIED).
- Mô hình động học hòa tan thuần toán (`src/simulation/models/Dissolution.ts`):
  + Công thức động học chuẩn hóa (SCIENTIFIC_SPEC §5.2):
    * Sức chứa dung môi: $\text{capacityG} = S_0 \times W$ với $S_0 = 2.0\text{ g/g nước}$ (chuẩn giáo khoa tại 20°C, tương đương $200\text{ g} / 100\text{ ml}$ nước do $\rho_W = 1.0\text{ g/ml}$).
    * Dung sai hòa tan còn lại (headroom): $\text{gap} = \max(0, \text{capacityG} - Gd)$.
    * Lượng đường khả dụng để tan: $\text{available} = \min(Gu, \text{gap})$.
    * Hằng số tốc độ động học: $k_G = k_{G0} + k_{G1} \times I$ với $k_{G0} = 0.025\text{ s}^{-1}$ (tốc độ nền khi không khuấy) và $k_{G1} = 0.25\text{ s}^{-1}$ (hệ số gia tốc khi khuấy tối đa), $I \in [0, 1]$.
    * Lượng chuyển pha trong bước $h$: $dG = (W > 0) ? \text{available} \times (1 - \exp(-k_G \cdot h)) : 0$.
    * Độ chính xác số học cao: dùng `-Math.expm1(-k_G * h)` triệt tiêu hoàn toàn sai số triệt tiêu dấu phẩy động (float cancellation) với timestep nhỏ ($h = 1/60\text{ s}$).
    * Cập nhật pha bảo toàn: $Gu_{next} = Gu - dG$, $Gd_{next} = Gt - Gu_{next}$ thông qua V3-01 `applyPairedTransfer` với `pair: 'sugar_dissolution'`.
  + Nghiệm giải tích liên tục độc lập (`computeAnalyticDissolution`):
    * Với $I$ cố định: $\text{limit} = \min(Gt, \text{capacityG})$, $Gd(t) = \text{limit} - (\text{limit} - Gd_0) \times \exp(-k_G \cdot t)$.
    * Kiểm chứng khớp tuyệt đối với đặc tả SPEC §5.2 tại $t = 1.0\text{ s}$ ($60\text{ ticks}$ at $h = 1/60\text{ s}$):
      - Fixed $I = 0$: $Gd(1\text{ s}) = 20 \times (1 - \exp(-0.025)) = 0.4938017594\text{ g}$ (sai số $< 10^{-6}\text{ g}$).
      - Fixed $I = 1$: $Gd(1\text{ s}) = 20 \times (1 - \exp(-0.275)) = 4.808557536\text{ g}$ (sai số $< 10^{-6}\text{ g}$).
  + Bộ hàm đánh giá giáo dục & UX (SPEC §8):
    * `computeSaturationRatio(Gd, capacityG, W)`: $Gd / \text{capacityG}$ ($null$ khi $W = 0$).
    * `computeDissolutionProgress(Gd, Gt, capacityG, W)`: $Gd / \min(Gt, \text{capacityG})$ ($null$ khi $W = 0$).
    * `isNearSaturation(Gd, capacityG)`: $\ge 0.99$.
    * `hasExcessSugar(Gt, capacityG, W)`: $W > 0 \ \&\&\ Gt > \text{capacityG} + \epsilon$.
    * `hasResidualSolidSugar(Gu, Gt)`: $Gu > L(Gt) = \max(0.01\text{ g}, 0.01 \times Gt)$.
- Tích hợp Engine Headless (`src/simulation/core/HeadlessSimulationEngine.ts`):
  + Trình tự thực thi chuẩn khoa học trong `stepFixedTick`:
    1. Cập nhật controller thìa tự động (`AutoStirController.step`).
    2. Cập nhật tiếp xúc chất lỏng và phân vùng cốc (`computeBeakerRegions`, `computeMechanicalContact`).
    3. Cập nhật mô hình dòng chảy (`stepStirringFlow` $\to \omega_{drive}, \omega_{flow}, I$).
    4. Cập nhật mô hình hòa tan (`stepDissolution` dùng flow intensity $I$).
    5. Cập nhật lại hình học cốc và cao độ mũi thìa (`recalculateGeometryAndConstraints`) khi khối lượng pha rắn ở đáy giảm do hòa tan.
    6. Tăng tick / simulated time ($t = \text{tickIndex} \times h$) / version và kiểm định 8 bất biến bảo toàn khối lượng (`assertMassInvariants`).
  + Xuất bản snapshot (`ScalarSnapshot`):
    * Tích hợp `capacityG`, `saturationRatio`, và `dissolutionProgress` vào snapshot phục vụ UI và bài học.
- Đánh giá kỹ thuật về 3D Scene / Renderer & UI Particle Reflection:
  + Hiện tại, `LaboratoryScene.tsx` truyền `amount={q.sugar}` (tổng lượng đường thêm vào từ input ticks) vào `ParticleRenderer.tsx`, chưa nối trực tiếp tới lượng đường chưa tan `snapshot.mass.Gu`.
  + Mô hình hòa tan V3-02 hoạt động chuẩn xác và có thẩm quyền (authoritative) trong engine headless, cập nhật `snapshot.mass.Gu`, `snapshot.mass.Gd`, `saturationRatio`, và `dissolutionProgress`.
  + Việc phản chiếu trực quan số lượng hạt 3D giảm dần theo `Gu` sẽ được nối và nghiệm thu trong task lát cắt V2-11 / V4-02. Ranh giới trách nhiệm này được phân định rõ ràng, không lấn sân sang visual rendering.
- Bằng chứng kiểm thử tự động (`src/simulation/tests/dissolution.test.ts` - 19 test cases):
  + Part A (Pure Model Unit Tests - 9 tests): SC-D01 dry carrier gate ($W=0 \implies dG=0$), SC-D02 analytic oracle tại 1s cho $I=0$ và $I=1$, SC-D03 tiệm cận bão hòa dài hạn tại 600s không vượt 20g và còn dư $\ge 10\text{ g}$, SC-D04 khuấy thay đổi tốc độ không đổi sức chứa, SC-D06 độ bền vững với lượng 0 / tiny $0.1\text{ g}$, bảo toàn phần dư nhỏ $< 0.001\text{ g}$, tính tương thích timestep $h=1/60$ vs $h=1/120$ (sai số $< 10^{-11}\text{ g}$), và các UX predicates SPEC §8.
  + Part B (Engine Integration - 10 tests): hòa tan thực tế qua các fixed steps, hòa tan nền $k_{G0}$ khi observe không khuấy, auto fast khuấy nhanh đẩy nhanh hòa tan, pause đóng băng hoàn toàn tiến trình và timeline, resume tiếp tục mượt mà, stop auto suy giảm dòng chảy và tốc độ hòa tan lùi về nền, SC-D05 thêm nước sau khi gần bão hòa nhân đôi sức chứa và hòa tan tiếp trong khi thêm dầu không tăng sức chứa, SC-IN03 bảo toàn dung tích reservation 500ml và từ chối lệnh thêm khi đầy cốc, mũi thìa thích ứng hạ thấp khi đáy đường tan, snapshot xuất bản đầy đủ thông số bão hòa, và tính độc lập frame rate $30/60/120\text{ FPS}$ (sai số $< 10^{-6}\text{ g}$).
- Kết quả kiểm chứng toàn diện:
  + Vitest: 208/208 tests pass across 10 test suites (`dissolution.test.ts` 19, `mass.test.ts` 28, `auto.test.ts` 28, `bridge.test.ts` 18, `flow.test.ts` 20, `clock.test.ts` 22, `engine.test.ts` 24, `beakerGeometry.test.ts` 18, `simulationContract.test.ts` 18, `experimentStore.test.ts` 13).
  + TypeScript (`tsc --noEmit`): exit 0.
  + ESLint (`eslint .`): exit 0.
  + Vite build: exit 0 (dist/ 614 modules, 7.42s).

## Triển khai V3-01 — 2026-10-17
- Hoàn thành V3-01 (Mass ledger và transfer primitive) với đầy đủ bằng chứng kiểm thử (COMPLETED_VERIFIED).
- Kiến trúc & Quyền sở hữu (Ownership):
  + Không tạo thêm mutable ledger owner nào bên cạnh `ScienceState`: `ScienceState.mass` tiếp tục là nguồn chân lý duy nhất trong engine.
  + Hằng số khoa học & chuyển đổi đơn vị (`src/simulation/constants/science.ts`):
    * Hệ số mật độ mô hình giáo khoa: $\rho_W = 1.0\text{ g/ml}$, $\rho_O = 0.9\text{ g/ml}$.
    * Hệ số chiếm chỗ trực quan: đường $0.65\text{ ml/g}$, cát $0.60\text{ ml/g}$.
    * Sức chứa hòa tan đường ở 20°C: $S_0 = 2.0\text{ g/ml}$ ($200\text{ g}$ đường / $100\text{ ml}$ nước).
    * Giới hạn reservation dung tích cốc: $500,000\text{ milli-ml}$.
    * Hàm sai số khối lượng canonical: $\epsilon(totalG) = \max(10^{-8}\text{ g}, 10^{-9} \times totalG)$.
    * Ngưỡng ý nghĩa giáo dục: $L(totalG) = \max(0.01\text{ g}, 0.01 \times totalG)$ (chỉ dùng cho UX labels, không snap hay xóa residual trong ledger).
  + Kiểm định bất biến khoa học (`src/simulation/models/MassLedger.ts`):
    * `validateMassInvariants(state, context)` & `assertMassInvariants(state, context)` kiểm tra 8 điều kiện tiên quyết:
      1. Ticks đầu vào là safe integer không âm.
      2. Mọi khoang khối lượng là số hữu hạn không âm (chặn `-0` và NaN/Infinity).
      3. Quy đổi input ticks sang khối lượng tổng ($W, Gt, St, Ot$) khớp trong sai số $\epsilonMass$.
      4. Tổng các phân vùng pha: $Gu + Gd = Gt$, $Sb + Ss = St$, $Ol + Od = Ot$ khớp trong $\epsilonMass$.
      5. Tỷ lệ lơ lửng $f_{Gu} \in [0, 1]$ và $f_{Gu} = 0$ khi $Gu = 0$.
      6. Lượng đường đã tan $Gd$ không vượt quá sức chứa hòa tan của nước trong sai số $\epsilonMass$.
      7. Điều kiện dry/carrier gate: khi $W = 0 \implies Gd = 0$ và $Od = 0$ (không nước thì không thể tan hay tạo nhũ tương dầu).
      8. Tổng reservation thể tích không vượt quá $500,000\text{ milli-ml}$.
    * Chẩn đoán lỗi chi tiết qua `MassInvariantError` gồm: tên bất biến, chất/pha, giá trị kỳ vọng vs thực tế, sai số dung sai, cùng metadata `generation`, `tickIndex`, `stateVersion`, `stage`.
  + Bounded Paired Transfer Primitive:
    * 5 cặp chuyển pha được hỗ trợ: `sugar_dissolution` ($Gu \to Gd$), `sand_suspension` ($Sb \to Ss$), `sand_sedimentation` ($Ss \to Sb$), `oil_dispersion` ($Ol \to Od$), `oil_separation` ($Od \to Ol$).
    * Hàm tính toán thuần `computePairedTransfer(mass, request)`: không làm thay đổi đối tượng đầu vào; giới hạn lượng chuyển thực tế không vượt lượng nguồn và không vượt headroom đích.
    * Hàm áp dụng nguyên tử `applyPairedTransfer(state, request)`: cập nhật hai pha như một giao dịch duy nhất, tính pha nguồn sau chuyển từ $total - dest_{after}$ để triệt tiêu trôi dạt số thực, cập nhật $f_{Gu} = 0$ khi $Gu = 0$, và kích hoạt kiểm định toàn diện `assertMassInvariants`.
    * Từ chối nguyên tử (Atomic Rejection): các yêu cầu âm, NaN, Infinity hoặc state ban đầu bị sai lệch tổng phân vùng đều bị chặn hoàn toàn, không thay đổi state, không tự động chuẩn hóa ngầm (no silent normalization), không dùng `Math.max(0, ...)` để xóa lỗi.
    * Bảo lưu residual nhỏ: các phần dư khối lượng nhỏ (dưới $0.01\text{ g}$ hay $0.001\text{ g}$) được giữ nguyên vẹn trong ledger, không snap về 0.
  + Tích hợp engine:
    * `HeadlessSimulationEngine.createForTesting`: kiểm tra invariants qua `assertMassInvariants`.
    * `dispatch('add')`: kiểm tra invariants ngay sau commit.
    * `dispatch('reset')`: kiểm tra invariants sau khi đưa state về baseline.
    * `stepFixedTick`: kiểm tra invariants ở cuối mỗi bước logic cố định $h$.
- Bằng chứng kiểm thử tự động:
  + 28 test cases trong `src/simulation/tests/mass.test.ts` (11 unit tests, 5 randomized tests, 12 engine integration tests).
  + Kiểm thử ngẫu nhiên xác định (Randomized deterministic test): chạy 1,000 bước transfer ngẫu nhiên với PRNG seed 1729 cố định, kiểm tra invariants tại TỪNG bước; sai số bảo toàn khối lượng lớn nhất ghi nhận được: $\text{maxError} < 10^{-12}\text{ g}$ (vượt xa mức $\le 10^{-8}\text{ g}$).
  + Toàn bộ 189 tests pass across 9 test suites (`npm test`).
  + `npm run typecheck`, `npm run lint`, `npm run build` exit 0.

## Triển khai V2-04 — 2026-10-17
- Hoàn thành V2-04 (Auto controller ba mức) phần core và kiểm chứng qua automated test suite (PARTIAL - Core verified 161/161 tests, Browser QA pending).
- Kiến trúc Controller thuần toán (`src/interactions/AutoStirController.ts`):
  + Smoothstep transition: $S(u) = u^2(3 - 2u)$ với $u = \min(1, \max(0, \text{elapsed} / 0.25))$.
  + Monotonic radius transition: $r(t) = r_0 + (0.4 - r_0) \times S(t / 0.25)$, không vọt lố (overshoot), kẹp chặt trong $[0, SPOON\_MAX\_RADIUS = 0.74]$.
  + Bảo toàn tư thế $t_0$ (Pose continuity): Giữ nguyên chính xác $(x_0, z_0, \theta_0, r_0)$ trong sai số $10^{-9}$ scene units tại thời điểm bắt đầu auto, loại bỏ hoàn toàn hiện tượng nhảy vị trí (teleportation).
  + Tiến triển góc thuần sim-time: $\theta(t + h) = \theta(t) + \omega_{rod} \times h$, hoàn toàn độc lập với clock render và wall-time.
  + Ba mức tốc độ tự động: slow ($1.0\text{ rad/s}$), medium ($3.0\text{ rad/s}$), fast ($6.0\text{ rad/s}$).
- Tích hợp Engine Headless (`src/simulation/core/HeadlessSimulationEngine.ts`):
  + Tích hợp `AutoStirController` làm driver điều khiển thìa khi `mode === 'auto'`.
  + Thứ tự thực thi cố định trong `stepFixedTick`:
    1. Cập nhật tư thế thìa từ auto controller.
    2. Tính toán tiếp xúc cơ học và hình học cốc (`calculateFluidContact`).
    3. Cập nhật mô hình dòng chảy (`stepStirringFlow`).
    4. Kiểm tra các bất biến khoa học (bảo toàn khối lượng các pha, deciTicks, seed).
  + Bổ sung trường `autoDriveEnabled: boolean` và `autoLevel: AutoLevel` vào `ScalarSnapshot`.
  + Snapshot detached an toàn: clone độc lập `rod`, `input`, `mass` ngăn ngừa aliasing / mutation từ renderer hoặc UI.
  + Cung cấp `getRodPose(): RodPose` và `getRenderPose(): RenderPoseCapture` cho render loop.
- Authoritative Bridge & Store:
  + `SimulationBridge`: Bổ sung `getRodPose()`, `getRenderPose()`, `setMode()`, `setAutoLevel()`, `startAuto()`, `stopAuto()`.
  + `experimentStore`: Actions `startAuto`, `stopAuto`, `setAutoLevel` kiểm tra cờ `showRod` (từ chối kích hoạt nếu thìa đang ẩn).
- Giao diện người dùng & 3D Scene:
  + `ControlPanel.tsx`: Cung cấp nhóm điều khiển khuấy tự động với 3 nút chọn mức ("Chậm", "Vừa", "Nhanh") và nút thao tác "Khuấy tự động" / "Ngừng khuấy", tự động disabled khi thìa ẩn hoặc mô phỏng tạm dừng.
  + `StirringRod.tsx`: Cập nhật trực tiếp transform của Three.js Object3D trong `useFrame` từ `bridge.getRodPose()` qua mutable ref, không gọi `setState` từ rod pose trong render loop. Lưu ý: Điều này không suy diễn thành zero React re-renders từ mọi subscription hoặc cam kết 60 FPS mà chưa có browser performance profiling thực tế. Numeric `omegaFlow` decay trong engine cũng là giá trị số học, chưa bao gồm surface wave animation 3D.
- Kiểm thử tự động toàn diện (`src/simulation/tests/auto.test.ts` - 28 test cases):
  + Part A (Pure Controller - 12 tests): smoothstep bounds, monotonic radius, bảo toàn $t_0 \le 10^{-9}$, tiến triển góc 3 mức tốc độ, wrapping góc, kẹp bán kính tối đa, độc lập wall-time, reset to pose.
  + Part B (Engine Integration - 10 tests): lệnh setMode/setAutoLevel, thứ tự fixed-step, stop suy giảm dòng, pause đóng băng góc và flow, resume tiếp tục, bất biến khối lượng pha, snapshot isolation.
  + Part C (Bridge/Store/Render Contract - 6 tests): bridge getRodPose/getRenderPose, store startAuto/stopAuto/setAutoLevel, guard showRod, detached snapshot immutability.
- Kết quả kiểm chứng thực tế:
  + Vitest: 161/161 tests pass across 8 suites (`auto.test.ts` 28, `bridge.test.ts` 18, `engine.test.ts` 24, `flow.test.ts` 20, `clock.test.ts` 22, `beakerGeometry.test.ts` 18, `simulationContract.test.ts` 18, `experimentStore.test.ts` 13).
  + TypeScript (`tsc --noEmit`): exit 0.
  + ESLint (`eslint .`): exit 0.
  + Vite build: exit 0 (611 modules, 4.86s).
- Giới hạn & Đánh giá trạng thái: Do phiên hiện tại chưa có công cụ trình duyệt WebGL tương tác để kiểm tra trực quan, task được phân loại chính xác là `PARTIAL` (Core verified, Browser QA pending) tuân thủ Gate/evidence rules.

## Triển khai V2-10 — 2026-10-17
- Hoàn thành V2-10 (Early authoritative bridge và controls tối thiểu) với đầy đủ bằng chứng kiểm thử (COMPLETED_VERIFIED).
- Kiến trúc SimulationBridge (`src/simulation/bridge/SimulationBridge.ts`):
  + Authoritative Owner ngoài Canvas: Engine sống trong application level / Zustand store, tách biệt hoàn toàn khỏi vòng đời Canvas/Three.js.
  + Single RAF scheduler: Một vòng lặp `requestAnimationFrame` duy nhất trên bridge, điều phối `engine.advanceTimestamp(timestampMs)`. Không còn duplicate `useFrame` scheduler gây nhân đôi tốc độ hoặc desync.
  + Forced immediate publish cho control intents: Mọi lệnh điều khiển được chấp nhận (`add`, `reset`, `pause`, `resume`, `releaseDrive`) lập tức ép xuất bản `ScalarSnapshot` mới đồng bộ (synchronous publish) mà không chờ throttle timer, đáp ứng SC-C07 (thêm chất khi pause hiển thị tức thì trên UI với 0s elapsed time).
  + Throttled 10Hz scalar publish (`TICK_PUBLISH_INTERVAL_MS = 100`): Trong khi animation chạy liên tục, scalar snapshots xuất bản tối đa ~10Hz để UI React không bị re-render thừa từng frame 60FPS.
  + Scene Invalidation Bridge: Đăng ký `subscribeInvalidate` từ Three.js/R3F; khi có bước logic chạy (`stepsExecuted > 0`), bridge lập tức kích hoạt `invalidate()` của Canvas R3F theo cơ chế on-demand render.
  + Vòng đời trình duyệt (Browser lifecycle): `attachLifecycle()` an toàn tuyệt đối với React StrictMode (`mount -> unmount -> mount`); lắng nghe sự kiện `visibilitychange`:
    * Khi tab bị ẩn (`document.hidden`): gọi `engine.suspend()`, dừng RAF scheduler.
    * Khi tab hiển thị lại (`!document.hidden`): gọi `engine.visible()`, triệt tiêu gap thời gian trôi qua ở frame đầu tiên (không bù burst time), và chỉ khởi động lại RAF scheduler nếu mô phỏng trước đó KHÔNG ở trạng thái user pause (SC-T03).
- Di chuyển ExperimentStore (`src/stores/experimentStore.ts`):
  + Đơn nhất nguồn chân lý (Single Source of Truth): Xóa bỏ hoàn toàn các biến mutable totals / local accumulators nội bộ. Trạng thái khoa học duy nhất là `snapshot: ScalarSnapshot` do engine xuất bản.
  + Dẫn xuất tự động `deciTicks` và `quantities` trực tiếp từ `snapshot.input`.
  + Giao diện tương thích ngược đầy đủ: giữ nguyên `add`, `reset`, `start`, `pause`, `resume`, `toggleRod`, `resetCamera` với cùng interface/UI actions.
  + Cách ly Camera Reset (SC-B03): Nút "Đặt lại góc nhìn" chỉ tăng `cameraRevision` để remount camera/orbit controls trong Canvas; tuyệt đối không đụng chạm tới bridge, engine, clock accumulator, khối lượng hay elapsed time.
  + Đảm bảo an toàn thìa khuấy (SC-J03 / SPEC §3.4): Khi ẩn thìa (`showRod = false`), store lập tức dispatch `releaseDrive` ngắt kết nối động lực trước khi ẩn; khi hiện thìa không tự động khôi phục driver.
  + Hỗ trợ multi-instance: `createExperimentStore(bridge?)` cho phép khởi tạo các store độc lập phục vụ kiểm thử cô lập song song.
- Tích hợp Scene và UI:
  + `LaboratoryScene.tsx`: Đăng ký `bridge.subscribeInvalidate()` qua component con `SceneInvalidationBridge` bên trong Canvas; truyền vị trí mũi thìa authoritative `snapshot.rod.tipY` trực tiếp vào `StirringRod`.
  + `ControlPanel.tsx`: Hiển thị thời gian mô phỏng chính xác `snapshot.elapsedSeconds.toFixed(1) s`, trạng thái `Đang chạy` / `Tạm dừng`, cung cấp các nút Bắt đầu, Tạm dừng, Tiếp tục, Làm mới cốc, Đặt lại góc nhìn và Hiện/Ẩn thìa.
  + `App.tsx`: Kích hoạt `bridge.attachLifecycle()` trong `useEffect` gốc.
- Kiểm thử toàn diện 18 kịch bản yêu cầu (`src/simulation/tests/bridge.test.ts` - 18 test cases):
  + 1. Khởi tạo baseline store và snapshot rỗng, pause, seed 1729, thời gian 0s.
  + 2. Thêm chất khi paused (SC-C07, SC-C01) cập nhật ngay lập tức với elapsed time 0s.
  + 3. Parser chuỗi tiếng Việt dấu phẩy " 1,2 " và dấu chấm "1.2" đều tạo đúng 12 deciTicks (1.2g/ml).
  + 4. Dữ liệu lỗi (NaN, âm, 0, chuỗi rác) bị từ chối sạch sẽ mà không corrupt store.
  + 5. Cộng dồn 10 lần 0.1 tạo đúng 1.0 chính xác tuyệt đối không trôi số thực (SC-IN02).
  + 6. Giới hạn dung tích 500ml (SC-IN04): 499.9 + 0.1 đầy 500ml; thêm tiếp bị từ chối lập tức với CAPACITY_EXCEEDED.
  + 7. Chuỗi add 100 -> reset -> add 50 (SC-C03) tăng generation, reset sạch và không hồi sinh 100ml cũ.
  + 8. Bắt đầu/Tiếp tục tăng elapsedSeconds/ticks; Tạm dừng đóng băng chính xác (SC-C01, SC-T02).
  + 9. Forced immediate publish cho control commands không bị nghẽn bởi throttle 10Hz.
  + 10. Tick publish khi chạy được throttle chuẩn ~10Hz (100ms) trong khi scene invalidate trên từng bước tích lũy.
  + 11. Cơ chế bảo vệ store bỏ qua các snapshot stale/regressed generation hoặc version.
  + 12. Camera reset tăng cameraRevision nhưng bảo toàn nguyên vẹn engine, generation, mass và thời gian (SC-B03).
  + 13. An toàn StrictMode lifecycle (attach -> cleanup -> attach) chỉ giữ đúng 1 scheduler/listener.
  + 14. Vòng đời visibilitychange: suspend khi ẩn, restore khi hiện không bù gap, bảo toàn triệt để user pause (SC-T03).
  + 15. Tính đơn điệu client sequence và fencing command generation xuyên suốt các lần reset.
  + 16. Tính độc lập hoàn toàn giữa 2 instances bridge/store song song.
  + 17. Cách ly DevFreeze của ScalarSnapshot và dọn dẹp subscription sạch sẽ.
  + 18. Toggle thìa khuấy ngắt releaseDrive trước khi ẩn; hiện thìa không tự kích hoạt lại driver (SC-J03).
- Kết quả kiểm thử thực tế:
  + Vitest: 133/133 tests pass across 7 suites (`beakerGeometry.test.ts` 18, `experimentStore.test.ts` 13, `simulationContract.test.ts` 18, `engine.test.ts` 24, `clock.test.ts` 22, `flow.test.ts` 20, `bridge.test.ts` 18).
  + TypeScript (`tsc --noEmit`): exit 0.
  + ESLint (`eslint .`): exit 0.
  + Vite build: exit 0 (610 modules, 4.84s).

## Triển khai V2-03 — 2026-10-17
- Hoàn thành V2-03 (Flow response và quán tính sau stop) với đầy đủ bằng chứng kiểm thử (COMPLETED_VERIFIED).
- Đã triển khai constants khoa học trong `src/simulation/constants/flow.ts`:
  + $a = 2.0\text{ s}^{-1}$ (`A_STIR`), $b = 0.8\text{ s}^{-1}$ (`B_STIR`), $\lambda = a + b = 2.8\text{ s}^{-1}$ (`FLOW_LAMBDA`).
  + Chuẩn hóa intensity: $6.0\text{ rad/s}$ (`FLOW_NORMALIZATION_RAD_PER_SEC`), giới hạn tốc độ thìa: $8.0\text{ rad/s}$ (`MAX_ROD_SPEED_RAD_PER_SEC`).
  + Bán kính quỹ đạo mặc định $0.4\text{ scene units}$ (`DEFAULT_ORBIT_RADIUS`), chuẩn hóa khớp nối bán kính: $0.4$ (`RADIAL_COUPLING_NORMALIZATION`).
  + Bảng tốc độ auto: slow = 1.0, medium = 3.0, fast = 6.0 rad/s.
- Đã triển khai mô hình dòng chảy thuần trong `src/simulation/models/StirringFlow.ts`:
  + Khớp nối bán kính: $\text{radialCoupling} = \min(\text{radius} / 0.4, 1.0)$ (bằng 0 khi $\text{radius} \le 0$).
  + Khớp nối động lực: $\omega_{drive} = \text{contact} \times \text{radialCoupling} \times \omega_{rod}$ (kẹp $\text{contact} \in [0, 1]$, $\omega_{rod} \in [-8, 8]$).
  + Vận tốc tiệm cận cân bằng: $\omega_{eq} = \frac{a}{a + b} \times \omega_{drive} = \frac{5}{7} \times \omega_{drive}$.
  + Cập nhật exponential update: $\omega_{flow Next} = \omega_{eq} + (\omega_{flow} - \omega_{eq}) \times \exp(-(a + b) \times h)$ (bảo toàn dấu của dòng chảy; khi $\lambda \le 0$ giữ nguyên $\omega_{flow}$ tránh chia cho 0).
  + Cường độ dòng chảy (intensity): $I = \min(1, \max(0, |\omega_{flow Next}| / 6))$ luôn không âm trong $[0, 1]$.
  + Cổng chất lỏng (carrier gate): khi không có nước và không có dầu ($W_{ml} + O_{ml} == 0$), ép $\omega_{drive} = 0, \omega_{flow} = 0, I = 0$. Bed khô không được coi là chất lỏng.
  + Chất lỏng mỏng ($W = 0.1\text{ ml}$): $\text{contact} = 0 \implies \omega_{drive} = 0$, dòng chảy cũ suy giảm dần theo hàm mũ chứ không bị triệt tiêu tức thì.
  + Hệ dầu đơn (oil-only): dầu là carrier hợp lệ, thìa nhúng trong dầu tạo $\text{contact} > 0$ và sinh dòng chảy bình thường.
  + Hàm nghiệm giải tích liên tục: `computeAnalyticFlow(t, initialFlow, drive)` làm oracle độc lập kiểm chứng tại thời điểm bất kỳ $t \ge 0$.
- Tích hợp fixed step trong `HeadlessSimulationEngine.ts`:
  + `stepFixedTick(h)` gọi `stepStirringFlow` trước các model tương lai; cập nhật đồng bộ `this.state.omegaDrive` và `this.state.omegaFlow`.
  + Tăng `tickIndex += 1`, `elapsedSeconds = tickIndex * h`, `stateVersion += 1` đúng 1 lần mỗi bước fixed step.
  + Giữ nguyên bất biến: các khoang khối lượng (W, Gt, Gu, Gd, St, Sb, Ss, Ot, Ol, Od), input deciTicks, $f_{Gu}$ và seed không đổi qua các bước tính flow.
  + Hành vi lệnh:
    * `releaseDrive` (Stop): tắt `autoDriveEnabled`, đặt $\omega_{rod} = 0, \omega_{drive} = 0$, giữ đồng hồ tiếp tục chạy, $\omega_{flow}$ suy giảm liên tục theo $\omega_{flow}(t) = \omega_{flow}(0) \times \exp(-2.8 t)$.
    * `pause`: đóng băng bước tính toán, đặt $\omega_{rod} = 0, \omega_{drive} = 0$, giữ nguyên $\omega_{flow}$ và $I$ không decay trong thời gian tạm dừng; bảo toàn cờ `autoDriveEnabled`.
    * `resume`: tiếp tục tính toán flow từ giá trị được giữ nguyên, không tự động khôi phục driver nếu đã bị stop.
    * `setMode`: chuyển sang non-auto đặt `autoDriveEnabled = false, \omega_{rod} = 0, \omega_{drive} = 0`.
    * `reset`: đặt $\omega_{rod} = 0, \omega_{drive} = 0, \omega_{flow} = 0$.
  + An toàn giao diện timing:
    * `getClock()` trả về `ReadonlyClock` bao gói, chặn caller truy cập các phương thức đột biến `advance()` / `reset()` trực tiếp.
    * `advance()` và `advanceTimestamp()` kiểm tra `this.state.generation === startGen` để fencing ngay lập tức nếu lệnh `reset` được dispatch bên trong `setBeforeStepHook`.
    * Phân biệt rõ: `advance(realDeltaSeconds)` bảo toàn delta hoạt động truyền vào trực tiếp sau resume; `advanceTimestamp(ms)` triệt tiêu gap thời gian trôi qua ở frame đầu tiên sau resume/visible.
- Kiểm thử toàn diện 20 kịch bản kiểm chứng (`src/simulation/tests/flow.test.ts` - 20 test cases):
  + 10 unit tests cho pure model: nghiệm giải tích tại 1s/10s, drive âm, đổi dấu mượt qua 0, suy giảm sau stop $30/7 \times \exp(-2.8t)$, các tốc độ 1/3/6/8 rad/s, tiếp xúc một phần $c = 0.047$ trong $7\text{ ml}$ nước, thin liquid $W=0.1\text{ ml}$ vs dry bed, hệ dầu đơn, robustness $a=b=0$ / non-finite inputs, giới hạn intensity $[0, 1]$.
  + 10 integration tests trên engine thật: flow tiến triển qua fixed steps, stop không pause và suy giảm dòng, pause đóng băng và resume tiếp tục, reset và duplicate reset, snapshot detached an toàn, bảo toàn khối lượng và thông số hạt, invariant tick/version/time, tính bất biến qua các mức $30/60/120\text{ FPS}$, tương thích giải tích giữa $h=1/60$ và $h=1/120$, timing regression contracts.
- Kết quả kiểm thử thực tế:
  + Vitest: 115/115 tests pass across 6 suites (18 beakerGeometry + 13 experimentStore + 18 simulationContract + 24 engine + 22 clock + 20 flow).
  + TypeScript (`tsc --noEmit`): exit 0.
  + ESLint (`eslint .`): exit 0.
  + Vite build: exit 0 (602 modules, 4.56s).

## Triển khai V2-02 — 2026-10-17
- Hoàn thành V2-02 (Fixed timestep và accumulator có cap) với đầy đủ bằng chứng kiểm thử (COMPLETED_VERIFIED).
- Đã triển khai `SimulationClock` trong `src/simulation/core/SimulationClock.ts`:
  + Cấu hình mặc định khoa học: $h = 1/60\text{ s}$ (`DEFAULT_H`), $maxRealDelta = 0.1\text{ s}$ (`DEFAULT_MAX_REAL_DELTA`), $maxSteps = 6$ (`DEFAULT_MAX_STEPS`).
  + `validateClockConfig`: kiểm tra nghiêm ngặt $h > 0$, $maxRealDelta > 0$, $maxSteps \ge 1$, số thực hữu hạn; từ chối NaN, $\le 0$, Infinity.
  + Clamped accumulator: kẹp $realDelta$ đầu vào $\le maxRealDelta$; chống spiral of death bằng cách giới hạn số bước thực thi tối đa trong một frame $\le maxSteps$.
  + Quản lý backlog và dropped active wall time: khi số bước cần thực hiện vượt quá $maxSteps$, số bước backlog dư thừa $\lfloor accumulator / h \rfloor \times h$ được chuyển vào `droppedActiveWallTime`, bảo toàn số dư phân số $remainder \in [0, h)$.
  + Chẩn đoán timing (`TimingDiagnostics`): theo dõi số frame delta không hợp lệ (`invalidDeltaCount`), tích lũy thời gian thực hoạt động bị drop (`droppedActiveWallTime`), và thời gian còn tồn trong accumulator.
  + Lifecycle API thuần (headless/deterministic):
    * `onPause()`: xóa phần dư active trong accumulator sang `droppedActiveWallTime`, chuyển trạng thái sang paused. Thời gian trôi qua trong lúc pause không được tính vào `droppedActiveWallTime` hay accumulator.
    * `onResume()`: đặt cờ `resumeGrace = true`, bỏ qua delta đầu tiên sau resume để không bù thời gian treo máy / pause.
    * `suspend()` / `visible()`: mô phỏng chuyển tab/ẩn trang; frame delta đầu tiên sau khi visible được drop an toàn ($firstDelta = 0$).
    * `advanceTimestamp(timestampMs, isRunning)`: chuyển đổi timestamp đơn điệu sang realDelta, kiểm tra timestamp không được lùi.
- Tích hợp `HeadlessSimulationEngine`:
  + Cập nhật `CommandEngineCore` interface: bổ sung `advance(realDeltaSeconds): AdvanceResult`, `getClock()`, `getAccumulator()`, `getDroppedActiveWallTime()`.
  + Tích hợp vòng đời: `reset()` reset clock; `pause()` gọi `clock.onPause()`; `resume()` gọi `clock.onResume()`.
  + Hook ranh giới bước logic `setBeforeStepHook(hook)`: cho phép inject hoặc flush commands chính xác tại ranh giới tick $N \rightarrow N+1$.
  + Invariant phiên bản: mỗi bước khoa học $h$ tăng `tickIndex += 1`, `elapsedSeconds += h`, và `stateVersion += 1`. Khi không có bước nào chạy (paused hoặc accumulator $< h$), `stateVersion` của science state không đổi.
- Triển khai `TickBoundaryReplayHarness` trong `src/simulation/core/ReplayHarness.ts`:
  + Hỗ trợ lên lịch inject commands tại ranh giới tick logic chính xác `appliedAtTick`.
  + Dispatch command sau step $N$ và trước step $N+1$, độc lập hoàn toàn với việc frame ngoài gộp bao nhiêu steps ($FPS = 30$, $60$ hay $120$).
  + Cơ chế phát hiện deadlock / starvation khi queue tích tụ command không bao giờ chạm tới tick đích.
- Kiểm thử toàn diện 16 kịch bản yêu cầu (`src/simulation/tests/clock.test.ts` - 22 test cases):
  + Cấu hình hợp lệ/không hợp lệ, dt âm/NaN/0, 4 lần $1/240\text{ s} \rightarrow 1\text{ step}$, kẹp delta $5\text{ s} \rightarrow 6\text{ steps} + 4.9\text{ s drop}$, custom budget $h=1/120\text{ s}$ với $maxSteps=12$.
  + Xóa remainder khi pause, lifecycle hidden $\rightarrow$ visible không bù gap, bảo toàn cờ user pause khi unhide, reset vs duplicate replay, command tại tick 120 áp dụng trước tick 121 tại $30/60/120\text{ FPS}$, tính độc lập của 2 engines song song.
- Kết quả kiểm thử thực tế:
  + Vitest: 95/95 tests pass across 5 suites (18 beakerGeometry + 13 experimentStore + 18 simulationContract + 24 engine + 22 clock).
  + TypeScript (`tsc --noEmit`): exit 0.
  + ESLint (`eslint .`): exit 0.
  + Vite build: exit 0 (602 modules, 8.15s).

## Triển khai V2-01 — 2026-10-17
- Hoàn thành V2-01 (Runtime engine và command transaction) với đầy đủ bằng chứng kiểm thử (COMPLETED_VERIFIED).
- Đã triển khai `HeadlessSimulationEngine` và `HeadlessSimulationFacade` trong `src/simulation/core/HeadlessSimulationEngine.ts`:
  + Trạng thái `ScienceState` hoàn toàn private, đóng gói, khởi tạo qua `createInitialScienceState(seed)`.
  + `dispatch(command: Command): Ack` đồng bộ, kiểm tra toàn diện kiểu dữ liệu thô từ bên ngoài (envelope, clientId, seq an toàn, expectedGeneration, payload types, finite/safe numbers).
  + Quản lý sequence client đơn điệu (`highWaterSeq`) và cache dedup LRU 256 acks (`MAX_ACK_CACHE_SIZE = 256`), tồn tại xuyên reset.
  + Hàm băm payload canonical `canonicalFingerprint` chuẩn hóa đệ quy không phụ thuộc thứ tự key.
  + Thứ tự dedup trước generation validation: replay reset cũ vẫn nhận original ack với `duplicate: true`.
  + Phân biệt chính xác:
    * Lệnh đúng client, `seq = next`: nếu rejected vì STALE_GENERATION, INVALID_PAYLOAD, INVALID_SEED, EXCEEDS_MAX_ADDITION, CAPACITY_EXCEEDED đều consume seq, cập nhật `highWaterSeq`, được cache vào LRU và có `controlOrdinal = seq`. Rejection không tăng `stateVersion`.
    * Lệnh out-of-order (`seq > next`), sai clientId hoặc malformed envelope: không consume seq, không đổi `highWaterSeq`, không cache và có `controlOrdinal = null`.
    * Replay trùng seq: cùng payload trả original ack với `duplicate: true`; khác payload trả `ID_REUSED`; đã bị evict khỏi LRU trả `DUPLICATE_EXPIRED`.
  + Phân bổ pha nguyên tử cho Add: nước tăng W ($1\text{ ml} = 1.0\text{ g}$); đường tăng Gt/Gu, giữ Gd, pha loãng $f_{Gu}$; cát tăng St/Sb, giữ Ss; dầu tăng Ot/Ol ($1\text{ ml} = 0.9\text{ g}$), giữ Od. Tự động tính lại phân vùng cốc và thích ứng cao độ mũi thìa `tipY` bằng V1-05 helpers.
  + Các control intents: pause giữ `autoDriveEnabled`; releaseDrive tắt driver; resume kích hoạt chạy; setMode/setAutoLevel cập nhật đúng cờ.
  + Snapshot scalar detached: `snapshot()` deep clone các object lồng nhau (`input`, `mass`, `rod`), tính toán các trường dẫn xuất (`intensity`, `contact`, `capacityG`, `saturationRatio`, `dissolutionProgress`) và đóng băng dev freeze.
  + `HeadlessSimulationFacade`: tự động liên kết `expectedGeneration` từ authoritative engine state và sequence đơn điệu tại thời điểm dispatch intent.
  + Internal test seam `HeadlessSimulationEngine.createForTesting(state, options)` kiểm tra invariant bảo toàn khối lượng nghiêm ngặt mà không expose public setter trong production.
- Sửa sai lệch contract & chuẩn hóa:
  + Sửa `staleManualSampleFixture` và `capacitySerializationFixture` trong `contractFixtures.ts`: lệnh bị từ chối khi `seq = next` có `controlOrdinal = seq` (không phải `null`).
  + Mã canonical lỗi dung tích: chọn `CAPACITY_EXCEEDED` (SPEC §3.3 dùng viết tắt `CAPACITY` $\rightarrow$ canonical `CAPACITY_EXCEEDED`).
  + Đính chính tổng kết Phase 1: Phase 1 có 7 tasks tổng cộng (V1-01…V1-07), hiện 4/7 đã COMPLETED_VERIFIED (V1-01, V1-04, V1-05, V1-07), V1-02 PARTIAL, V1-03 BLOCKED, V1-06 NOT_STARTED. Phase 1 chưa hoàn tất.
- Kiểm thử và môi trường:
  + Vitest: 73/73 tests pass across 4 suites (18 beakerGeometry + 13 experimentStore + 18 simulationContract + 24 engine).
  + TypeScript (`tsc --noEmit`): exit 0.
  + ESLint (`eslint .`): exit 0.
  + Vite build: exit 0 (602 modules).
  + Đúng phạm vi: Không triển khai advance/clock (V2-02), models khoa học (Phase 3), hay UI integration (V2-10).

## Triển khai V1-07 — 2026-10-17
- Hoàn thành V1-07 (Chốt contract command/state/đơn vị) với đầy đủ bằng chứng kiểm thử (COMPLETED_VERIFIED).
- Đã chuẩn hóa schemas trong `src/simulation/core/SimulationState.ts`:
  + `ScienceState`: generation, stateVersion, tickIndex, elapsedSeconds, seed, paused, mode, autoDriveEnabled, autoLevel, input (`ScienceInputTicks`), mass (`ScienceMassCompartments` gồm W, Gt, Gu, Gd, St, Sb, Ss, Ot, Ol, Od), fGu, rod (`RodPose` gồm x, z, tipY, theta, radius), omegaRod, omegaDrive, omegaFlow.
  + `ScalarSnapshot`: dùng `DeepReadonly` bảo vệ nested objects chống mutation.
  + `ClockConfig`: h (default 1/60 s), maxRealDelta (0.1 s), maxSteps (6).
  + `MATERIAL_IDS`: sugar: 0, sand: 1, oilDroplet: 2.
  + `RenderTarget`: Float32Array positions, Float32Array weights, Uint8Array materials, count (caller-allocated).
  + `RenderStamp`: generation, stateVersion, renderRevision, count (active copied count).
  + `DEFAULT_SEED = 1729`, `normalizeSeed(seed)` validate uint32 (từ chối âm, số thực, chuỗi, NaN, Infinity, > 0xffffffff).
  + `createInitialScienceState(seed)`: khởi tạo state chuẩn g0/v0/tick0/elapsed0/paused, cấp phát các object lồng nhau hoàn toàn độc lập (reference isolation).
- Đã chuẩn hóa commands và acks trong `src/simulation/core/SimulationEngine.ts`:
  + Intent union: `AddIntent`, `ResetIntent`, `PauseIntent`, `ResumeIntent`, `ReleaseDriveIntent`, `SetModeIntent`, `SetAutoLevelIntent`, `ManualSampleIntent`.
  + `Command`: clientId, seq (strictly monotonic per client session), expectedGeneration, payload (Intent).
  + `RejectionReason`: STALE_GENERATION, OUT_OF_ORDER, ID_REUSED, DUPLICATE_EXPIRED, CAPACITY_EXCEEDED, MALFORMED_ENVELOPE, INVALID_PAYLOAD, EXCEEDS_MAX_ADDITION, INVALID_SEED.
  + `Ack`: clientId, seq, accepted, duplicate, reason, generation, stateVersion, appliedAtTick, controlOrdinal.
  + `SimulationEngine` contract: dispatch, advance, snapshot, copyRenderFrame.
- Tạo `src/simulation/core/contractFixtures.ts` với 9 contract fixtures chuẩn hóa:
  1. `initialEmptyPausedFixture`: state factory baseline g0/v0/tick0/elapsed0/paused/seed 1729.
  2. `addWaterResetAddWaterFixture`: SC-C03 timeline seq1 add 100ml -> seq2 reset -> seq3 add 50ml -> g1/v3/W50.
  3. `resetReplayAndDistinctResetFixture`: SC-C04 duplicate replay seq 2 giữ g1 vs distinct resets seq 5/6 tăng g2/g3.
  4. `staleManualSampleFixture`: SC-C05 / SC-IN04 pointer sample với captureGeneration 0 bị từ chối STALE_GENERATION tại generation 1.
  5. `addPausedAndResumeFixture`: SC-C01 add khi paused cập nhật mass tức thì, elapsedSeconds=0; resume accepted ngay trước tick.
  6. `capacitySerializationFixture`: SC-C02 add 499.9ml -> 0.1ml (đạt 500000 milli-ml) -> 0.1ml oil bị reject CAPACITY_EXCEEDED.
  7. `addPhaseAllocationFixture`: SC-A01 add sugar/sand/oil/water cập nhật đúng khoang vật chất (Gt/Gu tăng, Gd giữ, fGu pha loãng; St/Sb tăng, Ss giữ; Ot/Ol tăng theo khối lượng riêng 0.9 g/ml, Od giữ; W tăng 1.0 g/ml), thời gian bất biến.
  8. `oilOnlyRegionFixture`: SC-R01 vùng oil-only cát lơ lửng nằm trong envelope dầu, không nhân đôi thể tích dầu nền.
  9. `ownershipAndBufferFixture`: SC-B01 caller sở hữu buffers typed array, snapshot scalar detached deep-readonly.
- Tạo `src/simulation/tests/simulationContract.test.ts` (18 unit tests):
  + Bao phủ factory, seed normalization, reference isolation, 9 fixtures, command envelope typing và Ack RejectionReasons.
- Kiểm thử và môi trường:
  + Vitest: 49/49 tests pass across 3 files (`beakerGeometry.test.ts`, `experimentStore.test.ts`, `simulationContract.test.ts`).
  + TypeScript (`tsc --noEmit`): exit 0.
  + ESLint (`eslint .`): exit 0.
  + Vite build: exit 0 (602 modules).
  + Không triển khai logic engine dispatch/advance runtime hoặc models (thuộc V2-01+). Không kiểm chứng WebGL trên browser thực tế do môi trường không có browser tool.

## Triển khai V1-05 — 2026-10-17
- Hoàn thành V1-05 (Chuẩn hóa hình học cốc và giới hạn dụng cụ) với đầy đủ bằng chứng kiểm thử (COMPLETED_VERIFIED).
- Tạo `src/simulation/constants/beaker.ts`:
  + Các hằng số hình học cốc chuẩn hóa: capacity 500 ml, bán kính lòng trong `BEAKER_INNER_RADIUS = 0.87`, bán kính ngoài thành cốc `BEAKER_OUTER_RADIUS = 0.91`, đáy trong `BEAKER_BASE_Y = 0.12`, chiều cao mức 500 ml `BEAKER_FILL_HEIGHT = 2.1`, tỉ lệ quy đổi `BEAKER_VOLUME_SCALE = 0.0042` scene units/ml.
  + Các hằng số thìa: chiều dài phần hoạt động `SPOON_ACTIVE_LENGTH = 0.20`, bán kính bao `SPOON_ENVELOPE_RADIUS = 0.12`, khoảng cách mép thành `SPOON_WALL_MARGIN = 0.01`, giới hạn bán kính tâm thìa `SPOON_MAX_RADIUS = 0.74`, giới hạn cao độ mũi thìa `SPOON_MIN_TIP_Y = 0.14`, `SPOON_MAX_TIP_Y = 2.00`.
  + Hằng số hạt: `PARTICLE_RADIUS` (cát 0.023, đường 0.028), `PARTICLE_MARGIN = 0.01`.
- Các hàm TypeScript thuần:
  + `volumeToHeight`, `heightToVolume`.
  + `computeBeakerRegions(phases: PhaseMasses)`: phân tách 4 trường hợp (empty/dry, water-only, oil-only, mixed) theo SPEC §4. Các vùng bed, aqueous, oil không chồng lấn, tổng thể tích luôn bằng `Vreserve`. Pha dầu trong oil-only có solids displacement nhưng không bị nhân đôi thể tích dầu nền. Thể tích giọt dầu trong mixed nằm trong aqueous envelope.
  + `computeTipY(bedTop)`: `clamp(bedTop + 0.02, 0.14, 2.0)`.
  + `clampSpoonXZ(x, z)`: giới hạn bán kính tâm $\le 0.74$.
  + `computeMechanicalContact(regions, tipY)`: tính độ dài giao nhau giữa active segment $[tipY, tipY + 0.20]$ với miền chất lỏng $[bedTop, liquidTop]$ chia cho $0.20$, kẹp về $[0, 1]$. Cốc khô/rỗng cho contact = 0; nước 0.1 ml không chạm tip cho contact = 0; nước 7 ml cho contact $\approx 0.047$; Fixture X và O cho contact = 1.
  + `computeParticleBounds`: xử lý vùng bình thường, vùng mỏng (thu nhỏ bán kính về `height / 2`, đặt tâm tại midpoint) và vùng rỗng (`active = false`, không sinh NaN hay đảo cận).
  + Adapter `computeBeakerRegionsFromQuantities(q)` nối trực tiếp từ dữ liệu Quantities của Giai đoạn 1.
- Nối các component scene:
  + `Beaker.tsx`: dùng `BEAKER_BASE_Y`, `BEAKER_OUTER_RADIUS`, `volumeToHeight(50)`.
  + `WaterVolume.tsx`: dùng `volumeToHeight`, `BEAKER_INNER_RADIUS`.
  + `OilVolume.tsx`: dùng `volumeToHeight`.
  + `StirringRod.tsx`: cán thìa đứng, nhận `tipY` thích ứng, chiều dài đầu thìa 0.20, bán kính bao 0.12, tâm kẹp $\le 0.74$.
  + `ParticleRenderer.tsx`: dùng `computeParticleBounds` và `volumeToHeight`.
  + `LaboratoryScene.tsx`: dùng `computeBeakerRegionsFromQuantities`, `computeTipY`, truyền `tipY` thích ứng cho `StirringRod`.
- Kiểm thử và môi trường:
  + Vitest: 31/31 tests pass (13 tests store + 18 tests beakerGeometry bao phủ 9 fixtures SPEC §4.1 E/D/O/G0/G1/L0/L1/X/T, contact, clamp, bounds).
  + TypeScript (`tsc --noEmit`): exit 0.
  + ESLint (`eslint .`): exit 0.
  + Vite build: exit 0 (602 modules).
  + Phiên hiện tại không có browser tool; UI chưa kiểm chứng trình duyệt thực tế.

## Triển khai V1-04 — 2026-10-17
- Hoàn thành V1-04 (Đồng nhất precision của lượng thêm) với đầy đủ bằng chứng kiểm thử (COMPLETED_VERIFIED).
- Đã bổ sung bộ phân tích chuỗi locale tiếng Việt `parseAmountString` và hàm kiểm tra kiểu dùng chung `parseInputAmount`:
  + Trim khoảng trắng, nhận số nguyên hoặc đúng 1 chữ số thập phân dùng dấu chấm `.` hoặc phẩy `,`.
  + " 1,2 " và "1.2" → 12 ticks; "0001" → 10 ticks; "0.1" → 1 tick.
  + Từ chối chuỗi rỗng, khoảng trắng, số âm, dấu cộng, số 0, "0.14", ".1", "1.", "1e2", "1.2x", "1,000.0", "1 000".
  + Không dùng `parseFloat`; dùng số học kiểm tra safe integer.
- Đơn nhất nguồn chân lý (Single Source of Truth) trong store:
  + `deciTicks` là nguồn lưu trữ integer chính thức.
  + `quantities` suy ra trực tiếp từ `deciTicks / 10`.
  + Phép cộng 10 lần 0.1 g đạt chính xác 1.0 g, loại bỏ hoàn toàn sai số trôi dạt dấu phẩy động (float drift).
- Dung tích cốc và kiểm tra giới hạn:
  + Dùng số học integer milli-ml: `100*qW + 100*qO + 65*qG + 60*qS <= 500000`.
  + Xử lý tuần tự các lần thêm sát ngưỡng dung tích (499.9 ml + 0.1 ml nhận; lần thêm tiếp theo bị từ chối mà không làm thay đổi dữ liệu trước đó).
- Form UI:
  + `IngredientPanel.tsx` dùng `type="text" inputMode="decimal"` và truyền trực tiếp chuỗi thô (raw string) vào `store.add`.
  + `ContentsPanel.tsx` dùng `formatDeciTicks` để hiển thị nhất quán dấu phẩy tiếng Việt.
- Kiểm thử và môi trường:
  + Vitest: 13/13 tests pass (`src/simulation/tests/experimentStore.test.ts`).
  + TypeScript (`tsc --noEmit`): exit 0.
  + ESLint (`eslint .`): exit 0.
  + Vite build: exit 0, 601 modules.
  + Phiên hiện tại không có browser tool; UI chưa kiểm chứng trình duyệt thực tế.

## Plan v3 — review tiếp nhận ngày 2026-10-17
- Đã đọc REVIEW_VA_PROMPT_CAI_THIEN_PLAN_V3.txt và phần prompt tham khảo bên trong. User yêu cầu sửa plan; các đề xuất được áp dụng trong phạm vi tài liệu, không cấp phép runtime.
- Resolver vẫn chọn project root. Không thấy AGENTS.md ở workspace/các thư mục cha đã kiểm tra; không tạo bản tên hậu tố (7), không cài skill/browser hoặc đọc transcript.
- SHA-256 source/public/config/lock hiện khớp baseline v2. Spot-check call path: IngredientCard submit → Zustand add → occupiedVolume/reject → LaboratoryScene đọc quantities; resetCamera remount Canvas. Engine/Clock chỉ interface, chưa có command flush hay driver runtime. Không có source delta để audit lại toàn bộ nhiều lần.
- R01–R07 là lỗ hổng đặc tả, không phải lỗi runtime đã tái hiện: oil-only regions, paused command handling, reset/idempotency, stale manual, spoon-liquid contact, bridge trễ, RNG/buffer ownership.
- Chọn defaults v3 trong SCIENTIFIC_SPEC; task mới được thêm có ID mới, task cũ giữ ID nếu trách nhiệm còn phù hợp. Trạng thái triển khai khoa học không nâng lên verified vì đã sửa tài liệu.
- Bằng chứng checks v2 giữ nguyên là lịch sử; lượt này ưu tiên kiểm chứng tài liệu, công thức, dependency và hash. Không tự báo lại các checks source cũ là vừa chạy.
- Khi kiểm tra fixture benchmark495ml, bed có thể cao hơn tip cố định: chốt tipY thích ứng bedTop+.02, clamp [.14,2.0], activeLength.2; contact overlap vẫn chặn liquid0.1ml không chạm. Projection plane manual cố định tại pointerdown tránh nhảy khi bed đổi, rod y do engine remap.
- Browser gate của early slice ghi riêng, không hard-block mọi unit model/math bởi V1-03; release integration vẫn cần slice/browser đầy đủ. Early bridge là dependency thật, full visual là phần mở rộng sau.
- Validation v3:41 task duy nhất,15 trường/task,Index/body khớp,72case duy nhất,20/20review rows, links hợp lệ; DAG không cycle. Từ catalog thật: MVP36task O47.5/L67.5/P111.5h; L+20%buffer=81h còn lại. Optional deploy .5h likely và4POST_MVP22h likely tính riêng. Critical-path lower bound30.5h, có ties; demo dependency-closed D0=16.5h/D1=26h, không dùng để claim fullMVP3–4ngày.
- Numeric region/contact audit9fixtures đều đúngvolume reservation/pool envelope; thin.1ml contact0, dầu-only cóoilcarrier, fixture495mltipadaptfullcontact. Auto fast Ieq.7142857 được giữ. Đây là docmath checks, không application/runtime tests.
- Hash source/public/config/package/lock trước/sau v3 giống nhau. Chỉ Markdown đổi; không install/build/deploy hoặc tựcheckpoint/gitinit tronglượt này.
- Chốt seq/high-water/LRU256 và facade bind generation từng intent; reset mới tăng generation nhưng replay cùng ID không tăng. Ack tick là pre-command tick, generation/version post-command; ordinal=seq cho consumed command. autoDriveEnabled tách stop khỏi pause để auto không bật lại sau stop.
- Add mới vào Gu/Sb/Ol/W, fGu dilution và paused constraint remap; bốn regions có bảng số. Visual RNG riêng và copy caller-owned buffers; readonly không bảo vệ runtime typed arrays.
- Threshold numerical/label/hide/equilibrium tách riêng, không mass snap, no-water N/A; giữ fast Ieq=.7142857. Tính model times bằng equations/root solve và stop integration, không chạy engine source để gọi validated.
- Benchmark hai window reset/refill độc lập để sugar pool không cạn ở window manual; fixture495ml/N700, median/p95/resource20cycles, context failures và HTTP artifact/public publish tách riêng.
- O/L/P và DAG được tính lại; mọi số v2 ở audit dưới là lịch sử, không phải estimate hiện tại.

> Re-plan v2, 2026-10-17: trạng thái task chính thức chuyển sang docs/IMPLEMENTATION_TASKS.md. Phần audit dưới đây là bằng chứng lịch sử, không phải bảng task đang được đồng bộ thủ công.

## Skill
- Nguồn: https://github.com/OthmanAdi/planning-with-files
- Danh bạ: https://skills.sh/othmanadi/planning-with-files/planning-with-files
- Danh bạ hiện hiển thị khoảng 45.9K installs và 27.5K GitHub stars (tra cứu ngày 2026-10-17 theo múi giờ người dùng).
- Canonical path: skills/planning-with-files. Skill lưu task_plan.md, findings.md, progress.md.
- Cài đặt thành công bằng npx skills, chỉ chọn agent codex, phạm vi user.
- Đã xác nhận bản cài tại C:/Users/thong/.agents/skills/planning-with-files/SKILL.md; version 3.24.1.
- Đã đọc bản skill cài đặt, chạy PowerShell resolver: không có named plan, dùng ba file tại project root.
- Chưa cấu hình hook tự động hoặc thay đổi cấu hình host.

## Dự án hiện tại
- Giai đoạn 1 đã có scaffold, giao diện tiếng Việt, scene procedural, thêm chất và validation, camera, interface engine và tài liệu.
- Theo kết quả phiên trước: typecheck/lint/build pass; 3 test pass; npm báo 0 vulnerabilities sau nâng Vitest.
- Chưa xác minh WebGL trực tiếp trong trình duyệt. Chunk scene khoảng 916 kB, 248 kB gzip.
- Chưa có engine runtime, hòa tan, lắng, tách pha theo thời gian, dòng chảy, khuấy hoặc worker.
- Workspace chưa được khởi tạo Git.

## Phạm vi đã xác nhận
- Người dùng chọn lộ trình tổng thể, sau đó cung cấp yêu cầu chi tiết qua attachment.
- Lượt này chỉ audit và cập nhật kế hoạch; phải dừng để người dùng xác nhận trước khi lập trình.
- MVP gồm Phase 1–4, mục tiêu tổng 3–4 ngày gồm Ngày 1; Phase 5 chỉ ghi nhận tương lai.
- Không nhiệt độ, đun/làm lạnh, backend, database, đăng nhập, CFD.

## Audit source ngày 2026-10-17
Đã đọc source TS/TSX, CSS, cấu hình, README và docs; không suy ra hoàn thành từ tên file.

| Hạng mục | Trạng thái | Bằng chứng / giới hạn |
|---|---|---|
| Stack, module và build pipeline | Tested | package.json, vite.config.ts, tsconfig.json, eslint.config.js; typecheck/lint pass trong lượt này |
| Thêm bốn chất, cộng dồn, reset, validation | Tested | experimentStore.ts và 3 test Vitest chạy pass; chỉ logic store, chưa test UI |
| Thứ tự thêm bất kỳ | Implemented | add không phụ thuộc thứ tự; test hiện tại chỉ một chuỗi, chưa bao phủ 24 hoán vị |
| Giới hạn cốc | Partially implemented | Chặn occupiedVolume >500 theo quy ước đồ họa; chưa phải mô hình thể tích dung dịch |
| Lượng đã thêm trong UI | Partially implemented | Tổng được lưu nhưng UI làm tròn 2 chữ số; input step=any, min=0.1 trong khi store chấp nhận mọi số >0; cần quy ước độ chính xác chung |
| Cốc, vạch, bàn, đèn, nước/dầu, hạt và thìa | Implemented | Geometry/material có thật; hạt instanced; chưa xác minh hình ảnh bằng browser |
| Camera orbit/zoom/limits/reset | Implemented | OrbitControls có giới hạn, reset remount Canvas; chưa test thao tác thực |
| Responsive, focus, live status, fallback | Implemented | CSS/media query, label, role=status, Canvas fallback và error boundary; chưa chứng minh fallback bắt mọi lỗi GPU |
| Bảng kết quả | Partially implemented | ContentsPanel chỉ hiển thị lượng đầu vào, chưa có lượng hòa tan/lắng/giọt hay giải thích hiện tượng |
| SimulationEngine và Clock | Not implemented | Chỉ interface, không class/hàm runtime, không tick |
| Dissolution/Sedimentation/OilSeparation/StirringFlow | Not implemented | Mỗi file chỉ interface extends SimulationModel |
| Khuấy tự động/thủ công | Not implemented | Thìa tĩnh; interactions chỉ README, không controller |
| Pause/resume, bảo toàn khối lượng, worker | Not implemented | Không có logic tương ứng; workers chỉ README |
| Kiểm chứng runtime WebGL | Blocked | Phiên này không có tool browser; không cài browser, không tuyên bố chạy runtime |

`Implemented` = có logic/geometry cụ thể, chưa đủ bằng chứng kiểm thử toàn phần. `Tested` chỉ áp dụng phạm vi được ghi rõ. `Partially implemented` = có một phần yêu cầu. `Not implemented` = chưa có runtime. `Blocked` = bước kiểm chứng chưa thực hiện được, không đồng nghĩa ứng dụng lỗi.

## Package thực tế (npm ls --depth=0, lượt này)
React/ReactDOM 19.3.1; Vite 6.4.4; TypeScript 5.8.3; Three 0.180.0; Fiber 9.8.2; Drei 10.7.9; Zustand 5.0.15; Tailwind/@tailwindcss/vite 4.3.3; Vitest 5.0.5; ESLint/@eslint/js 9.39.5; typescript-eslint 8.71.2; plugin-react 4.7.0; hooks lint 5.2.0; refresh lint 0.4.26; globals 16.5.0; @types/node 22.20.5; @types/react 19.3.0; @types/react-dom 19.3.0; @types/three 0.180.0. npm ls không báo dependency thiếu/invalid. Không đổi package trong lượt này.

## Kiến trúc và khả năng tái sử dụng
1. Tái sử dụng App/layout, form nguyên liệu, danh sách chất, camera, hình học cốc/bàn/thìa, vật liệu nước/dầu và instancing. Chỉ nối lại dữ liệu từng phần, không viết lại toàn bộ.
2. Hiện scene đọc trực tiếp quantities từ Zustand; toàn bộ đường/cát được vẽ thành lớp cố định, dầu luôn trên nước bất kể lịch sử. Cần snapshot vật lý riêng và adapter render.
3. quantities trộn ml và g, thiếu khối lượng nước/dầu, chưa có tách sugar dissolved/undissolved và oil layered/dispersed. Chốt đơn vị và invariant trước khi làm khuấy.
4. Readonly<SimulationState> hiện chỉ shallow; arrays/objects còn mutable. Cần ownership/snapshot contract; không để renderer thay đổi engine.
5. step/update còn interface; thiếu fixed timestep, pause/reset, RNG seed, xử lý tab nền, thứ tự command/model và chống nhiều vòng lặp trong StrictMode.
6. Canvas frameloop=demand phù hợp scene tĩnh nhưng cần invalidate khi engine tiến triển. Reset camera đang remount Canvas: engine phải sống độc lập để không bị reset theo camera.
7. ParticleRenderer chỉ đặt matrix theo lượng, không position/velocity từ engine; không được dùng công thức chuyển động hình ảnh thay thế mô hình khoa học. Instance mass phải độc lập số lượng instance.
8. Các số 500, 2.1, bán kính và base lặp trong scene; nên tập trung geometry mapping khi bắt đầu nối simulation, tránh thay đổi không cần thiết ở audit.
9. Store dùng find(...)! cho IngredientId: type-safe nội bộ nhưng chưa validate command từ worker/runtime. Lịch sử additions tăng không giới hạn; cần đo, chỉ giới hạn bản ghi hiển thị nếu thực sự cần, không làm mất tổng lượng.
10. Mã TSX/CSS nhiều dòng dài, khó review nhưng không là lý do viết lại. Chỉ format module khi thực sự chỉnh module đó.
11. Kiểm thử hiện chỉ 3 store tests; chưa có scientific tests, UI/E2E, performance baseline, 24 thứ tự hoặc combo tests.
12. Worker không bắt buộc để đạt MVP: đo frame time trước. Tách engine thuần TS ngay từ đầu để có thể chuyển worker sau mà không đổi mô hình.

## Kết quả kiểm tra trong lượt audit
- npm run typecheck: exit 0.
- npm run lint: exit 0.
- npm test: exit 0, 1 file / 3 tests pass.
- npm run build: exit 0; 601 modules, scene chunk 915.64 kB / 248.25 kB gzip; cảnh báo chunk >500 kB, không phải lỗi build.
- Runtime không có bằng chứng browser; chưa xác nhận có/không lỗi WebGL.
- Không chạy lại npm audit: kết quả 0 vulnerabilities thuộc phiên trước, không phải kết quả audit mới.

## Re-plan v2 — phát hiện mới và hiệu chỉnh kế hoạch
- Attachment mới yêu cầu thêm bốn cốc chứa nguyên liệu 3D. Source hiện chỉ có một Beaker trong LaboratoryScene và bốn mẫu màu CSS trong IngredientPanel; hạng mục này NOT_STARTED, không được tính đã hoàn thành.
- Đã đọc lại source, config, các tài liệu và ba planning files; không phát hiện runtime engine mới so với audit trước. Package versions được npm ls xác nhận lại, không có dependency missing/invalid.
- Các lượt npm scripts hiện thoát exit 1 mà không có diagnostic, cả sandbox và escalated. Đây là kiểm chứng chưa đạt, không thể gán lỗi TypeScript/lint cụ thể hoặc dùng kết quả pass cũ làm pass hiện tại. Đang thử gọi entry point Node trực tiếp để chẩn đoán lớp launcher.
- Công cụ browser vẫn không có; chưa chạy WebGL, console, camera hoặc mobile runtime. BLOCKED chỉ áp dụng bước kiểm chứng.
- Đã chụp SHA-256 source/public/config/lock trước thao tác tài liệu; sẽ so sau lượt để chứng minh không đổi ứng dụng.
- Kế hoạch cũ 18–25 giờ chưa tách hết transport/giọt, chuột và giới hạn đáy, stock vessels, lifecycle, scientific edge tests và release. Re-plan phải tính lại từ task, không ép vừa 3–4 ngày.
- Giữ các phát hiện precision, shallow Readonly, demand rendering, camera remount, duplicate scientific state và đại lượng visual không phải physical đã ghi ở audit trước.

## Quyết định kiến trúc v2 (đề xuất, chưa lập trình)
| Quyết định | Lý do | Bằng chứng/đánh đổi |
|---|---|---|
| Mass compartments là nguồn khoa học, particles đại diện là ánh xạ có trọng số | Không mất khối lượng khi thay số instance | Ledger test độc lập GPU; particles vẫn có transport dựa flow state, không animation tự do |
| Một engine owner ngoài Canvas; Zustand là UI và snapshot bridge | Reset camera không reset science, tránh hai nguồn totals | Cần migration từng action add/reset; không giữ hai bộ lượng mutable |
| Fixed timestep, seed, bounded transfer | Tests tái lập, giảm phụ thuộc FPS | Phải tách thời gian thật/giả lập và xử lý dropped backlog |
| Compartment model với contact rule hữu hiệu khi có nước | Tổ hợp không cần solver tiếp xúc từng hạt | Không mô phỏng oil barrier/contact topology; công bố rõ gần đúng |
| Capacity theo lượng đầu vào quy đổi bảo thủ, không theo phần đường biến mất | Không mở chỗ giả khi hòa tan | Không thể tích dung dịch đo được; user acceptance gate trước code |
| Các coefficient mẫu trong SCIENTIFIC_SPEC là teaching-model constants | Có đặc tả/test khả thi ngay mà không giả vờ hiệu chuẩn | Không phải số liệu thực nghiệm; calibration thuộc Phase 5 |
| Không worker trong baseline | Main thread/instancing giảm scope | Chỉ chuyển worker nếu profile chứng minh không đạt máy nghiệm thu |
| Static release task sau QA, chưa chọn host | Không backend, giữ portability | Lượt này không deploy hay cấu hình tài khoản |

## Tài liệu kế thừa
- Giữ ngày/thực tế audit và log cài skill; không giữ task table cũ làm nguồn trạng thái thứ hai.
- task_plan.md chuyển thành roadmap ngắn; MASTER_PLAN giữ kiến trúc/schedule; IMPLEMENTATION_TASKS giữ mọi task/status/estimate; SCIENTIFIC_SPEC giữ công thức/invariant/test.
- Các nhãn Tested/Implemented cũ ánh xạ tương ứng COMPLETED_VERIFIED/IMPLEMENTED_UNVERIFIED; chỉ dùng khi phạm vi bằng chứng tương đương. Không coi task mở rộng mới hoàn tất vì baseline cũ có code.

## Kết quả xác minh re-plan v2 — phân loại hiện tại

Các nhãn ở bảng này là đánh giá subsystem theo bằng chứng, **không phải bản sao trạng thái task** trong catalog.

| Subsystem | Nhãn | Phạm vi chứng minh |
|---|---|---|
| Source inventory/stack/module | COMPLETED_VERIFIED | Đã đọc source và npm ls lại |
| TypeScript/lint/unit baseline/build qua Node entry point | COMPLETED_VERIFIED | tsc --noEmit, eslint ., vitest run3tests, vite build đều exit0 |
| npm script wrapper | PARTIAL | Script có trong package nhưng current run exit1 silent; chưa giải thích root cause |
| Add/reset/cumulative/rejection baseline store | COMPLETED_VERIFIED | Chỉ3testcases hiện có, không bao hàm precision chung/24orders/UI |
| Forms/layout/geometry/water/oil/static particles/camera | IMPLEMENTED_UNVERIFIED | Source có logic/geometry, chưa browser kiểm chứng |
| Lượng/capacity/results đáp ứng full MVP | PARTIAL | Precision lệch, occupancy minh họa, chưa phase amounts/explanations |
| Bốn cốc nguồn3D | NOT_STARTED | Mẫu CSS không phải cốc3D |
| Runtime engine/clock/auto/manual/scientific models | NOT_STARTED | Chỉ interfaces và README giữ chỗ |
| Pause/resume, transport khoa học, mass invariants | NOT_STARTED | Chưa có runtime/test tương ứng |
| Browser baseline/runtime QA | BLOCKED | Không browser tool trong phiên, không tự cài package/browser |
| Static hosting release | NOT_STARTED | Có dist build nhưng chưa host/audience/URL, build không đồng nghĩa deployed |

Lệnh trực tiếp vừa chạy: `node node_modules/typescript/bin/tsc --noEmit`, `node node_modules/eslint/bin/eslint.js .`, `node node_modules/vitest/vitest.mjs run`, `node node_modules/vite/bin/vite.js build`. Không bỏ qua TypeScript khi dùng vite build trực tiếp: tsc đã chạy riêng pass. Scene chunk915.64kB/248.25kBgzip, warning>500kB;3tests pass. Current npm script lỗi được giữ riêng, không tuyên bố npm run pass ở lượt này.

## Schedule v2 thay estimate cũ
37task: Phase1=7, Phase2=9, Phase3=8, Phase4=9, Phase5=4. MVP còn45.5h (MUST44h + SHOULD1.5h), buffer20%=9.1h, tổng54.6h còn lại. Phase5=22h ngoài MVP. Khoảng8ngày tổng gồm Ngày1 theo8h/ngày; mục tiêu3–4ngày chỉ phù hợp demo subset có giới hạn, không fullMVP. Critical path lý tưởng21.5h chưa gồm resource serialization/buffer/browserblock.

## Xác minh không thay đổi ứng dụng
So sánh SHA-256 trước/sau toàn bộ src/public và package.json/package-lock.json/vite.config.ts/tsconfig.json/eslint.config.js/index.html/.gitignore: giống nhau. Chỉ sửa Markdown; dist là artifact đã build lại. Không chạy install/deploy/git init. Không có automatic approval rejection trong lượt này; npm script exit1 là vấn đề chạy command, không phải bị từ chối phê duyệt.
