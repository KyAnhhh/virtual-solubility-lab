# Task Plan — Virtual Solubility Lab 3D, plan v3

## Goal
Tiếp tục project hiện có thành MVP nước/đường/cát/dầu, auto/manual stirring, khoa học giáo dục có bảo toàn khối lượng, kết quả/giải thích, pause/resume/reset và static artifact. Không backend, nhiệt độ hoặc CFD.

## Next Step
- Người dùng kiểm tra trực quan cơ chế kéo chạm cốc 500 ml tự nâng lên rót trên browser (`http://localhost:4173/`).
- Sẵn sàng bàn giao hoặc tiếp tục các yêu cầu nâng cấp tiếp theo của người dùng.

## Current Phase
Phase 4 (Integration & Quality) — Đã hoàn thành toàn diện nâng cấp cơ chế tương tác kéo cốc chạm cốc 500 ml tự nâng lên rót, kiểm thử hình học perspective camera thực tế và giao diện tinh gọn:
- Hoàn thành toàn bộ các yêu cầu:
  1. *Đường kéo hình học thực tế (không phân nhánh test/runtime)*:
     - Chuẩn hóa mặt phẳng kéo đứng (vertical drag plane) đi qua đường nối từ vị trí cốc nguồn tới tâm cốc 500 ml, có pháp tuyến hướng về phía camera.
     - Hàm kiểm thử `createCameraRay(cameraPos, targetPoint)` mô phỏng chính xác tia chiếu perspective từ vị trí camera qua điểm mục tiêu trên màn hình/bàn thí nghiệm.
     - Kiểm thử thành công cả góc camera mặc định `[3.9, 3.4, 5.5]` và góc camera xoay `[-4.0, 3.4, 4.0]`. Đường kéo chứng minh tính liên tục (độ dịch chuyển mỗi bước $\le 0.35$, không teleport, kẹp an toàn trong phạm vi bàn).
  2. *Kéo cốc chạm cốc 500 ml thì tự nâng lên rót*:
     - Tiếp xúc 3D nhận diện tự động khi $d_{xz} \le 1.50$, $y \le 2.82$. Người dùng không cần tự nâng cốc lên cao và không cần thả chuột để kích hoạt.
     - Sau khi chạm: Cốc tự động bay thẳng lên cao độ an toàn $Y \ge 2.45$ (vượt vành cốc 2.32), lướt qua miệng cốc, nghiêng rót nguyên liệu vào trong, sau đó dựng thẳng và lướt về vị trí cũ trên bàn.
     - Rót theo lượng: Snapshot liều lúc bấm chuột, chạm là chốt commit một lần duy nhất; nhả chuột sau tiếp xúc không làm gián đoạn animation. Nhả chuột trước tiếp xúc hủy với lượng thêm bằng 0.
     - Rót tự do: Chạm cốc kích hoạt giai đoạn nâng (`lifting`); giữ chuột để rót liên tục theo nhịp 10Hz; nhả chuột khi đang nâng thì hủy với lượng 0; nhả chuột khi đang rót thì chốt toàn bộ decitick nguyên và dừng. Người dùng không cần giữ chuột trong halo trên cao khi đang rót.
  3. *Thông báo ngắn, rõ ràng*:
     - Hủy trước tiếp xúc: `"Kéo cốc nguyên liệu chạm cốc lớn để rót."`
     - Nhấn phím Escape: `"Đã dừng thao tác."`
     - Đạt dung tích tối đa: `"Cốc 500 ml đã đầy. Không thể thêm tiếp."`
     - Thông báo thành công: Sử dụng khối lượng được chấp nhận từ sổ cái động cơ (`bridge.add`).
  4. *Giao diện tinh gọn, tối ưu không gian 3D*:
     - Rót tự do: Ẩn hoàn toàn ô nhập và nút "+ Thêm", hiển thị nhãn tốc độ rót và gợi ý ngắn gọn.
     - Rót theo lượng: Cảnh báo inline màu đỏ cạnh ô nhập khi số không hợp lệ hoặc vượt ngưỡng tối đa.
     - Thu gọn khối camera gesture thành mục collapsible `<details>` cùng nút "Đặt lại góc nhìn" nhỏ gọn; tinh gọn padding các bảng để tối đa hóa diện tích Canvas 3D.
- Kết quả kiểm chứng chất lượng toàn diện:
  * 36/36 test files passed (623/623 tests passed, bao gồm 37/37 tests cho `vesselInteraction.test.ts`).
  * `npm run typecheck` mã thoát 0 (`tsc --noEmit`).
  * `npm run lint` mã thoát 0 (`eslint .`).
  * `npm run build` mã thoát 0 (dist sinh hoàn chỉnh trong 9.27s).
  * Preview server HTTP 200 tại `http://localhost:4173/`.

