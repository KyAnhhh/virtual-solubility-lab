# Implementation Tasks — v3, nguồn chuẩn duy nhất

Đề xuất ngày 2026-10-17; chưa có phê duyệt runtime. Giữ ID v2 khi trách nhiệm còn phù hợp. Mỗi task có input/output contract, acceptance và evidence độc lập. Các nhãn dưới đây không được nâng vì đã viết đặc tả.

## Quy ước

- COMPLETED_VERIFIED: có bằng chứng đạt acceptance của task; IMPLEMENTED_UNVERIFIED: có runtime chưa kiểm chứng; PARTIAL: một phần; NOT_STARTED: chưa runtime; BLOCKED: thiếu điều kiện có nêu cách gỡ.
- MUST_HAVE: cần local MVP; SHOULD_HAVE: bổ sung/tùy chọn; POST_MVP: sau MVP.
- Scope MVP gồm baseline quality, OPTIONAL_DEPLOY không thuộc local artifact DoD, POST_MVP ngoài lịch MVP.
- Estimate O/L/P là optimistic/likely/pessimistic **giờ công còn lại**, gồm local tests. Không cộng cả P và buffer; lịch likely dùng L+20%. Không tính thời gian chờ môi trường. Không sao chép task status sang tài liệu khác.
- Mỗi task có một body chuẩn; Index phải khớp body trong cùng file. Source paths mới chỉ được tạo khi triển khai task, không tạo skeleton ở lượt plan.

## Mapping v2 → v3

| ID | Điều chỉnh trách nhiệm |
|---|---|
| V2-10 mới | Tách migration authoritative add/reset/ack/scalar/pose bridge từ V4-01 lên sau V2-01/V2-02 |
| V2-11 mới | Gate lát cắt thật nước–đường trước manual/cát/dầu integration; dùng V3-02 sớm, không đánh full models xong |
| V4-01 giữ | Mở rộng bridge hiện hữu cho full phase/render outputs; không tạo owner/migrate totals lần hai |
| V2-08 giữ | Full manual pose/lifecycle dùng owner đã có, không tạo loop khác |
| V4-10 mới | Context creation/loss/restore/resize/retry contract và evidence riêng |
| V4-09 giữ | Chỉ production artifact qua HTTP, không đợi public host |
| V4-11 mới | Optional public publish sau authorization, ngoài core/local MVP DoD |
| V1-04/V2-01/V2-02/V2-06/V3-05/V4-04 | Mở rộng parser/flush/reset/replay/stale/buffer/threshold contracts theo review; giữ ID |

## Index

| ID | Phase | Task | Priority | Scope | O/L/P giờ | Status | Dependencies |
|---|---|---|---|---|---|---|---|
| V1-01 | 1 | Audit source và phân loại bằng chứng | MUST_HAVE | MVP | 0/0/0 | COMPLETED_VERIFIED | — |
| V1-02 | 1 | Xác minh pipeline và chẩn đoán npm launcher | MUST_HAVE | MVP | 0.5/0.5/1 | PARTIAL | V1-01 |
| V1-03 | 1 | Nghiệm thu WebGL và UI Ngày 1 | MUST_HAVE | MVP | 1.5/2/3 | BLOCKED | V1-01 |
| V1-04 | 1 | Đồng nhất precision của lượng thêm | MUST_HAVE | MVP | 0/0/0 | COMPLETED_VERIFIED | V1-01 |
| V1-05 | 1 | Chuẩn hóa hình học cốc và giới hạn dụng cụ | MUST_HAVE | MVP | 0/0/0 | COMPLETED_VERIFIED | V1-01 |
| V1-06 | 1 | Bổ sung bốn cốc chứa nguyên liệu 3D | MUST_HAVE | MVP | 0.2/0.5/0.5 | PARTIAL | V1-05 |
| V1-07 | 1 | Chốt contract command/state/đơn vị | MUST_HAVE | MVP | 0/0/0 | COMPLETED_VERIFIED | V1-04, V1-05 |
| V2-01 | 2 | Runtime engine và command transaction | MUST_HAVE | MVP | 0/0/0 | COMPLETED_VERIFIED | V1-07 |
| V2-02 | 2 | Fixed timestep và accumulator có cap | MUST_HAVE | MVP | 0/0/0 | COMPLETED_VERIFIED | V2-01 |
| V2-03 | 2 | Flow response và quán tính sau stop | MUST_HAVE | MVP | 0/0/0 | COMPLETED_VERIFIED | V2-02 |
| V2-04 | 2 | Auto controller ba mức | MUST_HAVE | MVP | 0.2/0.5/0.5 | PARTIAL | V2-03, V2-10 |
| V2-05 | 2 | Ray-plane projection và clamp thìa | MUST_HAVE | MVP | 0/0/0 | COMPLETED_VERIFIED | V1-05, V2-01 |
| V2-06 | 2 | Suy ra vận tốc và hướng manual | MUST_HAVE | MVP | 0/0/0 | COMPLETED_VERIFIED | V2-05, V2-03 |
| V2-07 | 2 | Pointer ownership và chuyển mode | MUST_HAVE | MVP | 0/0/0 | COMPLETED_VERIFIED | V2-04, V2-06 |
| V2-08 | 2 | Vòng đời tick và pose thìa trong scene | MUST_HAVE | MVP | 0.2/0.5/0.5 | PARTIAL | V2-02, V2-07, V2-10 |
| V2-09 | 2 | UI pause/resume/stop/reset thống nhất | MUST_HAVE | MVP | 0.1/0.3/0.5 | PARTIAL | V2-08 |
| V2-10 | 2 | Early authoritative bridge và controls tối thiểu | MUST_HAVE | MVP | 0.2/0.5/0.5 | PARTIAL | V2-01, V2-02 |
| V2-11 | 2 | Nghiệm thu lát cắt nước–đường chạy thật | MUST_HAVE | MVP | 0.2/0.5/0.5 | PARTIAL | V2-10, V2-04, V3-02 |
| V3-01 | 3 | Mass ledger và transfer primitive | MUST_HAVE | MVP | 0/0/0 | COMPLETED_VERIFIED | V2-01 |
| V3-02 | 3 | Dissolution bounded theo nước và bão hòa | MUST_HAVE | MVP | 0/0/0 | COMPLETED_VERIFIED | V3-01, V2-03 |
| V3-03 | 3 | Cát suspension và sedimentation | MUST_HAVE | MVP | 0/0/0 | COMPLETED_VERIFIED | V3-01, V2-03 |
| V3-04 | 3 | Dầu droplets và separation | MUST_HAVE | MVP | 0/0/0 | COMPLETED_VERIFIED | V3-01, V2-03 |
| V3-05 | 3 | Transport hạt đại diện có bounds | MUST_HAVE | MVP | 0/0/0 | COMPLETED_VERIFIED | V3-02, V3-03, V3-04 |
| V3-06 | 3 | Compose models và thêm chất mọi thời điểm | MUST_HAVE | MVP | 0/0/0 | COMPLETED_VERIFIED | V3-05, V2-09 |
| V3-07 | 3 | Ma trận tổ hợp và hoán vị | MUST_HAVE | MVP | 0/0/0 | COMPLETED_VERIFIED | V3-06 |
| V3-08 | 3 | Stability và independence của render rate | MUST_HAVE | MVP | 0/0/0 | COMPLETED_VERIFIED | V3-07, V2-02 |
| V4-01 | 4 | Mở rộng early bridge cho đầy đủ phase/render outputs | MUST_HAVE | MVP | 0/0/0 | COMPLETED_VERIFIED | V2-10, V3-06 |
| V4-02 | 4 | Render sugar và sand theo compartments | MUST_HAVE | MVP | 0.2/0.5/0.5 | PARTIAL | V4-01, V3-05 |
| V4-03 | 4 | Render nước và dầu layer/droplets | MUST_HAVE | MVP | 0.2/0.5/0.5 | PARTIAL | V4-01, V3-05 |
| V4-04 | 4 | Kết quả, giải thích và responsive controls | MUST_HAVE | MVP | 0.2/0.5/0.5 | PARTIAL | V4-01, V2-09 |
| V4-05 | 4 | Browser E2E và kiểm chứng runtime MVP | MUST_HAVE | MVP | 1.5/2.5/5 | PARTIAL | V4-02, V4-03, V4-04, V1-03, V1-06, V3-07, V2-11 |
| V4-06 | 4 | Profile và tối ưu bổ sung | SHOULD_HAVE | MVP | 1/1.5/2.5 | NOT_STARTED | V4-02, V4-03 |
| V4-07 | 4 | Regression cuối và sửa lỗi đã tái hiện | MUST_HAVE | MVP | 1/1.5/2.5 | PARTIAL | V4-05, V3-08, V1-02, V4-10 |
| V4-08 | 4 | Tài liệu sử dụng và giới hạn mô hình | MUST_HAVE | MVP | 0.5/1/1.5 | COMPLETED_VERIFIED | V4-07 |
| V4-09 | 4 | Nghiệm thu static artifact production qua HTTP | MUST_HAVE | MVP | 1/1.5/2.5 | PARTIAL | V4-07, V4-08 |
| V4-10 | 4 | WebGL failure, context loss/restore và resize | MUST_HAVE | MVP | 2/3/5 | PARTIAL | V2-10, V1-03 |
| V4-11 | 4 | Public deployment tùy chọn sau nghiệm thu artifact | SHOULD_HAVE | OPTIONAL_DEPLOY | 0.5/0.5/1.5 | NOT_STARTED | V4-09 |
| V5-01 | 5 | Shader nước/dầu/thủy tinh nâng cao | POST_MVP | POST_MVP | 3/4/6 | NOT_STARTED | V4-09 |
| V5-02 | 5 | Trường dòng gần thìa chân thực hơn | POST_MVP | POST_MVP | 4/6/9 | NOT_STARTED | V4-09 |
| V5-03 | 5 | Hạt và giọt đa kích thước | POST_MVP | POST_MVP | 3/4/6 | NOT_STARTED | V4-09 |
| V5-04 | 5 | Hiệu chuẩn mô hình khoa học | POST_MVP | POST_MVP | 5.5/8/12 | NOT_STARTED | V4-09 |

## Phase 1 — Foundation & 3D Laboratory

### V1-01 — Audit source và phân loại bằng chứng

