# Progress

## 2026-10-21 — Tương Tác Kéo Chạm Cốc 500 ml Tự Nâng Rót, Đường Kéo Perspective & Giao Diện Tinh Gọn
- **Tình trạng:** Hoàn tất toàn diện 5 mục tiêu theo yêu cầu nghiệm thu tương tác:
  1. *Hình học tia chiếu thực tế (Không phân nhánh test/runtime):*
     - Chuẩn hóa mặt phẳng kéo đứng (vertical drag plane) đi qua đường nối từ vị trí cốc nguồn tới tâm cốc thí nghiệm 500 ml, với pháp tuyến hướng về phía camera.
     - Hàm kiểm thử `createCameraRay(cameraPos, targetPoint)` mô phỏng chính xác tia chiếu perspective từ vị trí camera qua điểm mục tiêu trên màn hình.
     - Kiểm thử thành công cả góc camera mặc định `[3.9, 3.4, 5.5]` và góc camera xoay `[-4.0, 3.4, 4.0]`. Đường kéo chứng minh tính liên tục (độ dịch chuyển mỗi bước $\le 0.35$, không teleport, kẹp an toàn trong phạm vi bàn).
  2. *Kéo cốc chạm cốc 500 ml thì tự nâng lên rót:*
     - Tiếp xúc 3D nhận diện tự động khi $d_{xz} \le 1.50$, $y \le 2.82$. Người dùng không cần tự nâng cốc lên cao và không cần thả chuột để kích hoạt.
     - Sau khi chạm: Cốc tự động bay thẳng lên cao độ an toàn $Y \ge 2.45$ (vượt vành cốc 2.32), lướt qua miệng cốc, nghiêng rót nguyên liệu vào trong, sau đó dựng thẳng và lướt về vị trí cũ trên bàn.
     - Rót theo lượng: Snapshot liều lúc bấm chuột, chạm là chốt commit một lần duy nhất; nhả chuột sau tiếp xúc không làm gián đoạn animation. Nhả chuột trước tiếp xúc hủy với lượng thêm bằng 0.
     - Rót tự do: Chạm cốc kích hoạt giai đoạn nâng (`lifting`); giữ chuột để rót liên tục theo nhịp 10Hz; nhả chuột khi đang nâng thì hủy với lượng 0; nhả chuột khi đang rót thì chốt toàn bộ decitick nguyên và dừng. Người dùng không cần giữ chuột trong halo trên cao khi đang rót.
  3. *Thông báo ngắn, rõ ràng:*
     - Hủy trước tiếp xúc: `"Kéo cốc nguyên liệu chạm cốc lớn để rót."`
     - Nhấn phím Escape: `"Đã dừng thao tác."`
     - Đạt dung tích tối đa: `"Cốc 500 ml đã đầy. Không thể thêm tiếp."`
     - Thông báo thành công: Sử dụng khối lượng được chấp nhận từ sổ cái động cơ (`bridge.add`).
  4. *Giao diện tinh gọn, tối ưu không gian 3D:*
     - Rót tự do: Ẩn hoàn toàn ô nhập và nút "+ Thêm", hiển thị nhãn tốc độ rót (`25 ml/s`, `15 ml/s`, `10 g/s`) và gợi ý ngắn gọn.
     - Rót theo lượng: Cảnh báo inline màu đỏ cạnh ô nhập khi số không hợp lệ hoặc vượt ngưỡng tối đa.
     - Thu gọn khối camera gesture thành mục collapsible `<details>` cùng nút "Đặt lại góc nhìn" nhỏ gọn; tinh gọn padding các bảng để tối đa hóa diện tích Canvas 3D.
  5. *Quality Gates & Preview Server:*
     - 36/36 test files passed (623/623 tests passed, bao gồm 37/37 tests cho `vesselInteraction.test.ts`).
     - `npm run typecheck` mã thoát 0 (`tsc --noEmit`).
     - `npm run lint` mã thoát 0 (`eslint .`).
     - `npm run build` mã thoát 0 (dist sinh hoàn chỉnh trong 9.27s).
     - Preview server HTTP 200 tại `http://localhost:4173/`.
     - Browser QA ghi nhận trạng thái pending kiểm tra thủ công.
- **Tình trạng:** Hoàn tất trọn vẹn cả 2 chế độ tương tác cốc: "Rót theo lượng" và "Rót tự do".
  1. *Segmented Switch chuyển chế độ:*
     - Lựa chọn rõ ràng "Rót theo lượng" vs "Rót tự do" trên `IngredientPanel`.
     - Khóa đổi chế độ khi đang kéo cốc hoặc đang rót (`isBusy`).
     - Khi ở chế độ Rót tự do: Các ô input liều lượng và nút "+ Thêm" được vô hiệu hóa kèm chú thích sư phạm rõ ràng; nhãn nổi cốc hiển thị trạng thái "Giữ chuột để rót", "Đang nghiêng cốc...", "Đang rót... +X ml".
  2. *Bộ đếm nhịp dòng chảy & Batching 10 Hz vào Authoritative Engine:*
     - Giữ chuột trong vùng nhận -> cốc chuyển tiếp mượt mà vào tư thế rót trong $0.25\text{ s}$ (thời gian chuyển tiếp không cộng dồn hóa chất).
     - Dòng nguyên liệu tuôn liên tục theo tốc độ thao tác chuẩn hóa: Nước $25\text{ ml/s}$, Dầu $15\text{ ml/s}$, Đường $10\text{ g/s}$, Cát $10\text{ g/s}$.
     - Bộ gom nhịp phát hành các batch decitick nguyên vào `bridge.add()` ở nhịp ~10 Hz (mỗi $100\text{ ms}$).
     - Nhả chuột (`pointerup`) lập tức dừng dòng chảy, dựng đứng cốc, flush các decitick nguyên cuối cùng vào engine và hủy phần lẻ $< 0.1\text{ ml/g}$.
  3. *An toàn hệ thống & Chất lượng:*
     - Ngắt gián đoạn: $\Delta t > 300\text{ ms}$ (lag/chuyển tab) bỏ qua tích lũy, không dồn tích lũy quá khứ.
     - Dung tích: Tự động dừng dòng chảy và khóa rót khi đạt giới hạn 500 ml.
     - Reset: Gọi `onReset()` hủy phiên rót dở dang, khôi phục OrbitControls và vô hiệu hóa batch muộn.
  4. *Kiểm chứng chất lượng:*
     - 18/18 tests trong `vesselInteraction.test.ts` pass (9 Chặng 1 + 9 Chặng 2).
     - 604/604 tests pass trên toàn bộ 36 test files (`npm test`).
     - `npm run typecheck`, `npm run lint`, `npm run build` đều đạt mã thoát 0 sạch sẽ.
     - Preview server chạy liên tục tại `http://localhost:4173/`, phản hồi HTTP 200.

## 2026-10-19 — Triển Khai Chặng 1: Nền Tảng Tương Tác Cốc & Kéo-Thả Rót Theo Lượng
- **Tình trạng:** Hoàn tất trọn vẹn nền tảng kéo-thả rót theo lượng (By-Dose Mode):
  - Kéo cốc bằng chuột trái trên mặt phẳng chiếu 3D.
  - Snapshot liều lượng tại `pointerdown` chống thay đổi form trong lúc kéo.
  - Vùng nhận Drop Zone với cơ chế Hysteresis ($R \le 0.45$ vào, duy trì $R \le 0.75$).
  - Thả đúng vùng: Rót cam kết đúng 1 lần vào engine và tự quay về bàn.
  - Thả ngoài hoặc Escape/blur: Tự động trượt về bàn, không thêm hóa chất.
  - Pointer capture & token fencing chống hủy oan khi `lostpointercapture`.
  - 9/9 tests pass trong `vesselInteraction.test.ts`.
- **Tình trạng:** Hoàn tất trọn vẹn cả hai sửa lỗi hình ảnh:
  1. *Khắc phục chất lỏng bị biến dạng / lòi ra ngoài khi nghiêng cốc nguồn (Bug 1):*
     - Bỏ `contentCounterRotationZ`, giữ khối trụ chất lỏng ($R=0.355, H_v=1.05$) luôn xoay đồng bộ bên trong thành cốc ($R_{inner}=0.38$).
     - Bật `localClippingEnabled = true` trên Three.js Canvas. Dùng mặt phẳng cắt `Plane((0, -1, 0), worldSurfaceY)` cắt ngang mức nước theo trọng lực thế giới.
     - Tạo nắp elip (`ellipseGeometry`) xoay ngược góc nghiêng $+\theta$ và kéo dãn $1 / \cos \theta$, bịt kín 100% tiết diện cắt của lòng trụ, đảm bảo mặt thoáng luôn nằm ngang và không lộ ra ngoài thành cốc ở mọi góc nghiêng $\theta \in [0, 49^\circ]$.
     - Cập nhật dòng rót `PouringStream` lấy gốc từ tọa độ thế giới thực tế của miệng rót cốc nguồn (`spoutPos`).
  2. *Khắc phục sắc vàng ở đáy cốc thí nghiệm 500ml (Bug 2):*
     - Thêm `count={0}` cho toàn bộ 5 `<instancedMesh>` trong `ParticleRenderer.tsx` ngay khi mount, triệt tiêu 700 hạt cát rác mặc định ở đáy cốc.
     - Trong `zeroAllMeshes()` và chu trình render, ẩn triệt để `sandBedMeshVolRef` và `sugarBedMeshVolRef` khi khối lượng $< 0.001$ g.
     - Thay đổi chất liệu kính trong `Beaker.tsx` sang tông xanh xám lạnh trong trẻo (`#e2f0f4`, `#d5e8ee`, `#8faec0`), đặt `depthWrite={false}` và phân tách `renderOrder`, triệt tiêu hoàn toàn hiện tượng z-fighting và tích lũy sắc vàng dưới đáy.
  3. *Kiểm chứng:*
     - 586/586 tests pass qua 35 test files (`npm test`).
     - `npm run typecheck`, `npm run lint`, `npm run build` đều đạt mã thoát 0 sạch sẽ.
     - Dev server (`task-6124`) chạy liên tục tại `http://localhost:5173/`.

## 2026-10-18 — Tinh Chỉnh Trực Quan & Quỹ Đạo Rót Cốc Nguồn Phía Trên Cốc 500ml
- **Tình trạng:** Hoàn tất trọn vẹn cả hai yêu cầu hình ảnh và animation:
  1. *Làm đường và nước khác nhau rõ rệt:*
     - Đường: Loại bỏ hoàn toàn khối trụ trắng bóng. Dùng đống tinh thể trắng ngà (`#f4eee1`), hạ nền xuống 0.32 (`#e8e2d4`), bổ sung 96 tinh thể lập phương instanced (`#ffffff`, roughness 0.35, metalness 0.08) tạo các điểm sáng phản quang (specular glints) trên đỉnh đống và bám dọc thành kính bên trong. Khi rót tuôn thành 32 hạt tinh thể lập phương xoay lật. Đường tan trong cốc 500ml trong suốt 100%, không sinh hạt.
     - Nước: Xanh ngọc trong suốt thanh khiết (`#38bdf8`, opacity 0.46 cốc nguồn, 0.38 cốc 500ml), mặt thoáng meniscal disc (`#7dd3fc`) và viền phản quang (`#bae6fd`), giữ mặt ngang thăng bằng theo trọng lực. Dòng rót là dải ruy-băng thuôn mượt.
     - Nhãn & khoảng cách: Bố trí tách biệt $Z \ge 1.1$ đơn vị ($[-1.1, 0.0, 1.2, 2.3]$), không đè lấn; bổ sung huy hiệu phân loại phụ ("Chất lỏng", "Hạt tinh thể", "Hạt khoáng"). Nhãn `pointerEvents: 'none'` không cản chuột.
  2. *Đưa cốc nguồn lên cao phía trên cốc 500ml trước khi rót:*
     - Độ cao hành trình $Y_{base} = 2.35 > 2.32$ (miệng cốc 500ml).
     - Miệng rót cố định tại $(-0.50, 2.75, 0.0)$, tạo khoảng không khí thẳng đứng nhìn thấy rõ $0.43$ đơn vị phía trên miệng cốc 500ml.
     - Nghiêng thuận chiều kim đồng hồ quanh miệng rót: tại $\theta = 49^\circ$, đáy cốc tự động nâng lên $Y_{base} = 2.35 > 2.32$ và lùi sang trái $X_{base} = -1.54$, toàn bộ cốc lơ lửng bên ngoài và phía trên cốc 500ml.
     - Dòng chảy rơi tự do từ $(-0.50, 2.70, 0.0)$ vào $(-0.38, Y_{dest}, 0.0)$, hoàn toàn bên trong lòng cốc.
     - Góc nhìn camera nâng lên `position: [3.9, 3.4, 5.5]`, `fov: 42`, OrbitControls `target: [0, 1.25, 0]`, tạo khoảng trống thoáng phía trên (headroom $>0.7$ đơn vị) không bao giờ bị cắt hình.
  3. *Kiểm chứng:*
     - 583/583 tests pass across 35 test files (`npm test`).
     - `npm run typecheck`, `npm run lint`, `npm run build` đều đạt mã thoát 0 sạch sẽ.
     - Dev server (`task-6124`) chạy mượt mà tại `http://localhost:5173/`.

## 2026-10-18 — Triển Khai Hoàn Tất Nâng Cấp Trải Nghiệm Thêm Nguyên Liệu & Rót Cốc Nguồn
- **Tình trạng:** Hoàn tất trọn vẹn việc nâng cấp trải nghiệm thêm nguyên liệu, animation nhấc/rót cốc nguồn và trực quan hóa phân biệt 4 chất:
  1. *Phân biệt rõ 4 cốc nguồn:*
     - Đường: Thay khối trụ trắng đục cũ bằng khối nền tinh thể ngà (`#f4eee1`), nón gồ ghề (`#faf7f0`) và 48 tinh thể đường instanced (`#ffffff`) tạo phản quang lấp lánh (specular glints); khi rót chảy thành 24 hạt rời rụng theo trọng lực.
     - Cát: Khối nền và đống cát vàng nâu đất (`#b5894b`, `#a07436`), 48 hạt cát instanced đa sắc vàng đất; khi rót chảy thành dòng hạt rơi.
     - Nước: Chất lỏng trong xanh mát (`#a5f3fc`), mặt thoáng tròn phản xoay theo trọng lực (`contentCounterRotationZ = -tilt`) giữ mặt nước luôn nằm ngang khi nghiêng cốc.
     - Dầu: Dung dịch vàng hổ phách (`#f59e0b`), mặt thoáng vàng tươi, dòng rót dạng dải chất lỏng liền mạch có gợn sóng vòng tròn tại điểm rơi.
     - Nhãn: Chuyển sang huy hiệu xanh ngọc phát sáng "Đang rót..." khi hoạt động, không chặn raycast.
  2. *Animation nhấc cốc và rót (2.2s):*
     - Module thuần túy `src/scene/pouringAnimationMath.ts`: Lift ($0 \to 0.35$s) $\to$ Move ($0.35 \to 0.85$s) $\to$ Tilt ($0.85 \to 1.15$s) $\to$ Pour ($1.15 \to 1.65$s) $\to$ Return ($1.65 \to 2.20$s).
     - Điểm xoay quanh miệng rót $(-0.75, 2.50, 0.0)$, dòng rót vào sâu trong lòng cốc $(-0.38, Y_{liquid}, 0.0)$ không xuyên thành.
     - Trở về chính xác 100% tọa độ gốc (zero drift).
  3. *Đồng bộ hóa lệnh thêm:*
     - Cập nhật `src/stores/experimentStore.ts`: `startPour`, `commitPour`, `finishPour`, `cancelPour`.
     - Pre-validation dung tích 500ml và kiểm tra liều lượng trước khi nhấc cốc; từ chối ngay nếu không hợp lệ.
     - Single-flight lock chống spam, vô hiệu hóa nút thêm và thí nghiệm mẫu trong lúc rót.
     - Lệnh thêm `bridge.add()` chỉ được gọi đúng 1 lần tại $t = 1.15$s.
  4. *Pause, Reset, Context Loss & Fallback:*
     - Khi paused vẫn xem được animation; `elapsedSeconds` không tăng.
     - Reset và Context loss hủy animation, dọn sạch cốc và chặn callback muộn bằng generation/token.
     - WebGL fallback và reduced-motion thêm trực tiếp qua cùng bridge command path.
  5. *Kiểm chứng:*
     - Bổ sung test suite `src/simulation/tests/ingredientPourInteraction.test.ts` (12/12 pass).
     - 583/583 tests pass qua 35 suites (`npm test`).
     - `npm run typecheck`, `npm run lint`, `npm run build` đều đạt mã 0.

## 2026-10-18 — Triển Khai Hoàn Tất 5 Nhóm Cải Tiến Tương Tác & Trực Quan Hóa (UX / Visualization)
- **Tình trạng:** Hoàn tất trọn vẹn 5 nhóm cải tiến trải nghiệm người dùng và trực quan hóa 3D theo đúng cam kết:
  1. *Nhóm 1 — Dễ nhận biết và kéo thìa:*
     - Thêm cylinder hit target tàng hình quanh cán thìa $R = 0.15$ trong `src/scene/StirringRod.tsx`.
     - Phản hồi con trỏ chuột (`grab` khi hover, `grabbing` khi kéo) và giải phóng sạch sẽ khi nhả/thoát chuột.
     - Vòng hào quang (`#38bdf8`) và núm cầm thìa (`#0284c7`) chỉ thị trực quan.
     - Cập nhật câu hướng dẫn trong `src/components/controls/ControlPanel.tsx` và phản hồi trạng thái khi thìa bị ẩn hoặc tạm dừng.
     - Bổ sung test suite `src/simulation/tests/spoonInteractionUx.test.ts` (5/5 pass).
  2. *Nhóm 2 — Chuyển động hạt tự nhiên hơn, giảm popping:*
     - Scale hạt mượt mà (scale fade-in $0.3 r \to 1.0 r$ trong ~120ms) trong `src/scene/particleMeshHelpers.ts`.
     - Nội suy mượt mà chiều cao cặn cát và đường; chuyển sang unit cylinder scaling trong `src/scene/ParticleRenderer.tsx`.
     - Đóng băng kích thước khi `paused === true`, dọn sạch về 0 khi `reset()`.
     - Cách ly đột biến buffer, giữ nguyên sổ cái khối lượng vật lý.
     - Bổ sung test suite `src/simulation/tests/particleVisualSmoothing.test.ts` (4/4 pass).
  3. *Nhóm 3 — Đồ thị khối lượng theo thời gian:*
     - Tạo component `src/components/results/MassTimeChart.tsx` (thuần SVG) biểu diễn $G_d$, $S_s$, $O_d$ theo `elapsedSeconds`.
     - Lấy mẫu 5Hz ($\Delta t \ge 0.2$s), bộ đệm tối đa 300 điểm với decimation xen kẽ.
     - Cập nhật tại chỗ khi tạm dừng, tự động xóa khi chuyển `generation`, không phụ thuộc `cameraRevision`.
     - Hỗ trợ ẩn/hiện từng chuỗi dữ liệu, crosshair tooltip và accessibility readout.
     - Bổ sung test suite `src/simulation/tests/massTimeChart.test.ts` (4/4 pass).
  4. *Nhóm 4 — Thí nghiệm mẫu một nút:*
     - Tạo component `src/components/presets/PresetExperiments.tsx` với 4 kịch bản mẫu (Đường tan, Đường bão hòa, Cát lắng, Dầu tách lớp).
     - Nạp mẫu qua luồng chuẩn `reset()` $\to$ `add()`, kiểm tra liều lượng hợp lệ.
     - Hộp thoại xác nhận an toàn khi cốc đang có chất, tự động ở trạng thái tạm dừng sẵn sàng quan sát.
     - Tích hợp vào `src/components/ingredients/IngredientPanel.tsx`.
     - Bổ sung test suite `src/simulation/tests/presetExperiments.test.ts` (4/4 pass).
  5. *Nhóm 5 — Tinh chỉnh ánh sáng, kính và bề mặt chất lỏng:*
     - Bổ sung back rim light (`#e0f2fe`) và beaker point light (`#f8fafc`) trong `src/scene/LaboratoryScene.tsx`.
     - Kính trong suốt cao cấp trong `src/scene/Beaker.tsx` (`opacity: 0.16`, `roughness: 0.08`, `metalness: 0.04`).
     - Mặt khum và gợn sóng chất lỏng trong `src/scene/WaterVolume.tsx` (`#7dd3fc`) và `src/scene/OilVolume.tsx` (`#f59e0b`).
     - Tạo module `src/scene/fluidSurfaceRipple.ts`: biên độ sóng $|offsetY| \le 0.004 \times intensity$, triệt tiêu về 0 khi tạm dừng hoặc không khuấy, bảo toàn độ cao trung bình, không xuyên thành kính.
     - Bổ sung test suite `src/simulation/tests/visualFluidPolish.test.ts` (6/6 pass).
- **Chất lượng toàn diện:**
  - 571/571 tests pass qua 34 test suites (`npm test`).
  - `npm run typecheck`: mã 0.
  - `npm run lint`: mã 0.
  - `npm run build`: mã 0.

## 2026-10-18 — Sửa Lỗi Treo Bàn Thí Nghiệm "Đang Chuẩn Bị Bàn Thí Nghiệm..."
- **Hiện tượng & Nguyên nhân:** Người dùng phản ánh trên trình duyệt (`localhost:5173`) chỉ thấy thông báo `Đang chuẩn bị bàn thí nghiệm...`, không hiện cốc 3D. Nguyên nhân do `RetryableLaboratoryScene` nằm bên trong `<Suspense>` kích hoạt suspension ở initial mount, khiến React 19 unmount/discard fiber của component con; khi import resolve, component mount lại khiến `useMemo` tạo `React.lazy()` mới, dẫn đến vòng lặp vô hạn hàng ngàn lần render/giây.
- **Khắc phục:** Chuyển tham chiếu `lazy(() => import('../scene/LaboratoryScene'))` vào state `SceneComponent` của Error Boundary `AppSceneBoundary` (nằm bên ngoài `<Suspense>`). Khi nạp xong, React tái sử dụng đối tượng lazy đã resolve và mount ngay `<LaboratoryScene />`.
- **Kiểm chứng:** 548/548 tests pass qua 29 suites (`npm test`), `npm run typecheck`, `npm run lint`, `npm run build` đều đạt mã 0; kiểm tra DOM trên trình duyệt xác nhận `<canvas>` 3D mount và render ổn định.

## 2026-10-18 — Chuẩn Bị Bàn Giao Local, Sửa Phân Loại Evidence & Rà Soát Regression (V4-07, V4-08, V4-09, V4-10)
- **Tình trạng:** Hoàn tất gói chuẩn bị bàn giao cục bộ (Local Handoff Package) tuân thủ nghiêm ngặt ranh giới bằng chứng thực nghiệm, chất lượng mã nguồn đạt 100% các quality gates.
- **Sửa phân loại Evidence & Trạng thái V4-10 (PARTIAL):**
  + Chuyển trạng thái V4-10 từ `COMPLETED_VERIFIED` về `PARTIAL` do acceptance catalog yêu cầu kiểm nghiệm trên trình duyệt thực tế nhưng automated headless runner chưa có bằng chứng thực nghiệm real context loss/restore.
  + Bảo toàn browser requirement trong catalog, không hạ chuẩn hay xóa yêu cầu trình duyệt để hợp thức hóa nhãn.
  + Làm rõ: Extension `WEBGL_lose_context` chỉ liên quan tới synthetic context loss testing, không phải điều kiện bắt buộc cho mọi ca E2E khác.
  + Ghi đúng: `preventDefault()` cho phép trình duyệt xử lý restore theo contract WebGL, không đồng nghĩa GPU resources được giữ nguyên trong phần cứng.
- **V4-07 — Regression Call Paths & Sửa Lỗi Tồn Đọng (PARTIAL):**
  + Sửa `src/simulation/bridge/SimulationBridge.ts`: Chặn lệnh `dispatchIntent({ type: 'resume' })` khi `isContextLost === true` với mã `reason: 'CONTEXT_LOST'`, bảo đảm mô phỏng không tự ý chạy khi 3D gián đoạn.
  + Sửa `src/scene/LaboratoryScene.tsx`: Thêm guard `activeCanvasRevision` trong `WebGLContextHandler`, loại trừ triệt để callback từ Canvas cũ đang unmount.
  + Sửa `src/app/App.tsx`: Tạo component `RetryableLaboratoryScene` tạo `React.lazy` instance mới khi retry, khắc phục triệt để lỗi React.lazy cache Promise bị rejected của dynamic import.
  + Sửa `src/components/controls/ControlPanel.tsx`: Gắn `disabled={isContextBlocked}` cho nút Tiếp tục và Bắt đầu khuấy tự động khi `webglStatus !== 'ready'`.
  + Bổ sung 2 tests mới vào `src/simulation/tests/contextFailure.test.ts` (tổng 11 tests). Toàn bộ 548/548 tests pass qua 29 test suites.
- **V4-08 — Hoàn Thiện Tài Liệu Bàn Giao (COMPLETED_VERIFIED):**
  + Hoàn thiện `README.md` bằng tiếng Việt sư phạm chi tiết: hướng dẫn cài đặt (`npm ci`), dev, test, preview (`npm run preview`), nhập liệu phẩy/chấm, phân biệt Auto/Manual, phân biệt Stop vs Pause vs Resume vs Reset vs Camera Reset, 3 kịch bản học tập, giới hạn mô hình chưa calibrated, in-memory persistence và recovery WebGL.
  + Cập nhật `docs/SCIENTIFIC_ASSUMPTIONS.md` khớp 100% với động cơ tính toán hiện hành và các giới hạn giáo dục.
- **V4-09 — Nghiệm Thu Local Production HTTP Artifact (PARTIAL):**
  + Bổ sung script `"preview": "vite preview"` vào `package.json`.
  + Phục vụ bundle `dist/` qua máy chủ HTTP cục bộ tại `http://localhost:4173/`.
  + Kiểm tra qua script `checkPreview.cjs`: `index.html` (HTTP 200, `text/html`), CSS (HTTP 200, `text/css`), main JS bundle (HTTP 200, `text/javascript`), lazy chunk `LaboratoryScene` (HTTP 200, `text/javascript`).
  + Dừng máy chủ ngay sau khi kiểm tra, không để process chạy ngầm. Ghi nhận browser production UI smoke là pending.
