# Task Plan — Virtual Solubility Lab 3D, plan v3

## Goal
Tiếp tục project hiện có thành MVP nước/đường/cát/dầu, auto/manual stirring, khoa học giáo dục có bảo toàn khối lượng, kết quả/giải thích, pause/resume/reset và static artifact. Không backend, nhiệt độ hoặc CFD.

## Next Step
Hoàn thành đợt chuẩn bị bàn giao local (V4-07, V4-08, V4-09, V4-10):
- Sửa phân loại V4-10 thành PARTIAL (Core/unit verified 548/548 tests, real browser context loss/restore pending/BLOCKED do chưa kiểm chứng qua trình duyệt thực tế). Ghi nhận đúng hợp đồng `preventDefault()` của WebGL.
- V4-08 COMPLETED_VERIFIED: Hoàn thiện tài liệu README.md và docs/SCIENTIFIC_ASSUMPTIONS.md với hướng dẫn cài đặt, dev, preview, test, thao tác, 3 kịch bản thí nghiệm, phân biệt nút điều khiển, giới hạn giáo dục chưa calibrated và cơ chế khôi phục WebGL.
- V4-09 PARTIAL: Nghiệm thu local production HTTP preview artifact tại http://localhost:4173/ với mã HTTP 200 và MIME types đúng chuẩn cho index.html, CSS, JS bundle và lazy chunk LaboratoryScene. Browser production UI smoke ghi nhận pending.
- V4-07 PARTIAL: Rà soát production call paths, phát hiện và sửa 4 lỗi (chặn resume/startAuto khi mất context, stale canvas revision callback fencing, retryable React.lazy dynamic chunk loader, UI disabled guard trên ControlPanel); 11/11 tests pass trong contextFailure.test.ts.
- Toàn bộ 548/548 tests pass qua 29 test suites, typecheck/lint/build exit 0. Dừng theo chỉ đạo, sẵn sàng bàn giao local cho người dùng.

## Current Phase
Phase 4 (Integration & Quality).
- V4-08: COMPLETED_VERIFIED (Tài liệu sử dụng README.md và docs/SCIENTIFIC_ASSUMPTIONS.md hoàn thiện, sư phạm, chuẩn xác 100% với source code).
- V4-07: PARTIAL (Core/unit verified 548/548 tests; đã sửa 4 lỗi production path; browser interaction regression pending).
- V4-09: PARTIAL (Local production HTTP artifact verified với HTTP 200 và MIME types chuẩn; browser production smoke pending).
- V4-10: PARTIAL (Core/unit verified 548/548 tests across 29 suites; real browser context loss/restore pending).
- V4-05: PARTIAL (User xác nhận kéo thìa thủ công; 2 screenshots Edge headless; benchmark và full 7-step checklist browser tự động pending/BLOCKED).
- V1-06: PARTIAL (Core verified, 4 cốc nguồn 3D độc lập mass ledger; browser QA pending).
- V4-04: PARTIAL (Core verified 16/16 tests; kết quả pha tiếng Việt sạch, N/A khi W=0, <0,1g, hysteresis, responsive 390px review; browser QA pending).
- V4-03: PARTIAL (Core verified 17/17 tests; 4 fixtures hình học SPEC §4, trao đổi giọt dầu Ol <-> Od; browser QA pending).
- V4-02: PARTIAL (Core verified 14/14 tests; Gu_bed/Gu_susp, cát Sb/Ss, lắng tự nhiên, bed reservation 113ml; browser QA pending).
- V4-01: COMPLETED_VERIFIED (Mở rộng early bridge cho đầy đủ phase/render outputs, 18/18 tests pass).
- V3-08: COMPLETED_VERIFIED (Stability, 36,000 ticks, replay 30/60/120 FPS, 16/16 tests pass).
- Toàn bộ 548 unit & integration tests pass across 29 test suites (`npm test`), `npm run typecheck`, `npm run lint`, `npm run build` exit 0.

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