- **Mục tiêu:** Ghi đúng phần có runtime và phần chỉ interface.
- **Mô tả kỹ thuật:** Đọc mọi source/config/docs, đối chiếu yêu cầu A–F với call sites thực.
- **Input contract:** Source/state hiện có; defaults và fixtures trong SCIENTIFIC_SPEC/TEST_CASES.
- **Output contract:** Có inventory, nhãn rõ ràng, phát hiện thiếu stock vessels và engine runtime. Ghi evidence/command/exit/seed/tick trong progress.md.
- **Bước triển khai:** 1) Đọc store/scene/controllers/models. 2) Ghi bằng chứng và phạm vi kiểm chứng. 3) Giữ phần hoạt động và chỉ ra phần thiếu.
- **Module/file:** src/**, package.json, docs/**, findings.md
- **Phụ thuộc:** Không.
- **Gate/evidence:** Core/unit acceptance theo task; browser evidence nếu task yêu cầu chưa có thì ghi phần BLOCKED, không dùng tài liệu làm pass.
- **Ưu tiên:** MUST_HAVE; scope MVP.
- **Thời gian dự kiến:** O=0; L=0; P=0 giờ.
- **Trạng thái:** COMPLETED_VERIFIED.
- **Tiêu chí nghiệm thu:** Có inventory, nhãn rõ ràng, phát hiện thiếu stock vessels và engine runtime.
- **Kiểm thử:** Source review + npm ls; bằng chứng trong findings.md.
- **Rủi ro:** Nhầm tồn tại file với tồn tại chức năng.
- **Dự phòng:** Chỉ nâng nhãn khi có call path và kết quả kiểm tra.

### V1-02 — Xác minh pipeline và chẩn đoán npm launcher

- **Mục tiêu:** Có cách chạy checks tái lập và phân biệt lỗi môi trường.
- **Mô tả kỹ thuật:** Timebox 30 phút chẩn đoán npm wrapper bằng exit/stdout/stderr và Node entry point đã có. Không sửa package/shell mù; fallback tương đương được ghi rõ và cho phép tiếp tục task độc lập.
- **Input contract:** Outputs của V1-01; defaults và fixtures trong SCIENTIFIC_SPEC/TEST_CASES.
- **Output contract:** Trong 30 phút có nguyên nhân/bằng chứng hoặc kết luận môi trường chưa rõ + lệnh Node fallback tái lập đủ bốn checks. Không coi script wrapper pass nếu vẫn exit1; không chặn code thuần TS vì launcher có fallback. Ghi evidence/command/exit/seed/tick trong progress.md.
- **Bước triển khai:** 1) Chạy scripts, thu exit/stdout/stderr. 2) So cùng kiểm tra bằng Node entry point. 3) Xác định launcher/shell rồi chỉ sửa cách chạy nếu có bằng chứng.
- **Module/file:** package.json (chỉ nếu cần sau duyệt), docs/TEST_CASES.md, progress.md
- **Phụ thuộc:** V1-01.
- **Gate/evidence:** Core/unit acceptance theo task; browser evidence nếu task yêu cầu chưa có thì ghi phần BLOCKED, không dùng tài liệu làm pass.
- **Ưu tiên:** MUST_HAVE; scope MVP.
- **Thời gian dự kiến:** O=0.5; L=0.5; P=1 giờ.
- **Trạng thái:** PARTIAL.
- **Tiêu chí nghiệm thu:** Trong 30 phút có nguyên nhân/bằng chứng hoặc kết luận môi trường chưa rõ + lệnh Node fallback tái lập đủ bốn checks. Không coi script wrapper pass nếu vẫn exit1; không chặn code thuần TS vì launcher có fallback.
- **Kiểm thử:** npm scripts và node entry points; không tạo test bắt chước launcher.
- **Rủi ro:** Báo source lỗi khi lỗi nằm shell.
- **Dự phòng:** Giữ lệnh Node tương đương có log; ghi npm launcher chưa giải quyết.

### V1-03 — Nghiệm thu WebGL và UI Ngày 1

- **Mục tiêu:** Có baseline hình ảnh và thao tác thật trước mở rộng.
- **Mô tả kỹ thuật:** Phiên hiện tại thiếu browser tool; cần người chạy browser hoặc công cụ khả dụng sau này.
- **Input contract:** Outputs của V1-01; defaults và fixtures trong SCIENTIFIC_SPEC/TEST_CASES.
- **Output contract:** Cốc/nước/dầu/hạt/thìa nhìn được, camera giới hạn, form/reset hoạt động; không console error được quan sát. Ghi evidence/command/exit/seed/tick trong progress.md.
- **Bước triển khai:** 1) Chạy 8 case docs/TEST_CASES trên desktop và 390 px. 2) Kiểm tra alpha/vạch/zoom/reset và console. 3) Ghi thiết bị, viewport, ảnh và lỗi tái hiện.
- **Module/file:** docs/TEST_CASES.md, scene/** và styles chỉ khi có lỗi xác nhận
- **Phụ thuộc:** V1-01.
- **Gate/evidence:** Core/unit acceptance theo task; browser evidence nếu task yêu cầu chưa có thì ghi phần BLOCKED, không dùng tài liệu làm pass.
- **Ưu tiên:** MUST_HAVE; scope MVP.
- **Thời gian dự kiến:** O=1.5; L=2; P=3 giờ.
- **Trạng thái:** BLOCKED.
- **Tiêu chí nghiệm thu:** Cốc/nước/dầu/hạt/thìa nhìn được, camera giới hạn, form/reset hoạt động; không console error được quan sát.
- **Kiểm thử:** Checklist desktop 1366×768 và 390×844; ghi browser/OS/GPU/DPR, width nhỏ không chứng minh touch; init failure/loss/restore chi tiết ở V4-10.
- **Rủi ro:** GPU/alpha khác máy, không có môi trường browser.
- **Dự phòng:** Giữ BLOCKED khi thiếu browser; điều kiện gỡ: có browser/công cụ hoặc người chạy checklist cung cấp bằng chứng. Các task không phụ thuộc runtime browser vẫn tiến hành sau khi được phép code.

### V1-04 — Đồng nhất precision của lượng thêm

- **Mục tiêu:** Form, store và kết quả thống nhất cùng độ chính xác.
- **Mô tả kỹ thuật:** Parser locale trong SPEC §2: trim, một dấu . hoặc ,; không grouping/exponent/rác; integer deci-units và capacity authoritative khi nhiều add liên tiếp.
- **Input contract:** Outputs của V1-01; defaults và fixtures trong SCIENTIFIC_SPEC/TEST_CASES.
- **Output contract:** ' 1,2 ' và '1.2'→12 ticks; ''/1e2/1.2x/1,000.0/0/âm/0.14 reject. 10×0.1→10 ticks đúng, hai add gần capacity được serialize theo engine, phase mass nhỏ dùng '<0,1 g'. Ghi evidence/command/exit/seed/tick trong progress.md.
- **Bước triển khai:** 1) Viết pure parser/formatter nhận raw string theo grammar. 2) Unit fixtures valid/invalid/precision/max/safe integer và message tiếng Việt. 3) Nối form vào validator dùng chung, phase display giữ float.
- **Module/file:** types/experiment.ts, constants/ingredients.ts, experimentStore.ts, IngredientPanel.tsx, ContentsPanel.tsx, tests
- **Phụ thuộc:** V1-01.
- **Gate/evidence:** Core/unit acceptance theo task; browser evidence nếu task yêu cầu chưa có thì ghi phần BLOCKED, không dùng tài liệu làm pass.
- **Ưu tiên:** MUST_HAVE; scope MVP.
- **Thời gian dự kiến:** O=0; L=0; P=0 giờ.
- **Trạng thái:** COMPLETED_VERIFIED.
- **Tiêu chí nghiệm thu:** ' 1,2 ' và '1.2'→12 ticks; ''/1e2/1.2x/1,000.0/0/âm/0.14 reject. 10×0.1→10 ticks đúng, hai add gần capacity được serialize theo engine, phase mass nhỏ dùng '<0,1 g'.
- **Kiểm thử:** SC-IN01–SC-IN04 và SC-C01/SC-C02; parser không parseFloat chấp nhận rác. Command integration capacity triển khai ở V2-01.
- **Rủi ro:** Đổi precision làm mất nhu cầu liều nhỏ.
- **Dự phòng:** Nếu cần 0.01, đổi hệ số integer chung và fixtures; không dùng step=any với display 2 decimals.

### V1-05 — Chuẩn hóa hình học cốc và giới hạn dụng cụ

- **Mục tiêu:** Một nguồn bounds cho scene, manual controller và particle transport.
- **Mô tả kỹ thuật:** Inner radius0.87,base0.12,fillHeight2.1; rod tipY=clamp(bedTop+.02,.14,2.0), activeLength.2,envelope.12,margin.01. Contact=overlap/activeLength theo region có liquid; bed cao thích ứng tip, thin liquid không full drive.
- **Input contract:** Bounds/pose/region contract SCIENTIFIC_SPEC §4–§6 và outputs dependencies.
- **Output contract:** Một mapping cho geometry/controller/transport. Empty/dry/contact0 không flow; liquid0.1ml dưới tip không full drive; pose trong thành/đáy. Bed collision ngoài MVP được ghi rõ. Ghi evidence/command/exit/seed/tick trong progress.md.
- **Bước triển khai:** 1) Trích các giá trị 0.87/2.1/500/base lặp. 2) Định nghĩa spoon tip envelope và particle radius margin. 3) Test mapping volume→height và bounds.
- **Module/file:** scene/Beaker.tsx, LaboratoryScene.tsx, WaterVolume.tsx, OilVolume.tsx, simulation/constants/beaker.ts (khi làm)
- **Phụ thuộc:** V1-01.
- **Gate/evidence:** Core/unit acceptance theo task; browser evidence nếu task yêu cầu chưa có thì ghi phần BLOCKED, không dùng tài liệu làm pass.
- **Ưu tiên:** MUST_HAVE; scope MVP.
- **Thời gian dự kiến:** O=0; L=0; P=0 giờ.
- **Trạng thái:** COMPLETED_VERIFIED.
- **Tiêu chí nghiệm thu:** Một mapping cho geometry/controller/transport. Empty/dry/contact0 không flow; liquid0.1ml dưới tip không full drive; pose trong thành/đáy. Bed collision ngoài MVP được ghi rõ.
- **Kiểm thử:** Mapping region examples SPEC §4, SC-R01–SC-R05 và SC-H01–SC-H02.
- **Rủi ro:** Tip hợp lệ nhưng cán thìa xuyên thành.
- **Dự phòng:** Giữ cán thẳng đứng và độ sâu cố định trong MVP, clamp theo envelope lớn nhất.

### V1-06 — Bổ sung bốn cốc chứa nguyên liệu 3D

- **Mục tiêu:** Có cốc nước/đường/cát/dầu riêng trên bàn theo yêu cầu A.
- **Mô tả kỹ thuật:** Tái sử dụng Beaker geometry/material và hạt đại diện; đây là nguồn trực quan, không thêm kho tồn/phễu rót.
- **Input contract:** Outputs của V1-05; defaults và fixtures trong SCIENTIFIC_SPEC/TEST_CASES.
- **Output contract:** Bốn cốc phân biệt rõ và không che thí nghiệm ở viewport nghiệm thu; lượng trong cốc nguồn không bị hiểu là ledger thí nghiệm. Ghi evidence/command/exit/seed/tick trong progress.md.
- **Bước triển khai:** 1) Tạo component stock vessels có bốn label. 2) Đặt ngoài vùng thao tác cốc thí nghiệm, điều chỉnh camera framing. 3) Giữ thao tác thêm bằng form hiện có.
- **Module/file:** scene/IngredientVessels.tsx (khi làm), LaboratoryScene.tsx, Beaker.tsx
- **Phụ thuộc:** V1-05.
- **Thời gian dự kiến:** O=0.2; L=0.5; P=0.5 giờ (còn lại cho Browser QA).
- **Trạng thái:** PARTIAL (Core verified 537/537 tests qua 28 test suites, typecheck/lint/build exit 0, Browser QA pending do thiếu môi trường browser tự động).
- **Tiêu chí nghiệm thu:** Bốn cốc chứa nguyên liệu 3D (Nước, Đường, Cát, Dầu ăn) được bố trí xác định trên mặt bàn phòng thí nghiệm bên trái cốc chính; tái sử dụng an toàn Beaker geometry với props scaling và không hiển thị vạch 500ml; nội dung bên trong trực quan (nước/dầu dùng procedural volume trong suốt có bề mặt meniscus; đường/cát dùng khối trụ + chóp nón và cụm tinh thể/hạt bề mặt tính toán bằng lượng giác xác định, không dùng Math.random hay RNG khoa học); nhãn tiếng Việt rõ ràng, thanh thoát qua Drei Html; toàn bộ mesh có `raycast={() => null}` bảo đảm không cản trở thao tác khuấy hay camera; độc lập hoàn toàn với experiment mass ledger và không bị trừ hao; 6/6 tests pass trong `stockVessels.test.ts`.
- **Kiểm thử:** `stockVessels.test.ts` (6 tests), kiểm tra layout, bounding table, không overlap, độc lập ledger, bảo toàn hằng số khoa học, regression saturation equality & max add per turn, toàn bộ 537 tests qua 28 suites.
- **Rủi ro:** Thêm geometry gây rối và draw calls.
- **Dự phòng:** Dùng geometry chung và mức chi tiết thấp, giữ cả bốn cốc; không thay bằng mẫu CSS để gọi hoàn thành; gán raycast null cho toàn bộ stock objects.

### V1-07 — Chốt contract command/state/đơn vị

- **Mục tiêu:** Engine và render có contract khả thi trước khuấy.
- **Mô tả kỹ thuật:** SPEC §2–§4 schemas: seq/generation/tickIndex/stateVersion/renderRevision riêng; commands sync control flush, bounded dedup, copied render outputs; không thêm source skeleton.
- **Input contract:** Outputs của V1-04, V1-05; defaults và fixtures trong SCIENTIFIC_SPEC/TEST_CASES.
- **Output contract:** Contract test fixtures xác định add→reset→add, duplicate vs two resets, paused resume/add, input→Gu/Sb/Ol, oil-only region và copy buffer. Core không React/Three/DOM. Ghi evidence/command/exit/seed/tick trong progress.md.
- **Bước triển khai:** 1) Định nghĩa g/ml/s/rad và integer input. 2) Chốt command results, version/reset generation, seed. 3) Viết fixtures/state factory và compile-time usage examples.
- **Module/file:** SimulationState.ts, SimulationEngine.ts, types/experiment.ts, docs/SCIENTIFIC_SPEC.md
- **Phụ thuộc:** V1-04, V1-05.
- **Gate/evidence:** Core/unit acceptance theo task; browser evidence nếu task yêu cầu chưa có thì ghi phần BLOCKED, không dùng tài liệu làm pass.
- **Ưu tiên:** MUST_HAVE; scope MVP.
- **Thời gian dự kiến:** O=0; L=0; P=0 giờ.
- **Trạng thái:** COMPLETED_VERIFIED.
- **Tiêu chí nghiệm thu:** Contract test fixtures xác định add→reset→add, duplicate vs two resets, paused resume/add, input→Gu/Sb/Ol, oil-only region và copy buffer. Core không React/Three/DOM.
- **Kiểm thử:** Type fixtures và SC-C/SC-R/SC-B cases; runtime được kiểm ở V2-01/V2-10.
- **Rủi ro:** Hai nguồn totals và readonly nông.
- **Dự phòng:** Dùng copied snapshot + readonly nested types, không deep-clone particles mỗi React render.


## Phase 2 — Stirring System và early slice

### V2-01 — Runtime engine và command transaction

- **Mục tiêu:** Commands có validation và kết quả nguyên tử.
- **Mô tả kỹ thuật:** Synchronous dispatch/control flush hoạt động khi paused, không đợi scientific tick. Facade bind generation mới cho từng control intent, pointer giữ token g cũ; single client monotonic seq + ack LRU256/high-water. SPEC §3.4 autoDriveEnabled ngăn stop bị auto controller bật lại; pause giữ cấu hình enable nhưng omegaRod0.
- **Input contract:** Outputs của V1-07; defaults và fixtures trong SCIENTIFIC_SPEC/TEST_CASES.
- **Output contract:** Paused resume không deadlock; add paused hiện ngay với elapsed không đổi. seq1add100→seq2reset→seq3add50 cho g1/v3/50ml; duplicate reset không tăng g; reset ID khác tăng g; stale pointer/ack không ghi đè; max256 cached acks. Ghi evidence/command/exit/seed/tick trong progress.md.
- **Bước triển khai:** 1) State factory có totals và phases, paused mặc định. 2) Validate/commit command nguyên tử, add vào Gu/Sb/Ol/W và remap chỉ bounds. 3) Bounded dedup/ack/version/reset fence với timeline fixtures SPEC §3.
- **Module/file:** simulation/core/SimulationEngine.ts, SimulationState.ts, tests/engine.test.ts
- **Phụ thuộc:** V1-07.
- **Gate/evidence:** Core/unit acceptance theo task; browser evidence nếu task yêu cầu chưa có thì ghi phần BLOCKED, không dùng tài liệu làm pass.
- **Ưu tiên:** MUST_HAVE; scope MVP.
- **Thời gian dự kiến:** O=0; L=0; P=0 giờ.
- **Trạng thái:** COMPLETED_VERIFIED.
- **Tiêu chí nghiệm thu:** Paused resume không deadlock; add paused hiện ngay với elapsed không đổi. seq1add100→seq2reset→seq3add50 cho g1/v3/50ml; duplicate reset không tăng g; reset ID khác tăng g; stale pointer/ack không ghi đè; max256 cached acks.
- **Kiểm thử:** SC-C01–SC-C07 và baseline store tests; snapshot detached/mutation fixtures; add phase allocation SC-A01.
- **Rủi ro:** Reset fencing và ack cũ phá input; dedup memory không giới hạn.
- **Dự phòng:** Single synchronous facade và high-water; giữ sequence diagnostics, không async worker/protocol nhiều client.

### V2-02 — Fixed timestep và accumulator có cap

- **Mục tiêu:** Mô phỏng tiến triển ổn định theo thời gian sim.
- **Mô tả kỹ thuật:** advance(dt) flush control riêng, dt0 no-op time; h1/60,maxDelta.1,maxSteps6; h1/120 cần12steps. Preserve remainder<h; discarded active time tách khỏi hidden/paused duration; replay commands theo tick+ordinal.
- **Input contract:** Outputs của V2-01; defaults và fixtures trong SCIENTIFIC_SPEC/TEST_CASES.
- **Output contract:** Paused controls chạy ngoài step, command tại tick120 áp dụng trước step121 ở mọi FPS. advance5s chạy6steps/drop4.9s nếu remainder0. Hidden/resume firstDelta0, không bù gap; h1/120 budget12. Ghi evidence/command/exit/seed/tick trong progress.md.
- **Bước triển khai:** 1) Implement advance(realDt)/single step. 2) Tách elapsed sim và wall time. 3) Xử lý pause/visibility/unmount không tăng time.
- **Module/file:** SimulationClock.ts, engine tests, bridge runtime
- **Phụ thuộc:** V2-01.
- **Gate/evidence:** Core/unit acceptance theo task; browser evidence nếu task yêu cầu chưa có thì ghi phần BLOCKED, không dùng tài liệu làm pass.
- **Ưu tiên:** MUST_HAVE; scope MVP.
- **Thời gian dự kiến:** O=0; L=0; P=0 giờ.
- **Trạng thái:** COMPLETED_VERIFIED.
- **Tiêu chí nghiệm thu:** Paused controls chạy ngoài step, command tại tick120 áp dụng trước step121 ở mọi FPS. advance5s chạy6steps/drop4.9s nếu remainder0. Hidden/resume firstDelta0, không bù gap; h1/120 budget12.
- **Kiểm thử:** SC-N01/SC-N04/SC-N05 và SC-T01–SC-T03; logical timeline, không inject frame gần nhất.
- **Rủi ro:** Spiral of death, mất command ở ranh giới tick.
- **Dự phòng:** Queue commands tại tick kế tiếp, log dropped time; không tăng dt khoa học.

### V2-03 — Flow response và quán tính sau stop

- **Mục tiêu:** Tốc độ dòng có hướng và giảm liên tục khi ngừng khuấy.
- **Mô tả kỹ thuật:** Ba biến omegaRod/omegaDrive/omegaFlow; omegaDrive=contact*radialCoupling*omegaRod. Giữ a2,b.8,I=abs(flow)/6 nên fast equilibriumI=.7143 ở contact1; fixed-I fixture riêng.
- **Input contract:** Outputs của V2-02; defaults và fixtures trong SCIENTIFIC_SPEC/TEST_CASES.
- **Output contract:** No contact hoặc dry không tạo drive, flow đang có vẫn decay khi rút contact. Full contact auto slow/medium/fast Ieq≈.1190/.3571/.7143; stop không pause; thin liquid gate pass. Ghi evidence/command/exit/seed/tick trong progress.md.
- **Bước triển khai:** 1) Tách rodAngularVelocity khỏi flowAngularVelocity. 2) Tính drive coupling và damping. 3) Tạo flow intensity bounded cho model khác.
- **Module/file:** models/StirringFlow.ts, constants/science.ts (khi làm), tests/flow.test.ts
- **Phụ thuộc:** V2-02.
- **Gate/evidence:** Core/unit acceptance theo task; browser evidence nếu task yêu cầu chưa có thì ghi phần BLOCKED, không dùng tài liệu làm pass.
- **Ưu tiên:** MUST_HAVE; scope MVP.
- **Thời gian dự kiến:** O=0; L=0; P=0 giờ.
- **Trạng thái:** COMPLETED_VERIFIED.
- **Tiêu chí nghiệm thu:** No contact hoặc dry không tạo drive, flow đang có vẫn decay khi rút contact. Full contact auto slow/medium/fast Ieq≈.1190/.3571/.7143; stop không pause; thin liquid gate pass.
- **Kiểm thử:** SC-F01/F02, SC-H01/H02, engine ramp-up timing §8; không ép I1 thành auto fast.
- **Rủi ro:** Tắt input đồng nghĩa tắt mọi hiện tượng.
- **Dự phòng:** Stop chỉ drive=0, tiếp tục clock và decay; pause mới đóng băng.

### V2-04 — Auto controller ba mức

- **Mục tiêu:** Auto slow/medium/fast điều khiển cùng engine input.
- **Mô tả kỹ thuật:** Auto1/3/6rad/s; default orbit radius.4,tipY adaptive theo bed (bed0=.14). On-entry giữ pose, radius smoothstep tới.4 trong.25s, theta liên tục. Geometry/contact cùng state.
- **Input contract:** Bounds/pose/region contract SCIENTIFIC_SPEC §4–§6 và outputs dependencies.
- **Output contract:** Manual→auto first pose giống trước trong1e-9scene units, sau.25s radius.4 không nhảy frame đầu; slow<medium<fast; stop drive0 flowdecay. Ghi evidence/command/exit/seed/tick trong progress.md.
- **Bước triển khai:** 1) Map UI level→signed drive. 2) Advance angle theo sim dt. 3) Stop drive nhưng giữ flow.
- **Module/file:** interactions/AutoStirController.ts, ControlPanel.tsx, tests/auto.test.ts
- **Phụ thuộc:** V2-03, V2-10.
- **Gate/evidence:** Core/unit acceptance theo task; browser evidence nếu task yêu cầu chưa có thì ghi phần BLOCKED, không dùng tài liệu làm pass.
- **Ưu tiên:** MUST_HAVE; scope MVP.
- **Thời gian dự kiến:** O=0.2; L=0.5; P=0.5 giờ (còn lại browser QA).
- **Trạng thái:** PARTIAL (Core verified 161/161 tests, Browser QA pending).
- **Tiêu chí nghiệm thu:** Manual→auto first pose giống trước trong1e-9scene units, sau.25s radius.4 không nhảy frame đầu; slow<medium<fast; stop drive0 flowdecay.
- **Kiểm thử:** SC-F01/SC-J01 và V2-11 slice browser; contact1 formula oracle độc lập.
- **Rủi ro:** Rod angle từ wall time lệch lúc pause.
- **Dự phòng:** Góc do engine cập nhật, renderer chỉ nhận pose.

### V2-05 — Ray-plane projection và clamp thìa

- **Mục tiêu:** Chuột tạo vị trí thìa hợp lệ trong cốc.
- **Mô tả kỹ thuật:** Plane x/z ngang chốt tại tipY ở pointerdown (bed0=.14), rodtip vẫn adapt theo bed. theta=atan2(z,x); drag offset tránh jump; rAllowed.74; nearparallel<1e-5 bỏ.
- **Input contract:** Bounds/pose/region contract SCIENTIFIC_SPEC §4–§6 và outputs dependencies.
- **Output contract:** Pointerdown giữ pose, move áp offset trước clamp; không xuyên thành/đáy; rayinvalid hoặc pointerId thứ hai không đổi pose/drive. Ghi evidence/command/exit/seed/tick trong progress.md.
- **Bước triển khai:** 1) Chuyển event ray thành điểm mặt phẳng ở adapter. 2) Clamp radial và cố định độ sâu tip. 3) Đưa x/z + timestamp input vào controller.
- **Module/file:** ManualStirController.ts, StirringRod.tsx, LaboratoryScene.tsx, tests/manualPosition.test.ts
- **Phụ thuộc:** V1-05, V2-01.
- **Gate/evidence:** Core/unit acceptance theo task; browser evidence nếu task yêu cầu chưa có thì ghi phần BLOCKED, không dùng tài liệu làm pass.
- **Ưu tiên:** MUST_HAVE; scope MVP.
- **Thời gian dự kiến:** O=0; L=0; P=0 giờ.
- **Trạng thái:** COMPLETED_VERIFIED.
- **Tiêu chí nghiệm thu:** Pointerdown giữ pose, move áp offset trước clamp; không xuyên thành/đáy; rayinvalid hoặc pointerId thứ hai không đổi pose/drive.
- **Kiểm thử:** SC-F04, SC-H01/H02, SC-J01–SC-J04; unit math và browser nhiều góc.
- **Rủi ro:** Nhảy khi ray gần song song hoặc qua tâm.
- **Dự phòng:** Bỏ sample invalid; giữ vị trí trước; một mặt phẳng và cán đứng cố định.

### V2-06 — Suy ra vận tốc và hướng manual

- **Mục tiêu:** Mouse samples tác động flow qua rad/s thật.
- **Mô tả kỹ thuật:** Unwrap/lọc tau.08/cap8; stale timeout150ms monotonic host input clock không sim time; gap>150ms hoặc deadzone.0435 reset angle history+drive0. Exit cần2valid samples, không spike.
- **Input contract:** Outputs của V2-05, V2-03; defaults và fixtures trong SCIENTIFIC_SPEC/TEST_CASES.
- **Output contract:** Giữ chuột đứng yên: sau150ms drive0 dù chưa release, flowdecay. Chéo tâm/longgap không angular spike; dt<=0/out-of-order bỏ. Playback timeout được record thành control event cùng tick. Ghi evidence/command/exit/seed/tick trong progress.md.
- **Bước triển khai:** 1) Bỏ dt<=0 và timestamp đảo. 2) Unwrap ±π, áp dead zone r<0.05 radius. 3) Lọc và gửi drive mới; release decay drive về 0.
- **Module/file:** ManualStirController.ts, tests/manualVelocity.test.ts
- **Phụ thuộc:** V2-05, V2-03.
- **Gate/evidence:** Core/unit acceptance theo task; browser evidence nếu task yêu cầu chưa có thì ghi phần BLOCKED, không dùng tài liệu làm pass.
- **Ưu tiên:** MUST_HAVE; scope MVP.
- **Thời gian dự kiến:** O=0; L=0; P=0 giờ.
- **Trạng thái:** COMPLETED_VERIFIED.
- **Tiêu chí nghiệm thu:** Giữ chuột đứng yên: sau150ms drive0 dù chưa release, flowdecay. Chéo tâm/longgap không angular spike; dt<=0/out-of-order bỏ. Playback timeout được record thành control event cùng tick.
- **Kiểm thử:** SC-J02–SC-J04, SC-F03; eventtrace có input times và tick-stamped releases.
- **Rủi ro:** Pointer event không đều làm tốc độ ảo.
- **Dự phòng:** Timestamp monotonic, smoothing constant; reset sample history lúc mode/resume.

### V2-07 — Pointer ownership và chuyển mode

- **Mục tiêu:** Camera và thìa không tranh chuột.
- **Mô tả kỹ thuật:** SPEC §6 transition table đủ pointer capture/up/cancel/lostcapture, blur/hidden/hideRod/pause/reset/mode/unmount; một pointerId, observe/auto/manual-idle/manual-drag.
- **Input contract:** Outputs của V2-04, V2-06; defaults và fixtures trong SCIENTIFIC_SPEC/TEST_CASES.
- **Output contract:** Mọi exit path release capture/driver và camera enabled. HideRod stop driver nhưng không xóa flow; hidden clear sample, resume cần drag mới; auto/manual pose continuity. Ghi evidence/command/exit/seed/tick trong progress.md.
- **Bước triển khai:** 1) Xác định state machine mode + dragging. 2) Khóa OrbitControls khi manual drag, phục hồi mọi exit path. 3) Chuyển auto/manual giữ rod pose nhưng reset sample history.
- **Module/file:** ControlPanel.tsx, LaboratoryScene.tsx, controllers, tests/mode.test.ts
- **Phụ thuộc:** V2-04, V2-06.
- **Gate/evidence:** Core/unit acceptance theo task; browser evidence nếu task yêu cầu chưa có thì ghi phần BLOCKED, không dùng tài liệu làm pass.
- **Ưu tiên:** MUST_HAVE; scope MVP.
- **Thời gian dự kiến:** O=0; L=0; P=0 giờ.
- **Trạng thái:** COMPLETED_VERIFIED.
- **Tiêu chí nghiệm thu:** Mọi exit path release capture/driver và camera enabled. HideRod stop driver nhưng không xóa flow; hidden clear sample, resume cần drag mới; auto/manual pose continuity.
- **Kiểm thử:** SC-J01–SC-J04 và SC-W cases; mouse bắt buộc, responsive/touch camera riêng, không claim manual touch.
- **Rủi ro:** Pointer capture bị mất khi reset Canvas.
- **Dự phòng:** Engine owner ngoài Canvas, cleanup luôn dispatch release.

### V2-08 — Vòng đời tick và pose thìa trong scene

- **Mục tiêu:** Có một loop và thìa lấy pose từ engine.
- **Mô tả kỹ thuật:** Mở rộng owner/bridge đã có từ V2-10, không tạo owner thứ hai. Pose ref/cleanup theo full manual state machine; camera/context remount không reset engine.
- **Input contract:** Outputs của V2-02, V2-07, V2-10; defaults và fixtures trong SCIENTIFIC_SPEC/TEST_CASES.
- **Output contract:** StrictMode/camera reset20lần vẫn1loop; generation/mass không đổi vì remount. Loss/restore behavior chuyên biệt V4-10, không mặc định ErrorBoundary đã xử lý. Ghi evidence/command/exit/seed/tick trong progress.md.
- **Bước triển khai:** 1) Gắn bridge owner ở app/provider có runtime thật. 2) Cập nhật ref pose, không setState per-frame. 3) Cleanup/StrictMode/camera reset không nhân tick.
- **Module/file:** app/providers/SimulationProvider.tsx (khi cần), LaboratoryScene.tsx, StirringRod.tsx
- **Phụ thuộc:** V2-02, V2-07, V2-10.
- **Gate/evidence:** Core/unit acceptance theo task; browser evidence nếu task yêu cầu chưa có thì ghi phần BLOCKED, không dùng tài liệu làm pass.
- **Ưu tiên:** MUST_HAVE; scope MVP.
- **Thời gian dự kiến:** O=0.2; L=0.5; P=0.5 giờ (còn lại browser QA).
- **Trạng thái:** PARTIAL (Core verified 392/392 tests qua 19 test suites, Browser QA pending).
- **Tiêu chí nghiệm thu:** StrictMode/camera reset20lần vẫn1loop; generation/mass không đổi vì remount. Loss/restore behavior chuyên biệt V4-10, không mặc định ErrorBoundary đã xử lý.
- **Kiểm thử:** SC-B01–SC-B03, browserloop logs; integration ownership tests.
- **Rủi ro:** Loop sống dai hoặc scene không redraw khi demand.
- **Dự phòng:** Một RAF owner, scene subscribe invalidate; không song song useFrame tick nữa.

### V2-09 — UI pause/resume/stop/reset thống nhất

- **Mục tiêu:** Người dùng phân biệt dừng khuấy và tạm dừng mô phỏng.
- **Mô tả kỹ thuật:** Hoàn thiện UI các mode/stop/pause/resume trên basic controls từ V2-10; initial/reset paused. Add paused flush và remap hiện ngay; nút Bắt đầu/tiếp tục dễ thấy.
- **Input contract:** Outputs của V2-08; defaults và fixtures trong SCIENTIFIC_SPEC/TEST_CASES.
- **Output contract:** Stop không đóng băng models; pause giữ time/positions trừ command add/remap ràng buộc; reset hóa học sạch nhưng giữ camera/showRod, stale event không resurrect. Ghi evidence/command/exit/seed/tick trong progress.md.
- **Bước triển khai:** 1) Đặt label và disabled states rõ. 2) Cho add hợp lệ khi pause, không tự resume. 3) Reset state khoa học, giữ camera/UI preference.
- **Module/file:** ControlPanel.tsx, experimentStore.ts, Engine, UI tests
- **Phụ thuộc:** V2-08.
- **Gate/evidence:** Core/unit acceptance theo task; browser evidence nếu task yêu cầu chưa có thì ghi phần BLOCKED, không dùng tài liệu làm pass.
- **Ưu tiên:** MUST_HAVE; scope MVP.
- **Thời gian dự kiến:** O=0.1; L=0.3; P=0.5 giờ (còn lại browser QA).
- **Trạng thái:** PARTIAL (Core verified 412/412 tests qua 20 test suites, Browser QA pending).
- **Tiêu chí nghiệm thu:** Stop không đóng băng models; pause giữ time/positions trừ command add/remap ràng buộc; reset hóa học sạch nhưng giữ camera/showRod, stale event không resurrect.
- **Kiểm thử:** SC-C01/C03/C04, SC-A01, SC-J03, UI states từ slice được giữ.
- **Rủi ro:** Reset và add race ở cùng tick.
- **Dự phòng:** Reset command fence tăng generation, loại commands cũ sau reset.

### V2-10 — Early authoritative bridge và controls tối thiểu

- **Mục tiêu:** Ngay lát cắt đầu, form/reset/UI/rod dùng một engine thật.
- **Mô tả kỹ thuật:** Engine owner ngoài Canvas, facadecontrolflushsync, store bỏ mutable totals và giữ detachedsnapshots/acks; scalarcommandpublish ngay, tick10Hz; copy pose/regions tối thiểu, controlsBắtđầu/Pause/Reset.
- **Input contract:** V2-01 commands/acks/snapshots, V2-02 clock, UIforms Ngày1.
- **Output contract:** Addpaused→UI ngay và time0; resume tick; reset không hai totals; camera remount giữengine. 1owner/loop, staleackkhôngapply; no fullscienceclaim. Ghi evidence/command/exit/seed/tick trong progress.md.
- **Bước triển khai:** 1) Nối add/reset cũ vào facade mộtengine, initialpaused. 2) Subscribe detached totals/phase snapshots; no aliasbuffer. 3) Cấprodref vàinvalidate, scheduler oneowner, test camera remount.
- **Module/file:** experimentStore.ts, app/providers/SimulationProvider.tsx (khi làm), ControlPanel.tsx, LaboratoryScene.tsx, StirringRod.tsx
- **Phụ thuộc:** V2-01, V2-02.
- **Gate/evidence:** Core/unit acceptance theo task; browser evidence nếu task yêu cầu chưa có thì ghi phần BLOCKED, không dùng tài liệu làm pass.
- **Ưu tiên:** MUST_HAVE; scope MVP.
- **Thời gian dự kiến:** O=0.2; L=0.5; P=0.5 giờ (còn lại browser QA).
- **Trạng thái:** PARTIAL (Core verified 161/161 tests, Browser QA pending).
- **Tiêu chí nghiệm thu:** Addpaused→UI ngay và time0; resume tick; reset không hai totals; camera remount giữengine. 1owner/loop, staleackkhôngapply; no fullscienceclaim.
- **Kiểm thử:** SC-C01/C03/C07, SC-B01/B03, bridge/storeintegration + browserbaseline khi có.
- **Rủi ro:** Nửa migration để lạihai bộ quantities hoặc loop.
- **Dự phòng:** Migrateadd/resetđồng thời transaction, giữshapeUIactions; chưa làm shader/fullpools.

### V2-11 — Nghiệm thu lát cắt nước–đường chạy thật

- **Mục tiêu:** Kiểm chứng engine→snapshot→UI/scene trước cát/dầu/manual đầy đủ.
- **Mô tả kỹ thuật:** Early integration nước–đường bằng model thật, basic phase/scene outputs. Nghiệm thu unit và browser ghi riêng; ưu tiên slice trước mở rộng visual/manual nhưng không chặn toán học unit độc lập khi browser thiếu.
- **Input contract:** MộtbridgeV2-10, autoslow/fastV2-04, dissolutionV3-02, baselinebrowserV1-03.
- **Output contract:** Bằngchứngverticalslice thật, danh sáchlỗi; không fullcomposition/massmodelcomplete.
- **Bước triển khai:** 1) W100ml/G1g qua bridge và model thật, no-stir/auto fixtures. 2) Pause/add/resume/reset và minimal UI/scene. 3) Integration tests; browser theo V1-03, ghi phần blocked trung thực.
- **Module/file:** LaboratoryScene.tsx, ParticleRenderer.tsx (adapter tối thiểu), ContentsPanel.tsx, integrationtests, progress.md
- **Phụ thuộc:** V2-10, V2-04, V3-02.
- **Gate/evidence:** Browser evidence cần V1-03; thiếu browser giữ slice PARTIAL/BLOCKED, unit models độc lập không bị chặn. Full integration release vẫn cần V2-11 verified.
- **Ưu tiên:** MUST_HAVE; scope MVP.
- **Thời gian dự kiến:** O=0.2; L=0.5; P=0.5 giờ (còn lại cho browser QA).
- **Trạng thái:** PARTIAL (Core calibrated & verified 223/223 tests, Browser QA pending).
- **Tiêu chí nghiệm thu:** ThêmW100/G1 ởpaused, starttăngGd/giảmhạttheoGu, pause10s giữt/Gd, add.1g vàoGu hiệnngay, resume, reset0paused. Snapshot/scene/UIkhớp; khôngchờPhase4.
- **Kiểm thử:** SC-C01/SC-D02 và browserUC1mini trongTEST_CASES. Browserthiếu→BLOCKEDslice, corebranch có thể tiếp tục nếu đãđược phép.
- **Rủi ro:** Browserblocked làmnhánhmanual/cát/dầu integrationchưaqua gate.
- **Dự phòng:** Giữ browser slice PARTIAL/BLOCKED khi thiếu môi trường, điều kiện gỡ V1-03 evidence; pure model/controller tasks có deps kỹ thuật riêng nên không cần giả complete slice.


## Phase 3 — Scientific Simulation

### V3-01 — Mass ledger và transfer primitive

- **Mục tiêu:** Bảo toàn từng chất không phụ thuộc render.
- **Mô tả kỹ thuật:** Implement bounded paired transfers/invariant checks trên phase allocation đã có V2-01; không di chuyển add allocation tới cuối. Eps numerical khác label/hide/equilibrium.
- **Input contract:** Outputs của V2-01; defaults và fixtures trong SCIENTIFIC_SPEC/TEST_CASES.
- **Output contract:** Mass mỗi chất invariant ở mọi tick; input ticks chính xác; addG→Gu/addS→Sb/addO→Ol giữ phase cũ; reservation không mở chỗ sau tan. Không snap residual. Ghi evidence/command/exit/seed/tick trong progress.md.
- **Bước triển khai:** 1) Đổi water/oil ml→g bằng model density. 2) Tạo paired-transfer và total assertions. 3) Lưu input totals độc lập, capacity reserve từ input.
- **Module/file:** SimulationState.ts, Engine, constants/science.ts, tests/mass.test.ts
- **Phụ thuộc:** V2-01.
- **Gate/evidence:** Core/unit acceptance theo task; browser evidence nếu task yêu cầu chưa có thì ghi phần BLOCKED, không dùng tài liệu làm pass.
- **Ưu tiên:** MUST_HAVE; scope MVP.
- **Thời gian dự kiến:** O=0; L=0; P=0 giờ.
- **Trạng thái:** COMPLETED_VERIFIED.
- **Tiêu chí nghiệm thu:** Mass mỗi chất invariant ở mọi tick; input ticks chính xác; addG→Gu/addS→Sb/addO→Ol giữ phase cũ; reservation không mở chỗ sau tan. Không snap residual.
- **Kiểm thử:** SC-IN03, SC-C/SC-A cases; randomtransfer/mass snapshot tests.
- **Rủi ro:** Double-count đại diện hoặc clamp âm làm tạo/mất mass.
- **Dự phòng:** Tính đích từ total trừ nguồn, throw diagnostic nếu vượt epsilon; không tự sửa tổng ngầm.

### V3-02 — Dissolution bounded theo nước và bão hòa

- **Mục tiêu:** Đường tan theo dt trong nước, không tan trong dầu.
- **Mô tả kỹ thuật:** Giữ bounded exponential dissolution và S0=2 teaching default; W0 gate, stirred rate không đổi capacity. Publish snapshot qua early bridge để nghiệm thu slice, không chờ fullcomposition.
- **Input contract:** Outputs của V3-01, V2-03; defaults và fixtures trong SCIENTIFIC_SPEC/TEST_CASES.
- **Output contract:** SC-D01–D06 pass và nhận raw float phase masses, near/full saturation dùng predicates SPEC §8; oil không tăng solvent; slice được đánh giá riêng V2-11. Ghi evidence/command/exit/seed/tick trong progress.md.
- **Bước triển khai:** 1) Implement capacity/gap/contact gates. 2) Tính transfer analytic bounded. 3) Add water/sugar giữa chừng giữ dissolved cũ.
- **Module/file:** models/Dissolution.ts, science constants, tests/dissolution.test.ts
- **Phụ thuộc:** V3-01, V2-03.
- **Gate/evidence:** Core/unit acceptance theo task; browser evidence nếu task yêu cầu chưa có thì ghi phần BLOCKED, không dùng tài liệu làm pass.
- **Ưu tiên:** MUST_HAVE; scope MVP.
- **Thời gian dự kiến:** O=0; L=0; P=0 giờ.
- **Trạng thái:** COMPLETED_VERIFIED.
- **Tiêu chí nghiệm thu:** SC-D01–D06 pass và nhận raw float phase masses, near/full saturation dùng predicates SPEC §8; oil không tăng solvent; slice được đánh giá riêng V2-11.
- **Kiểm thử:** Fixed-I numeric oracle riêng engine coupling/ramp: SC-D02 và SC-U01/U02, không gọi I1 là auto fast.
- **Rủi ro:** Sai đơn vị hoặc lấy oil vào solvent capacity.
- **Dự phòng:** Dùng g/g-water rõ; S0 giáo dục công bố, không gán độ tan thực nghiệm.

### V3-03 — Cát suspension và sedimentation

- **Mục tiêu:** Cát không tan, khuấy nâng và nghỉ lắng theo thời gian.
- **Mô tả kỹ thuật:** Sand exchange như v2; chốt fGu state dynamics cùng rate equation, add sugar dilute fGu, dry0, Gu0reset0. Oil-only solid suspension được map vào oil envelope chứa dầu thật.
- **Input contract:** V3-01 ledger và V2-03 flow; SPEC §4 oil-only mapping/fGu. Browser gate ở slice/release, không chặn unit model.
- **Output contract:** Oil-only Ss>0 có vùng dầu nền đủ100ml, Od0/OlOt; dry/wet transitions, fGu update/reset/pause rõ; stop lắng liên tục. Ghi evidence/command/exit/seed/tick trong progress.md.
- **Bước triển khai:** 1) Tính lift/settle rate từ flow và carrier. 2) Solve exchange bounded, không dissolve. 3) Đưa suspended fraction cho particle transport.
- **Module/file:** models/SandSuspension.ts, tests/sand.test.ts
- **Phụ thuộc:** V3-01, V2-03.
- **Gate/evidence:** Core/unit acceptance theo task; browser evidence nếu task yêu cầu chưa có thì ghi phần BLOCKED, không dùng tài liệu làm pass.
- **Ưu tiên:** MUST_HAVE; scope MVP.
- **Thời gian dự kiến:** O=0; L=0; P=0 giờ.
- **Trạng thái:** COMPLETED_VERIFIED.
- **Tiêu chí nghiệm thu:** Oil-only Ss>0 có vùng dầu nền đủ100ml, Od0/OlOt; dry/wet transitions, fGu update/reset/pause rõ; stop lắng liên tục.
- **Kiểm thử:** SC-S01–SC-S05, SC-R01–SC-R05, SC-A01; carrier mapping không tự dùng aqueous cho oil-only.
- **Rủi ro:** Khối lượng lắng khớp nhưng hạt vẽ sai.
- **Dự phòng:** Model là truth, positions seeded/weighted; không ép body pile thay suspension.

### V3-04 — Dầu droplets và separation

- **Mục tiêu:** Dầu không tan, có giọt khi khuấy trong nước và tách dần.
- **Mô tả kỹ thuật:** Giữ oil layered/dispersed exchange; Ol nền carrier trong oil-only, không tạo thêm khối oil. Water+oil droplets volume đã nằm aqueous envelope.
- **Input contract:** V3-01 ledger và V2-03 flow; SPEC §4/§5 oil phase gates. Unit models có thể làm khi browser chưa có.
- **Output contract:** SC-O01–SC-O05 đạt, oilOnly OlOt nhưng solids chứa trong chính oilregion; labels nearSeparated không xóa Od nhỏ. Ghi evidence/command/exit/seed/tick trong progress.md.
- **Bước triển khai:** 1) Tính breakup phụ thuộc intensity và water fraction. 2) Tính coalescence/separation khi drive suy giảm. 3) Giữ tổng oil và expose droplet fraction.
- **Module/file:** models/OilSeparation.ts, tests/oil.test.ts
- **Phụ thuộc:** V3-01, V2-03.
- **Gate/evidence:** Core/unit acceptance theo task; browser evidence nếu task yêu cầu chưa có thì ghi phần BLOCKED, không dùng tài liệu làm pass.
- **Ưu tiên:** MUST_HAVE; scope MVP.
- **Thời gian dự kiến:** O=0; L=0; P=0 giờ.
- **Trạng thái:** COMPLETED_VERIFIED.
- **Tiêu chí nghiệm thu:** SC-O01–SC-O05 đạt, oilOnly OlOt nhưng solids chứa trong chính oilregion; labels nearSeparated không xóa Od nhỏ.
- **Kiểm thử:** SC-O cases, SC-R02/R03, SC-U01/U02, no-water and add preserving phases.
- **Rủi ro:** Layer rendered đầy cộng droplets làm gấp đôi dầu.
- **Dự phòng:** Layer volume lấy layered mass; droplet total chỉ dispersed mass.

### V3-05 — Transport hạt đại diện có bounds

- **Mục tiêu:** Hạt/giọt di chuyển do flow và state khoa học.
- **Mô tả kỹ thuật:** Visual stateless hash(seed,generation,material,index,birthOrdinal), science không RNG hoặc stream visual. Engine private buffers, copyRenderFrame sang output caller-owned; command remap minimally clamps oldpositions.
- **Input contract:** Outputs của V3-02, V3-03, V3-04; defaults và fixtures trong SCIENTIFIC_SPEC/TEST_CASES.
- **Output contract:** N10/100/700 scalartrajectory như nhau; mutate returned snapshot/buffer không đổi core/nextstep. Oil-only solidpool trong oilregion; addpaused/remap không chạy time/velocities ngoài projectionconstraint. Ghi evidence/command/exit/seed/tick trong progress.md.
- **Bước triển khai:** 1) Tạo/reweight đại diện theo mass pha. 2) Integrate vị trí có damping và clamp vùng chứa. 3) Tách sugar/sand/droplet responses; zero-mass loại đại diện.
- **Module/file:** SimulationState.ts, simulation/models/ParticleTransport.ts (khi làm), tests/transport.test.ts
- **Phụ thuộc:** V3-02, V3-03, V3-04.
- **Gate/evidence:** Core/unit acceptance theo task; browser evidence nếu task yêu cầu chưa có thì ghi phần BLOCKED, không dùng tài liệu làm pass.
- **Ưu tiên:** MUST_HAVE; scope MVP.
- **Thời gian dự kiến:** O=0; L=0; P=0 giờ.
- **Trạng thái:** COMPLETED_VERIFIED.
- **Tiêu chí nghiệm thu:** N10/100/700 scalartrajectory như nhau; mutate returned snapshot/buffer không đổi core/nextstep. Oil-only solidpool trong oilregion; addpaused/remap không chạy time/velocities ngoài projectionconstraint.
- **Kiểm thử:** SC-P01–SC-P05, SC-B01/B02, SC-R04/R05; retained index/birth seed replay, readonly không thay runtime proof.
- **Rủi ro:** Chuyển mass làm particle pop hoặc invalid buffers.
- **Dự phòng:** Fixed pools và scale alpha/weight, không tự animation thời gian trong renderer.

### V3-06 — Compose models và thêm chất mọi thời điểm

- **Mục tiêu:** Một tick có thứ tự rõ, không reset mô hình khi thêm chất.
- **Mô tả kỹ thuật:** Control flush độc lập scientificstep; after eachcommand allocate/remap snapshot immediate. Tick:flow→dissolve→sand/fGu→oil→transport→invariants. Replay recorded actual generation/tick/ordinal, không wallframeinject.
- **Input contract:** Outputs của V3-05, V2-09; defaults và fixtures trong SCIENTIFIC_SPEC/TEST_CASES.
- **Output contract:** Paused add/reset/resume hoạt động, addg vào rắn chứ không tan ngay; trướcafterSC-A01 đúng; everygenerationversion ack nhất quán. Regionchangement oldparticles projectiononly. Ghi evidence/command/exit/seed/tick trong progress.md.
- **Bước triển khai:** 1) Chốt thứ tự deterministic. 2) Xử lý add while paused/mode changes. 3) Không suy ra cùng động trạng thái chỉ vì cùng final totals.
- **Module/file:** Engine, model interfaces, tests/composition.test.ts
- **Phụ thuộc:** V3-05, V2-09.
- **Gate/evidence:** Core/unit acceptance theo task; browser evidence nếu task yêu cầu chưa có thì ghi phần BLOCKED, không dùng tài liệu làm pass.
- **Ưu tiên:** MUST_HAVE; scope MVP.
- **Thời gian dự kiến:** O=0; L=0; P=0 giờ.
- **Trạng thái:** COMPLETED_VERIFIED.
- **Tiêu chí nghiệm thu:** Paused add/reset/resume hoạt động, addg vào rắn chứ không tan ngay; trướcafterSC-A01 đúng; everygenerationversion ack nhất quán. Regionchangement oldparticles projectiononly.
- **Kiểm thử:** SC-C01–C07, SC-A01, SC-R04/R05, scalar replaycases.
- **Rủi ro:** Models mutate cùng state gây phụ thuộc vô ý.
- **Dự phòng:** Một orchestrator và pure update transfers; test mỗi model + integration.

### V3-07 — Ma trận tổ hợp và hoán vị

- **Mục tiêu:** Đủ coverage cho mọi tập chất và thứ tự.
- **Mô tả kỹ thuật:** 16 subsets gồm empty; 24 permutations all-four; liều under/at/over capacity, dry/wet/oil states.
- **Input contract:** Outputs của V3-06; defaults và fixtures trong SCIENTIFIC_SPEC/TEST_CASES.
- **Output contract:** Mọi combo chạy ổn định; rejected additions được tính đúng; không đòi transient states giống nhau giữa các lịch sử khác nhau. Ghi evidence/command/exit/seed/tick trong progress.md.
- **Bước triển khai:** 1) Generate fixture matrices deterministic. 2) Assert totals/bounds/no-NaN mọi tick. 3) Thêm các timeline khuấy/pause/add và no-water gates.
- **Module/file:** simulation/tests/combinations.test.ts, docs/TEST_CASES.md
- **Phụ thuộc:** V3-06.
- **Gate/evidence:** Core/unit acceptance theo task; browser evidence nếu task yêu cầu chưa có thì ghi phần BLOCKED, không dùng tài liệu làm pass.
- **Ưu tiên:** MUST_HAVE; scope MVP.
- **Thời gian dự kiến:** O=0; L=0; P=0 giờ.
- **Trạng thái:** COMPLETED_VERIFIED.
- **Tiêu chí nghiệm thu:** Mọi combo chạy ổn định; rejected additions được tính đúng; không đòi transient states giống nhau giữa các lịch sử khác nhau.
- **Kiểm thử:** Giữ16subsets/24permutations SC-M01–M06; thêm oilOnly solids, dry→oil→water và reverse, concurrentrapidadds/orderedsynchronousack, pausedcommandtimelines.
- **Rủi ro:** Test chỉ snapshot hình không kiểm invariant.
- **Dự phòng:** Assert vật lý trực tiếp core, không WebGL hoặc ảnh làm oracle khoa học.

### V3-08 — Stability và independence của render rate

- **Mục tiêu:** Model không drift mass hoặc phụ thuộc FPS.
- **Mô tả kỹ thuật:** Replay targetTick/controlOrdinal và recordedmanualtrace; h120 có12stepsbudget; seeded visual independentN; mass/label tolerances riêng.
- **Input contract:** Outputs của V3-07, V2-02; defaults và fixtures trong SCIENTIFIC_SPEC/TEST_CASES.
- **Output contract:** Cùng timeline/FPS có scalarstate trong1e-6g/rad; fixedseedNkhác không đổi trajectory; hidden gap khôngcount elapsed, droppedwalltime exact policy; rangeh120 đúng stepcount. Ghi evidence/command/exit/seed/tick trong progress.md.
- **Bước triển khai:** 1) Chạy deterministic stress, random command bounded. 2) Đo max invariant error, không chỉ final. 3) So dt và dropped-gap policy được công bố.
- **Module/file:** simulation/tests/stability.test.ts, SCIENTIFIC_SPEC
- **Phụ thuộc:** V3-07, V2-02.
- **Gate/evidence:** Core/unit acceptance theo task; browser evidence nếu task yêu cầu chưa có thì ghi phần BLOCKED, không dùng tài liệu làm pass.
- **Ưu tiên:** MUST_HAVE; scope MVP.
- **Thời gian dự kiến:** O=0; L=0; P=0 giờ.
- **Trạng thái:** COMPLETED_VERIFIED.
- **Tiêu chí nghiệm thu:** Cùng timeline/FPS có scalarstate trong1e-6g/rad; fixedseedNkhác không đổi trajectory; hidden gap khôngcount elapsed, droppedwalltime exact policy; rangeh120 đúng stepcount.
- **Kiểm thử:** SC-N01–N05, SC-T01–T03, SC-B02; assert invariants mỗi tick, no short-path call method bypass clock in FPS tests.
- **Rủi ro:** Test quá chặt hoặc loose che lỗi.
- **Dự phòng:** Tolerance theo units; không so bitwise giữa dt khác nhau, không nới epsilon mass để che bug.


## Phase 4 — Integration & Quality

### V4-01 — Mở rộng early bridge cho đầy đủ phase/render outputs

- **Mục tiêu:** UI và scene dùng cùng authoritative engine.
- **Mô tả kỹ thuật:** Reuse một facade/owner đã nối từ V2-10; thêm full scalar selectors, copyRenderFrame pools/regions, generation/stateVersion/renderRevision handshake. Không migrate totals lần hai.
- **Input contract:** Outputs của V2-10, V3-06; defaults và fixtures trong SCIENTIFIC_SPEC/TEST_CASES.
- **Output contract:** UI/full render state cùngengine; copied frame khôngalias; forcedscalar publish command ngay và throttled10Hz khi tick; khôngowner/loopmới. Ghi evidence/command/exit/seed/tick trong progress.md.
- **Bước triển khai:** 1) Migrate add/reset store sang dispatch. 2) Xuất render mapping đơn vị→scene. 3) Subscribe/unsubscribe không deep-copy mỗi frame.
- **Module/file:** experimentStore.ts, app/providers, scene/SimulationBridge.tsx (khi cần)
- **Phụ thuộc:** V2-10, V3-06.
- **Gate/evidence:** Core/unit acceptance theo task; browser evidence nếu task yêu cầu chưa có thì ghi phần BLOCKED, không dùng tài liệu làm pass.
- **Ưu tiên:** MUST_HAVE; scope MVP.
- **Thời gian dự kiến:** O=0; L=0; P=0 giờ.
- **Trạng thái:** COMPLETED_VERIFIED.
- **Tiêu chí nghiệm thu:** UI/full render state cùng engine; copied frame không alias; forced scalar publish command ngay và throttled 10Hz khi tick; không owner/loop mới. 18/18 tests pass trong bridgeFull.test.ts, toàn bộ 484/484 tests pass across 24 test suites.
- **Kiểm thử:** SC-B01–B03, all phase UI buffers mapping fixtures; compare early slice regression; 4 interaction flows verified.
- **Rủi ro:** Hai nguồn quantities hoặc snapshots stale.
- **Dự phòng:** Giữ bridge mộtowner; tạm giảm visualinstances thay bỏownership guarantee.

### V4-02 — Render sugar và sand theo compartments

- **Mục tiêu:** Hạt phản ánh solid/suspended/settled thật.
- **Mô tả kỹ thuật:** Instanced sugar/sand từ pools có weights. OilOnly solidpool vùngoil; no mass snap khiẩn<.001g; phase values<.1g hiện '<0,1g'. Pile chỉbed.
- **Input contract:** Outputs của V4-01, V3-05; defaults và fixtures trong SCIENTIFIC_SPEC/TEST_CASES.
- **Output contract:** Vùngpool/weights đúng SPEC §4, nearcomplete labels không đánhGu=0; Nchange khôngmass; command paused thểhiệnadd/remap nhưng không animate. Ghi evidence/command/exit/seed/tick trong progress.md.
- **Bước triển khai:** 1) Map repr transforms vào buffers. 2) Scale/ẩn sugar khi tan; sand phân bố theo pha. 3) Dispose/update instance count không rò.
- **Module/file:** ParticleRenderer.tsx, LaboratoryScene.tsx
- **Phụ thuộc:** V4-01, V3-05.
- **Gate/evidence:** Core/unit acceptance theo task; browser evidence nếu task yêu cầu chưa có thì ghi phần BLOCKED/PARTIAL, không dùng tài liệu làm pass. 14/14 tests pass trong `renderCompartments.test.ts`, toàn bộ 498/498 tests pass across 25 suites, typecheck/lint/build exit 0.
- **Ưu tiên:** MUST_HAVE; scope MVP.
- **Thời gian dự kiến:** O=0.2; L=0.5; P=0.5 giờ.
- **Trạng thái:** PARTIAL (Core verified 498/498 tests pass across 25 test suites, typecheck/lint/build exit 0, Browser QA pending do thiếu môi trường trình duyệt tự động).
- **Tiêu chí nghiệm thu:** Vùng pool/weights đúng SPEC §4; đường rắn chia thành Gu_bed và Gu_susp; đường đã tan Gd không sinh hạt đại diện; cát chia thành Sb (đáy) và Ss (lơ lửng); ngừng khuấy cát lắng dần theo quán tính dòng chảy thật; bed aggregate cylinder được phủ trong suốt 65% để không che hạt rời rạc; khi mass < 0.001g hạt ẩn nhưng ledger bảo toàn; khi < 0.1g hiển thị "<0,1 g"; raycast disabled trên các hạt để không chặn kéo thìa; 14/14 tests pass trong renderCompartments.test.ts.
- **Kiểm thử:** SC-R01–R05, SC-P03/SC-U01/SC-U02 cases; desktopcamera multipleangles.
- **Rủi ro:** Opaque pile che hạt/layer.
- **Dự phòng:** Giảm pile thickness/alpha có bounds, giữ cùng mass fraction labels. Đã thêm transparent opacity=0.65 cho bed aggregate cylinders.

### V4-03 — Render nước và dầu layer/droplets

- **Mục tiêu:** Mức lớp dầu giảm khi chuyển sang giọt và trở lại khi tách.
- **Mô tả kỹ thuật:** Render explicit regions bed/aqueous/oil theo bốn cases dry/waterOnly/oilOnly/mixed; totalsumreservation không đủ, phải membershiptest. Contactdrive dùng cùngregions, dropletskhôngdoublecount.
- **Input contract:** Outputs của V4-01, V3-05; defaults và fixtures trong SCIENTIFIC_SPEC/TEST_CASES.
- **Output contract:** Oil100ml+sand10g Ss6g cho bed2.4/oil103.6/aq0; water100+oil20 dispersed9g cho aq110/oil10; numeric ybounds matchSC-R02/R03. Ghi evidence/command/exit/seed/tick trong progress.md.
- **Bước triển khai:** 1) Map liquid regions không chồng mass. 2) Instanced droplets màu vàng, no dissolved color claim. 3) Swirl surface nhẹ chỉ đọc flow intensity.
- **Module/file:** WaterVolume.tsx, OilVolume.tsx, ParticleRenderer hoặc OilDroplets.tsx (khi cần)
- **Phụ thuộc:** V4-01, V3-05.
- **Gate/evidence:** Core/unit acceptance theo task; browser evidence nếu task yêu cầu chưa có thì ghi phần BLOCKED, không dùng tài liệu làm pass.
- **Ưu tiên:** MUST_HAVE; scope MVP.
- **Thời gian dự kiến:** O=0.2; L=0.5; P=0.5 giờ.
- **Trạng thái:** PARTIAL (Core verified 515/515 tests qua 26 suites, typecheck/lint/build exit 0, Browser QA pending do thiếu môi trường browser tự động). Đã xác minh sai lệch công thức hòa tan là lỗi văn bản báo cáo V4-02 (runtime code chuẩn SPEC §5.2), hoàn thành 3 regressions hòa tan bắt buộc và fixtures độc lập. Đã kiểm chứng 4 fixtures hình học SPEC §4 (L0, L1, O, X), trao đổi giọt dầu Ol <-> Od bảo toàn khối lượng và thể tích phong bì, giọt dầu nằm nghiêm ngặt trong regions.aqueous, cát trong hệ chỉ dầu nằm trong regions.oil, guard height <= 0.0001 triệt tiêu phantom mesh, chuẩn hóa bán kính dầu r=0.87, gắn raycast={() => null} cho WaterVolume, OilVolume và Beaker để không che chuột kéo thìa. Bổ sung test suite renderLiquids.test.ts (17/17 pass).
- **Tiêu chí nghiệm thu:** Oil100ml+sand10g Ss6g cho bed2.4/oil103.6/aq0; water100+oil20 dispersed9g cho aq110/oil10; numeric ybounds matchSC-R02/R03. Đã xác minh hoàn toàn bằng unit & integration tests; browser visual inspection chờ người dùng hoặc E2E.
- **Kiểm thử:** Numeric region fixtures SPEC §4 và SC-R02/R03, visualalpha/poolmembership acrosscombinations, renderLiquids.test.ts (17 tests).
- **Rủi ro:** Transparent sorting che giọt hoặc thể tích đếm đôi.
- **Dự phòng:** Simple materials depthWrite policy; raycast={() => null} trên liquids và beaker; giảm shader, giữ layer/giọt phân biệt và science mapping.

### V4-04 — Kết quả, giải thích và responsive controls

- **Mục tiêu:** UI giải thích đúng trạng thái đang quan sát.
- **Mô tả kỹ thuật:** Predicates numerical/label/hide/equilibrium riêng, hysteresis. No water saturation N/A; progressGd/min(Gt,capacity), giải thích dư; displayinputdeci khác phasefloat. Legend tan/phân tán và modeltimingcheck.
- **Input contract:** Outputs của V4-01, V2-09; defaults và fixtures trong SCIENTIFIC_SPEC/TEST_CASES.
- **Output contract:** SC-U01/U02; residualmass khôngzero vìformat; nearSaturation99% enter/98%exit; stopsettling,separating đúngstate; 3 teaching scenarios labels phù hợp. Ghi evidence/command/exit/seed/tick trong progress.md.
- **Bước triển khai:** 1) Thêm phase amounts và status giải thích. 2) Label stop/pause/resume rõ; keyboard và mobile layout. 3) Gỡ badge/copy chỉ Giai đoạn 1 khi đã đủ state thực.
- **Module/file:** ContentsPanel.tsx, ControlPanel.tsx, App.tsx, styles/index.css
- **Phụ thuộc:** V4-01, V2-09.
- **Gate/evidence:** Core/unit acceptance theo task; browser evidence nếu task yêu cầu chưa có thì ghi phần BLOCKED, không dùng tài liệu làm pass.
- **Ưu tiên:** MUST_HAVE; scope MVP.
- **Thời gian dự kiến:** O=0.2; L=0.5; P=0.5 giờ (còn lại cho Browser QA).
- **Trạng thái:** PARTIAL (Core verified 531/531 tests qua 27 test suites, typecheck/lint/build exit 0, Browser QA pending do thiếu môi trường browser tự động).
- **Tiêu chí nghiệm thu:** SC-U01/U02; residual mass không zero vì format (<0,1 g); saturation ratio & capacity hiển thị N/A khi W=0; progress Gd/min(Gt, capacity) cap 99,9% khi còn headroom và 100% khi hết; nearSaturation [0.98, 0.99) và nearComplete L(Gt) có 2-way hysteresis; phase rates dG/dt, dSs/dt, dOd/dt dẫn xuất trực tiếp từ phương trình vật lý (bằng 0 khi paused); giải thích hiện tượng theo thứ tự ưu tiên (Empty -> Water only -> Paused -> Dry/Oil-only -> Dynamic/Rest), cát lắng và dầu tách lớp ghi nhận đồng thời; bảng chú giải màu sắc và mục mở rộng "Về mô hình"; gỡ bỏ badge "Giai đoạn 1"; hỗ trợ responsive mobile 390px và accessibility id/htmlFor không spam aria-live; 16/16 tests pass trong resultsAndControls.test.ts; UC1, UC2, UC3 kiểm chứng hoàn chỉnh trên engine và store thật.
- **Kiểm thử:** resultsAndControls.test.ts (16 tests), controls.test.ts (20 tests), bridgeFull.test.ts (18 tests), toàn bộ 531 tests qua 27 suites.
- **Rủi ro:** Text state mâu thuẫn simulation hoặc aria-live đọc liên tục.
- **Dự phòng:** Update status chỉ khi threshold chuyển; scalar snapshot 10 Hz, giữ nội dung ngắn; không đặt aria-live polling 10Hz lên container số liệu thường xuyên thay đổi.

### V4-05 — Browser E2E và kiểm chứng runtime MVP

- **Mục tiêu:** Có bằng chứng thật về chuỗi thao tác tích hợp.
- **Mô tả kỹ thuật:** Desktop1366×768/mobilewidth390×844, touch claim riêng. Benchmark W300/G100/S100/O70 reserve495ml, N700/pool. Reset/refill trước từngwindow: warm5s rồi30sauto hoặcmanual, ghi median/p95/drawcalls/instances.
- **Input contract:** Outputs của V4-02, V4-03, V4-04, V1-03, V1-06, V3-07; defaults và fixtures trong SCIENTIFIC_SPEC/TEST_CASES.
- **Output contract:** Browserflows/camera/keyboardalpha pass; medianFPS≥30 vàp95frame≤50ms trong từng30swindow trên máyghiOSCPU/GPUbrowserDPR1.5. 20reset/camera-reset không tăngloop/listeners/resources liên tục; P0/P1blockingnone. Ghi evidence/command/exit/seed/tick trong progress.md.
- **Bước triển khai:** 1) Chạy desktop+390 px và sequence case. 2) Kiểm console, layer/particle state, bounds thìa. 3) Ghi kết quả từng case và lỗi tái hiện.
- **Module/file:** docs/TEST_CASES.md, progress.md; source chỉ sửa lỗi xác nhận
- **Phụ thuộc:** V4-02, V4-03, V4-04, V1-03, V1-06, V3-07, V2-11.
- **Gate/evidence:** Core/unit acceptance theo task; browser evidence nếu task yêu cầu chưa có thì ghi phần BLOCKED, không dùng tài liệu làm pass.
- **Ưu tiên:** MUST_HAVE; scope MVP.
- **Thời gian dự kiến:** O=2; L=3; P=6 giờ.
- **Trạng thái:** PARTIAL / BLOCKED (Core verified 537/537 tests across 28 suites, typecheck/lint/build exit 0; WebGL renders cleanly via headless Edge; automated CDP runner blocked do thiếu test runner framework chính thức như Playwright/Puppeteer có timeout).
- **Tiêu chí nghiệm thu:** Browserflows/camera/keyboardalpha pass; medianFPS≥30 vàp95frame≤50ms trong từng30swindow trên máyghiOSCPU/GPUbrowserDPR1.5. 20reset/camera-reset không tăngloop/listeners/resources liên tục; P0/P1blockingnone. Cần xác nhận thủ công hoặc cấu hình E2E runner có timeout trước khi nâng COMPLETED.
- **Kiểm thử:** SC-W01–W04, SC-J/SC-R/SC-U browsercases, resultlogs đođúngfixture; rendering khôngmassoracle.
- **Rủi ro:** Không browser hoặc flaky GPU.
- **Dự phòng:** BLOCKED nếu thiếu môi trường; người dùng chạy checklist cung cấp bằng chứng, không skip để release.

### V4-06 — Profile và tối ưu bổ sung

- **Mục tiêu:** Giảm CPU/GPU/load cost đã đo.
- **Mô tả kỹ thuật:** Profile sâu ngoài mandatorybenchmark V4-05: drawcalls/frameCPU/GPU/load/memory; khôngworkerdefault. Tunedvisualqualitykhông đổiledger, benchmarkcompare samefixture.
- **Input contract:** Outputs của V4-02, V4-03; defaults và fixtures trong SCIENTIFIC_SPEC/TEST_CASES.
- **Output contract:** Before/after evidence nếu thực hiện; có thể hoãn với knownimpact vì basicbenchmark V4-05 đã bắt buộc. Ghi evidence/command/exit/seed/tick trong progress.md.
- **Bước triển khai:** 1) Đo máy nghiệm thu cùng fixture. 2) Điều chỉnh DPR/shadows/pools và manual chunk nếu hữu ích. 3) Đo lại với output tương đương khoa học.
- **Module/file:** scene/**, vite.config.ts nếu cần, docs/MASTER_PLAN.md
- **Phụ thuộc:** V4-02, V4-03.
- **Gate/evidence:** Core/unit acceptance theo task; browser evidence nếu task yêu cầu chưa có thì ghi phần BLOCKED, không dùng tài liệu làm pass.
- **Ưu tiên:** SHOULD_HAVE; scope MVP.
- **Thời gian dự kiến:** O=1; L=1.5; P=2.5 giờ.
- **Trạng thái:** NOT_STARTED.
- **Tiêu chí nghiệm thu:** Before/after evidence nếu thực hiện; có thể hoãn với knownimpact vì basicbenchmark V4-05 đã bắt buộc.
- **Kiểm thử:** Browser profiling, 30 FPS floor baseline được V4-05 kiểm; long-run/reset profile.
- **Rủi ro:** Micro-opt không có ích hoặc thêm worker quá scope.
- **Dự phòng:** Hoãn benchmark sâu; giữ instancing/DPR cap, basic FPS check bắt buộc V4-05.

### V4-07 — Regression cuối và sửa lỗi đã tái hiện

- **Mục tiêu:** Mã cuối đạt checks, lỗi khoa học có regression.
- **Mô tả kỹ thuật:** Release taxonomy MASTER: P0 incorrectledger/crash; P1blockwrongscience/interaction/resource leak; cosmeticissues chỉ defer explicitly. Nodefallbackokay wrapperissue cóevidence/timebox.
- **Input contract:** Outputs của V4-05, V3-08, V1-02, V4-10; defaults và fixtures trong SCIENTIFIC_SPEC/TEST_CASES.
- **Output contract:** Không P0 hoặc P1 chặn science/input/manual/tick/context usability; benigncosmeticP1 có impact/workaround/owner được userchấpnhận. Typecheck/lint/test/build lệnh/exit/phạm vi logs; runtimechanges rerunbrowser relevant. Ghi evidence/command/exit/seed/tick trong progress.md.
- **Bước triển khai:** 1) Chạy typecheck/lint/test/build. 2) Nếu fail, tạo case trước targeted fix. 3) Rerun affected và full gate cuối.
- **Module/file:** SimulationBridge.ts, ControlPanel.tsx, LaboratoryScene.tsx, App.tsx, contextFailure.test.ts, progress.md
- **Phụ thuộc:** V4-05, V3-08, V1-02, V4-10.
- **Gate/evidence:** Core/unit acceptance theo task; browser evidence nếu task yêu cầu chưa có thì ghi phần BLOCKED, không dùng tài liệu làm pass. 548/548 tests pass across 29 test suites, typecheck/lint/build exit 0. Trình duyệt thực tế chưa chạy lại regression tương tác nên giữ PARTIAL.
- **Ưu tiên:** MUST_HAVE; scope MVP.
- **Thời gian dự kiến:** O=1; L=1.5; P=2.5 giờ.
- **Trạng thái:** PARTIAL (Core/unit verified 548/548 tests pass; đã phát hiện và sửa 4 lỗi production path: chặn resume/startAuto vô tình advance khi mất context, stale canvas revision callback fencing, retryable React.lazy dynamic chunk loader, và UI disabled guard trên ControlPanel; browser interaction regression pending).
- **Tiêu chí nghiệm thu:** Không P0 hoặc P1 chặn science/input/manual/tick/context usability; 548/548 unit & integration tests pass across 29 suites; toàn bộ 4 quality gates exit code 0.
- **Kiểm thử:** Scripts hoặc lệnh Node tương đương ghi rõ; browser recheck nếu visual/input thay đổi.
- **Rủi ro:** Lỗi lớn vượt 1h task verification.
- **Dự phòng:** Dùng buffer 20% riêng, ghi phần chưa đạt và tăng lịch thay vì đánh complete.

### V4-08 — Tài liệu sử dụng và giới hạn mô hình

- **Mục tiêu:** Người dùng biết thao tác và giới hạn khoa học.
- **Mô tả kỹ thuật:** README và assumptions mô tả behavior thực; SCIENTIFIC_SPEC chuyển proposal→implemented bằng bằng chứng.
- **Input contract:** Outputs của V4-07; defaults và fixtures trong SCIENTIFIC_SPEC/TEST_CASES.
- **Output contract:** Tài liệu không còn mô tả scene tĩnh như bản cuối; không khẳng định định lượng khi chưa calibration. Ghi evidence/command/exit/seed/tick trong progress.md.
- **Bước triển khai:** 1) Cập nhật thao tác/mode/lượng/capacity. 2) Ghi coefficient provenance và teaching-model disclaimer. 3) Ghi test environment, known issues và handoff IDs.
- **Module/file:** README.md, docs/SCIENTIFIC_ASSUMPTIONS.md, SCIENTIFIC_SPEC.md, TEST_CASES.md, progress.md
- **Phụ thuộc:** V4-07.
- **Gate/evidence:** Core/unit acceptance theo task; browser evidence nếu task yêu cầu chưa có thì ghi phần BLOCKED, không dùng tài liệu làm pass. README.md và docs/SCIENTIFIC_ASSUMPTIONS.md đã hoàn thành và kiểm tra đầy đủ, khớp 100% với source code.
- **Ưu tiên:** MUST_HAVE; scope MVP.
- **Thời gian dự kiến:** O=0.5; L=1; P=1.5 giờ.
- **Trạng thái:** COMPLETED_VERIFIED.
- **Tiêu chí nghiệm thu:** README.md hoàn thiện hướng dẫn cài đặt (`npm ci`), dev (`npm run dev`), build/preview (`npm run preview`), kiểm thử; hướng dẫn thêm chất chấp nhận cả dấu chấm và phẩy; phân biệt chi tiết Auto/Manual, Stop/Pause/Resume/Reset và Camera Reset; trình bày 3 kịch bản học tập trọng tâm; tuyên bố rõ ràng về giới hạn mô hình giáo dục uncalibrated, không biến thiên nhiệt độ và lưu trữ in-memory; hướng dẫn xử lý lỗi WebGL và hành vi paused an toàn sau khôi phục.
- **Kiểm thử:** Đối chiếu docs với acceptance matrix và runtime state.
- **Rủi ro:** Docs lệch code cuối.
- **Dự phòng:** Chỉ mô tả đã verified, liệt kê explicitly phần deferred.

### V4-09 — Nghiệm thu static artifact production qua HTTP

- **Mục tiêu:** Build có thể chạy trên static hosting, không backend.
- **Mô tả kỹ thuật:** Artifact-only MUST_HAVE: basepath/assets/lazychunks/productionpreview HTTP; no publichostdependency. Publish chuyểnV4-11.
- **Input contract:** Outputs của V4-07, V4-08; defaults và fixtures trong SCIENTIFIC_SPEC/TEST_CASES.
- **Output contract:** HTTPpreview rootsubpath theo config loadHTML/CSS/chunks/3D, hardreload không404; corruptasset cófallbackuseful; noAPI/backend. LocalartifactDoD có thể complete dù chưachọnhost. Ghi evidence/command/exit/seed/tick trong progress.md.
- **Bước triển khai:** 1) Chọn host/base path khi được phép. 2) Serve build artifact, smoke reload/chunks. 3) Publish sau scope/access được xác nhận, ghi URL/version.
- **Module/file:** vite.config.ts nếu base cần, dist generated, README.md, progress.md
- **Phụ thuộc:** V4-07, V4-08.
- **Gate/evidence:** Core/unit acceptance theo task; browser evidence nếu task yêu cầu chưa có thì ghi phần BLOCKED, không dùng tài liệu làm pass. Đã kiểm chứng production preview HTTP server tại http://localhost:4173/, HTTP 200 và MIME types đúng chuẩn cho index.html, index CSS, index JS, và lazy chunk LaboratoryScene JS. Browser production UI smoke pending.
- **Ưu tiên:** MUST_HAVE; scope MVP.
- **Thời gian dự kiến:** O=1; L=1.5; P=2.5 giờ.
- **Trạng thái:** PARTIAL (Phần local HTTP artifact verified; browser production UI smoke pending do thiếu browser automation an toàn).
- **Tiêu chí nghiệm thu:** HTTP preview root subpath theo config load HTML/CSS/chunks/3D với mã HTTP 200 và MIME types chuẩn; hoàn toàn không phụ thuộc backend API; server preview phục vụ tĩnh sạch sẽ tại localhost:4173; browser production smoke ghi nhận pending.
- **Kiểm thử:** SC-W05 production HTTP/browser asset checks qua checkPreview.cjs.
- **Rủi ro:** Host/account chưa sẵn sàng, chunk path lỗi.
- **Dự phòng:** Nếu source gate pass nhưng artifact HTTP/browser chưa có, giữ chưa verified; chưa chọn host không chặn task.

### V4-10 — WebGL failure, context loss/restore và resize

- **Mục tiêu:** Hỏng canvas không làm mất science hoặc double loop.
- **Mô tả kỹ thuật:** Init fail và context lost set paused/clear drag/camera unlocked; fallback form/quantities còn dùng. RetryCanvas reuse owner, restored stay paused, explicit resume; resize DPR keep state.
- **Input contract:** Early owner V2-10, browser baseline V1-03 và event API trong môi trường có.
- **Output contract:** Mass/generation/tick giữ nguyên trừ user commands; error boundary không là bằng chứng context support; retry khi browser cho phép, failing repeat show reload mất state cảnh báo rõ. Ghi evidence/command/exit/seed/tick trong progress.md.
- **Bước triển khai:** 1) Init fail message + retry action. 2) Lost preventDefault + pause subscriptions/capture cleanup, restored rebind buffers. 3) Resize/DPR loss retry loops verified 20 cycles.
- **Module/file:** App.tsx (lazy load error boundary & retryable import), LaboratoryScene.tsx, SimulationProvider/bridge, ControlPanel.tsx, contextFailure.test.ts, browser checklist
- **Phụ thuộc:** V2-10, V1-03.
- **Gate/evidence:** Core/unit acceptance theo task; browser evidence nếu task yêu cầu chưa có thì ghi phần BLOCKED/PENDING, không dùng tài liệu làm pass. 11/11 tests pass trong `contextFailure.test.ts`, toàn bộ 548/548 tests pass across 29 test suites, typecheck/lint/build exit 0. Trình duyệt thực tế chưa có bằng chứng trigger real context loss/restore nên giữ PARTIAL.
- **Ưu tiên:** MUST_HAVE; scope MVP.
- **Thời gian dự kiến:** O=2; L=3; P=5 giờ.
- **Trạng thái:** PARTIAL (Core/unit verified 548/548 tests pass; browser real context loss/restore pending/BLOCKED do chưa có bằng chứng thực nghiệm trên trình duyệt).
- **Tiêu chí nghiệm thu:** Khởi tạo WebGL thất bại hiển thị WebGLFallbackView trong vùng 3D, các form điều khiển và thông số khoa học bên ngoài vẫn hoạt động bình thường; nút "↺ Thử lại hiển thị 3D" tạo lại Canvas/renderer qua dynamic key mà không tạo lại engine hay xóa dữ liệu; nút "Thử lại tải 3D" kích hoạt nạp lại module động `React.lazy` mà không dùng lại promise bị reject đã lưu cache; cảnh báo tải lại trang nêu rõ nguy cơ mất dữ liệu thí nghiệm; sự kiện `webglcontextlost` gọi `preventDefault()` cho phép trình duyệt xử lý khôi phục context theo hợp đồng WebGL (lưu ý: không có nghĩa toàn bộ GPU resources được giữ nguyên trong bộ nhớ phần cứng); hủy bỏ thao tác kéo chuột và giải phóng pointer capture, khôi phục camera OrbitControls, tạm dừng (pause) mô phỏng, bảo toàn khối lượng/thời gian/thế hệ; chặn không cho resume/startAuto advance mô phỏng trong khi context chưa phục hồi; sự kiện `webglcontextrestored` tái liên kết buffer từ trạng thái hiện tại, giữ nguyên trạng thái paused chờ người dùng nhấn Tiếp tục, frame đầu tiên sau khôi phục có delta = 0 không chạy bù thời gian trôi qua; 20 chu kỳ remount/retry liên tiếp duy trì duy nhất 1 engine và 0 rò rỉ scheduler; thay đổi kích thước Canvas/DPR không reset engine; fencing callback cách ly phiên làm việc; 11/11 tests pass trong contextFailure.test.ts.
- **Kiểm thử:** SC-W01/W02/W03 via contextFailure.test.ts (11 tests); extension WEBGL_lose_context chỉ áp dụng cho kiểm thử tự động giả lập mất context, không phải điều kiện bắt buộc cho mọi ca E2E khác; khi chưa có capability-query thực nghiệm trên môi trường chạy thì không đưa ra kết luận thiếu extension.
- **Rủi ro:** GPU event khác browser, listener bị rò.
- **Dự phòng:** Retry remount Canvas với engine outside; không tự reload/reset; user reload là lựa chọn rõ ràng có cảnh báo.

### V4-11 — Public deployment tùy chọn sau nghiệm thu artifact

- **Mục tiêu:** Publish khi người dùng yêu cầu host/audience phù hợp.
- **Mô tả kỹ thuật:** NgoàiDoDlocalMVP; khôngbackend/login; chỉdeploymatchingartifact sauauthorization.
- **Input contract:** V4-09 verified artifact vàuserauthorization host/audience.
- **Output contract:** URL/version/access trảvềxác nhận publish; chưachọnhostthìkhông chặnMVP artifact vàkhôngclaimdeployed. Ghi evidence/command/exit/seed/tick trong progress.md.
- **Bước triển khai:** 1) Userchọnhost/audience. 2) Publishartifactđãverified. 3) RecordURL/version/access vàsmoke.
- **Module/file:** README.md, hosting config nếu được phép, progress.md
- **Phụ thuộc:** V4-09.
- **Gate/evidence:** Core/unit acceptance theo task; browser evidence nếu task yêu cầu chưa có thì ghi phần BLOCKED, không dùng tài liệu làm pass.
- **Ưu tiên:** SHOULD_HAVE; scope OPTIONAL_DEPLOY.
- **Thời gian dự kiến:** O=0.5; L=0.5; P=1.5 giờ.
- **Trạng thái:** NOT_STARTED.
- **Tiêu chí nghiệm thu:** URL/version/access trảvềxác nhận publish; chưachọnhostthìkhông chặnMVP artifact vàkhôngclaimdeployed.
- **Kiểm thử:** HTTPasset/browser smoke nơihost; hostblockingrecord riêng.
- **Rủi ro:** Account/network/permissions chưa có.
- **Dự phòng:** GiữNOT_STARTED/BLOCKEDvớilýdo, bàngiaoartifactđãverified.


## Phase 5 — Future Enhancements

### V5-01 — Shader nước/dầu/thủy tinh nâng cao

- **Mục tiêu:** Tăng chất lượng hình ảnh khi MVP ổn định.
- **Mô tả kỹ thuật:** Meniscus/refraction/surface detail, vẫn đọc state engine và không làm oracle khoa học.
- **Input contract:** Outputs của V4-09; defaults và fixtures trong SCIENTIFIC_SPEC/TEST_CASES.
- **Output contract:** Ảnh tốt hơn và frame budget được người dùng chấp nhận; science invariants không đổi. Ghi evidence/command/exit/seed/tick trong progress.md.
- **Bước triển khai:** 1) Benchmark renderer MVP. 2) Thêm một shader từng lần. 3) A/B và giữ fallback material.
- **Module/file:** Beaker.tsx, WaterVolume.tsx, OilVolume.tsx, shaders nếu cần
- **Phụ thuộc:** V4-09.
- **Gate/evidence:** Core/unit acceptance theo task; browser evidence nếu task yêu cầu chưa có thì ghi phần BLOCKED, không dùng tài liệu làm pass.
- **Ưu tiên:** POST_MVP; scope POST_MVP.
- **Thời gian dự kiến:** O=3; L=4; P=6 giờ.
- **Trạng thái:** NOT_STARTED.
- **Tiêu chí nghiệm thu:** Ảnh tốt hơn và frame budget được người dùng chấp nhận; science invariants không đổi.
- **Kiểm thử:** Visual regression nhiều GPU và before/after profile.
- **Rủi ro:** Shader không tương thích hoặc che hạt.
- **Dự phòng:** Fallback vật liệu MVP, không chặn MVP.

### V5-02 — Trường dòng gần thìa chân thực hơn

- **Mục tiêu:** Flow có không gian/wake tốt hơn mô hình đồng nhất.
- **Mô tả kỹ thuật:** Low-order vector field, không CFD; hiệu chỉnh theo dữ liệu nếu có.
- **Input contract:** Outputs của V4-09; defaults và fixtures trong SCIENTIFIC_SPEC/TEST_CASES.
- **Output contract:** Không NaN/escape và không làm tăng giới hạn bão hòa; visual improvement có evidence. Ghi evidence/command/exit/seed/tick trong progress.md.
- **Bước triển khai:** 1) Đề xuất field và energy bounds. 2) Nối transport vào field mới. 3) So stability/performance với baseline.
- **Module/file:** StirringFlow.ts, ParticleTransport.ts, tests
- **Phụ thuộc:** V4-09.
- **Gate/evidence:** Core/unit acceptance theo task; browser evidence nếu task yêu cầu chưa có thì ghi phần BLOCKED, không dùng tài liệu làm pass.
- **Ưu tiên:** POST_MVP; scope POST_MVP.
- **Thời gian dự kiến:** O=4; L=6; P=9 giờ.
- **Trạng thái:** NOT_STARTED.
- **Tiêu chí nghiệm thu:** Không NaN/escape và không làm tăng giới hạn bão hòa; visual improvement có evidence.
- **Kiểm thử:** Model invariants, sampling/bounds, profile và user comparison.
- **Rủi ro:** Numerical instability tăng chi phí.
- **Dự phòng:** Giữ field tiếp tuyến baseline hoặc giới hạn khu vực wake.

### V5-03 — Hạt và giọt đa kích thước

- **Mục tiêu:** Hiển thị phân bố tốt mà không mất mass.
- **Mô tả kỹ thuật:** LOD/pools cho đại diện, weights giữ total, collision đơn giản nếu cần.
- **Input contract:** Outputs của V4-09; defaults và fixtures trong SCIENTIFIC_SPEC/TEST_CASES.
- **Output contract:** LOD không thay ledger; visible trajectories mượt và hiệu năng được đo. Ghi evidence/command/exit/seed/tick trong progress.md.
- **Bước triển khai:** 1) Chốt size distribution. 2) Đổi sampling/reweight/pooling. 3) So reset/LOD và transport bounds.
- **Module/file:** ParticleRenderer.tsx, ParticleTransport.ts, SimulationState.ts
- **Phụ thuộc:** V4-09.
- **Gate/evidence:** Core/unit acceptance theo task; browser evidence nếu task yêu cầu chưa có thì ghi phần BLOCKED, không dùng tài liệu làm pass.
- **Ưu tiên:** POST_MVP; scope POST_MVP.
- **Thời gian dự kiến:** O=3; L=4; P=6 giờ.
- **Trạng thái:** NOT_STARTED.
- **Tiêu chí nghiệm thu:** LOD không thay ledger; visible trajectories mượt và hiệu năng được đo.
- **Kiểm thử:** Mass invariants qua LOD, seeded replay và visual profile.
- **Rủi ro:** Weight distribution tạo bias khoa học.
- **Dự phòng:** Giữ weight mapping, fallback fixed-size representatives.

### V5-04 — Hiệu chuẩn mô hình khoa học

- **Mục tiêu:** Đánh giá/hiệu chỉnh coefficient bằng nguồn/dữ liệu.
- **Mô tả kỹ thuật:** Tách teaching parameters khỏi calibrated parameters; không thêm điều khiển nhiệt độ/CFD vào MVP.
- **Input contract:** Outputs của V4-09; defaults và fixtures trong SCIENTIFIC_SPEC/TEST_CASES.
- **Output contract:** Có provenance, sai số/miền hợp lệ, không tự gọi validated nếu thiếu dữ liệu; coefficients versioned. Ghi evidence/command/exit/seed/tick trong progress.md.
- **Bước triển khai:** 1) Tìm dữ liệu có đơn vị/điều kiện rõ. 2) Fit/compare và ghi uncertainty. 3) Cập nhật spec/tests, giữ baseline model version.
- **Module/file:** science constants, SCIENTIFIC_SPEC.md, assumptions, scientific tests
- **Phụ thuộc:** V4-09.
- **Gate/evidence:** Core/unit acceptance theo task; browser evidence nếu task yêu cầu chưa có thì ghi phần BLOCKED, không dùng tài liệu làm pass.
- **Ưu tiên:** POST_MVP; scope POST_MVP.
- **Thời gian dự kiến:** O=5.5; L=8; P=12 giờ.
- **Trạng thái:** NOT_STARTED.
- **Tiêu chí nghiệm thu:** Có provenance, sai số/miền hợp lệ, không tự gọi validated nếu thiếu dữ liệu; coefficients versioned.
- **Kiểm thử:** Reference datasets holdout và sensitivity tests.
- **Rủi ro:** Dữ liệu dầu/cát không đồng nhất, không đủ đo.
- **Dự phòng:** Ghi chưa calibrated, giữ mô hình giáo dục và limitation thay giả độ chính xác.

## Evidence và handoff

Cập nhật Index và body đồng thời trong file này. Log task ID, files thay đổi, command/exit/phạm vi, seed/tick/ack và browserenvironment vào progress.md, quyếtđịnh vào findings.md rồi Next Step. BLOCKED có điều kiện gỡ; không ảnh làm mass oracle. Root filenames canonical, không task_plan(7).md. Lượt này chỉ kế hoạch, không source/package/browser-install/deploy.