- **Trạng thái Quality Gates:**
  + `npm test`: 548/548 tests pass across 29 test suites (exit code 0).
  + `npm run typecheck`: tsc --noEmit (exit code 0).
  + `npm run lint`: eslint . (exit code 0).
  + `npm run build`: vite build thành công (exit code 0).

## 2026-10-18 — Triển khai V4-10 (WebGL failure, context loss/restore và resize) & Tiếp nhận User Evidence
- Hoàn thành V4-10 Xử lý lỗi WebGL, khôi phục context và thay đổi kích thước Canvas:
  + Ghi nhận bằng chứng người dùng: "Người dùng xác nhận đã thực hiện được thao tác kéo thìa thủ công." Không suy diễn rằng camera ownership trên toàn bộ các exit path, toàn bộ 7 bước checklist, benchmark hay khôi phục context trên trình duyệt thực tế đã được pass. Giữ nguyên trạng thái `PARTIAL` cho V4-05.
  + Cập nhật `src/interactions/ManualStirAdapter.ts`:
    * Thêm `onContextLost()`: giải phóng pointer capture (`releasePointerCapture`), mở khóa camera (`cameraTarget.setEnabled(true)`), reset controller và giải phóng engine drive.
    * Thêm alias `getActivePointerId()` trả về `getCapturedPointerId()`.
  + Cập nhật `src/simulation/bridge/SimulationBridge.ts`:
    * Thêm cờ `isContextLost`, `handleContextLost()`, `handleContextRestored()`, `isContextLostState()`.
    * Chặn gọi `stepFrame()` và `notifySceneInvalidate()` khi context đang mất để không gửi drawcall/buffer upload vào WebGL context đã hỏng.
    * Dừng scheduler RAF và tự động gọi `this.pause()`.
  + Cập nhật `src/stores/experimentStore.ts`:
    * Thêm `webglStatus: 'ready' | 'init_failed' | 'context_lost' | 'restoring'`.
    * Thêm `canvasRevision: number` và actions `retryCanvas()`, `reportWebGLInitFailed()`, `reportWebGLContextLost()`, `reportWebGLContextRestored()`.
  + Cập nhật `src/scene/LaboratoryScene.tsx`:
    * Xây dựng `WebGLFallbackView` với thông điệp tiếng Việt sư phạm rõ ràng, nút "↺ Thử lại hiển thị 3D" và nút "Tải lại trang" kèm cảnh báo mất dữ liệu.
    * Cải tiến `SceneBoundary` bắt lỗi khởi tạo và kết nối `onRetry={retryCanvas}`.
    * Thêm `WebGLContextHandler` lắng nghe `webglcontextlost` (gọi `e.preventDefault()`, cập nhật store/bridge) và `webglcontextrestored`.
    * Gắn dynamic key `key={`${cameraRevision}-${canvasRevision}`}` vào R3F Canvas để unmount/remount renderer sạch sẽ mà không động chạm engine ngoài Canvas.
    * Đặt prop `fallback={<WebGLFallbackView status="unsupported" onRetry={retryCanvas} />}` vào Canvas.
  + Cập nhật `src/app/App.tsx`:
    * Bọc `<Suspense>` của lazy Canvas bằng `AppSceneBoundary` để bắt lỗi tải chunk mạng (SC-W05) mà không làm sập form và thanh điều khiển.
  + Tạo test suite mới `src/simulation/tests/contextFailure.test.ts` (9 tests, exit code 0):
    1. SC-W01: Khởi tạo 3D thất bại không làm mất dữ liệu thí nghiệm, form/store hoạt động bình thường.
    2. Retry chỉ tạo lại renderer/canvas qua dynamic key, không tạo engine mới hay xóa dữ liệu ngầm.
    3. SC-W02: Xử lý `webglcontextlost`: gọi `preventDefault()`, hủy manual drag, khôi phục camera OrbitControls, pause mô phỏng, bảo toàn khối lượng/thời gian/thế hệ.
    4. Không tiếp tục upload hoặc tick renderer khi context đang bị mất.
    5. Sau khi context restored hoặc retryCanvas: giữ nguyên paused, chờ người dùng bấm Tiếp tục, first delta = 0 không chạy bù thời gian trôi qua.
    6. Không khôi phục thao tác kéo chuột cũ (drag/capture) sau khi phục hồi context.
    7. SC-W03: Thay đổi kích thước Canvas/viewport (Resize) và DPR không làm reset engine, khối lượng, thời gian.
    8. 20 chu kỳ remount/retryCanvas liên tiếp duy trì duy nhất 1 engine và 0 rò rỉ scheduler.
    9. Fencing callback giữa các phiên Canvas cách ly an toàn.
- **Trạng thái kiểm thử & Quality Gates:**
  + `npm test`: 546/546 tests pass across 29 test suites (exit code 0).
  + `npm run typecheck`: tsc --noEmit exit code 0.
  + `npm run lint`: eslint . exit code 0.
  + `npm run build`: vite build production exit code 0 (thành công trong 19.51s).
- **Trạng thái Task V4-10:**
  + `COMPLETED_VERIFIED` (Core/unit verified; real WebGL lose_context extension ghi nhận BLOCKED cho headless runner).

## 2026-10-18 — Chẩn đoán, Dừng tác vụ & Bàn giao trạng thái V4-05 (Browser E2E / Runtime MVP)
- **Tình trạng:** Đã dừng toàn bộ background tasks; hệ thống sạch, không còn tiến trình nào treo hoặc chạy ngầm.
- **Phân loại Evidence hiện có:**
  + *2 screenshots (`edge_scene_screenshot.png`, `edge_scene_screenshot2.png`):* Bằng chứng thực tế về initial WebGL render và bố trí hình học/nhãn quan sát được tại viewport 1366×768 chụp từ Edge headless. Tuyệt đối KHÔNG suy diễn các tương tác động auto/manual, pause/resume, scientific reset, benchmark hay resource lifecycle từ 2 ảnh này.
  + *537 unit & integration tests:* Bằng chứng kiểm thử tự động đạt 100% (exit code 0) trong phạm vi các test suite của vitest.
  + *Tương tác thực tế qua browser, benchmark 30s/FPS, 20 chu kỳ reset:* Chưa chạy và chưa có bằng chứng kiểm nghiệm (giữ nguyên NOT_RUN / BLOCKED).
- **Chẩn đoán nguyên nhân treo tác vụ:**
  + *Đã xác nhận:* Hàm `send()` trong script CDP tự viết sử dụng `new Promise()` trần, hoàn toàn thiếu timeout guard. Khi lệnh gọi CDP không giải phóng, tiến trình `task-5523` bị block vĩnh viễn ở trạng thái chờ.
  + *Giả thuyết:* Khả năng `Page.captureScreenshot` chờ sự kiện paint trong Edge headless Windows được ghi nhận là một giả thuyết khả dĩ (chưa có request/response log chi tiết ở mức frame).
  + *Thực tế dọn dẹp:* Việc di chuyển runner sang `scratch/` chỉ nhằm làm sạch workspace và giúp `npm run lint` đạt mã 0, không tự chứng minh lỗi tự động hóa đã được giải quyết.
  + *Capability còn thiếu:* Môi trường hiện tại thiếu browser automation runner chuẩn có timeout, protocol quản lý sự kiện tương tác DOM/WebGL an toàn và cơ chế wait-for-selector tin cậy.
- **Kiểm kê công việc và files đã thay đổi:**
  + `src/scene/IngredientVessels.tsx`: Tinh chỉnh dải vòng cung 4 cốc nguồn (`water: [-2.6, 0, -0.6]`, `sugar: [-2.7, 0, 0.4]`, `sand: [-2.5, 0, 1.4]`, `oil: [-2.1, 0, 2.3]`) tránh bị cốc thí nghiệm 500ml che khuất ở góc nhìn mặc định `[3.7, 3.1, 5.2]`.
  + `src/styles/index.css`: Sửa font heading `h1` sang `"Segoe UI",-apple-system,BlinkMacSystemFont,Arial,sans-serif` và loại bỏ `letter-spacing: -1px` âm, khắc phục hoàn toàn lỗi phân tách ký tự có dấu tiếng Việt ("Một chiếc cốc. Nhiều khám phá.") trên Windows browser.
- **Trạng thái kiểm thử & Quality Gates:**
  + `npm test`: 537/537 tests pass across 28 suites (exit code 0).
  + `npm run typecheck`: tsc --noEmit exit code 0.
  + `npm run lint`: eslint . exit code 0.
  + `npm run build`: vite build thành công (exit code 0, bundle production tại `dist/`).
- **Trạng thái Task V4-05:**
  + Giữ nguyên trạng thái `PARTIAL` / `BLOCKED` đối với browser automated runner. Không đánh dấu hoàn tất khi chưa có bằng chứng tương tác thực tế từ người dùng hoặc runner đạt chuẩn.

## 2026-10-18 — Triển khai V1-06 (Bổ sung bốn cốc chứa nguyên liệu 3D & Đính chính báo cáo V4-04)
- Hoàn thành V1-06 Bổ sung 4 cốc chứa nguyên liệu 3D (Nước, Đường, Cát, Dầu ăn) trên bàn thí nghiệm, đính chính các lỗi mô tả trong báo cáo V4-04 (checklist bão hòa, bỏ tuyên bố nhiệt độ phòng 25°C, đổi footer App.tsx, phân định review media query với browser measurement), và kiểm thử toàn diện:
  + Đính chính nội dung báo cáo V4-04:
    * Khẳng định hướng dẫn "Thêm 200g đường vào 100ml nước" trong checklist V4-04 là lỗi mô tả văn bản: với 100ml nước sức chứa là 200g ($G_t == \text{capacity}$ là bão hòa chứ không phải vượt sức chứa). Hơn nữa, giao diện chặn tối đa 100g/lần thêm.
    * Quy chuẩn checklist thử nghiệm bão hòa theo **Fixture UC1 chuẩn**: Thêm 40ml nước + 100g đường (capacity 80g, lượng đường vượt sức chứa 20g, thể tích đặt chỗ 105ml). Thêm 10ml nước khi tạm dừng nâng sức chứa lên 100g, xóa bỏ điều kiện đường dư vượt sức chứa mà bảo toàn khối lượng đã tan và thời gian.
    * Bỏ tuyên bố "nhiệt độ phòng 25°C" vì dự án sử dụng các tham số giáo khoa mặc định, không có mô hình nhiệt độ hay hiệu chuẩn định lượng thực nghiệm.
    * Sửa footer `src/app/App.tsx`: "Mô hình giáo dục tương tác 3D. Đồng hồ và trạng thái vật lý thống nhất."
    * Phân định rõ: CSS media query 390px đã qua source review và static bundle build; phép đo thực tế trên trình duyệt được ghi nhận rõ ràng là PENDING browser verification.
  + Cập nhật `src/scene/Beaker.tsx`:
    * Hỗ trợ `BeakerProps` (`radius`, `height`, `showGraduations`, `opacity`) để co nhỏ cốc nguồn ($R = 0.38$, $H = 1.05$) mà bảo toàn 100% hình học cốc 500ml mặc định khi không truyền props.
    * Bỏ vạch chia độ 500ml khi `showGraduations: false`.
  + Tạo component mới `src/scene/IngredientVessels.tsx`:
    * Hiển thị 4 cốc nguồn xếp thành dải vòng cung nhẹ bên trái bàn thí nghiệm ($x \in [-2.5, -2.2]$), cách tâm $\ge 2.55$ đơn vị (để lại $> 1.25$ đơn vị khoảng trống mở quanh cốc 500ml).
    * Nội dung trực quan: Nước (xanh lơ trong suốt + meniscus), Dầu ăn (vàng óng trong suốt + meniscus), Đường (khối kết tinh trắng + 14 tinh thể bề mặt xác định), Cát (khối trầm tích nâu vàng + 14 hạt bề mặt xác định).
    * Tính toán hạt bề mặt bằng lượng giác góc vàng xác định (`STATIC_GRAIN_OFFSETS`), không dùng `Math.random()` hay làm lệch seed RNG khoa học.
    * Nhãn Drei `<Html>` phía trên miệng cốc hiển thị tên tiếng Việt rõ ràng kèm chấm màu nhận diện và ghi chú nhỏ trên bàn "Thêm nguyên liệu bằng bảng điều khiển".
    * Đặt `raycast={() => null}` trên toàn bộ mesh của cốc nguồn để không chặn chuột tương tác với thìa hay camera.
    * Hoàn toàn độc lập với mass ledger: không bị trừ hao và không bị xóa khi scientific reset.
  + Cập nhật `src/scene/LaboratoryScene.tsx`:
    * Tích hợp `<IngredientVessels />` vào scene 3D procedural.
  + Xây dựng bộ test toàn diện `src/simulation/tests/stockVessels.test.ts` (6 tests, exit code 0):
    1. Cấu hình 4 cốc nguồn đúng ID, tên tiếng Việt và màu sắc đồng bộ `INGREDIENTS`.
    2. Bố trí không gian xác định (deterministic layout), không va chạm và nằm gọn trên bàn.
    3. Cốc nguồn độc lập hoàn toàn với experiment mass ledger và không bị tiêu hao.
    4. Bảo toàn các hằng số hình học và khoa học của cốc thí nghiệm 500ml.
    5. Giới hạn thêm mỗi lần: đường tối đa 100g, từ chối thêm 200g một lần.
    6. Phân biệt chính xác giữa $G_t == \text{capacity}$ (bão hòa) và $G_t > \text{capacity}$ (đường dư vượt sức chứa).
  + Tình trạng công cụ Browser QA:
    * Không có công cụ tự động hóa trình duyệt (Playwright/Puppeteer MCP tools) trong môi trường.
    * Trạng thái V1-06: `PARTIAL` (Core verified, Browser QA pending).
    * Cung cấp checklist 5 bước kiểm thử trực quan trên trình duyệt qua `npm run dev`.
  + Kiểm chứng chất lượng:
    * `npm test`: 537/537 tests pass across 28 test suites (exit code 0).
    * `npm run typecheck`: exit code 0.
    * `npm run lint`: exit code 0.
    * `npm run build`: exit code 0.

## 2026-10-18 — Hoàn thiện V4-04 (Kết quả, giải thích và responsive controls)
- Hoàn thiện V4-04 Kết quả, giải thích và responsive controls, xác minh các điểm sai lệch văn bản từ V4-03, dẫn xuất pure continuous phase rates không phụ thuộc vi phân 10Hz, cài đặt hysteresis hai chiều nearSaturation và nearComplete, chuẩn hóa hiển thị pha tiếng Việt sạch, bổ sung bảng chú giải màu sắc và mở rộng "Về mô hình", hoàn thiện responsive mobile 390px, khả năng truy cập a11y, và kiểm thử toàn diện:
  + Xác minh sai lệch mô tả từ báo cáo V4-03:
    * Khẳng định $S_0 = 2.0\text{ g/g-water}$ (`SOLUBILITY_SUGAR_DEFAULT = 2.0` tại `science.ts`), báo cáo trước viết nhầm $S_0 = 2.0\text{ g/ml}$.
    * Fixture L1: $O_t = 18\text{g}, O_l = 9\text{g}, O_d = 9\text{g}$ ($V_{Od} = 9 / 0.9 = 10\text{ml}$); báo cáo trước ghi nhầm "10g".
    * Fixture X: Dầu $70\text{ml} \implies O_t = 70 \times 0.9 = 63\text{g}$; báo cáo trước ghi nhầm "70g".
    * Lắng và hòa tan tiệm cận không cam kết bằng 0 tại thời điểm hữu hạn tùy ý.
    * `raycast={() => null}` chỉ nhằm giải phóng chuột cho thìa khuấy và `OrbitControls`.
    * Height guard $\le 0.0001\text{m}$ là guard hiển thị đồ họa 3D, không đổi mass ledger.
  + Cập nhật `src/components/results/contentsHelpers.ts`:
    * `formatCapacity` và `formatSaturationRatio`: trả về `N/A` khi $W=0$.
    * `formatDissolutionProgress`: giới hạn tối đa `99,9%` khi còn headroom hòa tan ($> 10^{-8}$), `100%` khi hết headroom.
    * `formatPhaseMass`: khối lượng $> 0$ và $< 0.1\text{g}$ hiển thị `<0,1 g`, không làm tròn thành $0\text{g}$.
    * Hysteresis hai chiều: nearSaturation $[0.98, 0.99)$ và nearComplete $L(Gt) = \max(0.01\text{g}, 0.01 \times Gt)$ với cơ chế chặn khi có đường dư vượt sức chứa.
    * `computePhaseRates`: dẫn xuất trực tiếp từ phương trình vi phân mô hình ($dG/dt, dSs/dt, dOd/dt$), bằng 0 khi paused.
    * `evaluateScienceState`: logic phân cấp ưu tiên (Empty $\to$ Water only $\to$ Paused $\to$ Dry/Oil-only $\to$ Dynamic/Rest) hỗ trợ đồng thời cát lắng và dầu tách lớp.
  + Cập nhật `src/components/results/ContentsPanel.tsx`:
    * Thay thế các ký hiệu biến thô bằng tên pha tiếng Việt sư phạm.
    * Hiển thị dòng đường dư khi $Gt > \text{capacity}_G + 10^{-8}$.
    * Bổ sung bảng chú giải màu sắc trực quan (Color Legend) và collapsible section "Về mô hình mô phỏng".
  + Cập nhật `src/components/layout/LabHeader.tsx` & `src/app/App.tsx`:
    * Gỡ bỏ badge cũ "Giai đoạn 1 · Khám phá", thay bằng "Mô phỏng tương tác".
    * Cập nhật footer app nêu bật "Đồng hồ mô phỏng authoritative".
  + Cập nhật `src/components/ingredients/IngredientPanel.tsx`:
    * Gán thuộc tính `id` và `htmlFor` cho các trường nhập liệu số lượng để tăng tính tiếp cận.
  + Cập nhật `src/styles/index.css`:
    * Thêm breakpoint responsive `@media (max-width: 480px)` cho `.ingredient-list` hiển thị dạng 1 cột trên mobile $390\text{px}$.
  + Xây dựng bộ test toàn diện `src/simulation/tests/resultsAndControls.test.ts` (16 tests, exit code 0):
    1. Formatting, Nullable & Boundary Handling (SC-U01, SC-U02).
    2. Hysteresis hai chiều (Near-Saturation & Near-Complete).
    3. Tiến độ hòa tan khi có đường dư vượt sức chứa (SC-U02).
    4. Continuous phase rates & vị từ lắng / tách lớp độc lập.
    5. Thứ tự ưu tiên giải thích hiện tượng (Condition Priority).
    6. Ba kịch bản người học (UC1, UC2, UC3) trên engine & store thật.
  + Tình trạng công cụ Browser QA:
    * Không có công cụ tự động hóa trình duyệt (Playwright/Puppeteer MCP tools) trong môi trường.
    * Trạng thái V4-04: `PARTIAL` (Core verified, Browser QA pending).
    * Cung cấp checklist 6 bước kiểm thử trực quan trên trình duyệt qua `npm run dev`.
  + Kiểm chứng chất lượng:
    * `npm test`: 531/531 tests pass across 27 test suites (exit code 0).
    * `npm run typecheck`: exit code 0.
    * `npm run lint`: exit code 0.
    * `npm run build`: exit code 0.