## Nguồn chuẩn
- [IMPLEMENTATION_TASKS.md](docs/IMPLEMENTATION_TASKS.md): duy nhất task/status/deps/input-output/O-L-P.
- [MASTER_PLAN.md](docs/MASTER_PLAN.md): kiến trúc, milestones, review coverage và estimates tính từ catalog.
- [SCIENTIFIC_SPEC.md](docs/SCIENTIFIC_SPEC.md): schemas, control flush/reset, regions/contact, formulas/thresholds và 72 cases.
- [TEST_CASES.md](docs/TEST_CASES.md): browser/benchmark/3 scenarios.
- [findings.md](findings.md) và [progress.md](progress.md): evidence và lịch sử.

Không sao chép bảng status/estimate từng task vào root plan hoặc tạo bản hậu tố attachment (7). Resolver chọn root plan; không đọc transcript hoặc thay host config.

## Phases
### Phase 1 — Foundation & 3D Laboratory
- V1-01…V1-07: source Ngày 1 có runtime tĩnh, chưa browser verified; parser/bounds/contracts/bốn cốc nguồn và baseline (4/7 hoàn tất: V1-01, V1-04, V1-05, V1-07).
- Milestone M0: phân biệt verified/partial/interface.
- **Status:** in_progress

### Phase 2 — Stirring System và tích hợp sớm
- V2-01…V2-11: commands/clock/flow/auto/manual/stale/contact/lifecycle, early bridge và early water–sugar slice (V2-01 COMPLETED_VERIFIED).
- M1A: một owner/bridge ngay sau engine/clock. M1B dùng V3-01/V3-02 sớm cho đường thật, không đợi toàn bộ models.
- **Status:** in_progress

### Phase 3 — Scientific Simulation
- V3-01…V3-08: ledger/dissolution/sand/fGu/oil/transport/composition/combo/replay.
- Unit models độc lập có thể tiến hành khi browser blocked; full integration vẫn cần slice/browser gate.
- **Status:** pending

### Phase 4 — Integration & Quality
- V4-01…V4-11: mở rộng bridge cũ, full phase render/UI, browser/benchmark/context/QA/HTTP artifact.
- V4-09 local artifact MUST; V4-11 public deploy tùy chọn, không chặn local DoD.
- **Status:** pending

### Phase 5 — Future Enhancements
- V5-01…V5-04 shader/flow/particles/calibration POST_MVP, không triển khai trong lượt này.
- **Status:** pending

## Decisions Made
| Quyết định v3 | Lý do |
|---|---|
| Control flush đồng bộ kể cả paused, độc lập scientific step | Resume không deadlock, add paused hiện ngay |
| Facade bind generation từng intent; seq/high-water + LRU256 | Add→reset→add đúng, stale/duplicate reset không hồi sinh state |
| Four-case regions và pool membership | Oil-only solids nằm trong dầu thật, không double volume |
| Tip thích ứng bed + contact overlap, stale 150 ms | Không khuấy trên không hoặc giữ drive vô hạn |
| Visual hash riêng và copyRenderFrame caller-owned | Particle count/mutation renderer không đổi khoa học |
| V2-10/V2-11 early bridge/slice; V4-01 extend only | Một engine từ lát cắt đầu, tích hợp sớm |
| Threshold riêng, fixed-I unit fixture tách auto | Không coi format 0 là hết mass; fast Ieq≈0.7143 |
| Public deploy tùy chọn tách HTTP artifact | Local MVP không đợi account/host |
| O/L/P và DAG recompute | Không giữ số v2 khi contract/scope đã đổi |

Các default kỹ thuật thường ngày đã chọn và có lý do; không cần hỏi lại để sửa tài liệu. Full MVP scope giữ nguyên. Calibration định lượng/manual touch là scope mới nếu người dùng yêu cầu.

## Errors Encountered / evidence boundaries
| Vấn đề | Evidence | Cách tiếp tục |
|---|---|---|
| Python alias ở phiên cài skill | Lịch sử, skill đã cài qua CLI | Không cài lại |
| Workspace chưa Git | Audit trước và source hash | Đề xuất checkpoint có phạm vi trước code, không git init/reset |
| Npm wrapper exit1 silent ở v2 | Node entry points cùng checks pass ở v2 | Timebox V1-02, fallback được log; không chạy lại vô hạn |
| Không có browser tool | Chưa WebGL/context/interaction QA | V1-03 BLOCKED có điều kiện gỡ; math/unit không phụ thuộc |
| Plan v2 R01–R20 | Review tài liệu, chưa phải source bug tái hiện | Mapping/spec/case/task trong MASTER v3 |
| Patch task_plan v2 không match dòng đầu | Phát hiện UTF-8 BOM EF BB BF | Patch có xét BOM; kiểm tra lại nội dung và links |

## History và handoff
Hash source/public/config/lock đầu lượt khớp v2. Store 3 tests/typecheck/lint/build qua Node đã pass ở v2, **không coi là checks vừa chạy v3**. Lượt v3 log riêng kiểm tra tài liệu, công thức, DAG và hash; các estimate v2 giữ trong history, current estimate chỉ ở catalog và bảng derived MASTER.

Sau task: cập nhật Index+body catalog; log files/command/exit/phạm vi/seed/tick/ack/errors/evidence; cập nhật Next Step. Nâng COMPLETED_VERIFIED chỉ khi đúng acceptance, không vì file/spec mới. Lượt này dừng sau plan v3, không runtime/deploy/package change.