## 2026-10-18 — Hoàn thiện V4-03 (Render nước và dầu layer/droplets & Đính chính công thức hòa tan)
- Hoàn thiện V4-03 Render nước và dầu layer/droplets, xác minh công thức hòa tan và hoàn thành 3 regressions bắt buộc, kiểm chứng 4 fixtures hình học SPEC §4 (L0, L1, O, X), giải phóng sự kiện chuột kéo thìa bằng `raycast={() => null}` trên các mesh lỏng và cốc, và kiểm thử toàn diện:
  + Xác minh công thức hòa tan & Nền tảng khoa học:
    * Xác nhận công thức $k_{diss} = 0.08 \cdot I \cdot (1 + \text{contact})$ CHƯA TỪNG tồn tại trong codebase, mà chỉ là lỗi mô tả văn bản trong báo cáo V4-02.
    * Mã nguồn runtime tại [`src/simulation/models/Dissolution.ts`](file:///d:/IdeaProjects/virtual-solubility-lab/src/simulation/models/Dissolution.ts) và [`src/simulation/constants/science.ts`](file:///d:/IdeaProjects/virtual-solubility-lab/src/simulation/constants/science.ts) luôn tuân thủ chuẩn xác SPEC §5.2: $k_G = 0.025 + 0.25 \cdot I$, $\text{capacity}_G = 2 \cdot W$, $\text{available} = \min(G_u, \max(0, \text{capacity}_G - G_d))$, $dG = \text{available} \cdot (1 - e^{-k_G \cdot h})$.
    * Hoàn thành 3 regressions bắt buộc trong `renderLiquids.test.ts`:
      1. Có nước, không khuấy ($I=0$): đường vẫn tan ở tốc độ nền $k_{G0} = 0.025\text{ s}^{-1}$.
      2. Có nước, thìa ở trên không hoặc $I=0$ ($contact = 0$): đường vẫn tan ở tốc độ nền $k_{G0} = 0.025\text{ s}^{-1}$.
      3. Hệ không có nước ($W=0$, kể cả có dầu và khuấy mạnh): tuyệt đối không tan ($k_G = 0, dG = 0, G_d = 0$).
    * Kiểm chứng numeric fixtures độc lập: $W=10\text{g}, G_t=30\text{g}$ sau $1\text{s}$ (60 ticks, $h=1/60\text{s}$):
      - Cố định $I=0$: $G_d \approx 0.493801759\text{g}$ (sai số $< 10^{-8}\text{g}$).
      - Cố định $I=1$: $G_d \approx 4.808557536\text{g}$ (sai số $< 10^{-8}\text{g}$).
    * Phân định rõ dung sai: hiển thị $20.00\text{g}$ hoặc sai lệch $\le 0.05\text{g}$ là dung sai quan sát sư phạm; không phải epsilon bảo toàn khối lượng ($\max(10^{-8}\text{g}, 10^{-9} \times \text{totalMass})$).
  + Tinh chỉnh và đính chính các mô tả khác từ V4-02:
    * Trao đổi pha cát do scalar model điều phối; vận tốc particle transport chỉ là visual transport đại diện.
    * Không gọi `drag = 4.0/s` là Stokes hiệu chuẩn vật lý.
    * Lắng tiệm cận không cam kết $Sb = St$ hoặc $Ss = 0$ tại thời điểm hữu hạn tùy ý.
    * `Math.max(0, ...)` trong visual adapters chỉ là phòng thủ sai số làm tròn float; engine kiểm định nghiêm ngặt bất biến và fail nếu ledger mass $< -\varepsilon$.
    * Các lớp con của bed: lớp cát $[0.12, 0.12 + h_{sand}]$ và lớp đường $[0.12 + h_{sand}, regions.bed.top]$ có tổng chiều cao bằng $regions.bed.height$.
    * Khuấy hệ chỉ dầu nâng cát vào phong bì dầu, làm giảm lớp cát đáy trong khi khuấy.
  + Cải tiến Hình học 3D, Phân Vùng Lỏng và Raycast Immunity:
    * Cập nhật `src/scene/WaterVolume.tsx`: Thêm `raycast={() => null}` và height guard `if (height <= 0.0001) return null`.
    * Cập nhật `src/scene/OilVolume.tsx`: Chuẩn hóa bán kính từ $0.872$ về đúng `BEAKER_INNER_RADIUS` ($0.87$), thêm `raycast={() => null}` và height guard `if (height <= 0.0001) return null`.
    * Cập nhật `src/scene/Beaker.tsx`: Thêm `raycast={() => null}` cho thành cốc, đáy cốc và các vạch chia độ. Nhờ đó thao tác kéo chuột thìa khuấy và điều khiển camera không bị cản trở.
  + Xây dựng bộ test toàn diện `src/simulation/tests/renderLiquids.test.ts` (17 tests, exit code 0):
    1. Kiểm chứng đặc tả hòa tan SPEC §5.2.
    2. Regression 1: Có nước, $I=0$ tan nền $k_{G0} = 0.025\text{ s}^{-1}$.
    3. Regression 2: Có nước, $contact=0$ tan nền $k_{G0} = 0.025\text{ s}^{-1}$.
    4. Regression 3: $W=0$ tuyệt đối không tan.
    5. Numeric fixture độc lập: $W=10\text{g}, G_t=30\text{g}$ sau $1\text{s}$ ở $I=0$ và $I=1$.
    6. Fixture L0: Không khuấy, nước $100\text{ml}$, dầu $20\text{ml}$.
    7. Fixture L1: Khuấy mạnh, dầu phân tán $10\text{g}$, mức chất lỏng $0.624$ bất biến.
    8. Fixture O: Chỉ dầu + cát, cát lơ lửng nằm trong phong bì dầu, aqueous null.
    9. Fixture X: Hỗn hợp tối đa $495\text{ml}$ đúng ranh giới và phân vùng.
    10. Trao đổi giọt dầu: Khuấy mạnh $Ol \to Od$, ngừng khuấy tách pha tự nhiên $Od \to Ol$, bảo toàn $Ol + Od = Ot$.
    11. Giọt dầu nằm nghiêm ngặt trong $regions.aqueous$; cát trong hệ chỉ dầu nằm trong $regions.oil$.
    12. Triệt tiêu phantom mesh khi thể tích bằng 0 hoặc bề dày $< 0.0001\text{m}$.
    13. An toàn điều khiển khi paused, reset dọn dẹp và camera remount.
    14. Cô lập buffer caller-owned độc lập.
  + Tình trạng công cụ Browser QA:
    * Không có công cụ tự động hóa trình duyệt (Playwright/Puppeteer MCP tools) trong môi trường.
    * Trạng thái V4-03: `PARTIAL` (Core verified, Browser QA pending).
    * Cung cấp checklist 6 bước kiểm thử trực quan trên trình duyệt qua `npm run dev`.
  + Kiểm chứng chất lượng:
    * `npm test`: 515/515 tests pass across 26 test suites (exit code 0).
    * `npm run typecheck`: exit code 0.
    * `npm run lint`: exit code 0.
    * `npm run build`: exit code 0.

## 2026-10-18 — Hoàn thiện V4-02 (Render sugar và sand theo compartments)
- Hoàn thiện V4-02 Render đường và cát theo compartments authoritative, làm rõ 2 điểm rà soát báo cáo V4-01, hoàn thiện hình học đáy bán trong suốt không che khuất hạt rời rạc, và kiểm thử toàn diện:
  + Cập nhật `src/scene/ParticleRenderer.tsx`:
    * Thêm thuộc tính `transparent opacity={0.65}` cho 2 khối trụ trầm tích đáy cát (`sandBedHeight > 0.001`) và đáy đường (`sugarBedHeight > 0.001`).
    * Ngăn chặn triệt để rủi ro khối trụ đặc che khuất các hạt tinh thể đường và hạt cát rời rạc bên trong lớp trầm tích, đồng thời vẫn thể hiện rõ thể tích khối lắng.
  + Cập nhật `src/scene/LaboratoryScene.tsx`:
    * Áp dụng `Math.max(0, ...)` cho `guBed = Math.max(0, snapshot.mass.Gu * (1 - fGu))` và `sandMass = Math.max(0, snapshot.mass.Sb)` chống sai số số học âm.
  + Xây dựng bộ test toàn diện `src/simulation/tests/renderCompartments.test.ts` (14 tests, exit code 0):
    1. Phân chia $Gu$ thành $Gu_{bed} = Gu \times (1 - f_{Gu})$ và $Gu_{susp} = Gu \times f_{Gu}$.
    2. $Gd$ (đường đã tan) hoàn toàn KHÔNG sinh hạt đại diện trong bất kỳ pool nào.
    3. Hệ khô hoặc chỉ dầu luôn có $Gd = 0$, toàn bộ đường giữ nguyên ở pha rắn $Gu$.
    4. Định dạng $Gu < 0.1\text{g}$ hiển thị `<0,1 g` không làm tròn thành $0\text{g}$.
    5. Ngưỡng ẩn trực quan $0.001\text{g}$ ẩn hạt đại diện nhưng bảo toàn 100% khối lượng trên mass ledger.
    6. Cát phân chia nghiêm ngặt giữa $Sb$ (đáy) và $Ss$ (lơ lửng), không có trạng thái tan.
    7. Ngừng khuấy làm dòng xoáy suy giảm liên tục theo quán tính và cát lắng dần về đáy ($Ss \to Sb$) mà không rơi tức thì hoặc dùng animation giả tạo.
    8. Chiều cao lớp cát đáy và lớp đường đáy khớp chính xác với $regions.bed.height$ và $regions.bed.top$.
    9. Tọa độ không gian `computePoolBounds` chia tách chính xác lớp cát dưới đáy và lớp đường đọng bên trên cho cả lớp dày và lớp mỏng.
    10. Trong hệ chỉ dầu, cát lơ lửng và đường lơ lửng nằm hoàn toàn trong phong bì dầu $[regions.oil.bottom, regions.oil.top]$.
    11. Tỷ lệ bán kính hữu hiệu $r_{eff} = \min(r_{particle}, \text{height}/2)$ trong lớp mỏng bảo đảm hạt không lồi ra ngoài biên.
    12. Thêm chất khi paused cập nhật ngay phân vùng và tọa độ hạt nhưng không tăng thời gian hay vận tốc.
    13. Độc lập ngân sách hạt $N=10/100/700$ bảo toàn tính chất hạt và không sinh memory leak.
    14. Buffer caller-owned (~77KB) cô lập hoàn toàn, caller ghi đè buffer không ảnh hưởng core engine.
  + Giải trình và làm rõ 2 điểm rà soát báo cáo V4-01:
    * *Thời gian bão hòa:* Tại fixture $W=10\text{ml}, G=30\text{g}$ dưới auto fast ($6.0\text{ rad/s}$), tại $t=10\text{s}$ (600 ticks) đạt $Gd = 8.44\text{g}$ ($42.2\%$ sức chứa 20g), cần $\approx 60\text{--}100\text{s}$ để đạt bão hòa trong dung sai $\le 0.05\text{g}$. Câu văn "sau 10s đạt bão hòa 20g" là diễn đạt không chính xác trong văn bản giải trình trước; mã nguồn mô hình vật lý hoàn toàn chuẩn xác.
    * *Mức chất lỏng sau khi thêm đường:* $W=100\text{ml} + G=20\text{g}$ tại $t=0$ có thể tích đặt chỗ đường là $13\text{ml}$ ($0.65\text{ ml/g}$), thể tích nước là $100\text{ml}$, tổng mức chất lỏng trong cốc là $113\text{ml}$. Câu checklist trước đây nhầm lẫn lượng nước thêm vào với tổng mức chất lỏng trong cốc.
  + Tình trạng công cụ Browser QA:
    * Không có công cụ tự động hóa trình duyệt (Playwright/Puppeteer MCP tools) trong môi trường.
    * Trạng thái V4-02: `PARTIAL` (Core verified, Browser QA pending).
    * Cung cấp checklist 6 bước kiểm thử trực quan trên trình duyệt qua `npm run dev`.
  + Kiểm chứng chất lượng:
    * `npm test`: 498/498 tests pass across 25 test suites (exit code 0).
    * `npm run typecheck`: exit code 0.
    * `npm run lint`: exit code 0.
    * `npm run build`: exit code 0.

## 2026-10-18 — Hoàn thiện V4-01 (Mở rộng early bridge cho đầy đủ phase/render outputs)
- Hoàn thiện V4-01 Mở rộng bridge authoritative cho đầy đủ phase compartments và render outputs, xác nhận tính toàn vẹn kiến trúc một owner và một scheduler, kiểm chứng buffer isolation theo SC-B01, và kiểm thử toàn diện:
  + Cập nhật `src/components/results/ContentsPanel.tsx`:
    * Bổ sung hiển thị `Pha cát (Mô hình khoa học)` gồm 3 ngăn: Tổng lượng cát (St), Cát đọng đáy (Sb), và Cát lơ lửng (Ss) khi `snapshot.mass.St > 0`.
    * Giúp giao diện hiển thị trọn vẹn cả 4 chất và các ngăn khối lượng tương ứng xuất bản từ bridge.
  + Xây dựng bộ test toàn diện `src/simulation/tests/bridgeFull.test.ts` (18 tests, exit code 0):
    1. SC-B01 & Render Copy Contract: Buffer isolation và zero aliasing giữa engine private arrays và caller-owned target buffers (~77KB pre-allocated).
    2. Trả về poolRanges cho đầy đủ 5 pools hạt (`sugarBed`, `sugarSusp`, `sandBed`, `sandSusp`, `oilDroplet`).
    3. Full scalar snapshot với đầy đủ 10 ngăn khối lượng ($W, Gt, Gu, Gd, St, Sb, Ss, Ot, Ol, Od$), $f_{Gu}$, rod pose, contact, intensity, capacity, saturationRatio, dissolutionProgress.
    4. Ngữ nghĩa nullable khi thiếu nước ($W=0 \implies capacityG=0, saturationRatio=null, dissolutionProgress=null$).
    5. Freeze Dev: Object.freeze bảo vệ snapshot và nested objects chống mutation từ UI.
    6. Forced immediate publish khi nhận commands đồng bộ (`add`, `reset`, `pause`, `resume`, `releaseDrive`, `setMode`, `setAutoLevel`).
    7. Throttled publish ~10Hz (100ms interval) trong quá trình tick mô phỏng động liên tục.
    8. Metadata handshake SC-B03: Đồng bộ generation, stateVersion, renderRevision; resetCamera tăng cameraRevision độc lập ở UI mà không reset thế hệ khoa học.
    9. Paused add (SC-C07, SC-R04, SC-A01): Cập nhật ngay phân vùng cốc, rod tipY và tái ánh xạ hạt mà không tăng tick/thời gian.
    10. Bảng hằng số tốc độ khuấy `AUTO_LEVEL_SPEEDS` (`slow: 1.0, medium: 3.0, fast: 6.0 rad/s`).
    11. Flow 1: Tốc độ hòa tan đường theo vận tốc khuấy (Fast > Medium > Slow > Rest).
    12. Flow 2: Đạt bão hòa và thêm nước tiếp tục hòa tan (SC-D05), thêm dầu không tăng capacity.
    13. Flow 3: Nâng/lắng cát và phân tán/tách pha dầu, bảo toàn khối lượng nghiêm ngặt $Sb+Ss=St, Ol+Od=Ot$.
    14. Flow 4: Điều khiển tương tác, stale watchdog 150ms tự động nhả lực, toggleRod nhả lực trước khi ẩn thìa.
    15. Dọn dẹp subscription và tính lũy đẳng (idempotent) của `attachLifecycle`.
  + Rà soát và giải trình các điểm lưu ý từ V3-08:
    * `AUTO_LEVEL_SPEEDS` là `1.0, 3.0, 6.0 rad/s`; chữ "medium 4.0 rad/s" ở báo cáo V3-08 là lỗi typo.
    * Timestep test fixture dùng $W=100, G=20, S=20, O=18$ nên $0.2\text{g} = 1\%$ của $20\text{g}$ và $0.18\text{g} = 1\%$ của $18\text{g}$.
    * Ranh giới hạt trong long-run kiểm tra bao quát lòng cốc $r \le 0.87, y \in [regions.bed.bottom, regions.oil.top]$.
  + Tình trạng công cụ Browser QA:
    * Hệ thống môi trường hiện tại không tích hợp công cụ browser automation (Playwright/Puppeteer MCP tools).
    * Giữ nguyên trạng thái `PARTIAL` cho các task phụ thuộc WebGL/browser runtime (V2-08, V2-09, V2-04, V2-10, V2-11, V4-02, V4-03, V4-04, V4-05).
    * Cung cấp checklist 7 bước kiểm thử trực quan trên trình duyệt qua `npm run dev`.
  + Kiểm chứng chất lượng:
    * `npm test`: 484/484 tests pass across 24 test suites (exit code 0).
    * `npm run typecheck`: exit code 0.
    * `npm run lint`: exit code 0.
    * `npm run build`: exit code 0.

## 2026-10-18 — Triển khai V3-08 (Stability và independence của render rate)
- Triển khai V3-08 Stability và independence của render rate, khắc phục state ownership, replay 30/60/120 FPS, so sánh timestep h60 vs h120, N10/100/700 independence, timing edge cases, 1,000 randomized commands, và kiểm định toàn diện:
  + Cập nhật `src/simulation/core/SimulationState.ts`:
    * Bổ sung helper `cloneScienceState(state: ScienceState): ScienceState` thực hiện deep clone toàn bộ 16 trường vô hướng và 3 nested objects (`input`, `mass`, `rod`), bảo đảm không chia sẻ bất kỳ tham chiếu mutable nào.
  + Cập nhật `src/simulation/core/HeadlessSimulationEngine.ts` & `SimulationEngine.ts`:
    * `getState()` trả về detached clone `cloneScienceState(this.state)`.
    * Cung cấp các scalar accessors trực tiếp: `getMode()`, `getTickIndex()`, `getElapsedSeconds()`, `getStateVersion()`, `getOmegaRod()`, `getOmegaFlow()`, `getOmegaDrive()`.
  + Cập nhật `src/interactions/ManualStirAdapter.ts`, `src/simulation/bridge/SimulationBridge.ts`, `src/simulation/core/ReplayHarness.ts`:
    * Thay thế toàn bộ các lần gọi `getState()` bằng scalar accessors và `isPaused()`, loại bỏ hoàn toàn việc deep clone trong các vòng lặp hot loop của render và pointer move.
  + Xây dựng bộ test toàn diện `src/simulation/tests/stability.test.ts` (16 tests, 7 nhóm kịch bản):
    1. Kiểm chứng cách ly bộ nhớ: caller mutate detached nested objects không làm biến đổi core engine.
    2. Snapshot cũ không tự đổi sau advance.
    3. Mutate capture không làm đổi quỹ đạo bước kế tiếp (bit-identical).
    4. Đọc snapshot hoặc gọi copyRenderFrame không làm đổi quỹ đạo khoa học hay PRNG.
    5. Long-run 600s đúng clock (SC-N02): Mixed fixture M (495ml, seed 1729) qua 36,000 ticks sim-time liên tục, kiểm tra max mass error $< 10^{-11}\text{ g}$ và bounds hạt tại các checkpoints (0, 600, 18000, 36000 ticks).
    6. Representative N=700 visual budget chạy 600 ticks giữ nguyên bounds.
    7. FPS replay (SC-N01, SC-T01): Replay trace 12 lệnh trên 30, 60, 120 FPS hội tụ chính xác 600 scientific ticks, sai khác vô hướng $\le 10^{-6}\text{ g/rad}$, acks/seq/version/tickIndex exact.
    8. Timestep independence $h=1/60$ vs $h=1/120$ (SC-N05, SC-T03): 10 sim-seconds bảo toàn khối lượng $< 10^{-12}\text{ g}$, sai khác $Gd, Ss, Od \le 1\%$ lượng thêm, pose RMS $\le 0.05$ scene units.
    9. Visual budget N=10/100/700: Quỹ đạo vô hướng vật lý bit-identical 100%.
    10. Buffer mutation isolation: Caller corrupt buffer mục tiêu không ảnh hưởng dữ liệu các lần copy tiếp theo.
    11. Timing edge cases: $dt=0$ no-op, delta âm/NaN/Inf trả về `INVALID_DELTA`, advance 5s tại $h=1/60$ chạy 6 steps và bỏ 4.9s, tại $h=1/120$ chạy 12 steps và bỏ 4.9s.
    12. Pause/hidden dọn sạch accumulator remainder vào `droppedActiveWallTime`; thời gian ẩn không tính dồn vào active dropped time.
    13. 1,000 seeded randomized commands (SC-N03): Sinh xác định qua Mulberry32 (seed 1729), kiểm định tính nguyên tử khi reject, bảo toàn bất biến khi accept, max mass error $< 10^{-10}\text{ g}$.
  + Đính chính V3-07:
    * Làm rõ 72 kịch bản đã sinh xác định (16 subsets + 24 paused permutations + 24 interleaved permutations + 8 capacity/transition scenarios = 72 scenarios) trên 18 test blocks trong `combinations.test.ts`.
    * 16 subsets ở V3-07 chỉ chạy 60 ticks sim-time ($1.0\text{ s}$), không phải bài kiểm tra long-run. Long-run 600s đầy đủ (36,000 ticks) được chính thức thực thi và nghiệm thu trong V3-08 (SC-N02).
  + Kiểm chứng chất lượng:
    * `npm test`: 466/466 tests pass across 23 test suites (exit code 0).
    * `npm run typecheck`: exit code 0.
    * `npm run lint`: exit code 0 (0 errors, 0 warnings).
    * `npm run build`: exit code 0 (bundle sinh thành công trong 5.21s).
  + Trạng thái:
    * V3-08: `COMPLETED_VERIFIED`.
    * Các task cổng trình duyệt V2-08, V2-09, V2-04, V2-10, V2-11 giữ nguyên `PARTIAL` do thiếu môi trường browser automation.

## 2026-10-18 — Triển khai V3-07 (Ma trận tổ hợp và hoán vị)
- Triển khai V3-07 Ma trận tổ hợp và hoán vị, deterministic test matrix trên engine thật, xác minh các điểm rà soát V3-06 và kiểm định toàn diện:
  + Cập nhật `src/stores/experimentStore.ts`:
    * Bảo vệ `hasStarted`: chỉ gán `hasStarted: true` khi `bridge.start()`, `bridge.resume()` hoặc `bridge.startAuto()` trả về `ack.accepted === true`.
    * Lệnh bị từ chối giữ nguyên `hasStarted: false` và không thay đổi trạng thái chạy.
  + Cập nhật `src/scene/ParticleRenderer.tsx`:
    * Kiểm tra dung lượng buffer mục tiêu thông qua độ dài mảng thực tế (`targetRef.current.radii.length < requiredCapacity`) thay vì trường `count`.
    * Bảo đảm tính bất biến tham chiếu (reference preservation) của `targetRef.current` qua 20 frames liên tục khi budget không đổi.
  + Xây dựng bộ test toàn diện `src/simulation/tests/combinations.test.ts` (18 test suites / 72 scenarios chạy thực tế):
    1. Sinh xác định đủ 16 subsets của 4 chất (từ empty đến all-four).
    2. Chạy 16 kịch bản subsets độc lập qua 60 ticks sim-time trên fresh engines: kiểm định 8 bất biến, dry gate ($W=0 \implies Gd=0, Od=0$), sand không tan ($Sb+Ss=St$), và tính an toàn của bounds hạt.
    3. Sinh xác định đủ 24 permutations của 4 chất.
    4. Chạy 24 kịch bản hoán vị thêm khi tạm dừng (tick 0): tất cả đều đạt cùng trạng thái $W=100, Gt=10, St=10, Ot=18$, $V_{reserve}=132.5\text{ ml}$ và tiến triển giống hệt nhau khi unpause.
    5. Chạy 24 kịch bản hoán vị xen kẽ các mốc thời gian ($t=0, 30, 60, 90, 120$ ticks): bảo toàn khối lượng tại mọi tick, chứng minh $Gd$ phụ thuộc lịch sử thêm.
    6. Kiểm tra giới hạn cốc nước $500\text{ ml}$: 5 lần 100ml nhận, lần 0.1ml tiếp theo bị từ chối với `CAPACITY_EXCEEDED` (SC-IN03).
    7. Kiểm tra ranh giới $499.9\text{ ml} + 0.1\text{ ml} = 500\text{ ml}$; lần 0.1ml tiếp theo bị từ chối.
    8. Kiểm tra Fixture X ($495\text{ ml}$) thêm $5\text{ ml}$ nước nhận, thêm $0.1\text{ ml}$ dầu bị từ chối (SC-M05).
    9. Chứng minh hòa tan đường không tạo dung tích ảo trong cốc.
    10. Kiểm tra từ chối liều vượt ngưỡng `maxAddition` (`EXCEEDS_MAX_ADDITION`, SC-IN04).
    11. Chuyển tiếp Dry $\to$ Oil-only $\to$ Mixed bảo toàn các pha và vùng chứa (SC-R02, SC-S04).
    12. Cát lơ lửng trong hệ oil-only nằm trong phong bì dầu $[regions.oil.bottom, regions.oil.top]$ (SC-R01).
    13. Mô phỏng 600 ticks hệ bão hòa đa chất $W10, G30, S10, O20$ ổn định không trôi dạt (SC-M04).
    14. Ngừng khuấy khi đồng hồ chạy: lực về 0, dòng chảy suy giảm liên tục, cát lắng và dầu tách lớp.
    15. Thêm chất đồng bộ nhanh trả về stateVersion đơn điệu và acks tuần tự (SC-C02).
    16. Kiểm chứng canonical SC-A01 với baseline $Gu=5, Gd=5, f_{Gu}=0.4$ và chuỗi thêm chất.
    17. Kiểm chứng cờ `hasStarted` qua các chu trình start, resume, startAuto, pause, reset.
    18. Kiểm chứng buffer renderer bảo toàn tham chiếu bộ nhớ qua các frame (zero GC).
  + Kiểm chứng chất lượng:
    * `npm test`: 450/450 tests pass across 22 test suites (exit code 0).
    * `npm run typecheck`: exit code 0.
    * `npm run lint`: exit code 0 (0 errors, 0 warnings).
    * `npm run build`: exit code 0 (bundle sinh thành công trong 4.91s).
  + Trạng thái:
    * V3-07: `COMPLETED_VERIFIED`.
    * Các task cổng trình duyệt V2-08, V2-09, V2-04, V2-10, V2-11 giữ nguyên `PARTIAL` do thiếu môi trường browser automation.

## 2026-10-18 — Triển khai V3-06 (Compose models và thêm chất mọi thời điểm)
- Triển khai V3-06 Compose simulation models, điều phối orchestration duy nhất trong engine, giao dịch thêm chất nguyên tử mọi thời điểm, bảo toàn SC-A01 tuyệt đối, xử lý trạng thái UI tick 0 và buffer capacity renderer:
  + Cập nhật `src/stores/experimentStore.ts`:
    * Bổ sung cờ `hasStarted: boolean` vào interface `ExperimentStore`.
    * Khởi tạo `hasStarted: !initialSnapshot.paused`.
    * Bật `true` khi người dùng gọi `start()` hoặc `resume()`.
    * Reset về `false` khi người dùng gọi `reset()`.
    * Đồng bộ hóa trong listener `subscribeSnapshot`: khi generation thay đổi và snapshot ở trạng thái paused tại $t = 0$, reset `hasStarted` về false.
  + Cập nhật `src/components/controls/ControlPanel.tsx`:
    * Kết nối cờ `hasStarted` từ store vào badge trạng thái: `'Chưa chạy'` khi `!hasStarted && paused`, `'Tạm dừng'` khi `hasStarted && paused`, `'Đang chạy'` khi `!paused`.
    * Nút chính chuyển đổi linh hoạt: `'▶ Bắt đầu mô phỏng'` (khi `!hasStarted`) và `'▶ Tiếp tục mô phỏng'` (khi `hasStarted`).
    * Dọn dẹp biến `tickIndex` không sử dụng.
  + Cập nhật `src/scene/particleMeshHelpers.ts` & `src/scene/ParticleRenderer.tsx`:
    * Bổ sung `warnedPools: Set<string>` và tham số `poolKey` trong `updatePoolInstancedMesh` để deduplicate cảnh báo tràn dung lượng mesh (chỉ log 1 lần duy nhất cho mỗi pool).
    * Bổ sung cơ chế dynamic target buffer resizing trong `ParticleRenderer.tsx`: kiểm tra `engine.getParticleBudget() * 5` so với dung lượng `targetRef.current.count`. Nếu budget lớn hơn, cấp phát lại buffer caller-owned an toàn mà không ném ngoại lệ hay làm trắng cốc.
  + Xây dựng bộ test toàn diện `src/simulation/tests/composition.test.ts` (20 mandatory tests):
    1. Thứ tự bước logic đơn định xác định tuyệt đối (Controller -> Flow -> Dissolution -> Sand/fGu -> Oil -> Geometry/reconcile -> Transport -> Invariants -> Tick commit).
    2. Tổ hợp đa chất tạo Gd, Ss, Od, fGu và phân bổ đều 5 pools hạt đại diện.
    3. Kiểm chứng thực nghiệm SC-A01 trước và sau mỗi lần thêm tuần tự ($Gt10 \to Gt11$, $St10 \to St11$, $Ot18 \to Ot18.9$, $W100 \to W101$).
    4. Thêm chất khi tạm dừng đóng băng thời gian ($t=0, \text{tick}=0$) và không chạy hóa học ngầm.
    5. Thêm chất khi đang chạy cam kết vào mass ledger ngay lập tức tại biên lệnh trước tick tiếp theo.
    6. Thêm nước vào dung dịch bão hòa mở rộng sức chứa ($20\text{g} \to 40\text{g}$) và đẩy nhanh hòa tan.
    7. Thêm dầu không làm tăng sức chứa dung môi của nước.
    8. Chuyển tiếp Dry -> Oil-only -> Mixed phân bổ chất rắn vào đúng phong bì chất mang.
    9. Dung tích chiếm chỗ $V_{reserve}$ bảo toàn tuyệt đối qua các chuyển pha ($Gu \to Gd, Sb \to Ss, Ol \to Od$).
    10. Lệnh thêm bị từ chối bảo toàn 100% hóa học, transport và căn tính sinh hạt.
    11. Replay lệnh trùng lặp trả về ack được cache với `duplicate: true` mà không chạy lại.
    12. Reset tăng thế hệ `generation` và rào chắn các lệnh/mẫu/frame cũ.
    13. Remap hạt khi thể tích đổi chỉ dùng phép chiếu (`projection-only`), không kéo dãn affine hay xáo trộn danh tính.
    14. Lượng đầu vào cực nhỏ ($W=0.1, G=0.1$) tính toán ổn định, không sinh NaN hay đảo cận.
    15. Pause, stop và resume có hợp đồng ngữ nghĩa rành mạch.
    16. Zustand store bảo toàn góc nhìn camera và tùy chọn `showRod` qua reset.
    17. Tổng lượng cuối cùng giống nhau với lịch sử thêm khác nhau tạo ra trạng thái quá độ khác nhau.
    18. Replay trace tại 30, 60, và 120 FPS qua `TickBoundaryReplayHarness` cho kết quả scalar đồng nhất.
    19. DevFreeze của snapshot và cách ly buffer copy của renderer.
    20. Hồi quy toàn diện: chuỗi thêm chất đa bước bảo toàn khối lượng liên tục từ đầu đến cuối.
  + Kiểm chứng chất lượng:
    * `npm test`: 432/432 tests pass across 21 test suites (exit code 0).
    * `npm run typecheck`: exit code 0.
    * `npm run lint`: exit code 0 (0 errors, 0 warnings).
    * `npm run build`: exit code 0 (bundle sinh thành công trong 4.36s).
  + Trạng thái:
    * V3-06: `COMPLETED_VERIFIED`.
    * Các task cổng trình duyệt V2-08, V2-09, V2-04, V2-10, V2-11 giữ nguyên `PARTIAL` do thiếu môi trường browser automation.

## 2026-10-18 — Triển khai V2-09 (UI pause/resume/stop/reset thống nhất và 20 mandatory tests)
- Triển khai V2-09 UI pause/resume/stop/reset thống nhất, phân tách 3 chiều trạng thái, đính chính sai lệch typo tách pha dầu và hoàn thiện chẩn đoán:
  + Cập nhật `src/simulation/core/HeadlessSimulationEngine.ts`:
    * Thêm `isPaused(): boolean` vào interface `CommandEngineCore` và triển khai trên class `HeadlessSimulationEngine`.
  + Cập nhật `src/simulation/bridge/SimulationBridge.ts`:
    * Cập nhật `getGeneration(): number` gọi trực tiếp `this.engine.getCurrentGeneration()` thay vì truy xuất qua `getState().generation`.
    * Bổ sung phương thức `isPaused(): boolean` chuyển tiếp trực tiếp vào `this.engine.isPaused()`.
  + Cập nhật `src/scene/particleMeshHelpers.ts` & `src/scene/ParticleRenderer.tsx`:
    * Bổ sung cảnh báo `console.warn` khi `range.count > maxMeshCapacity` trong `particleMeshHelpers.ts`, bảo vệ không nuốt chửng lỗi tràn dung lượng.
    * Bổ sung `console.error` khi `copyRenderFrame` ném lỗi trong `ParticleRenderer.tsx` trước khi gọi `zeroAllMeshes()`.
  + Cập nhật `src/components/controls/ControlPanel.tsx`:
    * Tách bạch 3 chiều trạng thái độc lập trên giao diện:
      1. Clock state: `Chưa chạy` (`tickIndex === 0 && elapsedSeconds === 0`) / `Đang chạy` (`!paused`) / `Tạm dừng` (`paused`).
      2. Mode: `Quan sát` / `Khuấy tự động` / `Kéo thủ công`.
      3. Driver state: `Đang khuấy: X rad/s` / `Đã ngừng khuấy (thìa ở trạng thái nghỉ)` / `Thìa tạm dừng — đứng yên`.
    * Nút điều khiển tiến trình: hiển thị `▶ Bắt đầu mô phỏng` khi ở mốc ban đầu ($t = 0$), `▶ Tiếp tục mô phỏng` khi tạm dừng ($t > 0$), và `⏸ Tạm dừng mô phỏng` khi đang chạy.
    * "Ngừng khuấy" (`stopAuto` / `releaseDrive`): giải phóng lực truyền động của thìa nhưng giữ nguyên đồng hồ mô phỏng đang chạy, badge hiển thị "Đang chạy", dòng chảy suy giảm liên tục.
    * Chế độ quan sát (`observe`): hiển thị subtext tương ứng "Chế độ quan sát — mô phỏng đang chạy/tạm dừng".
    * Bổ sung ghi chú giáo dục: "* Ngừng khuấy chỉ ngắt lực của thìa. Tạm dừng đóng băng toàn bộ mô phỏng."
  + Xây dựng bộ test toàn diện `src/simulation/tests/controls.test.ts` (20 mandatory tests):
    1. Trạng thái khởi tạo controls (`paused = true`, `time = 0`, `tickIndex = 0`, `mode = observe`, `autoDriveEnabled = false`).
    2. Resume được chấp nhận ngay tại tick 0 (bắt đầu đồng hồ mà không cần tick trước).
    3. Tạm dừng (`pause`) đóng băng thời gian, các pha hóa học và tọa độ hạt.
    4. Ngừng khuấy (`stopAuto`) giữ đồng hồ chạy, lực khuấy về 0, dòng chảy suy giảm mượt mà.
    5. Ngừng khuấy $\to$ Tạm dừng $\to$ Tiếp tục KHÔNG tự ý kích hoạt lại khuấy tự động.
    6. Tạm dừng khi đang auto $\to$ Tiếp tục khôi phục cấu hình tốc độ và vận tốc góc của thìa.
    7. Tạm dừng khi đang kéo thủ công $\to$ giải phóng capture, khôi phục camera OrbitControls; khi tiếp tục yêu cầu `pointerdown` mới.
    8. Ẩn/hiện thìa khuấy (`toggleRod`) ngắt driver khi ẩn và không tự ý bật lại driver khi hiện.
    9. Thêm chất khi tạm dừng phát snapshot ngay tức thì và cập nhật hình học cốc mà không làm tăng thời gian hoặc tick.
    10. Thêm chất khi tạm dừng bảo toàn nguyên vẹn lượng đường đã tan ($Gd$), cát lơ lửng ($Ss$) và giọt dầu phân tán ($Od$).
    11. Thêm chất không hợp lệ bảo toàn tuyệt đối mass ledger và lịch sử `additions`.
    12. Thêm 100 ml $\to$ Reset $\to$ Thêm 50 ml còn đúng 50 ml (không lưu tàn dư của thế hệ cũ).
    13. Duplicate reset và stale ack/sample/frame handling (hàng rào chuỗi và thế hệ loại bỏ trùng lặp).
    14. Reset làm sạch hóa học nhưng bảo toàn góc nhìn camera (`cameraRevision`) và tùy chọn hiển thị thìa (`showRod`).
    15. Trạng thái UI phân biệt rạch ròi 3 chiều độc lập (clock, mode, driver).
    16. Đổi mức tốc độ autoLevel khi ở mode observe/manual không tự ý kích hoạt auto mode.
    17. Dọn dẹp phiên kéo thủ công khi stop, pause, reset, mode change, hide rod, blur, hidden.
    18. Thao tác điều khiển lặp đi lặp lại không sinh scheduler thứ hai hoặc rò rỉ RAF loop.
    19. Kiểm chứng công thức động học tách pha dầu: $k_{Separate} = 0.10 / (1 + 3I)$ theo SPEC §5.4; phân biệt với hệ số lắng của cát trong nước $0.15\text{ s}^{-1}$, làm rõ typo ghi chép trước đó.
    20. Hồi quy toàn diện: chuỗi thêm nước $\to$ thêm đường $\to$ khuấy tự động $\to$ ngừng khuấy $\to$ tạm dừng $\to$ thêm cát $\to$ tiếp tục $\to$ kéo thủ công $\to$ tạm dừng $\to$ reset bảo toàn 100% các định luật bảo toàn khối lượng và bất biến khoa học.
  + Kiểm chứng chất lượng:
    * `npm test`: 412/412 tests pass across 20 test suites (exit code 0).
    * `npm run typecheck`: exit code 0.
    * `npm run lint`: exit code 0 (0 errors, 0 warnings).
    * `npm run build`: exit code 0 (bundle sinh thành công trong 5.00s).
  + Giới hạn Browser / WebGL:
    * Môi trường hiện tại không có browser automation tool (headless browser). Chưa có browser runtime evidence.
    * Đánh dấu V2-09 ở trạng thái `PARTIAL (Core verified 412/412 tests, Browser QA pending)`.

## 2026-10-18 — Triển khai V2-08 (Vòng đời tick, pose thìa trong scene và regression tests)
- Triển khai V2-08 Vòng đời tick và pose thìa trong scene, đồng thời kiểm tra regression và cải tiến renderer:
  + Cập nhật `src/scene/ParticleRenderer.tsx` & tạo `src/scene/particleMeshHelpers.ts`:
    * Tách các hàm helper `updatePoolInstancedMesh`, `MAX_POOL_CAPACITY = 700`, `MAX_BUFFER_CAPACITY = 3500` sang `particleMeshHelpers.ts` để giữ `ParticleRenderer.tsx` thuần component, xóa sạch cảnh báo `react-refresh/only-export-components`.
    * Kẹp số lượng an toàn: `count = Math.min(Math.max(0, range.count), maxMeshCapacity)`, bảo vệ tuyệt đối không vượt dung lượng `InstancedMesh`.
    * Chuẩn hóa bán kính mặc định theo các hằng số khoa học `PARTICLE_RADIUS.sand` (0.026), `PARTICLE_RADIUS.sugar` (0.022), `PARTICLE_RADIUS_OIL_DROPLET` (0.028).
    * Hiệu chỉnh generation fencing: đọc trực tiếp `stamp.generation` từ render path của engine, sử dụng `lastRenderedGenerationRef` để từ chối các frame cũ bị hồi quy.
    * Khi reset thí nghiệm (`stamp.count === 0`), lập tức đặt `count = 0` trên toàn bộ 5 `InstancedMesh`, dọn sạch ghost particles ngay trong frame render đầu tiên kể cả khi paused.
    * Bảo vệ khi `copyRenderFrame` ném lỗi: lập tức gọi `zeroAllMeshes()` để tránh hiển thị một nửa pools hoặc frame hỏng.
  + Cập nhật `src/simulation/bridge/SimulationBridge.ts`:
    * Bổ sung phương thức `getGeneration(): number` trích xuất thế hệ hiện tại từ engine.
    * Triển khai `attachLifecycle` strictly idempotent: lưu `lifecycleCleanup`, tự động dọn dẹp phiên trước nếu được gọi lại, hoạt động an toàn trên cả môi trường browser lẫn headless/node.
    * Cập nhật `destroy()`: tự động gọi `lifecycleCleanup?.()` nếu còn hoạt động.
  + Cập nhật `src/interactions/ManualStirAdapter.ts`:
    * Bổ sung phương thức `isDragActive(): boolean` ủy quyền trực tiếp cho controller.
  + Xây dựng bộ stress test vòng đời chuyên biệt `src/simulation/tests/lifecycle.test.ts` (16 tests):
    1. StrictMode setup -> cleanup -> setup duy trì tối đa 1 active scheduler.
    2. Full cleanup hủy toàn bộ RAF handles, event listeners và subscriptions.
    3. Camera reset 20 lần bảo toàn tuyệt đối engine identity (`===`), khối lượng các chất, thời gian và thế hệ.
    4. Remount scene khi đang chạy không nhân tốc độ tick (~60 ticks/s ở 1x rate).
    5. Remount scene khi paused không làm tăng thời gian hoặc tick index.
    6. Renderer mới nhận frame hạt authoritative ngay khi đang paused mà không cần scientific tick.
    7. Reset khoa học đưa số lượng hạt về 0 lập tức, không còn ghost particles.
    8. Stale frame từ thế hệ cũ bị loại bỏ an toàn qua generation fencing.
    9. UI snapshot bị throttle không chặn hoặc làm rơi rớt render frame mới nhất.
    10. Remount camera giữa lúc kéo thủ công: kết thúc phiên kéo, khôi phục OrbitControls camera, bảo toàn dòng chảy còn dư `omegaFlow`.
    11. Callback trễ từ pointerId cũ không hủy phiên kéo mới.
    12. Ẩn tab (hidden) đình chỉ đồng hồ; quay lại (visible) không dồn ép thời gian thực (no spiral of death).
    13. Effective radius thu nhỏ trong các lớp mỏng ($height < 2r$) và ánh xạ trực tiếp vào tỷ lệ ma trận của instance mà không nhân đôi bán kính.
    14. Thay đổi ngân sách hạt (budget N) co giãn bộ nhớ an toàn không gây tràn buffer 3500 phần tử.
    15. Đột biến buffer của caller không làm ô nhiễm bộ nhớ mảng nội bộ của engine.
    16. Kiểm thử hồi quy toàn diện: auto stir -> pause -> thêm đường -> manual drag bảo toàn 100% định luật bảo toàn khối lượng.
  + Kiểm chứng:
    * `npm test`: 392/392 tests pass across 19 test suites (exit code 0).
    * `npm run typecheck`: exit code 0.
    * `npm run lint`: exit code 0 (0 errors, 0 warnings).
    * `npm run build`: exit code 0 (bundle sinh thành công trong 7.57s).
  + Giới hạn Browser / WebGL:
    * Môi trường hiện tại không có browser automation tool (headless browser). Chưa có browser runtime evidence.
    * Đánh dấu V2-08 ở trạng thái `PARTIAL (Core verified 392/392 tests, Browser QA pending)`.

## 2026-10-18 — Tích hợp Visual Particle Transport vào Renderer 3D (Đường, Cát, Dầu)
- Tích hợp động học vận chuyển hạt có thẩm quyền từ `engine` vào hệ thống hiển thị 3D và cải thiện khả năng quan sát:
  + Cập nhật `src/simulation/core/SimulationState.ts`:
    * Thêm định nghĩa kiểu `PoolKind = 'sugarBed' | 'sugarSusp' | 'sandBed' | 'sandSusp' | 'oilDroplet'`.
    * Thêm interface `RenderPoolRange = { offset: number; count: number }`.
    * Mở rộng `RenderTarget` với trường tùy chọn `poolIds?: Uint8Array`.
    * Mở rộng `RenderStamp` với trường tùy chọn `poolRanges?: Record<PoolKind, RenderPoolRange>`.
  + Cập nhật `src/simulation/models/ParticleTransport.ts`:
    * Khai báo hằng số `POOL_KINDS` theo đúng thứ tự sao chép `['sugarBed', 'sugarSusp', 'sandBed', 'sandSusp', 'oilDroplet']`.
    * Cập nhật `copyRenderFrame` để kiểm tra kích thước `target.poolIds` khi được truyền vào.
    * Ghi dải offset/count cho từng pool vào `poolRanges` và ghi ID pool (0..4) vào mảng `poolIds`.
    * Trả về `poolRanges` trong `RenderStamp`.
  + Cập nhật `src/simulation/bridge/SimulationBridge.ts`:
    * Thêm phương thức `copyRenderFrame(target: RenderTarget): RenderStamp` chuyển tiếp trực tiếp vào `this.engine.copyRenderFrame(target)`.
  + Tinh chỉnh vật liệu chất lỏng trong suốt:
    * `src/scene/WaterVolume.tsx`: Chuyển màu sang `#62c4e8` (nước trong), `roughness: 0.08`, `opacity: 0.32`, `transparent: true`, `renderOrder: 2`, `depthWrite: false`.
    * `src/scene/OilVolume.tsx`: Chuyển màu sang `#f5c842` (dầu ăn trong), `roughness: 0.15`, `opacity: 0.48`, `transparent: true`, `renderOrder: 2`, `depthWrite: false`.
  + Cập nhật `src/scene/ParticleRenderer.tsx`:
    * Sử dụng caller-owned buffers trong `useRef` (dung lượng tối đa 3500 hạt, cấp phát một lần duy nhất lúc khởi tạo, tốn khoảng 77 KB bộ nhớ heap, zero GC per-frame).
    * Trong `useFrame`, gọi `bridge.copyRenderFrame(targetRef.current)` và kiểm tra generation fence `stamp.generation === snapshot.generation`.
    * Quản lý 5 `InstancedMesh` tương ứng với 5 pools:
      1. `sandBed`: hạt cát đáy cốc (màu `#c89650`, roughness 0.9, radius 0.026).
      2. `sandSusp`: hạt cát xoáy lơ lửng trong nước/dầu (màu `#d9a35a`, roughness 0.85, radius 0.026).
      3. `sugarBed`: hạt đường đáy cốc (màu `#f0ede6`, roughness 0.5, radius 0.022).
      4. `sugarSusp`: hạt đường xoáy lơ lửng (màu `#ffffff`, roughness 0.2, metalness 0.15, opacity 0.92, radius 0.022).
      5. `oilDroplet`: giọt dầu phân tán xoáy trong nước (màu `#f59e0b`, opacity 0.85, roughness 0.15, radius 0.028).
    * Gán `raycast={() => null}` trên tất cả các `InstancedMesh` để các hạt không cản trở sự kiện chuột của thìa và cốc.
    * Phân cấp hiển thị: các hạt có `renderOrder = 1`, `depthWrite = true`.
    * Đĩa trầm tích đáy chỉ render khi khối lượng đáy $\ge 0.001\text{ g}$.
  + Cập nhật `src/scene/LaboratoryScene.tsx`:
    * Thay thế các khối gọi `ParticleRenderer` rời rạc cũ bằng một instance duy nhất `<ParticleRenderer regions={regions} sandMass={snapshot.mass.Sb} sugarBedMass={guBed} />`.
    * Cố định thứ tự `renderOrder`: 1 (hạt / đĩa đáy) $\to$ 2 (chất lỏng nước & dầu) $\to$ 3 (thành cốc thủy tinh).
  + Xây dựng bộ test tích hợp `src/simulation/tests/visualTransport.test.ts` (9 tests):
    1. Trả về đúng `RenderStamp`, điền `poolRanges` và `poolIds` phân biệt 5 pools.
    2. Buffer caller-owned cách ly hoàn toàn với bộ nhớ engine; đột biến bên ngoài không ảnh hưởng đến engine.
    3. Đường đã tan (`Gd`) bị loại trừ khỏi hạt hiển thị.
    4. Thêm cát ở trạng thái nghỉ nằm ở `sandBed`; khi khuấy chuyển dần sang `sandSusp`; dừng khuấy lắng trở lại `sandBed`.
    5. Thêm nước + dầu: khuấy làm dầu phân tán thành `oilDroplet`; dừng khuấy giọt dầu nổi tách lớp trở lại lớp dầu trên.
    6. Vị trí hạt `positions` di chuyển theo dòng xoáy khi khuấy và phân tán trong phạm vi cốc.
    7. Tạm dừng (`pause`) đóng băng tọa độ hạt; tiếp tục (`resume`) chuyển động trở lại.
    8. `SimulationBridge.copyRenderFrame` phơi bày giao tiếp chuẩn xác với engine.
    9. Reset camera không ảnh hưởng và không làm sai lệch vị trí hạt.
  + Kiểm chứng chất lượng:
    * `npm test`: 376/376 tests pass across 18 test suites (exit code 0).
    * `npm run typecheck`: exit code 0.
    * `npm run lint`: exit code 0.
    * `npm run build`: exit code 0 (build 5.26s, dist bundles sinh thành công).

## 2026-10-18 — triển khai V2-07 (Pointer ownership, interaction state machine và chuyển mode)
- Triển khai V2-07 Pointer Ownership, Interaction State Machine và Chuyển Mode:
  + Cập nhật `src/interactions/ManualStirAdapter.ts`:
    * Triển khai state machine 4 trạng thái tương tác: `observe`, `auto`, `manual-idle`, `manual-drag`.
    * Định nghĩa các interface trừu tượng: `PointerCaptureTarget`, `CameraControlTarget`, `PointerDownEventParams`, `InteractionState`.
    * Kiểm tra guard conditions nghiêm ngặt trên pointerdown: `mode === 'manual'`, `showRod === true`, `!paused`, `!isSuspended`, `pointerType === 'mouse'`, `button === 0` (chuột trái), `isHitSpoon === true`, chưa có con trỏ khác đang kéo, tia chiếu hợp lệ.
    * Quản lý quyền sở hữu camera: vô hiệu hóa OrbitControls (`cameraTarget.setEnabled(false)`) ngay khi bắt đầu kéo; khôi phục quyền camera trên MỌI nhánh thoát.
    * Quản lý pointer capture: bắt pointer (`captureTarget.setPointerCapture(pointerId)`); rollback an toàn (khôi phục camera, hủy drag session trong controller) nếu capture thất bại.
    * Triển khai hàm thoát lũy đẳng `endManualDrag(pointerId)`: nhả pointer capture an toàn, khôi phục camera, giải phóng driver trong engine nếu cùng generation và mode manual.
    * Đấu nối toàn bộ các sự kiện thoát: `onPointerUp`, `onPointerCancel`, `onLostPointerCapture`, `onWindowBlur`, `onPageHidden`, `onHideRod`, `onPause`, `onReset`, `onModeChange`, `detach`.
    * Bảo toàn khóa con trỏ và camera trong Stale Watchdog: khi dừng chuột $\ge 150\text{ ms}$, watchdog chỉ giải phóng drive ($\omega_{rod} = 0$) nhưng GIỮ NGUYÊN pointer capture và camera lock trong trạng thái `manual-drag`.
  + Cập nhật `src/simulation/bridge/SimulationBridge.ts`:
    * Khởi tạo mặc định `ManualStirAdapter` trong bridge nếu không truyền từ options.
    * Chuyển tiếp các intent điều khiển (`pause`, `reset`, `setMode`, `releaseDrive`) tới `manualAdapter`.
    * Lắng nghe vòng đời trình duyệt: `visibilitychange` (page hidden) và `window blur` gửi tín hiệu thoát kéo tới `manualAdapter`.
    * Hàm `destroy()` tự động gọi `manualAdapter.detach()`.
  + Cập nhật `src/stores/experimentStore.ts`:
    * Thêm action `setMode(mode: Mode)` cập nhật state và thông báo hướng dẫn người dùng bằng tiếng Việt.
    * Cập nhật `toggleRod`: khi ẩn thìa (`showRod = false`), tự động gọi `adapter.onHideRod()`.
  + Cập nhật `src/components/controls/ControlPanel.tsx`:
    * Bổ sung thanh chuyển đổi 3 chế độ: "Quan sát" (`observe`), "Khuấy tự động" (`auto`), "Kéo thủ công" (`manual`).
    * Bổ sung banner hướng dẫn khi ở chế độ thủ công ("Chọn thủ công, kéo thìa để khuấy. Thả chuột để ngừng truyền lực.").
    * Cảnh báo ngữ cảnh khi thìa bị ẩn hoặc mô phỏng đang tạm dừng.
  + Đấu nối Scene Interaction trong `src/scene/LaboratoryScene.tsx` và `src/scene/StirringRod.tsx`:
    * Gắn `orbitRef` vào `<OrbitControls ref={orbitRef} ... />`.
    * Tạo component `<ManualStirSceneWiring controlsRef={orbitRef} />` kết nối `cameraTarget`, `captureTarget` (`gl.domElement`), `getShowRod` và lắng nghe các sự kiện capture `pointermove`, `pointerup`, `pointercancel`, `lostpointercapture` với phép tính NDC từ `canvas.getBoundingClientRect()`.
    * Gắn sự kiện `onPointerDown` trên `<group onPointerDown={handlePointerDown}>` của `StirringRod.tsx`: chặn bubbling (`e.stopPropagation()`), kiểm tra chuột trái, chuyển đổi ray sang `Ray3D` và gửi vào `adapter.onPointerDown()`.
  + Tạo bộ kiểm thử toàn diện `src/simulation/tests/mode.test.ts` (20 test cases):
    1. Valid pointerdown preserves pose, captures ID, camera off.
    2. Invalid hit / ray / paused / hidden rod does not capture input.
    3. Second pointer cannot hijack active session.
    4. Move negative x/z and negative theta work across quadrants.
    5. Outside-canvas move and up handled via capture.
    6. Up / cancel / lostcapture / blur all trigger cleanup.
    7. Hide / pause / reset / mode / unmount all trigger cleanup.
    8. Capture failure triggers rollback and restores camera.
    9. Cleanup is idempotent when release triggers lostpointercapture.
    10. Stale watchdog clears drive to 0 while keeping capture and camera lock.
    11. Move after stale re-anchors properly.
    12. Auto -> manual -> auto preserves rod pose continuity.
    13. Delayed callback from old session cannot cancel new auto driver.
    14. Stale generation cannot rebase or modify engine.
    15. Camera reset preserves mass, elapsed time, and generation.
    16. Canvas attach/detach does not create a new scientific scheduler.
    17. Listener cleanup prevents duplicate samples.
    18. Touch / pen cannot become manual driver (mouse only).
    19. Residual flow decays continuously via e^{-(a+b)h} after release.
    20. Regression check across all existing test suites.
  + Kiểm chứng:
    * `npm test`: 367/367 tests pass across 17 test suites (exit code 0).
    * `npm run typecheck`: exit code 0.
    * `npm run lint`: exit code 0.
    * `npm run build`: exit code 0.

## 2026-10-18 — triển khai V2-06 (Suy ra vận tốc và hướng manual, deadzone, stale watchdog)
- Triển khai V2-06 Angular Velocity Estimator và Stale Watchdog:
  + Tạo `src/interactions/AngularVelocityEstimator.ts`:
    * Hàm pure `unwrapAngleDelta(thetaNow, thetaPrev)` sử dụng $\text{atan2}(\sin\Delta\theta, \cos\Delta\theta)$ unwrap mượt mà qua ranh giới $\pm\pi$.
    * Hàm pure `computeExponentialSmoothing(omegaPrev, omegaInput, dtSeconds, tau = 0.08)` với $\alpha = 1 - e^{-\Delta t / \tau}$.
    * Hằng số chuẩn: `MANUAL_DEADZONE_RADIUS = 0.0435`, `MANUAL_STALE_TIMEOUT_MS = 150`, `MANUAL_MAX_SPEED_RAD_PER_SEC = 8.0`, `MANUAL_FILTER_TAU_SECONDS = 0.08`.
    * Class `AngularVelocityEstimator`:
      - Quản lý trạng thái neo (anchor), lịch sử góc và mốc thời gian host monotonic.
      - Loại bỏ ngay các mẫu $\Delta t \le 0$, out-of-order, hoặc NaN/Infinity mà không làm ô nhiễm bộ lọc.
      - Thứ tự kẹp vận tốc chuẩn: kẹp vận tốc thô $\Delta\theta / \Delta t$ về $[-8, 8]\text{ rad/s}$ trước khi lọc, lọc exponential smoothing, sau đó kẹp đầu ra về $[-8, 8]\text{ rad/s}$.
      - Vùng chết bán kính $R_{dead} = 0.0435$ scene units: bên trong vùng chết lập tức đặt $\omega = 0$ và xóa lịch sử; khi thoát ra ngoài vùng chết, mẫu đầu tiên hoạt động như mẫu tái neo (`isAnchor = true, omega = 0`), mẫu thứ hai mới suy ra vận tốc góc, loại bỏ hoàn toàn hiện tượng spike khi quét qua tâm cốc.
      - Tự động tái neo khi khoảng cách thời gian $\Delta t > 150.0\text{ ms}$.
      - Cơ chế `snapshot()` và `rollback(snap)` phục hồi trạng thái nguyên vẹn.
      - Hàm `checkStale(nowMs)` kích hoạt giải phóng lực khuấy đúng 1 lần khi dừng chuột $\ge 150\text{ ms}$.
  + Cập nhật `src/interactions/ManualStirController.ts`:
    * Tích hợp `AngularVelocityEstimator` vào quy trình kéo chuột manual.
    * Nhận `inputTimeMs` trong `startDrag` (thiết lập neo ban đầu với $\omega = 0$) và trong `onPointerMove`.
    * Hỗ trợ `rollback(snap, prevPose)` khi lệnh bị engine từ chối.
    * Hỗ trợ `checkStale(nowMs)` chuyển tiếp sang estimator.
  + Cập nhật `src/interactions/ManualStirAdapter.ts`:
    * Gửi lệnh `manualSample` nguyên tử với `omegaRod: result.omega` tính toán được.
    * Rollback lịch sử ứng viên khi engine từ chối lệnh (`!ack.accepted`).
    * Triển khai `checkStale(nowMs)`: kiểm tra con trỏ dừng chuột $\ge 150\text{ ms}$, gửi lệnh `releaseDrive` vào engine.
    * Bảo vệ phiên stale: kiểm tra `state.generation === controller.getCaptureGeneration()` và `state.mode === 'manual'` để phiên stale cũ không thể giải phóng nhầm auto driver hoặc thế hệ simulation mới.
  + Cập nhật `src/simulation/core/SimulationEngine.ts` và `HeadlessSimulationEngine.ts`:
    * Mở rộng `ManualSampleIntent` hỗ trợ trường tùy chọn `omegaRod?: number`.
    * Engine kiểm tra tính hợp lệ của `omegaRod`, kẹp về $[-8, 8]\text{ rad/s}$ và cập nhật `state.omegaRod`.
    * Khi `releaseDrive` được kích hoạt hoặc $\omega_{rod} = 0$, $\omega_{drive} = 0$, dòng xoáy $\omega_{flow}$ phân rã liên tục giải tích $e^{-(a+b)h}$ chứ không bị giật về 0 đột ngột.
    * Re-export `AngularVelocityEstimator`, các hàm thuần và hằng số liên quan.
  + Cập nhật `src/simulation/bridge/SimulationBridge.ts`:
    * Thêm tùy chọn `manualAdapter?: ManualStirAdapter` vào `BridgeOptions`.
    * Thêm getter `getManualAdapter()` và setter `setManualAdapter(adapter)`.
    * Tích hợp hook giám sát `this.manualAdapter?.checkStale(time)` trong `stepFrame(timestampMs)` trước khi bước mô phỏng tiến tới.
  + Tạo bộ kiểm thử toàn diện `src/simulation/tests/manualVelocity.test.ts` (28 test cases):
    * Part 1 (1–12): Kiểm thử toán học bộ ước lượng (anchor, unwrap $\pm\pi$, lọc hàm mũ, kẹp $\pm 8$, deadzone $0.0435$, băng qua tâm không spike, khoảng nghỉ $> 150\text{ ms}$, biên thời gian $149.9, 150.0, 150.1\text{ ms}$, snapshot/rollback).
    * Part 2 (13–20): Kiểm thử watchdog và adapter (con trỏ đứng yên $\ge 150\text{ ms}$ tự release, mẫu lỗi không gia hạn deadline, phát đúng 1 lệnh release, di chuyển sau stale tự tái neo, pause/reset/mode xóa lịch sử, phiên stale cũ không ảnh hưởng auto driver, rollback khi engine từ chối lệnh, bảo toàn capture generation).
    * Part 3 (21–28): Tích hợp engine và bridge (manual omega sinh flow qua `stepStirringFlow`, omega 0 không xóa residual flow mà phân rã mượt mà, watchdog release trong bridge, watchdog dùng host time monotonic, poll stale không chạy thời gian/khối lượng, phát lại tất định qua 30/60/120 FPS bằng `TickBoundaryReplayHarness`, không rò rỉ timer/scheduler, kiểm thử hồi quy bảo toàn mọi định luật khối lượng).
  + Kiểm chứng:
    * `npm test -- --run`: 347/347 tests pass across 16 test suites (exit code 0).
    * `npm run typecheck`: exit code 0.
    * `npm run lint`: exit code 0.
    * `npm run build`: exit code 0.

## 2026-10-18 — triển khai V2-05 (Ray-plane projection và clamp thìa) & xác minh transport
- Xác minh các điểm transport liên quan:
  + Xác minh `ParticleTransport.ts`: `sugarSusp` trong hệ dầu đơn (`category === 'oil-only'`) lấy ranh giới từ `regions.oil` envelope, cùng hành vi với `sandSusp`, không dùng empty aqueous region.
  + Động học cản nhớt: `stepPoolTransport` tuân thủ nghiêm ngặt $v_{next} = v_{target} + (v - v_{target}) \cdot e^{-k_{drag} \cdot h}$ ($k_{drag} = 4.0\text{ s}^{-1}$) và $p_{next} = p + v_{next} \cdot h$.
  + Đơn vị: Tất cả tọa độ vị trí được tính toán trong scene units, không phải mét.
  + Bản chất pha: `sugarBed` là hạt đường rắn chưa tan ở đáy, không phải đường kết tủa (MVP chưa có precipitation).
  + Khối lượng: Tổng trọng số các pool Float32 khớp khối lượng pha trên ledger trong dung sai số thực đơn, ngoại trừ các pool bị ẩn do khối lượng nhỏ hơn $0.001\text{ g}$.
- Triển khai V2-05 Ray-plane projection và clamp thìa:
  + Tạo `src/interactions/RayPlaneProjection.ts`:
    * Triển khai hàm pure `intersectRayHorizontalPlane(ray, planeY)`.
    * Chuẩn hóa hướng tia và áp dụng ngưỡng lọc tia gần song song $|\hat{d}_y| < 10^{-5}$ (`NEAR_PARALLEL_THRESHOLD`).
    * Loại bỏ các giao điểm sau lưng tia ($t < 0$) hoặc inputs không hữu hạn (NaN/Infinity).
    * Cung cấp helper `rayFromThreeRay` chuyển đổi từ cấu trúc tia Three.js.
  + Tạo `src/interactions/ManualStirController.ts`:
    * Quản lý phiên kéo chuột: chốt `activePointerId`, `captureGeneration`, và `planeY` tại thời điểm `startDrag`.
    * Tính độ lệch kéo $\vec{\Delta}_{drag} = \vec{r}_{rod, XZ} - \vec{p}_{plane, XZ}$, bảo toàn vị trí chính xác tại $t_0$ ($< 10^{-9}$ scene units, zero jump).
    * Kẹp xuyên tâm candidate point $\vec{p}_{cand} = \vec{p}_{plane} + \vec{\Delta}_{drag}$ theo $R_{max} = 0.74$.
    * Bảo tồn góc $\theta$ tại tâm ($r < 10^{-6}$), không phát sinh NaN hay lỗi chia cho 0.
    * Độc quyền phiên: từ chối pointerId thứ hai cố gắng chiếm quyền điều khiển.
  + Tạo `src/interactions/ManualStirAdapter.ts`:
    * Cầu nối giữa sự kiện tia và `HeadlessSimulationEngine`.
    * Áp dụng chính sách paused: bỏ qua sự kiện di chuột khi engine đang tạm dừng để không làm thay đổi trạng thái khoa học (SCIENTIFIC_SPEC §6).
    * Fencing thế hệ: từ chối mẫu có `captureGeneration` cũ sau khi reset.
    * Chế độ position-only: gửi lệnh `manualSample` nguyên tử với $\omega_{rod} = 0$, không tạo $\omega_{drive}$ hay $\omega_{flow}$ trước khi có V2-06.
    * Giữ an toàn UI: Chưa bật drag trực tiếp trên scene 3D để tránh xung đột với OrbitControls.
  + Cập nhật `HeadlessSimulationEngine.ts`:
    * Trong `case 'manualSample'`: bảo tồn `this.state.rod.theta` khi $radius < 10^{-6}$ thay vì reset về 0.
  + Xuất module tương tác trong `src/interactions/index.ts` và `src/simulation/core/SimulationEngine.ts`.
- Bộ kiểm thử toàn diện `src/simulation/tests/manualPosition.test.ts` (22 test cases):
  + Part 1 (Pure Ray–Plane Projection - 6 tests): Tia thẳng đứng từ trên xuống; tia nghiêng với oracle giải tích độc lập; từ chối tia song song và gần song song; từ chối giao điểm sau lưng tia; xử lý an toàn NaN/Infinity/zero direction; hai góc nhìn camera khác nhau hội tụ về cùng một điểm thế giới.
  + Part 2 (ManualStirController State & Continuity - 8 tests): Pointerdown giữ pose trong tolerance $10^{-9}$ (SC-J01); move áp offset trước clamp; kẹp xuyên tâm không sinh artifact hộp vuông; di chuyển về tâm bảo tồn góc $\theta$; pointerId khác không thể can thiệp (SC-J04); move không hợp lệ không làm mất drag offset; `planeY` giữ cố định khi đáy cốc thay đổi (SC-R04); reset và kết thúc phiên xóa sạch offset cũ.
  + Part 3 (Engine & Adapter Integration - 8 tests): Cập nhật vị trí qua engine thật; position-only không tạo $\omega_{drive}$; từ chối generation cũ sau reset (SC-C05); paused move không đổi pose theo policy; lệnh hỏng/duplicate bảo toàn trạng thái; chuyển manual sang auto giữ nguyên vị trí tại $t_0$ và trơn tru tiến tới $0.4$ trong $0.25\text{ s}$ (SC-J01); kéo thìa không đổi khối lượng, input totals, hay reservation; helper `rayFromThreeRay` trích xuất đúng dữ liệu tia 3D.
- Kết quả kiểm chứng chất lượng:
  + `npm test -- --run`: 319/319 tests pass across 15 test suites.
  + `npm run typecheck`: exit 0 (`tsc --noEmit`).
  + `npm run lint`: exit 0 (`eslint .`).
  + `npm run build`: exit 0 (dist/ 621 modules, 4.79s).
- Cập nhật trạng thái V2-05 thành COMPLETED_VERIFIED (O=0; L=0; P=0 giờ) trong IMPLEMENTATION_TASKS.md và task_plan.md.

## 2026-10-18 — triển khai V3-05 (Transport hạt đại diện có bounds) & xác minh numeric V3-04
- Xác minh và khắc phục sai lệch numeric V3-04:
  + Xác minh: Sai lệch thuộc về văn bản trong báo cáo tóm tắt (nhầm lẫn giữa fixture được test và giá trị giả định trong mô tả). Runtime `OilSeparation.ts` hoàn toàn tuân thủ các phương trình vi phân giải tích liên tục SC-O01…SC-O05.
  + Thêm 2 test cases độc lập `2b` và `3b` trong `src/simulation/tests/oil.test.ts`:
    * Test 2b ($I = 0, Od_0 = 10.0\text{ g}$): $Od(1.0\text{ s}) = 10 \cdot e^{-0.10} \approx 9.0483741804\text{ g}$ (sai số $< 10^{-6}\text{ g}$).
    * Test 3b ($I = 1.0, W = 100\text{ g}, Ot = 10.0\text{ g}, Od_0 = 0$): $wf = 0.90, kBreak = 0.45, kSeparate = 0.025, \lambda_O = 0.475, Od(1.0\text{ s}) = \frac{180}{19}(1 - e^{-0.475}) \approx 3.5821415703\text{ g}$ (sai số $< 10^{-6}\text{ g}$).
  + Bộ test `oil.test.ts` tăng từ 23 lên 25 test cases, tất cả đều pass 100%.
- Triển khai V3-05 Transport hạt đại diện có bounds (`src/simulation/models/ParticleTransport.ts`):
  + Xây dựng bộ băm 32-bit FNV-1a MurmurHash3 finalizer `hash32` và `sampleUnitFloat`, độc lập với Math.random, đảm bảo tính tất định hoàn hảo.
  + Thiết lập 5 particle pools: `sugarBed`, `sugarSusp`, `sandBed`, `sandSusp`, `oilDroplet`.
  + Cơ chế reconciliation `reconcilePool`:
    * Phân bổ trọng số hạt $w_i = M_{phase} / N$.
    * Khởi tạo stateless các hạt mới bằng `hash32`.
    * Giữ nguyên vị trí và vận tốc các hạt hiện hữu (không kéo giãn tọa độ affine giả tạo).
    * Áp dụng ngưỡng ẩn trực quan `VISUAL_HIDE_THRESHOLD_GRAMS = 0.001` ($1\text{ mg}$): khi $M_{phase} < 0.001\text{ g}$ hoặc vùng chứa không hoạt động, đặt `activeCount = 0` (hạt biến mất về mặt thị giác mà không xóa khối lượng trên mass ledger).
  + Tích phân vận tốc và di chuyển hạt `stepPoolTransport`:
    * Vận tốc xoáy ngang $v_{swirl} = 0.25 \cdot \omega_{flow} \cdot (-z, x) \cdot \text{falloff}(r)$.
    * Vận tốc thẳng đứng nhiễu loạn kết hợp chìm lắng ($0.08$ solids trong nước, $0.03$ solids trong dầu) hoặc nổi giọt dầu ($0.06$ oil droplets trong nước).
    * Hồi quy cản nhớt số mũ với hệ số $k_{drag} = 4.0\text{ s}^{-1}$.
    * Tích phân Euler ổn định vị trí $p + v \cdot h$.
  + Kẹp biên hình học và phản xạ vận tốc `clampParticlePositionAndVelocity`:
    * Kẹp theo bán kính cốc ($r \le R - r_{eff}$), bảo toàn thành phần tiếp tuyến $v_\theta$ và triệt tiêu vận tốc pháp tuyến hướng ra ngoài ($v_r = \min(0, v_r)$).
    * Kẹp theo độ cao trục $Y \in [Y_{min} + r_{eff}, Y_{max} - r_{eff}]$, triệt tiêu vận tốc hướng ra ngoài ranh giới.
    * Tự động điều chỉnh bán kính hiệu dụng cho vùng mỏng ($H < 2 \cdot r_0 \implies r_{eff} = H / 2$) và kẹp vào tâm $Y$ của vùng.
  + Quản lý bộ nhớ và an toàn cách ly `ParticleTransportSystem`:
    * Engine sở hữu các TypedArray private (`positions`, `velocities`, `weights`, `radii`, `birthOrdinals`).
    * Phương thức `copyRenderFrame(target)` copy nguyên tử sang caller buffer, kiểm tra chống memory aliasing và đảm bảo việc sửa đổi target buffer ngoài engine không làm hỏng trạng thái nội bộ.
- Tích hợp Engine Headless `src/simulation/core/HeadlessSimulationEngine.ts`:
  + Thêm instance `ParticleTransportSystem` vào engine constructor.
  + Gọi `recalculateGeometryAndConstraints` và `transport.step(this.state, flowResult.omega, flowResult.intensity, h)` ở bước 7 của `stepFixedTick` (sau oil separation và trước kiểm định mass invariants).
  + Xuất các API: `copyRenderFrame`, `getParticleBudget`, `setParticleBudget`, `getTransport`.
  + Xử lý reset: làm rỗng toàn bộ pool hạt và đặt `activeCount = 0`.
- Bộ kiểm thử toàn diện `src/simulation/tests/transport.test.ts` (20 test cases):
  + Part 1 (Stateless Hash32, Seeding, Sampling & Budget Determinism): Budget $N=10, 100, 700$ cho cùng quỹ đạo vật lý vô hướng; replay tất định từng bit; lưu giữ birthOrdinal; tính bất biến qua getRenderFrame lặp lại.
  + Part 2 (Pool Membership, Region Bounds & Kinematics): Đúng 5 pool; zero bounds an toàn; kẹp biên thành cốc và triệt tiêu vận tốc pháp tuyến; tổng trọng số bằng khối lượng ledger; điều chỉnh trọng số khi đường tan; cát lơ lửng và lắng đọng; giọt dầu phân tán và nổi; hệ dầu đơn nằm trọn trong vùng dầu $L1$.
  + Part 3 (Commands & Lifecycle Integration): Thêm chất khi đang pause chiếu hạt vào vùng mới an toàn; pause đóng băng hạt; reset xóa toàn bộ activeCount; duplicate reset an toàn.
  + Part 4 (Memory Isolation & Copy Safety): Sửa đổi target buffer không ảnh hưởng engine; từ chối aliasing buffer; xử lý target thiếu kích thước.
  + Part 5 (Long Run Stability & Timestep Independence): Chạy 36,000 continuous ticks (600s) trên hỗn hợp mixed không lỗi số học, hạt luôn nằm trong bounds cốc; timestep độc lập giữa $h = 1/60$ và $h = 1/120$.
- Kết quả kiểm chứng:
  + `npm test -- --run`: 297/297 tests pass across 14 test suites.
  + `npm run typecheck`: exit 0.
  + `npm run lint`: exit 0.
  + `npm run build`: exit 0 (dist/ 618 modules, 4.57s).
- Cập nhật trạng thái V3-05 thành COMPLETED_VERIFIED (O=0; L=0; P=0 giờ) trong IMPLEMENTATION_TASKS.md và task_plan.md.

## 2026-10-18 — triển khai V3-04 (Dầu droplets và separation) & xác minh numeric V3-03
- Xác minh và khắc phục sai lệch numeric V3-03:
  + Xác minh: Lỗi thuộc về nhãn mô tả trong báo cáo tóm tắt lượt trước (gán nhãn điều kiện lifting cho số liệu kết quả của settling), không phải lỗi thuật toán runtime.
  + Thêm 3 test cases độc lập `1b`, `2b`, `9b` trong `src/simulation/tests/sand.test.ts` kiểm chứng trực tiếp Lifting tại $1.0\text{ s}$ ($I = 1.0, Ss_0 = 0, St = 10\text{ g}$):
    * Trong nước: $Ss(1.0\text{ s}) = \frac{120}{13} (1 - e^{-0.65}) \approx 4.4118851376\text{ g}$ (sai số $< 10^{-6}\text{ g}$).
    * Trong dầu: $Ss(1.0\text{ s}) = \frac{300}{31} (1 - e^{-0.62}) \approx 4.4715054426\text{ g}$ (sai số $< 10^{-6}\text{ g}$).
    * Tỷ lệ $f_{Gu}$ trong nước: $f_{Gu}(1.0\text{ s}) = \frac{12}{13} (1 - e^{-0.65}) \approx 0.4411885138$ (sai số $< 10^{-6}$).
  + Đổi tên test 1 và 2 thành rõ ràng `(Settling)` với $Ss_0 = 10\text{ g}, I = 0$: nước $8.607079764\text{ g}$, dầu $9.417645336\text{ g}$.
  + Xác nhận `computeBeakerRegions` trong `beaker.ts` đã bao gồm $0.60 \times Ss$ choán chỗ trong aqueous/oil region.
  + Làm rõ ngưỡng dry gate $10^{-9}\text{ ml}$ là zero guard số thực, không ảnh hưởng input thực tế $\ge 0.1\text{ ml}$.
- Triển khai V3-04 Dầu droplets và separation:
  + Cập nhật `src/simulation/constants/science.ts`: xuất `OIL_BREAKUP_COEFF = 0.5` ($s^{-1}$), `OIL_SEPARATE_BASE = 0.10` ($s^{-1}$).
  + Tạo `src/simulation/models/OilSeparation.ts`:
    * `computeOilCarrierFractions`: tính thể tích chuẩn $W_{ml} = W$, $O_{ml} = Ot / 0.9$ (dùng tổng dầu $Ot$), $waterFraction = W_{ml} / (W_{ml} + O_{ml})$ khi có cả nước và dầu.
    * `computeOilRates`: $kBreak = 0.5 \times I^2 \times wf$, $kSeparate = 0.10 / (1 + 3I)$, $\lambda_O = kBreak + kSeparate$.
    * `computeOilSeparationStep`: giải tích số học liên tục $-Math.expm1(-\lambda_O \cdot h)$ hướng về $Od_{eq} = Ot \times (kBreak / \lambda_O)$, bảo toàn $Ol + Od = Ot$, kẹp trong $[0, Ot]$, khi thiếu nước hoặc dầu ép $Od = 0, Ol = Ot$.
    * `stepOilSeparation`: áp dụng nguyên tử qua `applyPairedTransfer` với `oil_dispersion` ($Ol \to Od$) và `oil_separation` ($Od \to Ol$).
    * `computeAnalyticOilSeparation`: oracle giải tích liên tục cho kiểm thử độc lập.
  + Cập nhật `src/simulation/core/SimulationEngine.ts`: re-export `OilSeparation` types và pure functions.
  + Cập nhật `src/simulation/core/HeadlessSimulationEngine.ts`: gọi `stepOilSeparation` ở bước 6 của `stepFixedTick` (sau sand/fGu và trước geometry/constraints).
  + Cập nhật `src/components/results/ContentsPanel.tsx`: hiển thị hàng "Tổng lượng dầu (Ot)", "Dầu thành lớp (Ol)", "Dầu phân tán (Od)" khi $Ot > 0$.
- Tạo bộ kiểm thử `src/simulation/tests/oil.test.ts` (23 test cases):
  + Part 1 (Pure Model Unit Tests - 10 tests): SC-O01 water-only/oil-only/empty Od=0; SC-O03 settling I=0 Od1s=8.1435367623g; SC-O02 active I=1.0 Od1s=6.0628768124g; approach to equilibrium; water fraction ml vs mass ratio; edge cases h=0/Ot=0/lambda=0; invalid/negative inputs rejection; small residual preservation; mass conservation Ol+Od=Ot; timestep compatibility h=1/60 vs h=1/120.
  + Part 2 (Engine Integration - 13 tests): auto fast flow ramp Od creation; SC-O04 stop auto flow decay và separation chiếm ưu thế dài hạn; pause freezes Ol/Od; resume continues; add oil paused giữ Od; add water paused không tự tạo droplets; oil-only sand/fGu hoạt động bình thường; sugar capacity độc lập với dầu; SC-R03 beaker regions L0/L1/X không double-count; reset/duplicate reset; snapshot detached truthful; long-run 3600 ticks continuous invariant check với max error $< 10^{-11}\text{ g}$; frame rate independence 30/60/120 FPS ($< 10^{-6}\text{ g}$).
- Kiểm tra toàn bộ chất lượng:
  + `npm test -- --run`: 275/275 tests pass across 13 test suites.
  + `npm run typecheck`: exit 0 (`tsc --noEmit`).
  + `npm run lint`: exit 0 (`eslint .`).
  + `npm run build`: exit 0 (dist/ 617 modules, 4.68s).
- Cập nhật trạng thái V3-04 thành COMPLETED_VERIFIED (O=0; L=0; P=0 giờ) trong IMPLEMENTATION_TASKS.md và task_plan.md.

## 2026-10-17 — triển khai V3-03 (Cát suspension và sedimentation, động học fGu)
- Đọc yêu cầu V3-03 trong IMPLEMENTATION_TASKS.md và SCIENTIFIC_SPEC.md §3.5, §4–§5, §7–§10, các ca kiểm thử SC-S01…SC-S05, SC-R01…SC-R05, SC-A01.
- Cập nhật hằng số khoa học trong `src/simulation/constants/science.ts`:
  + Xuất `SAND_LIFT_MAX = 0.6` ($s^{-1}$).
  + Xuất `SAND_SETTLE_WATER = 0.15` ($s^{-1}$).
  + Xuất `SAND_SETTLE_OIL = 0.06` ($s^{-1}$).
- Triển khai mô hình động học cát và lơ lửng đường rắn trong `src/simulation/models/SandSuspension.ts`:
  + Phân tích tỷ lệ thể tích chất mang: `computeCarrierFractions(mass)` tính $W_{ml} = W$, $O_{ml} = Ot / 0.9$, $waterFraction = W_{ml} / (W_{ml} + O_{ml})$ khi có chất lỏng.
  + Tính tốc độ: $kLift = 0.6 \times I^2$, $kSettleBase = 0.15 wf + 0.06 (1 - wf)$, $kSettle = kSettleBase / (1 + 2I)$, $\lambda = kLift + kSettle$.
  + Tính bước chuyển pha cát thuần: `computeSandSuspensionStep`: dùng nghiệm vi phân liên tục $SsNext = SsEq + (Ss - SsEq) \cdot e^{-\lambda h}$ thông qua `-Math.expm1(-lambda * h)`.
  + Động học lơ lửng đường rắn $f_{Gu}$: `computeFGuStep` cập nhật $f_{Gu}$ mượt mà liên tục theo cùng phương trình vi phân $df_{Gu}/dt = kLift (1 - f_{Gu}) - kSettle f_{Gu}$, tự động đưa về 0 khi $Gu = 0$ hoặc hệ khô ($carrierTotal \le 10^{-9}$).
  + Áp dụng nguyên tử vào state: `stepSandSuspension(state, options)` thực hiện chuyển pha qua `applyPairedTransfer` với `sand_suspension` ($Sb \to Ss$) hoặc `sand_sedimentation` ($Ss \to Sb$), bảo toàn khối lượng và kiểm định `assertMassInvariants`.
  + Cung cấp nghiệm giải tích độc lập: `computeAnalyticSandSuspension` và `computeAnalyticFGu` làm oracle đối sánh cho kiểm thử.
- Tích hợp Engine Headless `src/simulation/core/HeadlessSimulationEngine.ts`:
  + Gọi `stepSandSuspension(this.state, { intensity: flowResult.intensity, h })` ở bước 5 của `stepFixedTick`, ngay sau `stepDissolution` và trước `recalculateGeometryAndConstraints`.
- Tối ưu hóa 3D Scene `src/scene/LaboratoryScene.tsx`:
  + Truyền $GuBed = Gu \times (1 - f_{Gu})$ vào `<ParticleRenderer kind="sugar">` và $Sb$ vào `<ParticleRenderer kind="sand">`.
  + Phân vùng cốc tính lại thể tích lớp đáy từ $0.65 GuBed + 0.60 Sb$ và thể tích aqueous từ $W + 0.65 Gd + 0.65 GuSusp$.
- Cập nhật các bộ kiểm thử liên quan:
  + Cập nhật test 18 trong `src/simulation/tests/auto.test.ts` để kiểm tra $f_{Gu}$ được nâng lơ lửng khi auto stirring hoạt động.
  + Cập nhật test 15 trong `src/simulation/tests/sliceWaterSugar.test.ts` để tính thể tích bed theo $0.65 GuBed$.
- Tạo bộ kiểm thử toàn diện `src/simulation/tests/sand.test.ts` (26 test cases):
  + Part 1 (Pure Model Unit Tests - 11 tests): SC-S02 nghiệm giải tích tại 1s trong nước ($Ss \approx 8.607079764\text{ g}$) và dầu ($Ss \approx 9.417645336\text{ g}$); $f_{Gu}$ giải tích tại 1s; lắng đọng sau stop; hỗn hợp nước-dầu; hệ khô SC-S01; cát không tan; pha loãng $f_{Gu}$ khi thêm đường lúc pause; Fixture O (Oil-only SPEC §4.1) bảo toàn ranh giới hình học và contact; tính tương thích timestep $h=1/60$ vs $h=1/120$.
  + Part 2 (Engine Integration - 10 tests): auto khuấy nâng cát và $f_{Gu}$; stop auto suy giảm dòng và cát lắng dần; pause đóng băng timeline; resume tiếp tục mượt mà; reset đưa $Sb = 0, Ss = 0, f_{Gu} = 0$; thêm cát khi đang chạy; thêm đường pha loãng $f_{Gu}$; tính độc lập frame rate $30/60/120\text{ FPS}$ (sai số $< 10^{-6}\text{ g}$); snapshot phản ánh trung thực $Sb, Ss, f_{Gu}$; mũi thìa thích ứng theo độ cao lớp cát.
  + Part 3 (Robustness - 5 tests): zero/tiny addition, độ bền số học 3600 ticks liên tục với sai số bảo toàn khối lượng cực đại $< 10^{-11}\text{ g}$, an toàn khi inputs âm/NaN/Infinity, tính độc lập giữa 2 engine instances song song.
- Chạy kiểm thử thực tế và nghiệm thu:
  + `npm test -- --run`: exit 0, 249/249 tests pass across 12 test suites.
  + `npm run typecheck`: exit 0 (`tsc --noEmit`).
  + `npm run lint`: exit 0 (`eslint .`).
  + `npm run build`: exit 0 (dist/ 616 modules, 5.28s).
- Cập nhật trạng thái V3-03 thành COMPLETED_VERIFIED (O=0; L=0; P=0 giờ) trong index và body của IMPLEMENTATION_TASKS.md và task_plan.md.

## 2026-10-17 — hiệu chỉnh V2-11 (Tính đúng đắn hiển thị, trạng thái khoa học & kịch bản nghiệm thu nước–đường)
- Đọc yêu cầu hiệu chỉnh V2-11, SCIENTIFIC_SPEC.md §5.2/§8 và TEST_CASES.md UC1.
- Hiệu chỉnh các nguyên lý hiển thị và đánh giá khoa học:
  + Cập nhật `src/simulation/constants/science.ts`:
    * Làm rõ đơn vị chuẩn: $S_0 = 2.0\text{ g đường / g nước}$ (`g/g-water`), $\text{capacityG} = S_0 \times W$.
    * Xuất `SOLUBILITY_SUGAR_DEFAULT = 2.0` và `SOLUBILITY_SUGAR_20C = SOLUBILITY_SUGAR_DEFAULT`.
    * Chú thích rõ ràng: mô hình giáo khoa giả định, MVP chưa mô phỏng nhiệt độ.
  + Cập nhật `src/components/results/contentsHelpers.ts`:
    * Sửa `formatDissolutionProgress(progress, headroomG)`: tính headroom của lượng có thể tan thay vì chặn theo $Gu > 0$. Khi $\text{headroom} > 10^{-8}$ và phần trăm thô $\ge 99.95\%$, chặn ở `"99,9%"`. Khi $\text{headroom} \le 10^{-8}$ và $\ge 99.95\%$, hiển thị `"100%"`.
    * Cập nhật `evaluateScienceState`: khi $W > 0, Gt = 0$ giải thích rõ "chưa thêm đường" và không kích hoạt nhãn hòa tan thành công hay bão hòa; tách biệt rõ ràng giữa `isSaturated` ($\text{gap} \le \epsilon$) và `isNearSaturation` ($\ge 0.99$ hysteresis); sửa chuỗi giải thích bão hòa thành "2,0 g đường / g nước theo mô hình giáo khoa".
  + Cập nhật `src/components/results/ContentsPanel.tsx`:
    * Tính `dissolvableTarget = Math.min(snapshot.mass.Gt, snapshot.capacityG)` và `dissolvableHeadroom = Math.max(0, dissolvableTarget - snapshot.mass.Gd)`.
    * Đổi nhãn thành "Tiến độ lượng có thể tan", phân tách rõ các dòng $Gt$ (Tổng lượng đường đã thêm), $Gd$ (Đường đã tan), $Gu$ (Đường rắn còn lại).
    * Phân biệt rõ các huy hiệu: "Đạt giới hạn hòa tan (trong sai số)", "Gần bão hòa", "Có đường dư", "Đã tan gần hết", "Đã tan hoàn toàn".
- Cập nhật bộ kiểm thử `src/simulation/tests/sliceWaterSugar.test.ts` (15 regression tests toàn diện):
  1. $Gu > 0$ và $< 0.001\text{ g}$: hạt 3D ẩn trực quan, ledger bảo lưu chính xác phần dư.
  2. Số dương nhỏ $Gu$: `formatPhaseMass` xuất `"<0,1 g"`, không bao giờ xuất `"0 g"`.
  3. Nhãn "Đã tan gần hết" không đồng nghĩa với $Gu = 0$.
  4. Fixture $Gu = 0$ cho trạng thái tan hoàn toàn: nhãn "Đã tan hoàn toàn" và tiến độ 100%.
  5. $Gt = 0$ (có nước, chưa có đường): không có nhãn tan hoàn thành hay bão hòa.
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
- Kiểm tra toàn bộ chất lượng:
  + `npm test -- --run`: 223/223 tests pass across 11 test suites.
  + `npm run typecheck`: exit 0 (`tsc --noEmit`).
  + `npm run lint`: exit 0 (`eslint .`).
  + `npm run build`: exit 0 (dist/ 615 modules, 6.08s).
- Cập nhật trạng thái V2-11 thành PARTIAL (Core calibrated & verified 223/223 tests, Browser QA pending) trong IMPLEMENTATION_TASKS.md và task_plan.md.

## 2026-10-17 — triển khai V2-11 (Nghiệm thu lát cắt nước–đường chạy thật)
- Đọc yêu cầu V2-11 trong IMPLEMENTATION_TASKS.md, MASTER_PLAN.md §4–§4.2, SCIENTIFIC_SPEC.md §4–§5, §8–§10, TEST_CASES.md UC1.
- Sửa lỗi và phản hồi kiểm toán từ V3-02:
  + Cập nhật `src/simulation/models/MassLedger.ts`: Xóa bỏ điều kiện snap `state.mass.Gu <= 1e-9`. Chỉ đặt $f_{Gu} = 0$ khi $Gu = 0$ tuyệt đối. Mọi phần dư dương cực nhỏ (ví dụ $10^{-11}\text{ g}$) được bảo tồn nguyên vẹn trong ledger và tham gia hòa tan theo tỷ lệ.
  + Cập nhật `src/simulation/constants/science.ts`: Làm rõ định nghĩa $S_0 = 2.0\text{ g/ml}$ là mô hình giáo khoa giả định tại 20°C (teaching model default), không phải độ tan thực nghiệm có calibration.
- Nâng cấp `ScalarSnapshot` và `HeadlessSimulationEngine`:
  + Thêm trường `fGu: number` vào `ScalarSnapshot` trong `src/simulation/core/SimulationState.ts`.
  + Xuất bản `fGu: this.state.fGu` trong `snapshot()` của `src/simulation/core/HeadlessSimulationEngine.ts`.
- Tối ưu hóa 3D Scene và Particle Renderer:
  + Cập nhật `src/scene/ParticleRenderer.tsx`:
    * Cố định cấp phát bộ đệm GPU `<instancedMesh args={[undefined, undefined, 700]}>`, cập nhật số lượng hiển thị thực tế qua `ref.current.count = count`.
    * Ngưỡng ẩn trực quan SPEC §8: Khi $amount < 0.001\text{ g}$, component trả về `null` (ẩn toàn bộ hạt và cylinder đáy).
  + Cập nhật `src/scene/LaboratoryScene.tsx`:
    * Dựng `phases: PhaseMasses` trực tiếp từ `snapshot.mass` và `snapshot.fGu`.
    * Gọi `computeBeakerRegions(phases)` để các phân vùng cốc co giãn theo thời gian thực ($V_{aq} = W + 0.65 \times Gd$, $V_{bed} = 0.65 \times Gu + 0.60 \times Sb$).
    * Truyền `amount={snapshot.mass.Gu}` vào `<ParticleRenderer kind="sugar">` và `amount={snapshot.mass.Sb}` vào `<ParticleRenderer kind="sand">`.
- Nâng cấp giao diện kết quả khoa học `ContentsPanel.tsx` & `contentsHelpers.ts`:
  + Tạo `src/components/results/contentsHelpers.ts`:
    * `formatPhaseMass`: $< 0.1\text{ g} \to \text{"<0,1 g"}$, $0 \to \text{"0 g"}$, số thực dấu phẩy tiếng Việt.
    * `formatCapacity`: $W \le 0 \implies \text{"N/A"}$, $W > 0 \implies \text{"200 g"}$.
    * `formatSaturationRatio`: $W \le 0 \implies \text{"N/A"}$, hiển thị phần trăm chuẩn tiếng Việt.
    * `formatDissolutionProgress`: $W \le 0 \implies \text{"N/A"}$, chặn trần `"99,9%"` khi $Gu > 0$ và raw progress $\ge 99.95\%$; chỉ hiển thị `"100%"` khi $Gu = 0$.
    * `updateHysteresisState`: Gần bão hòa (vào $\ge 0.99$, ra $< 0.98$), Đã tan gần hết (vào $Gu \le L(Gt)$, ra $Gu > 1.2 L(Gt)$).
    * `evaluateScienceState`: Nhận xét sư phạm chính xác theo mọi trạng thái hệ thống.
  + Cập nhật `src/components/results/ContentsPanel.tsx`:
    * Hiển thị bảng phân vùng pha nước–đường, huy hiệu trạng thái khoa học và hộp nhận xét sư phạm.
    * Quản lý trạng thái hysteresis qua `useRef` và reset sạch sẽ khi generation tăng sau reset.
- Tạo `src/simulation/tests/sliceWaterSugar.test.ts` (12 test cases):
  + Part 1 (Unit formatters & hysteresis - 6 tests): kiểm tra toàn bộ formatters, hysteresis nearSaturation và nearComplete.
  + Part 2 (Scenario A - 1 test): W100ml + G1g khuấy auto fast hòa tan hoàn toàn về $Gu < 0.001\text{ g}$ sau 45s, hạt biến mất trên 3D, dung tích nở $100.65\text{ ml}$, chuyển trạng thái $Gu = 0 \implies$ "Đã tan hoàn toàn", progress 100%.
  + Part 3 (Scenario B - 1 test): Hòa tan tự nhiên không khuấy khớp nghiệm giải tích độc lập tại $1\text{ s}$ ($Gd \approx 0.02469\text{ g}$, sai số $< 10^{-6}\text{ g}$).
  + Part 4 (Scenario C - 1 test): Bão hòa và đường dư W10ml + G30g ($Gt=30\text{ g}$, sức chứa $20\text{ g}$), $Gd \to 20\text{ g}$, $Gu \ge 10\text{ g}$, lớp đường rắn duy trì ở đáy, tiến độ chặn 99.9%, nhãn "Có đường dư" và "Đã bão hòa".
  + Part 5 (Scenario D - 1 test): Tạm dừng đóng băng $t$ và $Gd$, thêm đường 0.1g khi paused cập nhật ngay lập tức $Gu$ với $0\text{ s}$ delta thời gian, tiếp tục mô phỏng hòa tan mượt mà.
  + Part 6 (Scenario E - 1 test): Làm mới cốc đưa toàn bộ mass về 0, $t = 0$, generation tăng, UI reset sạch sẽ.
  + Part 7 (Regression - 1 test): Bảo lưu phần dư cực nhỏ $Gu = 10^{-11}\text{ g}$ và $f_{Gu} > 0$ không bị snap.
- Chạy kiểm thử thực tế và nghiệm thu:
  + `npm test`: exit 0, 220/220 tests pass across 11 test suites.
  + `npm run typecheck`: exit 0.
  + `npm run lint`: exit 0.
  + `npm run build`: exit 0 (dist/ 615 modules, 5.07s).
- Cập nhật trạng thái V2-11 thành PARTIAL (Core verified 220/220 tests, Browser QA pending; O=0.2; L=0.5; P=0.5 giờ) trong index và body của IMPLEMENTATION_TASKS.md.

## 2026-10-17 — triển khai V3-02 (Dissolution bounded theo nước và bão hòa)
- Đọc yêu cầu V3-02 trong IMPLEMENTATION_TASKS.md và SCIENTIFIC_SPEC.md §1–§5, §7–§10, các ca kiểm thử SC-D01–SC-D06.
- Cập nhật `src/simulation/constants/science.ts`:
  + Bổ sung hằng số tốc độ động học hòa tan đường chuẩn hóa:
    * $k_{G0} = 0.025\text{ s}^{-1}$ (`DISSOLUTION_RATE_BASE`): tốc độ hòa tan nền không khuấy.
    * $k_{G1} = 0.25\text{ s}^{-1}$ (`DISSOLUTION_RATE_STIRRED`): hệ số gia tốc khi khuấy tối đa.
- Triển khai `src/simulation/models/Dissolution.ts`:
  + Hàm tính tốc độ động học: `computeDissolutionRate(intensity, kG0, kG1) = kG0 + kG1 * clamp(intensity, 0, 1)`.
  + Hàm tính bước hòa tan thuần: `computeDissolutionStep(mass, options)`:
    * $\text{capacityG} = \text{computeWaterCapacityG}(W) = 2.0 \times W$.
    * $\text{gap} = \max(0, \text{capacityG} - Gd)$, $\text{available} = \min(Gu, \text{gap})$.
    * Độ chính xác số học cao: $dG = (W > 0) ? \text{available} \times (-\text{Math.expm1}(-k_G \cdot h)) : 0$.
  + Hàm áp dụng vào trạng thái: `stepDissolution(state, options)`:
    * Nếu $dG \le 0$: trả về `TransferExecutionResult` rỗng, không mutate state.
    * Nếu $dG > 0$: ủy thác nguyên tử cho `applyPairedTransfer(state, { pair: 'sugar_dissolution', requestedGrams: dG })`.
  + Nghiệm giải tích độc lập: `computeAnalyticDissolution(t, W, Gt, I, initialGd)` làm oracle kiểm thử chính xác tại thời điểm bất kỳ dưới $I$ cố định.
  + Bộ hàm đánh giá giáo dục (SPEC §8): `computeSaturationRatio`, `computeDissolutionProgress`, `isNearSaturation`, `hasExcessSugar`, `hasResidualSolidSugar`.
- Cập nhật `src/simulation/core/SimulationEngine.ts`:
  + Re-export `DISSOLUTION_RATE_BASE`, `DISSOLUTION_RATE_STIRRED` cùng toàn bộ các hàm và types của `Dissolution.ts`.
- Cập nhật `src/simulation/core/HeadlessSimulationEngine.ts`:
  + Tích hợp `stepDissolution` vào `stepFixedTick(h)` ở bước 4 (ngay sau bước 3 tính dòng chảy `stepStirringFlow`).
  + Gọi `recalculateGeometryAndConstraints()` ở bước 5 để tự động cập nhật phân vùng cốc và thích ứng hạ thấp cao độ mũi thìa `rod.tipY` khi lớp đường rắn ở đáy cốc tan dần.
  + Chuẩn hóa tính toán `capacityG`, `saturationRatio`, `dissolutionProgress` trong `snapshot()` qua các helper canonical.
- Tạo `src/simulation/tests/dissolution.test.ts`: 19 test cases bao phủ toàn diện:
  + Part A (Pure Model Unit Tests - 9 tests): SC-D01 dry carrier gate ($W=0 \implies dG=0$), SC-D02 analytic oracle tại 1s cho $I=0$ và $I=1$, SC-D03 tiệm cận bão hòa 600s không vượt 20g và dư $\ge 10\text{ g}$, SC-D04 khuấy thay đổi tốc độ không đổi sức chứa, SC-D06 độ bền vững với lượng 0 / tiny $0.1\text{ g}$, bảo toàn phần dư nhỏ $< 0.001\text{ g}$, tính tương thích timestep $h=1/60$ vs $h=1/120$ (sai số $< 10^{-11}\text{ g}$), và các UX predicates SPEC §8.
  + Part B (Engine Integration - 10 tests): hòa tan thực tế qua các fixed steps, hòa tan nền $k_{G0}$ khi observe không khuấy, auto fast khuấy nhanh đẩy nhanh hòa tan, pause đóng băng hoàn toàn tiến trình và timeline, resume tiếp tục mượt mà, stop auto suy giảm dòng chảy và tốc độ hòa tan lùi về nền, SC-D05 thêm nước sau khi gần bão hòa nhân đôi sức chứa và hòa tan tiếp trong khi thêm dầu không tăng sức chứa, SC-IN03 bảo toàn dung tích reservation 500ml và từ chối lệnh thêm khi đầy cốc, mũi thìa thích ứng hạ thấp khi đáy đường tan, snapshot xuất bản đầy đủ thông số bão hòa, và tính độc lập frame rate $30/60/120\text{ FPS}$ (sai số $< 10^{-6}\text{ g}$).
- Cập nhật các test case hiện hữu (`auto.test.ts`, `flow.test.ts`, `mass.test.ts`) để assert chính xác bảo toàn tổng phân vùng khối lượng ($Gu + Gd = Gt$) khi hòa tan hoạt động trong runtime engine.
- Chạy kiểm thử thực tế và nghiệm thu:
  + `npm test`: exit 0, 208/208 tests pass across 10 test suites (`dissolution.test.ts` 19, `mass.test.ts` 28, `auto.test.ts` 28, `bridge.test.ts` 18, `flow.test.ts` 20, `clock.test.ts` 22, `engine.test.ts` 24, `beakerGeometry.test.ts` 18, `simulationContract.test.ts` 18, `experimentStore.test.ts` 13).
  + `npm run typecheck`: exit 0.
  + `npm run lint`: exit 0.
  + `npm run build`: exit 0 (dist/ 614 modules, 7.42s).
- Cập nhật trạng thái V3-02 thành COMPLETED_VERIFIED (O=0; L=0; P=0 giờ) trong index và body của IMPLEMENTATION_TASKS.md.

## 2026-10-17 — triển khai V3-01 (Mass ledger và transfer primitive)
- Đọc yêu cầu V3-01 trong IMPLEMENTATION_TASKS.md và SCIENTIFIC_SPEC.md §1–§4, §8, §10, các ca kiểm thử SC-IN03/SC-A01.
- Triển khai `src/simulation/constants/science.ts`:
  + Các hệ số mật độ: $\rho_W = 1.0\text{ g/ml}$, $\rho_O = 0.9\text{ g/ml}$.
  + Hệ số chiếm chỗ: đường $0.65\text{ ml/g}$, cát $0.60\text{ ml/g}$.
  + Sức chứa hòa tan đường: $2.0\text{ g/ml}$ ($200\text{ g}$ đường / $100\text{ ml}$ nước).
  + Giới hạn reservation: $500,000\text{ milli-ml}$.
  + Hàm sai số khối lượng canonical: $\epsilon(totalG) = \max(10^{-8}\text{ g}, 10^{-9} \times totalG)$.
  + Ngưỡng nhãn ý nghĩa giáo dục: $L(totalG) = \max(0.01\text{ g}, 0.01 \times totalG)$.
  + Helpers chuyển đổi đơn vị và sức chứa nước: `ticksToWaterMassG`, `ticksToOilMassG`, `ticksToSugarMassG`, `ticksToSandMassG`, `computeWaterCapacityG`.
- Triển khai `src/simulation/models/MassLedger.ts`:
  + `validateMassInvariants` và `assertMassInvariants`: kiểm tra 8 điều kiện tiên quyết (ticks safe integer, mass hữu hạn không âm, quy đổi input ticks, bảo toàn phân vùng Gu+Gd=Gt, Sb+Ss=St, Ol+Od=Ot, fGu trong [0, 1] và fGu=0 khi Gu=0, Gd <= water capacity, dry carrier gates W=0 -> Gd=0, Od=0, reservation <= 500,000 milli-ml).
  + Chẩn đoán `MassInvariantError` có thông tin phong phú (tên invariant, chất/pha, expected, actual, tolerance, generation, tickIndex, stateVersion, stage).
  + Bounded Paired Transfer Primitive: `computePairedTransfer` (thuần toán, không mutation) và `applyPairedTransfer` (nguyên tử) cho 5 cặp chuyển pha (`sugar_dissolution`, `sand_suspension`, `sand_sedimentation`, `oil_dispersion`, `oil_separation`).
  + Tính pha nguồn từ $total - dest_{after}$ triệt tiêu drift; từ chối nguyên tử các yêu cầu âm, NaN, Infinity hoặc state khởi đầu bị sai lệch phân vùng (không tự sửa tổng ngầm, không clamp residual nhỏ về 0).
- Cập nhật `src/simulation/core/HeadlessSimulationEngine.ts`:
  + Tích hợp `assertMassInvariants` vào `createForTesting`, `dispatch('add')`, `dispatch('reset')`, và cuối mỗi `stepFixedTick(h)`.
- Cập nhật `src/simulation/core/contractFixtures.ts` & `src/simulation/tests/engine.test.ts`:
  + Điều chỉnh fixture `addPhaseAllocationFixture` với $Ot = 18\text{ g}$ ($200\text{ ticks}$ dầu tại mật độ $0.9\text{ g/ml}$) bảo đảm tính toàn vẹn số học giữa input ticks và mass conversions.
- Tạo `src/simulation/tests/mass.test.ts`: 28 test cases bao phủ toàn diện:
  + Part A (Unit primitives, 11 tests): transfer 0, small precision fraction, transfer 100% source, bound request by source, destination headroom, zero transfer on 0 source/headroom, atomic rejection of negative/NaN/Infinity/invalid types, rejection of corrupt initial partition, bidirectional transfer for sand and oil, small residual preservation, pure computation immutability.
  + Part B (Randomized deterministic, 5 tests): 1,000 steps transfer ngẫu nhiên với seed 1729, assert invariants tại từng bước, max observed error $< 10^{-12}\text{ g}$, tính tái lập xác định, kiểm tra độc lập conservation sum.
  + Part C (Engine integration, 12 tests): add allocation SC-A01, water/oil conversions, rejected command immutability, active invariant enforcement in engine seam, auto/flow 600 ticks mass invariance, reset/duplicate reset, instance isolation, snapshot mutation protection, non-shrinking capacity reservation, near-capacity blocking SC-IN03, beaker regions conservation sum with non-baseline phases, spec constants regression.
- Chạy kiểm thử thực tế và nghiệm thu:
  + `npm test`: exit 0, 189/189 tests pass across 9 test suites (`beakerGeometry.test.ts` 18, `experimentStore.test.ts` 13, `simulationContract.test.ts` 18, `engine.test.ts` 24, `clock.test.ts` 22, `flow.test.ts` 20, `bridge.test.ts` 18, `auto.test.ts` 28, `mass.test.ts` 28).
  + `npm run typecheck`: exit 0.
  + `npm run lint`: exit 0.
  + `npm run build`: exit 0 (dist/ 613 modules, 4.86s).
- Cập nhật trạng thái V3-01 thành COMPLETED_VERIFIED (O=0; L=0; P=0 giờ) trong IMPLEMENTATION_TASKS.md.

## 2026-10-17 — triển khai V2-04 (Auto controller ba mức)
- Đọc yêu cầu V2-04 trong IMPLEMENTATION_TASKS.md và SCIENTIFIC_SPEC.md §3.4, §4–§7, các ca kiểm thử SC-F01/SC-J01.
- Triển khai `src/interactions/AutoStirController.ts`:
  + Pure math transition hàm smoothstep: $S(u) = u^2(3 - 2u)$ với $u \in [0, 1]$.
  + Monotonic radius transition $r(t) = r_0 + (0.4 - r_0) \times S(t / 0.25)$ chuyển tiếp bán kính mượt mà tới $0.4\text{ scene units}$ trong $0.25\text{ s}$ sim time, không vọt lố, kẹp trong $[0, 0.74]$.
  + Bảo toàn tư thế $t_0$: giữ nguyên $(x_0, z_0, \theta_0, r_0)$ trong sai số $10^{-9}$ units tại thời điểm bắt đầu auto, không teleportation.
  + Tiến triển góc theo simulated dt ($\theta += \omega_{rod} \times h$), độc lập với wall-time hay render clock.
  + Ba mức tốc độ khuấy tự động: slow = 1.0 rad/s, medium = 3.0 rad/s, fast = 6.0 rad/s.
- Cập nhật `HeadlessSimulationEngine.ts`:
  + Tích hợp `AutoStirController` làm driver khi `mode === 'auto'`.
  + Cập nhật `stepFixedTick`: step controller -> fluid contact -> flow model -> mass invariants.
  + Xử lý lệnh `setMode('auto')`, `setAutoLevel(level)`, `releaseDrive` (Stop), `pause`, `resume`, `reset`.
  + Bổ sung `autoDriveEnabled` và `autoLevel` vào `ScalarSnapshot`.
  + Xuất `getRodPose(): RodPose` và `getRenderPose(): RenderPoseCapture` cho renderer.
- Cập nhật `SimulationBridge.ts` và `experimentStore.ts`:
  + Bridge bổ sung `getRodPose()`, `getRenderPose()`, `startAuto(level?)`, `stopAuto()`, `setAutoLevel(level)`.
  + Store bổ sung `startAuto`, `stopAuto`, `setAutoLevel` với guard `showRod` (từ chối khi thìa ẩn).
- Cập nhật UI và 3D Scene:
  + `ControlPanel.tsx`: Thêm 3 nút chọn mức tốc độ ("Chậm", "Vừa", "Nhanh") và nút toggle "Khuấy tự động" / "Ngừng khuấy", tự động disable khi thìa ẩn hoặc tạm dừng.
  + `StirringRod.tsx`: Kết nối Three.js Object3D trực tiếp trong `useFrame` đọc `bridge.getRodPose()` qua mutable ref, không gọi `setState` từ rod pose trong render loop (hiệu năng 60 FPS và surface wave animation chưa kiểm chứng trình duyệt thực tế).
- Tạo `src/simulation/tests/auto.test.ts`: 28 test cases bao phủ toàn diện 28 kịch bản Part A, Part B, Part C.
- Chạy kiểm thử thực tế và nghiệm thu:
  + `npm test`: exit 0, 161/161 tests pass across 8 suites (`beakerGeometry.test.ts` 18, `experimentStore.test.ts` 13, `simulationContract.test.ts` 18, `engine.test.ts` 24, `clock.test.ts` 22, `flow.test.ts` 20, `bridge.test.ts` 18, `auto.test.ts` 28).
  + `npm run typecheck`: exit 0.
  + `npm run lint`: exit 0.
  + `npm run build`: exit 0 (dist/ 611 modules, 4.86s).
- Cập nhật trạng thái V2-04 và V2-10 thành PARTIAL (Core verified 161/161 tests, Browser QA pending; O=0.2; L=0.5; P=0.5 giờ) trong IMPLEMENTATION_TASKS.md theo chuẩn gate evidence.

## 2026-10-17 — triển khai V2-10 (Early authoritative bridge và controls tối thiểu)
- Đọc yêu cầu V2-10 trong IMPLEMENTATION_TASKS.md và SCIENTIFIC_SPEC.md §2–§4, §6–§9, MASTER_PLAN.md §4–§4.2.
- Triển khai `SimulationBridge` trong `src/simulation/bridge/SimulationBridge.ts`:
  + Authoritative bridge điều phối `HeadlessSimulationEngine`, `HeadlessSimulationFacade`, `HostClockAdapter`.
  + Cơ chế publish lưỡng tính: forced immediate publish khi dispatch accepted control commands (`add`, `reset`, `pause`, `resume`, `releaseDrive`), throttled 10Hz (`TICK_PUBLISH_INTERVAL_MS = 100`) cho continuous tick publishing.
  + Single RAF scheduler loop: một RAF loop duy nhất điều phối `advanceTimestamp(ms)`, dừng khi paused/destroyed.
  + Scene invalidation bridge: kết nối Three.js R3F theo cơ chế on-demand render, gọi `invalidate()` khi có logic steps chạy.
  + Quản lý vòng đời tab: `attachLifecycle()` an toàn StrictMode, bắt sự kiện `visibilitychange`, gọi `engine.suspend()` khi hidden và `engine.visible()` khi visible, bảo toàn nguyên vẹn cờ user pause (SC-T03).
  + Form helper `bridge.add(id, amount)`: phân tích dữ liệu đầu vào tiếng Việt, kiểm tra per-add max, chuyển đổi sang deciTicks và dispatch `add` intent đồng bộ.
- Di chuyển `ExperimentStore` trong `src/stores/experimentStore.ts`:
  + Chuyển đổi hoàn toàn sang kiến trúc single source of truth: loại bỏ biến tích lũy mutable; nguồn dữ liệu duy nhất là `snapshot: ScalarSnapshot` từ engine.
  + Dẫn xuất `deciTicks` và `quantities` trực tiếp từ `snapshot.input`.
  + Gắn kết các hành vi `add`, `reset`, `start`, `pause`, `resume`, `toggleRod`, `resetCamera` vào bridge.
  + Bảo toàn engine khi "Đặt lại góc nhìn": `resetCamera()` chỉ tăng `cameraRevision`, không làm suy suyển engine hay simulation clock (SC-B03).
  + Ngắt driver khi ẩn thìa: `toggleRod()` gọi `bridge.releaseDrive()` trước khi ẩn (SC-J03 / SPEC §3.4).
- Cập nhật giao diện và scene:
  + `src/app/App.tsx`: Kích hoạt `bridge.attachLifecycle()` trong hook vòng đời gốc.
  + `src/components/controls/ControlPanel.tsx`: Bổ sung hiển thị thời gian mô phỏng `snapshot.elapsedSeconds.toFixed(1) s` và huy hiệu trạng thái; kết nối các nút điều khiển mô phỏng.
  + `src/scene/LaboratoryScene.tsx`: Đăng ký `SceneInvalidationBridge` bên trong Canvas để kích hoạt R3F `invalidate()` theo yêu cầu; truyền `snapshot.rod.tipY` trực tiếp vào `StirringRod`.
- Tạo `src/simulation/tests/bridge.test.ts`: 18 test cases bao phủ toàn bộ 18 kịch bản kiểm thử:
  + Baseline initialization, add when paused với 0s elapsed, Vietnamese comma/dot parser, invalid input rejection, exact deci-unit accumulation (10x 0.1 = 1.0), capacity limit 500ml enforcement, add-reset-add sequence generation fencing, start/pause timeline freezing, forced immediate command publish, 10Hz tick publish throttling, stale snapshot rejection, camera reset engine preservation, StrictMode mount-unmount-mount safety, visibilitychange suspend/resume/user pause preservation, client sequence monotonicity across resets, multi-instance store isolation, DevFreeze isolation, và hide rod drive release.
- Chạy kiểm thử thực tế và nghiệm thu:
  + `npm test`: exit 0, 133/133 tests pass across 7 suites (`beakerGeometry.test.ts` 18, `experimentStore.test.ts` 13, `simulationContract.test.ts` 18, `engine.test.ts` 24, `clock.test.ts` 22, `flow.test.ts` 20, `bridge.test.ts` 18).
  + `npm run typecheck`: exit 0.
  + `npm run lint`: exit 0.
  + `npm run build`: exit 0 (dist/ 610 modules, 4.84s).
- Cập nhật trạng thái V2-10 thành COMPLETED_VERIFIED (O=0; L=0; P=0 giờ) trong index và body của IMPLEMENTATION_TASKS.md.

## 2026-10-17 — triển khai V2-03 (Flow response và quán tính sau stop)
- Đọc yêu cầu V2-03 trong IMPLEMENTATION_TASKS.md và SCIENTIFIC_SPEC.md §3.4, §4, §5.1, §6–§8 và các ca kiểm thử SC-F01/SC-F02/SC-H01/SC-H02.
- Triển khai `src/simulation/constants/flow.ts`:
  + $a = 2.0\text{ s}^{-1}$ (`A_STIR`), $b = 0.8\text{ s}^{-1}$ (`B_STIR`), $\lambda = a + b = 2.8\text{ s}^{-1}$ (`FLOW_LAMBDA`).
  + Chuẩn hóa intensity $6.0\text{ rad/s}$ (`FLOW_NORMALIZATION_RAD_PER_SEC`), giới hạn tốc độ thìa $8.0\text{ rad/s}$ (`MAX_ROD_SPEED_RAD_PER_SEC`).
  + Bán kính quỹ đạo mặc định $0.4\text{ scene units}$ (`DEFAULT_ORBIT_RADIUS`), chuẩn hóa khớp nối bán kính $0.4$ (`RADIAL_COUPLING_NORMALIZATION`).
  + `AUTO_LEVEL_SPEEDS`: slow = 1.0, medium = 3.0, fast = 6.0 rad/s.
- Triển khai mô hình dòng chảy thuần trong `src/simulation/models/StirringFlow.ts`:
  + Khớp nối bán kính: $\text{radialCoupling} = \min(\text{radius} / 0.4, 1.0)$ (0 khi $\text{radius} \le 0$).
  + Khớp nối động lực: $\omega_{drive} = \text{contact} \times \text{radialCoupling} \times \omega_{rod}$ (kẹp $\text{contact} \in [0, 1]$, $\omega_{rod} \in [-8, 8]$).
  + Vận tốc tiệm cận cân bằng: $\omega_{eq} = \frac{a}{a + b} \times \omega_{drive} = \frac{5}{7} \times \omega_{drive}$.
  + Cập nhật exponential update: $\omega_{flow Next} = \omega_{eq} + (\omega_{flow} - \omega_{eq}) \times \exp(-(a + b) \times h)$ (bảo toàn dấu; khi $\lambda \le 0$ giữ nguyên $\omega_{flow}$).
  + Cường độ dòng chảy $I = \min(1, \max(0, |\omega_{flow Next}| / 6))$ luôn trong $[0, 1]$.
  + Cổng chất lỏng (carrier gate): khi $W_{ml} + O_{ml} == 0$, ép $\omega_{drive} = 0, \omega_{flow} = 0, I = 0$; bed khô không phải chất lỏng.
  + Chất lỏng mỏng ($W = 0.1\text{ ml}$): $\text{contact} = 0 \implies \omega_{drive} = 0$, dòng chảy cũ suy giảm dần theo hàm mũ $\exp(-2.8t)$, không bị triệt tiêu tức thì.
  + Hệ dầu đơn (oil-only): dầu là carrier hợp lệ, thìa nhúng trong dầu tạo $\text{contact} > 0$ và sinh dòng chảy hợp lệ.
  + Hàm nghiệm giải tích `computeAnalyticFlow(t, initialFlow, drive)` làm oracle độc lập tại thời điểm $t \ge 0$.
- Cập nhật `HeadlessSimulationEngine.ts`:
  + `stepFixedTick(h)` gọi `stepStirringFlow`, cập nhật `omegaDrive` và `omegaFlow`, bảo toàn toàn bộ mass compartments, input ticks, $f_{Gu}$, seed.
  + `releaseDrive` (Stop): tắt `autoDriveEnabled`, đặt $\omega_{rod} = 0, \omega_{drive} = 0$, giữ đồng hồ tiếp tục chạy, $\omega_{flow}$ suy giảm liên tục.
  + `pause`: đóng băng bước tính toán, đặt $\omega_{rod} = 0, \omega_{drive} = 0$, giữ nguyên $\omega_{flow}$ không suy giảm; bảo toàn `autoDriveEnabled`.
  + `resume`: tiếp tục tính toán flow từ giá trị được bảo lưu.
  + `setMode`: chuyển sang non-auto đặt $\omega_{rod} = 0, \omega_{drive} = 0$.
  + `reset`: đặt lại $\omega_{rod} = 0, \omega_{drive} = 0, \omega_{flow} = 0$.
  + An toàn timing và encapsulation:
    * `getClock()` trả về `ReadonlyClock` bao gói, chặn caller gọi đột biến `advance()` / `reset()` trực tiếp.
    * `advance()` và `advanceTimestamp()` kiểm tra `generation === startGen` để fencing ngay lập tức nếu `reset` được dispatch bên trong `setBeforeStepHook`.
    * Phân biệt rõ: `advance(realDeltaSeconds)` bảo toàn delta hoạt động truyền vào trực tiếp sau resume; `advanceTimestamp(ms)` triệt tiêu gap thời gian trôi qua ở frame đầu tiên sau resume/visible.
- Cập nhật `src/simulation/core/SimulationEngine.ts`: re-export constants và pure functions từ `constants/flow` và `models/StirringFlow`.
- Tạo `src/simulation/tests/flow.test.ts`: 20 test cases bao phủ toàn diện 20 kịch bản kiểm thử (10 pure model + 10 engine integration).
- Chạy kiểm thử thực tế và nghiệm thu:
  + `npm test`: exit 0, 115/115 tests pass across 6 suites (`beakerGeometry.test.ts` 18, `experimentStore.test.ts` 13, `simulationContract.test.ts` 18, `engine.test.ts` 24, `clock.test.ts` 22, `flow.test.ts` 20).
  + `npm run typecheck`: exit 0.
  + `npm run lint`: exit 0.
  + `npm run build`: exit 0 (dist/ 602 modules, 4.56s).
- Cập nhật trạng thái V2-03 thành COMPLETED_VERIFIED (O=0; L=0; P=0 giờ) trong index và body của IMPLEMENTATION_TASKS.md.

## 2026-10-17 — triển khai V2-02 (Fixed timestep và accumulator có cap)
- Đọc yêu cầu V2-02 trong IMPLEMENTATION_TASKS.md và SCIENTIFIC_SPEC.md §2–§3, §7 và các ca kiểm thử SC-T01–SC-T03.
- Triển khai `src/simulation/core/SimulationClock.ts`:
  + Cấu hình mặc định: $h = 1/60\text{ s}$, $maxRealDelta = 0.1\text{ s}$, $maxSteps = 6$.
  + Xác thực cấu hình `validateClockConfig`: bảo đảm $h > 0$, $maxRealDelta > 0$, $maxSteps \ge 1$ và hữu hạn.
  + Clamped accumulator & anti spiral-of-death: kẹp $realDelta$ đầu vào $\le maxRealDelta$; giới hạn tối đa $maxSteps$ bước lặp mỗi frame; nếu số bước vượt quá $maxSteps$, phần tích lũy số bước dư thừa $\lfloor accumulator / h \rfloor \times h$ được chuyển sang `droppedActiveWallTime`, bảo toàn phần dư fractional $remainder \in [0, h)$.
  + Chẩn đoán timing: `TimingDiagnostics` lưu vết `invalidDeltaCount`, `droppedActiveWallTime`, `accumulator`.
  + Quản lý vòng đời thuần (headless): `onPause()` dọn dẹp active remainder sang `droppedActiveWallTime`, `onResume()` đặt cờ grace drop delta đầu tiên tránh bù thời gian trôi qua, `suspend()` / `visible()` xử lý chuyển đổi hiển thị tab không gây burst, `advanceTimestamp(ms)` xử lý thời gian đơn điệu.
- Triển khai `src/simulation/core/ReplayHarness.ts`:
  + `TickBoundaryReplayHarness`: hỗ trợ kiểm thử và tái hiện kịch bản theo ranh giới tick logic chính xác `appliedAtTick`.
  + Cho phép bơm lệnh vào engine ngay trước bước $N+1$ và sau bước $N$, bảo đảm tính bất biến của kết quả mô phỏng không phụ thuộc vào FPS của host ($30$, $60$ hay $120\text{ FPS}$).
  + Tự động phát hiện nguy cơ deadlock khi lệnh bị nghẽn không bao giờ được dispatch.
- Cập nhật `src/simulation/core/HeadlessSimulationEngine.ts`:
  + Bổ sung phương thức `advance(realDeltaSeconds)` vào `CommandEngineCore`, trả về `AdvanceResult` (gồm `stepsExecuted`, `elapsedSimDelta`, `droppedActiveWallTime`, `clockDiagnostics`).
  + Tích hợp vòng đời đồng bộ: `reset()` đặt lại clock, `pause()` gọi `clock.onPause()`, `resume()` gọi `clock.onResume()`.
  + Cung cấp hook `setBeforeStepHook(hook)` cho replay harness.
  + Đảm bảo invariant: `tickIndex += 1`, `elapsedSeconds += h`, `stateVersion += 1` cho mỗi bước khoa học $h$; giữ nguyên `stateVersion` khi không có bước nào chạy.
- Cập nhật `src/simulation/core/SimulationEngine.ts`: re-export `SimulationClock`, `TickBoundaryReplayHarness`, các hằng số và interface clock.
- Tạo `src/simulation/tests/clock.test.ts`: 22 test cases bao phủ toàn diện 16 kịch bản kiểm thử theo yêu cầu.
- Chạy kiểm thử thực tế và nghiệm thu:
  + `npm test`: exit 0, 95/95 tests pass across 5 suites (`beakerGeometry.test.ts` 18, `experimentStore.test.ts` 13, `simulationContract.test.ts` 18, `engine.test.ts` 24, `clock.test.ts` 22).
  + `npm run typecheck`: exit 0.
  + `npm run lint`: exit 0.
  + `npm run build`: exit 0 (dist/ 602 modules, 8.15s).
- Cập nhật trạng thái V2-02 thành COMPLETED_VERIFIED (O=0; L=0; P=0 giờ) trong index và body của IMPLEMENTATION_TASKS.md.

## 2026-10-17 — triển khai V2-01 (Runtime engine và command transaction)
- Đọc yêu cầu V2-01 trong IMPLEMENTATION_TASKS.md và SCIENTIFIC_SPEC.md §1–§4, §8–§9.
- Sửa sai lệch contract & chuẩn hóa:
  + Cập nhật `staleManualSampleFixture` và `capacitySerializationFixture` trong `contractFixtures.ts`: lệnh đúng client và `seq = next` bị từ chối do validation vẫn consume seq và có `controlOrdinal = seq` (không phải `null`).
  + Chuẩn hóa mã lỗi canonical: `CAPACITY_EXCEEDED`.
  + Đính chính tổng kết Phase 1: Phase 1 gồm 7 tasks (V1-01…V1-07), hiện 4/7 đã COMPLETED_VERIFIED (V1-01, V1-04, V1-05, V1-07), V1-02 PARTIAL, V1-03 BLOCKED, V1-06 NOT_STARTED. Phase 1 đang `in_progress`.
- Triển khai `src/simulation/core/HeadlessSimulationEngine.ts`:
  + Đóng gói `ScienceState` private, khởi tạo bằng `createInitialScienceState(seed)`.
  + `dispatch(command)` thực hiện validation chặt chẽ dữ liệu đầu vào (envelope, clientId, seq an toàn, expectedGeneration, payload).
  + Quản lý sequence đơn điệu (`highWaterSeq`) và bộ nhớ cache có giới hạn LRU tối đa 256 acks (`MAX_ACK_CACHE_SIZE = 256`), tồn tại xuyên suốt các đợt reset.
  + Hàm băm payload canonical `canonicalFingerprint` chuẩn hóa không phụ thuộc thứ tự key.
  + Kiểm tra dedup trước generation validation: replay reset cũ nhận original ack với `duplicate: true`.
  + Phân biệt chính xác lệnh consume (`controlOrdinal = seq`) với lệnh không consume (`controlOrdinal = null` cho out-of-order, malformed envelope, sai clientId, `ID_REUSED`, `DUPLICATE_EXPIRED`).
  + Phân bổ pha nguyên tử cho Add: nước tăng W; đường tăng Gt/Gu, giữ Gd, pha loãng $f_{Gu}$; cát tăng St/Sb, giữ Ss; dầu tăng Ot/Ol ($0.9\text{ g/ml}$), giữ Od. Tự động tính lại phân vùng cốc và cao độ mũi thìa thích ứng qua V1-05 helpers.
  + Xử lý intents: pause (giữ `autoDriveEnabled`, ngắt `omegaRod`), resume, releaseDrive, setMode, setAutoLevel, manualSample (kẹp bán kính thìa $\le 0.74$).
  + Cung cấp `snapshot()` trả về `ScalarSnapshot` detached hoàn toàn độc lập, tính toán các trường dẫn xuất (`intensity`, `contact`, `capacityG`, `saturationRatio`, `dissolutionProgress`) và dev freeze.
  + Triển khai `HeadlessSimulationFacade`: tự động bind `expectedGeneration` từ authoritative engine state và sequence đơn điệu tại thời điểm dispatch intent.
  + Test seam an toàn `HeadlessSimulationEngine.createForTesting(state, options)` kiểm tra nghiêm ngặt bảo toàn khối lượng và invariant vật lý trước khi khởi tạo.
- Cập nhật `src/simulation/core/SimulationEngine.ts`: re-export `HeadlessSimulationEngine`, `HeadlessSimulationFacade`, `CommandEngineCore`, `MAX_ACK_CACHE_SIZE`, `MAX_ADDITION_DECI_TICKS`, `canonicalFingerprint`.
- Tạo `src/simulation/tests/engine.test.ts`: 24 test cases bao phủ toàn diện 18 khía cạnh kỹ thuật theo yêu cầu nhiệm vụ.
- Chạy kiểm thử thực tế:
  + `npm test`: exit 0, 73/73 tests pass across 4 suites (`beakerGeometry.test.ts` 18, `simulationContract.test.ts` 18, `experimentStore.test.ts` 13, `engine.test.ts` 24).
  + `npm run typecheck`: exit 0.
  + `npm run lint`: exit 0.
  + `npm run build`: exit 0 (dist/ 602 modules, 13.41s).
- Cập nhật trạng thái V2-01 thành COMPLETED_VERIFIED (O=0; L=0; P=0 giờ) trong index và body của IMPLEMENTATION_TASKS.md.

## 2026-10-17 — triển khai V1-07 (Chốt contract command/state/đơn vị)
- Đọc yêu cầu V1-07 trong IMPLEMENTATION_TASKS.md và SCIENTIFIC_SPEC.md §1–§4, §7, §9.
- Hoàn thiện schema và state factory trong `src/simulation/core/SimulationState.ts`:
  + `ScienceState`: generation, stateVersion, tickIndex, elapsedSeconds, seed, paused, mode, autoDriveEnabled, autoLevel, input (`ScienceInputTicks`), mass (`ScienceMassCompartments`: W, Gt, Gu, Gd, St, Sb, Ss, Ot, Ol, Od), fGu, rod (`RodPose`: x, z, tipY, theta, radius), omegaRod, omegaDrive, omegaFlow.
  + `ScalarSnapshot`: dùng `DeepReadonly` bảo vệ nested objects chống mutation.
  + `ClockConfig`: h (default 1/60 s), maxRealDelta (0.1 s), maxSteps (6).
  + `MATERIAL_IDS`: sugar: 0, sand: 1, oilDroplet: 2.
  + `RenderTarget`: Float32Array positions, Float32Array weights, Uint8Array materials, count (caller-allocated).
  + `RenderStamp`: generation, stateVersion, renderRevision, count (active copied count).
  + `DEFAULT_SEED = 1729`, `normalizeSeed(seed)` validate uint32 (từ chối số âm, số thực, chuỗi, NaN, Infinity, giá trị > 0xffffffff).
  + `createInitialScienceState(seed)`: khởi tạo state chuẩn g0/v0/tick0/elapsed0/paused, cấp phát các object lồng nhau hoàn toàn độc lập (reference isolation).
- Hoàn thiện envelope lệnh và acks trong `src/simulation/core/SimulationEngine.ts`:
  + Intent union: `AddIntent`, `ResetIntent`, `PauseIntent`, `ResumeIntent`, `ReleaseDriveIntent`, `SetModeIntent`, `SetAutoLevelIntent`, `ManualSampleIntent`.
  + `Command`: clientId, seq (strictly monotonic integer per client session), expectedGeneration, payload (Intent).
  + `RejectionReason`: STALE_GENERATION, OUT_OF_ORDER, ID_REUSED, DUPLICATE_EXPIRED, CAPACITY_EXCEEDED, MALFORMED_ENVELOPE, INVALID_PAYLOAD, EXCEEDS_MAX_ADDITION, INVALID_SEED.
  + `Ack`: clientId, seq, accepted, duplicate, reason, generation, stateVersion, appliedAtTick, controlOrdinal.
  + `SimulationEngine` contract: dispatch, advance, snapshot, copyRenderFrame.
- Tạo `src/simulation/core/contractFixtures.ts` với 9 contract fixtures chuẩn hóa theo SCIENTIFIC_SPEC §1–§4, §7, §9:
  1. `initialEmptyPausedFixture`: state factory baseline g0/v0/tick0/elapsed0/paused/seed 1729.
  2. `addWaterResetAddWaterFixture`: SC-C03 timeline g0 add 100ml -> g1 reset -> g1 add 50ml -> g1/v3/W50.
  3. `resetReplayAndDistinctResetFixture`: SC-C04 duplicate replay seq 2 giữ g1 vs distinct resets seq 5/6 tăng g2/g3.
  4. `staleManualSampleFixture`: SC-C05 / SC-IN04 pointer sample với captureGeneration 0 bị từ chối STALE_GENERATION tại generation 1.
  5. `addPausedAndResumeFixture`: SC-C01 add khi paused cập nhật mass tức thì, elapsedSeconds=0; resume accepted ngay trước tick.
  6. `capacitySerializationFixture`: SC-C02 add 499.9ml -> 0.1ml (đạt 500000 milli-ml) -> 0.1ml oil bị reject CAPACITY_EXCEEDED.
  7. `addPhaseAllocationFixture`: SC-A01 add sugar/sand/oil/water cập nhật đúng khoang vật chất (Gt/Gu tăng, Gd giữ, fGu pha loãng; St/Sb tăng, Ss giữ; Ot/Ol tăng theo khối lượng riêng 0.9 g/ml, Od giữ; W tăng 1.0 g/ml), thời gian bất biến.
  8. `oilOnlyRegionFixture`: SC-R01 vùng oil-only cát lơ lửng nằm trong envelope dầu, không nhân đôi thể tích dầu nền.
  9. `ownershipAndBufferFixture`: SC-B01 caller sở hữu buffers typed array, snapshot scalar detached deep-readonly.
- Tạo `src/simulation/tests/simulationContract.test.ts` (18 unit tests):
  + Bao phủ factory, seed normalization, reference isolation, 9 fixtures, command envelope typing và Ack RejectionReasons.
- Chạy kiểm thử thực tế:
  + `npm test`: exit 0, 49/49 tests pass across 3 test files (beakerGeometry 18, experimentStore 13, simulationContract 18).
  + `npm run typecheck`: exit 0.
  + `npm run lint`: exit 0.
  + `npm run build`: exit 0 (dist/ 602 modules transformed, built in 17.33s).
- Cập nhật trạng thái V1-07 thành COMPLETED_VERIFIED (O=0; L=0; P=0 giờ) trong index và body của IMPLEMENTATION_TASKS.md.

## 2026-10-17 — triển khai V1-05 (Chuẩn hóa hình học cốc và giới hạn dụng cụ)
- Đọc yêu cầu V1-05 trong IMPLEMENTATION_TASKS.md và SCIENTIFIC_SPEC.md §4–§6.
- Tạo `src/simulation/constants/beaker.ts` chứa các hằng số hình học cốc (bán kính trong 0.87, ngoài 0.91, base 0.12, fillTop 2.22, scale 0.0042) và thìa (active length 0.20, envelope radius 0.12, max radius 0.74, tip clamp [0.14, 2.0]), hằng số hạt (margin 0.01, radius).
- Viết các hàm thuần cho volume <-> height (`volumeToHeight`, `heightToVolume`), tính toán 4 phân vùng beaker (`computeBeakerRegions`), cao độ thích ứng mũi thìa (`computeTipY`), kẹp tọa độ tâm thìa (`clampSpoonXZ`), độ dài tiếp xúc chất lỏng (`computeMechanicalContact`) và biên không gian của hạt đại diện (`computeParticleBounds`).
- Tích hợp vào scene: `Beaker.tsx`, `WaterVolume.tsx`, `OilVolume.tsx`, `StirringRod.tsx`, `ParticleRenderer.tsx`, `LaboratoryScene.tsx`.
- Viết `src/simulation/tests/beakerGeometry.test.ts` (18 test cases) bao phủ 9 fixtures trong SPEC §4.1 (E/D/O/G0/G1/L0/L1/X/T), kiểm tra contact rỗng/khô/nước mỏng/nước 7ml/Fixture X/Fixture O, kẹp bán kính thìa và biên hạt.
- Chạy kiểm thử thực tế:
  + `npm test`: exit 0, 31/31 tests pass (13 tests store + 18 tests beakerGeometry).
  + `npm run typecheck`: exit 0.
  + `npm run lint`: exit 0.
  + `npm run build`: exit 0 (dist/ 602 modules transformed, built in 14.51s).
- Cập nhật trạng thái V1-05 thành COMPLETED_VERIFIED (O=0; L=0; P=0 giờ) trong index và body của IMPLEMENTATION_TASKS.md.

## 2026-10-17 — triển khai V1-04 (Đồng nhất precision của lượng thêm)
- Đọc yêu cầu V1-04 trong IMPLEMENTATION_TASKS.md và SCIENTIFIC_SPEC.md §1.1.
- Sửa `src/types/experiment.ts`: thêm `DeciTicks`, bổ sung `deciTicks` vào `Addition` và `ExperimentSnapshot`.
- Sửa `src/simulation/constants/ingredients.ts`: thêm `CAPACITY_MILLI_ML = 500_000`, `VISUAL_MILLI_ML_PER_TICK`, parser regex `^\d+(?:[.,]\d)?$`, `parseAmountString`, `parseInputAmount`, `occupiedVolumeMilliMl`, `ticksToQuantities`, `formatDeciTicks`, `formatPhaseMass`.
- Sửa `src/stores/experimentStore.ts`: quản lý `deciTicks` là nguồn dữ liệu integer duy nhất (single source of truth), `quantities` suy ra từ `deciTicks / 10`. Kiểm tra per-add max và capacity bằng integer milli-ml.
- Sửa `src/components/ingredients/IngredientPanel.tsx`: chuyển sang `type="text" inputMode="decimal"`, giữ raw string và truyền trực tiếp vào `store.add`.
- Sửa `src/components/results/ContentsPanel.tsx`: dùng `formatDeciTicks` và `occupiedVolumeMilliMl` để hiển thị nhất quán dấu phẩy tiếng Việt.
- Sửa `src/simulation/tests/experimentStore.test.ts`: mở rộng bộ kiểm thử thành 13 test cases bao phủ SC-IN01–SC-IN04, bảo toàn 3 test cũ, kiểm tra 10 lần 0.1 g = 1.0 g exact, per-add limit, capacity serialization, format helpers.
- Chạy kiểm thử thực tế:
  + `npm test`: exit 0, 13/13 tests pass.
  + `npm run typecheck`: exit 0.
  + `npm run lint`: exit 0.
  + `npm run build`: exit 0 (dist/ 601 modules transformed, built in 13.52s).
- Cập nhật trạng thái V1-04 thành COMPLETED_VERIFIED (O=0; L=0; P=0 giờ) trong index và body của IMPLEMENTATION_TASKS.md.

## 2026-10-17 — chỉnh plan v3 theo review R01–R20 (hoàn tất)
- Đọc review và phần prompt tham khảo; áp dụng yêu cầu sửa tài liệu, không triển khai runtime.
- Khôi phục root plan, đọc sáu tài liệu chính và docs foundation. Source hash khớp v2, spot-check source/config/call paths liên quan; không audit toàn project lặp lại.
- Xác định các contract cần sửa: oil-only region, control flush độc lập tick, reset/sequence/ack, stale manual, contact, early bridge, buffer copying và visual RNG.
- Giữ logs/checks v2 là lịch sử; chưa có browser QA hoặc engine tests mới.
- Đã chọn early bridge V2-10, vertical slice V2-11, context lifecycle V4-10 và optional publish V4-11; giữ ID cũ và đổi V4-01 thành mở rộng bridge, V4-09 chỉ nghiệm thu artifact. Đang cập nhật spec/contracts và tính lại DAG/OLP.
- Patch toàn task_plan không match dòng đầu; kiểm tra encoding/BOM trước thay phương pháp ghi, không lặp mù. Các sửa sau task_plan trong cùng call chưa chạy; sẽ thực hiện riêng và validate cuối.
- Read tổng hợp nhiều tài liệu dạng JSON bị tool truncation nên không parse được; chuyển validator chạy ngay trên file và chỉ trả summary JSON nhỏ, không retry cùng payload lớn.
- Xác định UTF-8 BOM EF BB BF ở task_plan; patch có xét BOM thành công, không mất history (giữ trong progress/findings).
- Validation file thực tế:41task/15fields,Index-body/status/O-L-P/deps đúng,72caseunique,20review rows, local links đúng. DAG acyclic;MVP O47.5/L67.5/P111.5h,buffer13.5→81h;critical path30.5h (nhiều nhánh đồnghạng). D0/D1dependency-closed16.5/26h.
- Kiểm numeric9regionfixtures vàcontact theo equations trong JS: đều đạt; thin.1ml contact0, X495mlcontact1tip.4508, oil-only envelope đúng; khối lượng/volume không đếm đôi. Không engine application test mới.
- So SHA-256source/public/config/package/lock trước/sau:giốngnhau. Bằng chứng appchecks v2 giữ lịch sử, browser/context/performance/E2E chưa chạy.
- Kết thúc planv3; codeđầu tiên sauusergiaoviệc làV1-04parser/precision, acceptance rawlocale→ticks/rejection/10×.1exact. Chưa sửa runtime hoặc deploy.
- SPEC v3: schemas/control flush/reset/allocation, regions/bảng số, adaptive tip/contact, stale/lifecycle, tick replay, thresholds, RNG/copy buffers,72casecontracts (40IDcũ+32mới), tất cả vẫn chưa runtime.
- Model timings được tính trong tool JS bằng công thức/root solve và stop exchangeh1/60; đây là kiểm tra toán học đặc tả, không application tests hoặc scientific validation thực nghiệm.
- Early bridge/slice vào DAG, pure unit không hard-block bởi browser; TEST_CASES bổ sung benchmark/scenarios/context/production preview, chưa chạy browser.
- Không rerun full app suite chỉ vì Markdown thay đổi; bằng chứng appchecks v2 giữ là lịch sử. Tiếp theo kiểm nhất quán IDs/fields/links/DAG/OLP/math/hash v3.

## 2026-10-17 — cài skill và mở phiên lập kế hoạch
- Đọc find-skills và skill-installer; xác định nguồn planning-with-files.
- Kiểm tra runtime Python: chưa có executable dùng được; chuyển sang CLI skills.
- Bắt đầu cài global cho Codex; chờ clone repository hoàn tất.
- Đọc ROADMAP và TEST_CASES; ghi lại kết quả kiểm tra từ phiên trước, không coi là vừa chạy lại.
- Gửi câu hỏi chọn phạm vi lập kế hoạch.
- Tạo ba file planning; chưa sửa mã nguồn ứng dụng hoặc triển khai tính năng mới.
- Cài skill thành công, đọc SKILL.md và xác nhận resolver dùng project-root plan.
- Hoàn tất Phase 1 của phiên lập kế hoạch; chuyển Phase 2 sang in_progress để cùng người dùng chốt phạm vi.
- Thêm bản đề xuất thứ tự nghiệm thu trực quan → hoàn thiện Giai đoạn 1 → đặc tả phần tiếp theo. Chưa coi là phạm vi đã chốt.

## 2026-10-17 — audit và lộ trình MVP theo yêu cầu attachment
- Người dùng chọn lộ trình tổng thể và giới hạn lượt này chỉ lập kế hoạch.
- Đọc attachment, đọc lại quy trình planning-with-files và chạy resolver: dùng planning files hiện có ở project root.
- Đọc toàn bộ source TS/TSX, CSS, cấu hình và tài liệu. Không sửa source hoặc dependency.
- Audit: store có runtime; scene tĩnh có geometry; Engine/Clock/models chỉ interface; interactions/workers chỉ README.
- npm ls --depth=0 thành công; ghi versions và giới hạn kiến trúc vào findings.md.
- Chạy lại typecheck và lint: pass. Vitest: 3/3 pass. Build đang thu kết quả cuối.
- Không có browser tool để kiểm chứng runtime; ghi Blocked riêng cho browser QA, không suy diễn thành lỗi ứng dụng.
- Chuẩn bị kế hoạch Phase 1–5, gắn task/đầu ra/phụ thuộc/test, tổng ngân sách 3–4 ngày gồm Ngày 1.
- Build đã hoàn tất: exit 0, scene 915.64 kB / 248.25 kB gzip; có warning chunk lớn.
- Soạn task breakdown Phase 1–5, dependency graph, lịch Ngày 2–4, rủi ro và fallback. Giữ lịch sử chuẩn bị cũ bằng heading Setup, tránh nhầm với phase sản phẩm.
- Các thiết kế fixed timestep, compartment mass, precision 0.1, snapshot throttling là đề xuất chưa thực thi/chưa duyệt.
- Task ưu tiên sau xác nhận: P1.2 browser nghiệm thu Ngày 1; task code nền tảng trước khuấy: P1.3/P1.4 rồi P2.1.

## 2026-10-17 — full technical re-plan v2
- Đọc attachment mới, quy tắc/template planning-with-files, các plan cũ; resolver chọn project root, không có named plan.
- Audit lại TS/TSX/CSS/config/docs; npm ls --depth=0 pass, versions giữ nguyên.
- Chụp source/public/config/lock SHA-256 trước thay đổi Markdown.
- Các npm script typecheck/lint/test/build thoát exit 1 không diagnostic trong sandbox; rerun escalated cùng kết quả. Không báo là pass, đang chẩn đoán launcher bằng Node entry point.
- Xác định stock vessels 3D còn thiếu và ước lượng cũ chưa tính đủ công việc độc lập; bắt đầu chuyển sang task catalog duy nhất.
- Không chỉnh logic, không cài package, không deploy; mọi thiết kế mới hiện chỉ là tài liệu đề xuất.
- Chẩn đoán không đụng source: `node .../typescript/bin/tsc --noEmit` exit0, `node .../eslint/bin/eslint.js .` exit0, `node .../vitest/vitest.mjs run` exit0 (1file/3tests), `node .../vite/bin/vite.js build` exit0 (601modules, scene915.64kB/248.25kBgzip, chunk warning). npm wrapper issue chưa khắc phục; ghi V1-02 PARTIAL.
- Tạo MASTER_PLAN/IMPLEMENTATION_TASKS/SCIENTIFIC_SPEC;37task, đủ12fields/task, catalog là nguồn duy nhất status/estimate/deps. Reorganize task_plan thành phase roadmap, giữ history trong log/findings.
- Spec thêm units/precision, capacity reservation exact, flow response, bounded sugar transfer, sand/oil analytic exchange, particle transport, invariant/tolerance và40caseSC-*; tất cả vẫn proposal, không đánh testcases mới là đã chạy.
- Tính lại: Phase1–4=45.5h, buffer9.1h, còn54.6h; Phase5=22h tách riêng. Đường găng DAG lý tưởng21.5h, không thay tổng giờ công một người. Estimate cũ18–25h bị thay, đã ghi lý do.
- Rà tài liệu bằng kiểm tra read-only:37task ID duy nhất, mỗi task đủ12fields, status enum hợp lệ, dependencies tồn tại, local Markdown links không hỏng,40science cases. Kiểm tra DAG và index/body consistency riêng trước báo cáo cuối.
- SHA-256 source/public/config/package-lock trước và sau bằng nhau; không sửa source ứng dụng, không cài dependency. dist được build lại bởi kiểm tra, không source code change.
- Bản re-plan hoàn tất; task ưu tiên tiếp sau duyệt V1-02 rồi browser baseline V1-03. Dừng theo yêu cầu người dùng, chưa viết Phase2 và chưa deploy.

## 2026-10-19 — Hoàn thành triển khai Chặng 1: Nền tảng tương tác cốc và kéo-thả rót theo lượng
- **Triển khai thành công Chặng 1 theo đúng kế hoạch kỹ thuật đã duyệt:**
  + Tạo `src/interactions/VesselPourAdapter.ts` quản lý toàn bộ vòng đời tương tác chuột của 4 cốc nguồn:
    * Bắt sự kiện pointer capture độc quyền trên canvas DOM, tạm khóa OrbitControls và thanh khuấy StirringRod.
    * Chiếu ray chuột lên mặt phẳng kéo vertical drag plane đi qua vị trí gốc của cốc và vị trí rót spout.
    * Hysteresis drop zone detection (bán kính vào R <= 0.45, bán kính duy trì R <= 0.75).
    * Token fencing và cờ `releasedNormally` chống hủy thao tác oan khi sự kiện `lostpointercapture` bắn trễ sau khi đã thả chuột bình thường.
    * Decouple sạch sẽ qua `VesselPourStoreTarget` interface, triệt tiêu hoàn toàn vòng lặp phụ thuộc (circular dependency).
  + Mở rộng `src/types/experiment.ts` & `src/stores/experimentStore.ts`:
    * Thêm `inputDoses: Record<IngredientId, string>` và `setInputDose(id, dose)` đồng bộ realtime với UI form.
    * Thêm `draggedVessel: DraggedVesselState | null` đóng băng (snapshot) liều rót ngay tại `pointerdown`.
    * Actions `startVesselDrag`, `updateVesselDragPos`, `endVesselDragDrop`, `cancelVesselDrag`.
    * `startPour` hỗ trợ option `fromDrop` và vị trí xuất phát `dropPos`.
  + Tích hợp `src/scene/pouringAnimationMath.ts`:
    * `DROP_POUR_DURATIONS` (total 1.45s, commit 0.30s).
    * `isPointInDropZone(point, isAlreadyInZone)` với bounding box hysteresis.
    * `computeDropPourTransform(...)` và `computeCancelReturnTransform(...)`.
  + Cập nhật `src/scene/IngredientVessels.tsx` & `src/scene/LaboratoryScene.tsx`:
    * Vùng nhận cốc `DropZoneIndicator` với vòng halo xoay và badge trạng thái nổi ("Kéo cốc tới đây để rót" / "✓ Thả chuột để rót").
    * Con trỏ chuột chuyển đổi linh hoạt: `grab` khi hover vào cốc, `grabbing` khi kéo, trả về `auto` khi kết thúc.
    * Nhãn cốc 3D hiển thị liều lượng dự kiến rót lấy trực tiếp từ form.
    * Kết nối `VesselPourSceneWiring` lắng nghe pointermove, pointerup, pointercancel, lostpointercapture, Escape key, blur và visibilitychange.
  + Kiểm thử toàn diện `src/simulation/tests/vesselInteraction.test.ts` (9 tests mới, 100% pass):
    1. Đóng băng dose tại pointerdown.
    2. Kiểm tra format và dung tích trước khi nhấc cốc.
    3. Kiểm tra ranh giới Hysteresis drop zone.
    4. Thả hợp lệ rót và commit đúng 1 lần vào authoritative engine.
    5. Thả ngoài hoặc cancel/escape trả cốc về vị trí cũ với 0 lượng thêm.
    6. Reset dọn sạch drag và vô hiệu hóa in-flight tokens.
    7. VesselPourAdapter kiểm soát pointer capture, camera locking và single pointer.
    8. Lost capture fencing chống cancel sớm.
    9. Drag-and-drop khi paused bảo toàn trạng thái paused và không tăng elapsedSeconds.
- **Trạng thái Quality Gates:**
  + `npm test`: 36/36 test files pass, 595/595 tests pass (exit code 0).
  + `npm run typecheck`: exit code 0.
  + `npm run lint`: exit code 0.
  + `npm run build`: vite build thành công (exit code 0).
  + `npm run preview`: Server đang chạy nền tại `http://localhost:4173/`, phản hồi HTTP 200.

## 2026-10-19 — Hoàn thành triển khai Chặng 2: Rót tự do bằng chuột
- **Triển khai thành công Chặng 2 theo đúng yêu cầu:**
  + Nâng cấp `src/components/ingredients/IngredientPanel.tsx`:
    * Segmented control 2 chế độ: "Rót theo lượng" vs "Rót tự do". Vô hiệu hóa switch khi đang tương tác.
    * Trong chế độ Rót tự do: Các ô input liều lượng và nút "+ Thêm" được vô hiệu hóa có điều kiện, kèm dòng giải thích sư phạm: *"Chế độ rót tự do: Nhấp và giữ chuột vào cốc nguyên liệu trong khu thí nghiệm để rót."*
  + Mở rộng `src/interactions/VesselPourAdapter.ts` hỗ trợ luồng Free Pour liên tục:
    * Tốc độ chuẩn hóa: Nước 25 ml/s, Dầu 15 ml/s, Đường 10 g/s, Cát 10 g/s (`FREE_POUR_RATES`).
    * Nhịp phát lệnh batching ~10 Hz (mỗi 100ms) gửi về `bridge.add(...)`.
    * Nghiêng mượt mà vào góc rót trong 0.25s (`TILT_TRANSITION_DURATION_S`), chỉ rót khi đã vào tư thế.
    * Khi ra ngoài vùng nhận: ngắt dòng tức thì và dựng thẳng cốc lại trong 0.20s.
    * Khi nhả chuột (`pointerup`): flush các decitick nguyên cuối cùng, hủy phần dư < 0.1 ml/g.
    * Ngưỡng gián đoạn (> 300ms gap): bỏ qua tích lũy, không dồn tích lũy quá khứ.
    * Dừng dòng chảy khi chạm dung tích tối đa 500 ml.
  + Kiểm thử mở rộng `src/simulation/tests/vesselInteraction.test.ts` (thêm 9 tests cho Chặng 2, tổng 18 tests):
    * Hoạt động khi form rỗng hoặc ngoài khoảng.
    * Đạt tốc độ định mức và nhịp batch ~10 Hz.
    * Tương đương lượng giữa 30, 60 và 120 FPS.
    * Thời gian chuyển tiếp pose không tính vào lượng rót.
    * Nhả chuột bình thường flush decitick nguyên và hủy phần dư.
    * Dừng sạch khi đạt giới hạn dung tích.
    * Ngắt gián đoạn trễ khung hình.
    * Reset dọn sạch phiên rót tự do.
    * Không ảnh hưởng chế độ rót theo liều và nút "+ Thêm".

## 2026-10-19 — Hoàn thành triển khai Chặng 3: Rà soát, chuẩn hóa hình học và hoàn thiện hai chế độ
- **Triển khai thành công Chặng 3:**
  1. *Loại bỏ tọa độ hardcode sai ngữ cảnh*:
     - Toàn bộ `SPOUT_TARGET`, `DROP_ZONE_ENTER_BOUNDS`, `DROP_ZONE_MAINTAIN_BOUNDS` và điểm rơi dòng rót được suy ra tương đối từ tâm và vành miệng cốc 500 ml chuẩn trong `src/scene/pouringAnimationMath.ts` (`BEAKER_CENTER`, `BEAKER_RIM_Y = 2.32`, `BEAKER_INNER_RADIUS = 0.87`, `BEAKER_OUTER_RADIUS = 0.91`).
     - Tọa độ 3D thế giới của miệng vòi cốc nguồn được tính toán trực tiếp qua hàm hình học `computeSpoutPosition(vesselPos, tiltAngleRad, rVessel, hVessel)`.
     - Cập nhật cả luồng rót tự do và rót theo lượng trong `src/scene/IngredientVessels.tsx` sử dụng `computeSpoutPosition` làm điểm xuất phát thực tế của dòng hạt rơi.
  2. *Chính sách xử lý gián đoạn nghiêm ngặt (Interruption Policy)*:
     - Trong `src/interactions/VesselPourAdapter.ts`, khi khoảng trống giữa 2 khung hình liên tiếp $dt > 300\text{ ms}$, hàm `terminateOnInterruption()` được kích hoạt ngay lập tức:
       * Tắt hoàn toàn dòng nguyên liệu (`isStreamActive = false`).
       * Hủy bỏ toàn bộ decitick lẻ chưa được gửi qua engine.
       * Giải phóng pointer capture và mở khóa điều khiển camera `OrbitControls`.
       * Giữ nguyên các lượng đã được engine ghi nhận qua ledger trước thời điểm gián đoạn.
       * Yêu cầu người dùng thực hiện một thao tác click/drag mới để rót tiếp (tuyệt đối không tự động phục hồi rót ở frame kế tiếp).
     - Khi `onPointerUp` được gọi sau một khoảng gián đoạn $> 300\text{ ms}$, phần dư tích lũy cũng bị hủy bỏ hoàn toàn và không thực hiện flush bù.
  3. *Lọc phản hồi ack và hiển thị khối lượng đã thêm*:
     - Store và adapter chỉ cập nhật khối lượng tích lũy khi nhận được `res.ack?.accepted === true`.
     - Bộ lọc `acceptedAckSeqSet` bảo đảm loại bỏ các ack trùng lặp (`ack.duplicate`), các ack bị từ chối (`ack.accepted === false`) tuyệt đối không làm tăng khối lượng hiển thị. Không tạo hàng đợi retry async trái phép.
  4. *Kẹp giới hạn dung tích 500 ml cho cả 4 chất*:
     - Kiểm tra thể tích chiếm chỗ vật lý (`occupiedVolumeMilliMl`): Nước (100 ml/tick), Dầu (100 ml/tick), Đường (65 ml/tick = 0.65 ml/g), Cát (60 ml/tick = 0.60 ml/g).
     - Khi dung tích còn lại $< 1\text{ tick}$, dòng chảy ngắt ngay lập tức, cờ `isCapacityFull` được bật và chỉ hiển thị thông báo một lần tới store mà không spam từng frame.
     - Khi nhả chuột, adapter mở khóa camera controls bình thường.
  5. *Trạng thái Paused & Vòng lặp Render*:
     - Hoạt động rót tự do khi paused cập nhật trực tiếp khối lượng vào ledger mà không làm trôi thời gian khoa học `elapsedSeconds`.
     - Store yêu cầu invalidate frame liên tục để giữ cho R3F `frameloop="demand"` render mượt mà trong quá trình kéo và rót.
  6. *Độc quyền thao tác & Lifecycle an toàn*:
     - Kết nối bảo vệ hai chiều giữa `ManualStirAdapter` và `VesselPourAdapter`: khi đang kéo cốc thì từ chối kéo thìa khuấy (`MANUAL_STIR_ACTIVE`), khi đang khuấy thìa thì từ chối nhấc cốc.
     - Dọn dẹp an toàn khi mất capture, ấn phím Escape, blur/tab ẩn, reset và unmount.
     - Văn bản hướng dẫn chuẩn sư phạm:
       * Rót theo lượng: *"Kéo tới vùng nhận rồi thả để rót"* / *"✓ Thả chuột để rót"*
       * Rót tự do: *"Kéo tới vùng nhận để rót"* / *"Đang rót..."* / *"Giữ trong vùng nhận để rót; thả để dừng"*
  7. *Kiểm thử chất lượng toàn diện*:
     - Bổ sung các bài kiểm tra 10-14 trong `src/simulation/tests/vesselInteraction.test.ts` (tổng cộng 23 tests, 100% pass):
       10. PointerUp sau gián đoạn >300ms hủy phần dư và không flush.
       11. Kẹp dung tích với engine thật cho cả 4 nguyên liệu tính đúng độ chiếm chỗ mà không spam lỗi.
       12. Tính độc quyền thao tác giữa khuấy thủ công và kéo cốc nguồn.
       13. Tính nhất quán hình học: vùng nhận và spout target suy ra từ kích thước cốc Beaker 500 ml.
       14. Lọc ack duplicate và rejected không làm tăng khối lượng hiển thị.
  8. *Chuẩn hóa hình học và quyền điều khiển Camera (Nghiệm thu Chặng 3)*:
     - Thống nhất nguồn hằng số hình học cốc 500 ml trong `src/simulation/constants/beaker.ts` (`BEAKER_CENTER`, `BEAKER_RIM_Y = 2.32`, `BEAKER_INNER_RADIUS = 0.87`, `BEAKER_OUTER_RADIUS = 0.91`, `BEAKER_BASE_Y = 0.12`). Cả `Beaker.tsx` và `pouringAnimationMath.ts` đều import trực tiếp từ nguồn chung này.
     - `DropZoneIndicator` sử dụng tọa độ và bán kính suy ra trực tiếp từ cấu hình vùng nhận `DROP_ZONE_ENTER_BOUNDS`: `DROP_ZONE_VISUAL_CENTER` (X = -0.80, Y = 2.47, Z = 0) và `DROP_ZONE_VISUAL_RADIUS` (inner = 0.50, outer = 0.65). Vòng halo xoay trực quan khớp hoàn toàn với vùng bounding box tiếp nhận cốc.
     - Khẳng định kiến trúc: Toàn bộ các mesh `<Beaker />`, `<IngredientVessels />`, `<WaterVolume />` đều là con trực tiếp của `<Canvas>` trong `LaboratoryScene.tsx` với transform gốc đồng nhất (position [0,0,0], scale [1,1,1]).
     - Chuẩn hóa tài liệu đơn vị: 1 decitick = 0,1 unit (0,1 ml hoặc 0,1 g). Hệ số thể tích chiếm chỗ: Nước 100 milli-ml/decitick, Dầu 100 milli-ml/decitick, Đường 65 milli-ml/decitick (0,65 ml/g), Cát 60 milli-ml/decitick (0,60 ml/g). Dung tích tối đa: 500.000 milli-ml. Phân biệt rành mạch ingredient decitick với simulation clock tick.
     - Quản lý quyền sở hữu Camera chặt chẽ: `VesselPourAdapter` chỉ khôi phục camera nếu chính nó đang nắm quyền (`hasCameraControl`), bảo toàn chính xác trạng thái trước thao tác (`previousCameraEnabled`), dọn dẹp không can thiệp vào camera khi adapter khác đang giữ quyền, và tự động dọn dẹp khi mất WebGL context (`handleContextLost`).
     - Độc quyền thao tác khi đang rót: Phương thức `isBusy()` chặn kéo thìa khuấy trong cả quá trình kéo cốc lẫn khi hoạt ảnh rót `activePour` đang diễn ra.
     - Bổ sung 4 bài test 15-18 trong `vesselInteraction.test.ts` (tổng 27/27 tests pass).
- **Trạng thái Quality Gates:**
  + `npm test`: 36/36 test files pass, 613/613 tests pass (exit code 0).
  + `npm run typecheck`: exit code 0.
  + `npm run lint`: exit code 0.
  + `npm run build`: vite build thành công (exit code 0).
  + `npm run preview`: Server đang chạy nền tại `http://localhost:4173/`, phản hồi HTTP 200.
