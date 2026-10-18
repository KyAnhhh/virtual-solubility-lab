# Test Cases — foundation hiện tại và kế hoạch nghiệm thu v3

**Chưa chạy các browser/science cases v3.** Kết quả appchecks trước đây ở [progress.md](../progress.md), không biến thành pass mới vì đổi tài liệu. Nguồn testoracle [SCIENTIFIC_SPEC.md](SCIENTIFIC_SPEC.md); task/status [IMPLEMENTATION_TASKS.md](IMPLEMENTATION_TASKS.md).

## 1. Baseline Ngày 1 được giữ
Tự động: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.

Vitest kiểm tra cộng dồn cả bốn chất, lịch sử, giá trị không hợp lệ, giới hạn sức chứa, làm mới.

Checklist kiểm chứng trình duyệt thủ công (7 bước chuẩn hóa MVP):

### Bước 1: Khởi chạy ứng dụng
- **Thao tác:** Chạy `npm run dev`, mở URL hiển thị trên terminal (`http://localhost:5173/`).
- **Expected:** Giao diện tải hoàn tất; cốc 500ml rỗng, nhãn vạch chia độ 100–500; 4 cốc nguồn (Nước, Đường, Cát, Dầu ăn) hiển thị bên trái với nhãn tiếng Việt Drei Html; bảng điều khiển ở trạng thái "Chưa chạy · 0.0s" (paused).
- **Actual:** [Người kiểm ghi nhận]
- **Trạng thái:** NOT_RUN
- **Ảnh / Lỗi:** [Nếu có]

### Bước 2: Nước
- **Thao tác:** Nhấn thêm 100ml nước 2 lần (tổng 200ml). Nhấn "Làm mới cốc thí nghiệm" trước khi chuyển bài.
- **Expected:** Lần 1: thể tích 100ml, cột nước xanh lơ dâng lên. Lần 2: tổng 200ml, cột nước dâng cao hơn. Bảng thành phần hiển thị 200 ml. Nhấn Reset đưa về rỗng.
- **Actual:** [Người kiểm ghi nhận]
- **Trạng thái:** NOT_RUN
- **Ảnh / Lỗi:** [Nếu có]

### Bước 3: Đường dư
- **Thao tác:** Từ cốc rỗng, thêm 40ml nước, sau đó thêm 100g đường.
- **Expected:** Sức chứa tối đa của 40ml nước là 80g; lượng đường tổng vượt sức chứa là 20g. Ngay sau khi thêm lúc đang tạm dừng: Gd = 0g, Gu = 100g, thời gian 0.0s. Lớp đường lắng ở đáy (bed), không đòi hỏi progress 100% ngay.
- **Actual:** [Người kiểm ghi nhận]
- **Trạng thái:** NOT_RUN
- **Ảnh / Lỗi:** [Nếu có]

### Bước 4: Khuấy và hòa tan
- **Thao tác:** Nhấn "Bắt đầu mô phỏng", chuyển sang "Khuấy tự động", chọn mức "Nhanh", nhấn "Bắt đầu khuấy". Sau một lúc, nhấn "Tạm dừng mô phỏng", rồi thêm 10ml nước. Cuối cùng nhấn "Tiếp tục mô phỏng".
- **Expected:** Khi khuấy: thời gian tăng, Gd tăng dần, Gu giảm dần (không yêu cầu đạt exact 80g tại thời điểm cố định). Khi tạm dừng: thời gian đóng băng. Khi thêm 10ml nước lúc paused: sức chứa nâng lên 100g, điều kiện đường dư vượt sức chứa triệt tiêu; Gd, Gu và thời gian giữ nguyên tại thời điểm command; khi resume mới tiếp tục hòa tan phần đường còn lại.
- **Actual:** [Người kiểm ghi nhận]
- **Trạng thái:** NOT_RUN
- **Ảnh / Lỗi:** [Nếu có]

### Bước 5: Cát
- **Thao tác:** Làm mới cốc, thêm 100ml nước + 10g cát. Bật auto khuấy nhanh $\to$ quan sát hạt lơ lửng $\to$ nhấn "Ngừng khuấy".
- **Expected:** Khi khuấy: cát phân tán lơ lửng trong nước (Ss tăng), cát không bao giờ hòa tan. Khi ngừng khuấy: đồng hồ mô phỏng vẫn chạy, lực khuấy suy giảm dần và cát lắng dần xuống đáy cốc (Ss giảm, Sb tăng). Chỉ khi nhấn "Tạm dừng" thì toàn bộ mới đóng băng.
- **Actual:** [Người kiểm ghi nhận]
- **Trạng thái:** NOT_RUN
- **Ảnh / Lỗi:** [Nếu có]

### Bước 6: Kéo thủ công và camera
- **Thao tác:** Chọn chế độ "Kéo thủ công" khi mô phỏng đang chạy, dùng chuột kéo đầu thìa khuấy theo đường tròn. Thử giữ yên hoặc thả chuột ngoài Canvas. Thử nhấn "Đặt lại góc nhìn".
- **Expected:** Trong lúc kéo chuột khuấy thìa, camera không bị xoay (OrbitControls bị khóa an toàn). Khi giữ yên hoặc thả chuột ngoài canvas, lực khuấy tự ngắt (watchdog) và camera phục hồi điều khiển xoay bình thường. Nhấn "Đặt lại góc nhìn" khôi phục camera về vị trí ban đầu mà không xóa hay ảnh hưởng đến khối lượng/tiến trình thí nghiệm.
- **Actual:** [Người kiểm ghi nhận]
- **Trạng thái:** NOT_RUN
- **Ảnh / Lỗi:** [Nếu có]

### Bước 7: Scientific reset & Kiểm tra console
- **Thao tác:** Nhấn "Làm mới cốc thí nghiệm", mở Developer Tools (F12) kiểm tra Console log.
- **Expected:** Cốc thí nghiệm trở về rỗng (khối lượng 0g, thời gian 0.0s, paused); 4 cốc nguồn vẫn giữ nguyên vị trí trên bàn; góc nhìn camera và tùy chọn hiện/ẩn thìa được bảo toàn; không có uncaught error hay exception đỏ trong Console.
- **Actual:** [Người kiểm ghi nhận]
- **Trạng thái:** NOT_RUN
- **Ảnh / Lỗi:** [Nếu có]

Các bước trình duyệt trên là checklist thủ công chuẩn cho người kiểm nghiệm, không tự điền PASS khi chưa có kết quả thực tế.

## 2. Evidence và môi trường

Unit/integration log: taskID/caseID, seed1729 (hoặcseedkhácđược ghi), generation/seq/tick/controlOrdinal, expected/actual, tolerance cóđơn vị, command+exitcode vàphạm vi. Scientificstate làoracle, imagekhôngchứngminhmass.

Browser baseline desktop1366×768 vàmobile-width390×844. GhiOS/browser+version/CPU/GPU/DPR, canvasCSSsize, viewport và inputtype. Width390 trêndesktop **không chứng minh touch**; chỉclaimtouchcamera nếu cóthiếtbị hoặcemulationinput đượcxác nhận. Manualmouse bắtbuộc, touchmanualngoàiMVP. DesktopbenchmarkDPR1.5; browserresponsivefixtureDPR ghiđúngthực tế.

Kiểmquan: cameraorbit/zoom/limits, keyboardTab/Enter/focus, formrawdecimal locale, label/screenreaderstatus, transparency/cốc/vạch/hạt/dầu từnhiềugóc; consoleerrors phải ghi kểcảexpectedinit/contextfailure thayvìchelog. Nếu khôngbrowser, task/casecần đógiữBLOCKED, khôngcàibrowser/package. Điều kiện gỡ làbrowser/côngcụ/ngườichạychecklistcungcấpbằng chứng.

## 3. Benchmark tối thiểu MUST_HAVE — V4-05, SC-W04

Fixture input **W300ml/G100g/S100g/O70ml**, reservation495ml; acceptedper-add maxima. Representativebudget700choeachsugar/sand/oilpool khi mass≥visualhide, tối đa2100activeinstancesngoàimeshbed/cốcnguồn. Ghiactualpoolcounts/drawcalls, khôngchỉrequestedbudget. Stockvessels đanghiện, shadow/DPRpresetghi rõ.

Haiwindow độc lập để vật chấtkhônggầncạnpoolởwindowthứhai:
1. Reset/refillfixture, startauto fast, warmup5s, **đo30sauto**.
2. Reset/refillcùng fixture, auto fast warmup5s cho cảsand/oilpool đượcphân tán, chuyểnmanualgiữpose, **đo30smanualmouse**. Ghi pointertrace vàcontact/intensity; khôngcho model animationgiảthaymanualinput.

Mỗiwindow dùng monotonicperformanceclock, foreground, khônghidden/tabpause. Lưurawframeintervals, medianframeMs,p95frameMs, medianFPS=1000/medianframeMs; acceptance **medianFPS≥30 vàp95frameMs≤50ms trongtừngwindow**. KhôngsuyFPS từvisualimagehoặctrungbìnhmơhồ. Nếuinputmanualngừng→watchdog150ms, khôngđểdrivegiảgiữvôhạn; benchmarktrace phải cóactualmovement vàeventlog.

Dùngmáynghiệm thu ghiCPU/GPU/browser/OS,1366×768,DPR1.5; performancechỉclaimmôi trườngđãđo. Mobile-width390×844kiểmresponsive/interaction riêng, khôngáp30FPSmọithiếtbịchưa đo. Khôngpixel-perfectimagegate; scientificinvariants vẫnassert khiđo.

Repeated lifecycle: warmcache5cycles, sau đó**20reset khoa học và20camera-reset/remount**. Scientificreset g++mỗiID vàempty/paused; camerareset generation/mass/timekhông đổi. Sốowner/scheduler phải1khiattached/0khiunmounted; listenercountvềbaseline saucleanup. Ghirenderer.info.memory geometries/textures vàactualinstances sau mỗi cycle+settle2frames. Geometry/texturecounts khôngtăngliêntụcmỗi cycle; meanlatecycles16–20 khôngvượtmeanearly6–10 quámax(1object,5%). Resourcecachewarmup được ghi, không gọileak chỉvìmộtlầnallocation. JSheap chỉsupportingmetric nếu GCkhôngkiểmsoát, khôngdùngheapnoiseđểclaimpass/failduynhất.

Nếu fail: giảmDPR/shadows/poolquality cólogtrước/sau; **không đổi ledger/masscoeffs**. Profile sâuV4-06SHOULD, worker khôngbắtbuộc. Basicbenchmarkởđây khôngbịhoãn cùngV4-06.

## 4. Failure/recovery và artifact — V4-10/V4-09

| Case/event | Behavior bắt buộc | Evidence |
|---|---|---|
| Init WebGL khôngtạođược | Engineinitialpaused/formcòn dùng; usefulfallback+RetryCanvas; không resetmass nếu đãadd | SC-W01, logfailuremode/UI |
| webglcontextlost | preventDefault nếuhỗtrợ; releasecapture/drive; explicitpause, time/massgiữ, schedulerkhôngduplicate | SC-W02, event/counter/state beforeafter |
| contextrestored / RetryCanvas | Reuseappengine, uploadcopiedbuffersmới; **vẫn paused**, userresumeclearsinputhistory; firstframeDelta0 | SC-W02, g/version/loopcheck |
| Restore/retryvẫnfail | Giữfallback vàform, không tựreload; lựa chọnReload ghi rõ sẽxóathí nghiệmlocal vìkhôngpersistence | UX screenshot vàgstate |
| Resize/DPR change | Canvas/viewportđổi nhưngengine/loop/ledgerkhông reset | SC-W03, dimensions/counter logs |
| Lazyasset/chunkmissing | App-level loaderrorfallback/retrycóthông tin; SceneBoundary bêntrongkhông đượccoiđãbắtlỗi lazy import; ownergiữmass | SC-W05 |
| Contextlossextensionkhông có | Ghi caseBLOCKED/khôngkiểm chứngloss, khôngclaimengine/contextrecoverypass | Browser capabilities/evidence |

Productionartifact nghiệm thu bằngHTTPpreview của buildđãqua tsc/lint/test/build; không dùngfile://. CóthểdùngentrypointVitepreviewcósẵn, khôngcàipackage. KiểmHTML/CSS/JS/lazychunk/model-freeassets200, hardreloadroot/basepathkhớpconfig, relativepaths vàMIME, failureflow khiassetkhôngtải. Chỉclaimsubpathđãcấuhình/test, khôngkhẳngđịnhmọihost. GhiURLlocalpreview/buildstamp vànetwork/console. KhôngcầnpublichostđểV4-09complete; publicdeployV4-11tùychọnsauuserrequest, khôngbackend/login.

## 5. Ba kịch bản nghiệm thu người học

Legend: nướcxanh, đườngrắntrắng, cátnâu, dầuvàng; đườngđãtan khôngcònsolidrepresentative nhưng vẫn được ghi mass trongbảng. “Tan” khác hạt “lơ lửng”; nướcđổimàukhônglàoracleđườngtan. Giảithíchngắndựađiều kiện, “Về mô hình” trìnhbàycapacityminhhọa/contacthữuhiiệu/coefficientchưa đochứkhôngnhét hằngsốvàprotocolvàonútthao tác.

### UC1 — Đường: tốc độ và lượng có thể tan

- Hai lượt reset/cùng seed, water100ml+sugar1g, reserve100.65ml, initialpaused. Startkhôngkhuấy15s so vớiautofast15s. Fullcontactđượcđảmbảovìbedrấtmỏng, active200milliunitsngậpnước; oraclecoupled SPEC§8.1: fasttan nhiềuhơnở15s, **capacitycảhai200g**, Gtđều1g.
- Lượt saturation riêng: water40ml+sugar100g (maxper-add100g), reserve105ml, capacity80g. Startauto, quan sát đếngầncapacity hoặc120smodel. KếtquảGd≤80g, Gurắndưít nhất20gtrongtol; progress dùngGd/80, khôngGd/100 đểgọiđólỗitanthiếu. KhôngđòiexactGu20ởthời gianhữu hạn.
- Người học giải thíchđược khuấy làmnhanhhơn nhưngkhôngtăngcapacity. Addnước10ml paused→capacity100g vàcó thểtantếpkhiresume; inputreserve115mlvẫnfit. BảnggiữGt100g, nêuquantityphasefloat/nearcomplete thayexact0.

### UC2 — Cát: phân tán không phải tan

- water100ml+sand10g, reserve106ml. InitialSb10/Ss0, startautofast10s: Ss tăng,hạtlơlửngnhưngkhông códissolvedsand.
- Stopdrive nhưngclockrunning; chờ30s, lưuSnapshotsở0/5/10/30s: flowdecay, Ss giảm,Sb tăng,khối lượng10g. KhôngđòiSs===0.
- Người học phânbiệtpauseđóngbăngvàstopvẫnlắng, màu/hạt không đượcgiảithíchlàhòa tan.

### UC3 — Bốn chất, pause/add/resume/reset

- water100ml+oil20ml+sugar10g+sand10g, reserve132.5ml. Formthứ tựoil→sand→sugar→water vẫnaccepted; Gd0trướcnước.
- Auto10s→manualmousecóđổi hướng→stop, quan sátdầutừdropletsvềlayer vàcátlắng. Khôngyêucầudầutáchxongexactở30s.
- Pause, ghi t/Gd/Ss/Od; addwater10ml+sugar1g. Reserve143.15ml, Wtăng10g,Gt/Gu tăng1g,Gd/Ss/Odgiữ,timekhông đổi. Geometry/poolremapconstraintđượccậpnhậtngay, khôngphysicsadvance.
- Resume, hiện tượngtiếp tục; resetscientific mới→empty,time0,flow0,paused,generation++; camera/showRodpreferencegiữ. Stalepointer/ack khôngkhôiphụcmass.
- Legend/explanationnóiđúngphân tán/tan, gầncap/N/Awhennowater, khôngtuyênbốdữliệuthựcnghiệm.

## 6. Release blocker evidence

P0/P1taxonomy [MASTER_PLAN.md](MASTER_PLAN.md) §7. Bảngknownissue cần severity,impact,reproduction,workaround,owner,lýdohoãn vàuseracceptance chobenigncosmeticissue. Science/input/doubletick/capture/context-massloss/crash/mandatorybenchmarkfailkhông đượchoãnđểclaimfullMVP.

## 7. Ma trận tổ hợp và hoán vị đã chạy (V3-07 — Automated Coverage)

Đã triển khai bộ test tự động xác định trên engine thật tại [`src/simulation/tests/combinations.test.ts`](file:///d:/IdeaProjects/virtual-solubility-lab/src/simulation/tests/combinations.test.ts):

1. **16 Subsets (SC-M01):**
   - Đủ 16 tập con từ empty `[]` đến full 4 chất `[water, sugar, sand, oil]`.
   - Chạy 60 ticks sim-time trên fresh engine cho từng subset (16 scenarios).
   - Kiểm định 8 bất biến bảo toàn khối lượng, dry gate ($W=0 \implies Gd=0, Od=0$), sand không có dissolved state, thể tích các phân vùng bằng $V_{reserve}$, không có NaN hay đảo cận.

2. **24 Permutations (SC-M02):**
   - Part A (24 scenarios paused at $t=0$): Cả 24 thứ tự thêm khi tạm dừng đều đạt trạng thái khối lượng giống nhau, $V_{reserve} = 132,500\text{ milli-ml}$, và tiến triển đồng nhất khi resume chạy 60 ticks.
   - Part B (24 scenarios interleaved scientific steps): Thêm chất xen kẽ các mốc $t=0, 30, 60, 90, 120\text{ ticks}$. Bất biến khối lượng nghiêm ngặt tại mọi bước; chứng minh $Gd$ phụ thuộc lịch sử (thêm nước trước cho $Gd$ cao hơn thêm nước sau).

3. **Capacity & Rejection Matrix (SC-IN03, SC-M05):**
   - Nước $500\text{ ml}$ (5 lần 100ml) nhận; lần thêm tiếp theo 0.1ml bị từ chối với `CAPACITY_EXCEEDED`.
   - Nước $499.9\text{ ml} + 0.1\text{ ml}$ nhận đúng $500,000\text{ milli-ml}$; lần tiếp bị từ chối.
   - Hỗn hợp Fixture X ($495\text{ ml}$) + $5\text{ ml}$ nước nhận đúng $500,000\text{ milli-ml}$; thêm $0.1\text{ ml}$ dầu bị từ chối.
   - Hòa tan không tạo dung tích ảo (reservation dựa trên input ticks).
   - Xác thực giới hạn liều tối đa mỗi lần thêm (`EXCEEDS_MAX_ADDITION`).

4. **Phase Transition Timelines (SC-R01, SC-R02, SC-M04):**
   - Dry $\to$ Oil-only $\to$ Mixed (SC-R02, SC-S04).
   - Oil-only với cát lơ lửng nằm trong phong bì dầu $[regions.oil.bottom, regions.oil.top]$ (SC-R01).
   - Hệ bão hòa đa chất (SC-M04): Water 10ml, Sugar 30g, Sand 10g, Oil 20ml chạy 600 ticks auto-stir.
   - Ngừng khuấy khi đồng hồ chạy (flow decay, lắng cát và tách dầu).
   - Thêm chất đồng bộ nhanh trả về stateVersion đơn điệu và acks tuần tự (SC-C02).

5. **Giới hạn kiểm chứng:**
   - Bộ test chạy headless thuần toán học và logic engine.
   - Chưa bao gồm WebGL browser runtime QA (giữ browser gates còn mở theo đúng quy định).

## 8. Độ ổn định, replay và tính độc lập của Render Rate (V3-08 — Automated Coverage)

Đã triển khai bộ test tự động xác định trên engine thật tại [`src/simulation/tests/stability.test.ts`](file:///d:/IdeaProjects/virtual-solubility-lab/src/simulation/tests/stability.test.ts) (16 tests, exit code 0):

1. **State Ownership & Memory Isolation (SC-B01):**
   - Caller mutate nested objects từ `getState()` (`mass.W = 999999`, `input`, `rod`) không ảnh hưởng đến core engine.
   - State capture cũ (`capturedAtT0`) không bị biến đổi khi engine advance thời gian.
   - Mutate capture không làm đổi quỹ đạo bước tiếp theo.
   - Không tăng snapshot reads / render frame copies làm đổi khoa học hoặc RNG stream.
   - Khẳng định tính cô lập trên production-shaped copy thông thường (không chỉ dựa vào freeze throwing error).

2. **Long-run 600s Verification (SC-N02):**
   - Mixed fixture M: Water 300ml, Sugar 100g, Sand 100g, Oil 70ml ($V_{reserve} = 495\text{ ml} \le 500\text{ ml}$), seed 1729.
   - Chạy 36,000 continuous ticks ($600\text{ s}$ sim-time): 300s auto-stirring + 300s release drive (deceleration & separation).
   - Kiểm định bất biến bảo toàn khối lượng tại **mọi tick** (max mass conservation error $< 10^{-11}\text{ g}$ cho cả 4 chất).
   - Checkpoints (tick 0, 600, 18000, 36000) copyRenderFrame kiểm tra tọa độ hạt hữu hạn và nằm nghiêm ngặt trong phân vùng cốc.
   - Kiểm tra đại diện N=700 visual budget trên 600 ticks duy trì bounds và tính ổn định.

3. **Frame Rate Replay 30/60/120 FPS (SC-N01, SC-T01):**
   - Cùng recorded command trace tại các mốc tick logical (0, 120, 240, 360).
   - 30, 60 và 120 FPS frame intervals hội tụ về cùng số scientific ticks (600 steps) và trạng thái vô hướng sai khác $\le 10^{-6}\text{ g/rad}$.
   - Danh sách acks, generation, seq, version và tickIndex hoàn toàn trùng khớp.

4. **Timestep Independence h=1/60 vs h=1/120 (SC-N05, SC-T03):**
   - Chạy cùng 10 sim-seconds ($h=1/60$ với 600 steps; $h=1/120$ với 1200 steps).
   - Invariant bảo toàn khối lượng nghiêm ngặt ($< 10^{-12}\text{ g}$) cho mỗi bước tích phân.
   - Sai khác nồng độ pha $|Gd_{60} - Gd_{120}|$, $|Ss_{60} - Ss_{120}|$, $|Od_{60} - Od_{120}| \le 1\%$ lượng chất thêm vào.
   - Pose RMS thìa khuấy $\le 0.05$ scene units.

5. **Visual Budget N Independence (SC-P01, SC-B02):**
   - Replay cùng trace với $N=10, 100, 700$: quỹ đạo vật lý vô hướng bit-identical 100%.
   - Caller làm hỏng buffer (`target.positions.fill(999.0)`) không làm hỏng dữ liệu các lần copy tiếp theo.

6. **Timing Edge Cases (SC-N04, SC-T02, SC-T03):**
   - $dt=0$ no-op; delta âm / NaN trả về lỗi `INVALID_DELTA` không gây đột biến state.
   - advance 5s tại $h=1/60$ chạy 6 steps, bỏ 4.9s vào `droppedActiveWallTime`; tại $h=1/120$ chạy 12 steps, bỏ 4.9s.
   - Pause / hidden dọn sạch remainder tích lũy; thời gian ẩn không cộng dồn vào `droppedActiveWallTime`.

7. **Seeded Randomized Commands (SC-N03):**
   - 1,000 commands sinh xác định bằng Mulberry32 (seed 1729).
   - Bao gồm add hợp lệ / bất hợp lệ / vượt ngưỡng, controls khuấy, mode, pause/resume/reset.
   - Mọi lệnh bị reject đều giữ nguyên state/mass/input; mọi lệnh accepted đều bảo toàn bất biến; max error $< 10^{-10}\text{ g}$, không có NaN/Infinity.

## 9. Kiểm chứng Mở rộng Bridge cho Đầy đủ Phase và Render Outputs (V4-01 — Automated Coverage)

Đã triển khai bộ test tự động toàn diện tại [`src/simulation/tests/bridgeFull.test.ts`](file:///d:/IdeaProjects/virtual-solubility-lab/src/simulation/tests/bridgeFull.test.ts) (18 tests, exit code 0):

1. **SC-B01 & Render Copy Contract (Buffer Isolation & Zero Aliasing):**
   - `copyRenderFrame(target)` sao chép các hạt đại diện vào target buffer do caller sở hữu (~77KB pre-allocated) mà không để lộ mảng nội bộ của engine.
   - Caller mutate target (`target.positions.fill(999.0)`, `weights.fill(-99.0)`) không làm biến đổi core engine state hoặc hỏng các frame copy tiếp theo.
   - Trả về `poolRanges` cho đầy đủ 5 pools (`sugarBed`, `sugarSusp`, `sandBed`, `sandSusp`, `oilDroplet`) với tổng count khớp số hạt active.

2. **Full Scalar Snapshot & Detached Phases:**
   - Snapshot xuất bản đầy đủ 10 ngăn khối lượng ($W, Gt, Gu, Gd, St, Sb, Ss, Ot, Ol, Od$), tỷ lệ lơ lửng $f_{Gu}$, rod pose ($x, z, tipY, \theta, r$), contact cơ học, flow intensity, sức chứa dung môi $capacityG$, độ bão hòa $saturationRatio$, tiến độ hòa tan $dissolutionProgress$, trạng thái $paused$, chế độ $mode$, $autoLevel$, $autoDriveEnabled$, $generation$, $stateVersion$, $tickIndex$, $elapsedSeconds$.
   - Ngữ nghĩa nullable: Khi thiếu nước ($W=0$), $capacityG = 0$, $saturationRatio = null$, $dissolutionProgress = null$. Khi có nước ($W > 0$), các trường này mang giá trị số học chuẩn xác.
   - Freeze Dev: Đóng băng `Object.freeze` các đối tượng snapshot và nested objects (`input`, `mass`, `rod`), ngăn chặn tuyệt đối việc mutate vô tình từ phía UI React.

3. **Forced Immediate Publish vs Throttled 10Hz Tick Publish:**
   - Lệnh điều khiển hợp lệ (`add`, `reset`, `pause`, `resume`, `releaseDrive`, `setMode`, `setAutoLevel`) kích hoạt publish snapshot tức thời (`forced publish`), không chờ tích tắc kế tiếp hay throttle.
   - Trong quá trình tick mô phỏng động liên tục, việc publish snapshot vô hướng được điều tiết (throttled) tại chu kỳ $\approx 10\text{Hz}$ ($100\text{ms}$ interval) để tối ưu hiệu năng UI React, trong khi scene 3D vẫn nhận tín hiệu invalidate trên từng tick.

4. **Metadata Handshake & Stale Frame Dropping (SC-B03):**
   - Đồng bộ thế hệ (`generation`), `stateVersion`, và `renderRevision` giữa snapshot và render frame.
   - `resetCamera` tăng `cameraRevision` độc lập ở UI mà không làm reset thế hệ khoa học hay khởi động lại scheduler.
   - Store Zustand và Renderer tự động loại bỏ các snapshot / frame trễ thế hệ (`generation < current.generation`).

5. **Paused Add & Immediate Remap (SC-C07, SC-R04, SC-A01):**
   - Thêm chất khi paused cập nhật ngay phân vùng cốc (`computeBeakerRegions`), cao độ đáy thìa (`rod.tipY`), và tái ánh xạ biểu diễn hạt mà không tăng thời gian hay tick index ($elapsed=0, tickIndex=0$).
   - Phân bổ pha ban đầu đúng chuẩn SC-A01: đường mới vào $Gu$, cát mới vào $Sb$, dầu mới vào $Ol$, nước mới vào $W$.

6. **Auto Speed Mapping Constants:**
   - Xác minh bảng hằng số `AUTO_LEVEL_SPEEDS`: `slow: 1.0, medium: 3.0, fast: 6.0 rad/s`.
   - Cập nhật chế độ và tốc độ khuấy qua bridge phản ánh lập tức trên engine và snapshot.

7. **Bốn Chuỗi Tương Tác Cốt Lõi (Four Key Interaction Flows):**
   - *Flow 1 (Tốc độ hòa tan đường theo vận tốc khuấy):* Cùng điều kiện ban đầu, tốc độ hòa tan đường $Gd(t)$ tuân thủ nghiêm ngặt thứ tự: Fast ($6.0\text{ rad/s}$) > Medium ($3.0\text{ rad/s}$) > Slow ($1.0\text{ rad/s}$) > Rest ($0\text{ rad/s}$).
   - *Flow 2 (Bão hòa và thêm nước tiếp tục hòa tan - SC-D05):* Đạt ngưỡng bão hòa dung môi ($W=10\text{ml} \to 20\text{g}$ đường), đường ngừng tan và dư ở đáy; thêm $10\text{ml}$ nước nhân đôi sức chứa ($40\text{g}$), làm giảm tỷ lệ bão hòa và kích hoạt hòa tan tiếp tục phần đường còn dư. Thêm dầu không làm tăng sức chứa hòa tan đường.
   - *Flow 3 (Động học nâng/lắng cát và phân tán/tách pha dầu):* Khuấy nhanh nâng cát từ đáy lên lơ lửng ($Sb \to Ss$) và xé dầu thành giọt phân tán ($Ol \to Od$); khi ngừng khuấy, dòng chảy suy giảm dần theo quán tính, cát lắng về đáy và giọt dầu nổi tách về lớp dầu trên mặt, bảo toàn khối lượng nghiêm ngặt ($Sb + Ss = St$, $Ol + Od = Ot$).
   - *Flow 4 (Controls, Stale Watchdog 150ms và Vòng đời hiển thị thìa - SC-J02, SC-J03):* Kéo thìa thủ công cập nhật pose và vận tốc góc; ngừng di chuột quá $150\text{ms}$ kích hoạt watchdog tự động nhả lực truyền; ẩn thìa (`toggleRod`) giải phóng lực truyền trước khi ẩn; tạm dừng mô phỏng đóng băng dòng chảy và ngừng tăng thời gian.

8. **Vòng đời và Dọn dẹp Subscription (Lifecycle & Cleanup):**
   - Hủy đăng ký snapshot và scene invalidate hoạt động chuẩn xác, không rò rỉ bộ nhớ.
   - `attachLifecycle` bảo đảm tính lũy đẳng (idempotent), hủy bỏ an toàn các listeners cũ khi re-attach trong React StrictMode.

## 10. Kiểm chứng Render Sugar và Sand theo Compartments (V4-02 — Automated Coverage)

Đã triển khai bộ test tự động toàn diện tại [`src/simulation/tests/renderCompartments.test.ts`](file:///d:/IdeaProjects/virtual-solubility-lab/src/simulation/tests/renderCompartments.test.ts) (14 tests, exit code 0):

1. **Phân chia Compartment Đường & Động học Hòa tan:**
   - $Gu$ được phân chia chính xác thành $Gu_{bed} = Gu \times (1 - f_{Gu})$ và $Gu_{susp} = Gu \times f_{Gu}$.
   - Đường đã tan ($Gd$) hoàn toàn KHÔNG sinh hạt đại diện (chỉ tồn tại ở cấp độ phân tử trong dung môi).
   - Trong hệ không nước (khô hoặc chỉ dầu), $Gd = 0$ tại mọi tick, toàn bộ đường giữ nguyên ở pha rắn $Gu$.
   - Khi $Gu < 0.1\text{g}$, `formatPhaseMass` hiển thị `<0,1 g` và không làm tròn thành $0\text{g}$.
   - Ngưỡng ẩn trực quan $0.001\text{g}$ ẩn hạt đại diện nhưng bảo toàn 100% khối lượng trên mass ledger.

2. **Phân chia Compartment Cát & Động học Lắng Thật:**
   - Cát phân chia nghiêm ngặt giữa $Sb$ (đáy) và $Ss$ (lơ lửng), không có trạng thái tan.
   - Khi khuấy, cát được nâng từ đáy lên lơ lửng ($Sb \to Ss$).
   - Khi ngừng khuấy, dòng chảy suy giảm liên tục theo quán tính và cát lắng dần về đáy ($Ss \to Sb$) mà không rơi tức thì hoặc dùng chuyển động sin/cos giả tạo.
   - Bất biến bảo toàn khối lượng cát $Sb + Ss = St$ duy trì nghiêm ngặt tại mọi bước.

3. **Hình học Đáy & Khớp computeBeakerRegions:**
   - Chiều cao lớp cát đáy và lớp đường đáy khớp chính xác với $regions.bed.height$ và $regions.bed.top$.
   - Tọa độ không gian `computePoolBounds` chia tách chính xác lớp cát dưới đáy và lớp đường đọng bên trên.
   - Khối trụ thể tích trầm tích đáy được thiết lập bán trong suốt (`transparent opacity={0.65}`) để không che khuất các hạt rời rạc bên trong.
   - Bề mặt chất lỏng và thành cốc không che khuất hạt (`renderOrder` 1 cho hạt, 2 cho chất lỏng, 3 cho thành cốc).
   - Mọi hạt đại diện có `raycast={() => null}` để không cản trở thao tác kéo thìa của chuột.

4. **Hệ Chỉ Dầu (Oil-Only Carrier Envelope):**
   - Trong hệ chỉ dầu, cát lơ lửng và đường lơ lửng nằm hoàn toàn trong phong bì dầu $[regions.oil.bottom, regions.oil.top]$.
   - Phân vùng nước có thể tích bằng 0 và không chứa hạt.

5. **Tỷ lệ Bán kính Hữu hiệu (Effective Radius) trong Lớp Mỏng:**
   - Khi bề dày lớp nhỏ hơn đường kính hạt, bán kính hữu hiệu $r_{eff}$ được co lại bằng $\text{height}/2$ và đặt hạt tại trung điểm, ngăn hạt lồi ra ngoài biên cốc.
   - Khẳng định tỷ lệ co giãn ma trận biến đổi được đọc trực tiếp từ `target.radii` không bị nhân đôi.

6. **Thêm Chất khi Tạm dừng & Cô lập Buffer:**
   - Thêm đường và cát khi paused cập nhật ngay phân vùng và tọa độ hạt nhưng không tăng thời gian hay vận tốc.
   - Thay đổi ngân sách hạt $N=10/100/700$ giữ nguyên quỹ đạo vật lý vô hướng.
   - Buffer caller-owned (~77KB) hoàn toàn độc lập, caller ghi đè buffer không làm ảnh hưởng đến core engine.

## 11. Kiểm chứng Render Nước và Dầu (Layer/Droplets) & Đính chính Hòa tan (V4-03 — Automated Coverage)

Đã triển khai bộ test tự động toàn diện tại [`src/simulation/tests/renderLiquids.test.ts`](file:///d:/IdeaProjects/virtual-solubility-lab/src/simulation/tests/renderLiquids.test.ts) (17 tests, exit code 0):

1. **Xác minh Công thức Hòa tan & Ba Regressions Bắt buộc:**
   - Xác nhận công thức $k_{diss} = 0.08 \cdot I \cdot (1 + \text{contact})$ CHƯA TỪNG tồn tại trong codebase, mà chỉ là lỗi mô tả dạng văn bản trong báo cáo V4-02.
   - Runtime code tại [`src/simulation/models/Dissolution.ts`](file:///d:/IdeaProjects/virtual-solubility-lab/src/simulation/models/Dissolution.ts) và [`src/simulation/constants/science.ts`](file:///d:/IdeaProjects/virtual-solubility-lab/src/simulation/constants/science.ts) luôn tuân thủ chuẩn xác SPEC §5.2: $k_G = 0.025 + 0.25 \cdot I$, $\text{capacity}_G = 2 \cdot W$, $\text{available} = \min(G_u, \max(0, \text{capacity}_G - G_d))$, $dG = \text{available} \cdot (1 - e^{-k_G \cdot h})$.
   - *Regression 1:* Có nước, $I=0$ (không khuấy): đường vẫn tan ở tốc độ nền $k_{G0} = 0.025\text{ s}^{-1}$.
   - *Regression 2:* Có nước, thìa ở trên không hoặc $I=0$ ($contact = 0$): đường vẫn tan ở tốc độ nền $k_{G0} = 0.025\text{ s}^{-1}$.
   - *Regression 3:* Hệ không có nước ($W=0$, kể cả khi có nhiều dầu và khuấy mạnh $I=1$): tuyệt đối không tan ($k_G = 0$, $dG = 0$, $G_d = 0$).
   - *Numeric Fixtures độc lập:* Với $W=10\text{g}, G_t=30\text{g}$ sau $1\text{s}$ ($60$ ticks, $h=1/60\text{s}$):
     * Ở $I=0$: $G_d \approx 20 \cdot (1 - e^{-0.025 \cdot 1}) \approx 0.493801759\text{g}$ (sai số $< 10^{-8}\text{g}$).
     * Ở $I=1$: $G_d \approx 20 \cdot (1 - e^{-0.275 \cdot 1}) \approx 4.808557536\text{g}$ (sai số $< 10^{-8}\text{g}$).

2. **Kiểm chứng 4 Fixtures Chuẩn SPEC §4:**
   - *Fixture L0 (Không khuấy, $W=100\text{ml}, O=20\text{ml}$):* $regions.aqueous = [0.12, 0.540]$, $regions.oil = [0.540, 0.624]$, $regions.bed.height = 0$.
   - *Fixture L1 (Khuấy mạnh, $W=100\text{ml}, O=20\text{ml}, Od=10\text{g}$):* $V_{aqueous} = 110\text{ml} \to regions.aqueous = [0.12, 0.582]$; $V_{oil} = 10\text{ml} \to regions.oil = [0.582, 0.624]$. Tổng mức chất lỏng $liquidTop = 0.624$ bất biến tuyệt đối.
   - *Fixture O (Chỉ dầu + cát, $O=100\text{ml}, S=10\text{g}$):* $regions.bed.height = 0.010$ ($2.4\text{ml}$), $regions.oil.bottom = 0.130$, $regions.oil.top = 0.565$ ($103.6\text{ml}$ bao gồm $6\text{g}$ cát lơ lửng), $regions.aqueous = \text{null}$.
   - *Fixture X (Hỗn hợp tối đa $495\text{ml}$, $W=300\text{g}, G=100\text{g}, S=100\text{g}, O=70\text{g}$):* $regions.bed.height = 0.311$ ($74\text{ml}$), $regions.aqueous = [0.431, 1.990]$ ($371\text{ml}$), $regions.oil = [1.990, 2.200]$ ($50\text{ml}$).

3. **Động học Trao đổi Giọt Dầu và Không Gian Phân Vùng:**
   - Khuấy mạnh làm tăng $Od$, giảm $V_{oil}$ của lớp dầu và tăng $V_{aqueous}$ của phong bì nước.
   - Ngừng khuấy cho phép tách pha tự nhiên ($Od \to Ol$) theo hàm số mũ của mô hình khoa học, không dùng solver coalescence giả.
   - Hạt giọt dầu đại diện $Od$ nằm nghiêm ngặt bên trong $regions.aqueous$, không lọt vào lớp dầu $regions.oil$ hoặc lớp trầm tích $regions.bed$.
   - Trong hệ chỉ dầu, cát lơ lửng nằm hoàn toàn bên trong $regions.oil$.

4. **An toàn Biên và Miễn nhiễm Raycast:**
   - Khi thể tích nước hoặc dầu bằng 0 hoặc bề dày $< 0.0001\text{m}$, component trả về `null`, hoàn toàn triệt tiêu phantom meshes.
   - Đã gắn `raycast={() => null}` trên `WaterVolume`, `OilVolume` và `Beaker` (glass wall, base, graduation markings), giải phóng hoàn toàn sự kiện chuột để truyền trực tiếp đến thìa khuấy và `OrbitControls`.
   - Chuỗi pause, resume, reset và remount camera bảo toàn tính toàn vẹn vùng hình học và phân bổ bộ nhớ.

## 12. Kiểm chứng Kết quả, Giải thích, Hysteresis & Responsive Controls (V4-04 — Automated Coverage)

Đã triển khai bộ test tự động toàn diện tại [`src/simulation/tests/resultsAndControls.test.ts`](file:///d:/IdeaProjects/virtual-solubility-lab/src/simulation/tests/resultsAndControls.test.ts) (16 tests, exit code 0):

1. **Định dạng, Xử lý Giá trị Không Khả Dụng & Biên Sư Phạm (SC-U01, SC-U02):**
   - `formatCapacity`: trả về `N/A` khi $W=0$ (hệ khô hoặc chỉ dầu) hoặc không hữu hạn; trả về dung tích chính xác theo định dạng tiếng Việt (dấu phẩy thập phân) khi có nước.
   - `formatSaturationRatio`: trả về `N/A` khi ratio là null hoặc không hữu hạn; hiển thị phần trăm chính xác (vd: `50,0%`).
   - `formatDissolutionProgress`: khi dung dịch còn khả năng hòa tan ($\text{headroom} > 10^{-8}$), tiến độ được giới hạn tối đa ở `99,9%` để không gây ngộ nhận cho người học rằng đã tan hết trước khi tiệm cận hoàn tất; khi $\text{headroom} \le 10^{-8}$, hiển thị `100%`.
   - `formatPhaseMass`: khối lượng dương nhỏ hơn $0.1\text{g}$ (ví dụ $0.05\text{g}$) luôn hiển thị `<0,1 g`, tuyệt đối không làm tròn thành $0\text{g}$.

2. **Cơ chế Hysteresis Hai Chiều (Near-Saturation & Near-Complete) (SPEC §8):**
   - *Near-Saturation:* Bật trạng thái "Gần bão hòa" khi $\text{ratio} \ge 0.99$, duy trì khi $0.98 \le \text{ratio} < 0.99$, tắt khi $\text{ratio} < 0.98$.
   - *Near-Complete:* Bật trạng thái "Tan gần hết" khi $G_u \le L(G_t)$ với $L = \max(0.01\text{g}, 0.01 \times G_t)$; duy trì trong $(L, 1.2L]$; tắt khi $G_u > 1.2L$.
   - Khi có đường dư vượt sức chứa ($G_t > \text{capacity}_G$), cờ `nearComplete` bị vô hiệu hóa cưỡng bức (`false`), ngăn chặn mâu thuẫn hiển thị giữa "tan gần hết" và "đường dư".

3. **Tiến Độ Hòa Tan khi Có Đường Dư Vượt Sức Chứa (SC-U02):**
   - Tiến độ hòa tan được định nghĩa chuẩn xác theo lượng có thể tan: $G_d / \min(G_t, \text{capacity}_G)$.
   - Khi $G_t > \text{capacity}_G$, sự hiện diện của đường không tan dư $G_u > 0$ không cản trở thanh tiến độ đạt gần 100% của lượng tối đa có thể tan trong dung môi hiện tại.

4. **Tỷ Lệ Liên Tục Pha & Vị Từ Lắng / Tách Lớp Độc Lập:**
   - Hàm `computePhaseRates` tính toán các tốc độ vô hướng liên tục thuần túy: $dG/dt$ từ $k_G \cdot \text{available}$, $dSs/dt$ từ $k_{suspend} \cdot I \cdot S_b - k_{settle} \cdot S_s$, và $dOd/dt$ từ $k_{disperse} \cdot I \cdot O_l - k_{separate} \cdot O_d$.
   - Khi tạm dừng (`paused = true`), mọi tốc độ tức thời trả về $0$ tuyệt đối mà không cần tính sai phân hữu hạn 10Hz.
   - Vị từ "đang lắng" ($dSs/dt < -0.01\text{g/s}$) và "đang tách lớp" ($dOd/dt < -0.01\text{g/s}$) được đánh giá độc lập, cho phép hai hiện tượng xảy ra đồng thời trong cùng một cốc mà không che khuất lẫn nhau.
   - Cát lắng hoặc dầu tách lớp không kích hoạt nhãn "đang lắng / đang tách" nếu lượng lơ lửng $S_s$ hoặc phân tán $O_d$ không đáng kể ($\le 0.1\text{g}$).

5. **Thứ Tự Ưu Tiên Giải Thích Hiện Tượng (Condition Priority):**
   - Cốc rỗng (Empty) $\to$ Tạm dừng (Paused) $\to$ Không có nước (Dry / Oil-only) $\to$ Động học đang diễn ra (Khuấy mạnh, Lắng, Tách lớp) $\to$ Trạng thái ổn định / bão hòa.
   - Khi tạm dừng, không bao giờ hiển thị thông điệp "đang tan nhanh hơn" hay "đang lắng".

6. **Ba Kịch Bản Người Học (UC1, UC2, UC3) trên Engine & Store Thật:**
   - *UC1 (Đường):* So sánh Observe vs Auto Fast ($6.0\text{ rad/s}$) xác nhận tốc độ khuấy làm tăng mạnh tốc độ hòa tan; kiểm chứng bão hòa $W=40\text{ml}, G=100\text{g}$ chạm giới hạn $80\text{g}$ và để lại đường dư $\ge 20\text{g}$; thêm $10\text{ml}$ nước khi paused nâng sức chứa lên $100\text{g}$ mà không làm thay đổi khối lượng đã tan hay thời gian trôi qua.
   - *UC2 (Cát):* Khuấy đưa $S_b \to S_s$; ngừng khuấy đồng hồ tiếp tục chạy, cát lắng dần về đáy $S_s \to S_b$ bảo toàn $S_b + S_s = 10\text{g}$; cát không bao giờ tan; tạm dừng đóng băng mọi tiến trình.
   - *UC3 (Bốn chất):* Trải qua chuỗi thêm 4 chất, Auto Fast, chuyển Manual, Tạm dừng, thêm chất khi paused, khôi phục camera, tiếp tục chạy, và Thiết lập lại (Reset). Kiểm chứng reset tăng generation, đưa các khối lượng và thời gian về 0, nhưng bảo toàn cameraRevision và showRod.

## 13. Kiểm chứng Bốn Cốc Nguồn 3D & Saturation Regression (V1-06 — Automated Coverage)

Đã triển khai bộ test tự động toàn diện tại [`src/simulation/tests/stockVessels.test.ts`](file:///d:/IdeaProjects/virtual-solubility-lab/src/simulation/tests/stockVessels.test.ts) (6 tests, exit code 0):

1. **Cấu hình Bốn Cốc Nguồn (Stock Vessels Configuration):**
   - Xác định đúng 4 loại nguyên liệu: `'water'`, `'sugar'`, `'sand'`, `'oil'`.
   - Tên hiển thị tiếng Việt chuẩn xác và màu sắc đồng bộ hoàn toàn với bảng định nghĩa `INGREDIENTS`: Nước (`#66bce0`), Đường (`#e8e3d4`), Cát (`#c89757`), Dầu ăn (`#e4bd49`).
   - Kích thước cốc nguồn được co nhỏ tương ứng (bán kính $0.38$, chiều cao $1.05$) so với cốc thí nghiệm 500ml ($0.91$ và $2.28$).

2. **Bố trí Không Gian Xác Định & An Toàn Biên (Deterministic Layout):**
   - Cả 4 cốc đặt chuẩn trên mặt bàn ($y = 0$), nằm trọn vẹn trong biên mặt bàn $9 \times 7$ ($|x| + 0.38 < 4.5$, $|z| + 0.38 < 3.5$).
   - Khoảng cách giữa các tâm cốc nguồn liền kề là $\approx 1.044$, lớn hơn đường kính cốc ($2 \times 0.38 = 0.76$), bảo đảm khoảng trống $\ge 0.28$ đơn vị, hoàn toàn không va chạm hay chồng lấn hình học.
   - Khoảng cách từ tâm cốc nguồn đến tâm cốc thí nghiệm $(0, 0, 0)$ đều $\ge 2.55$ đơn vị, để lại hơn $1.25$ đơn vị không gian mở xung quanh thành cốc thí nghiệm $500\text{ml}$ ($R = 0.91$), không che khuất thìa khuấy hay vùng tương tác kéo chuột.

3. **Tính Độc Lập Khoa Học & Không Tiêu Hao (Science Isolation):**
   - Cốc nguồn là đối tượng trực quan thuần túy, không có logic trừ kho hay liên kết với khối lượng thí nghiệm.
   - Thêm chất vào cốc thí nghiệm hoặc thực hiện Scientific Reset (`store.getState().reset()`) không làm biến đổi cấu hình 4 cốc nguồn.
   - Các hằng số hình học và khoa học cốt lõi của cốc 500ml (`BEAKER_OUTER_RADIUS = 0.91`, `BEAKER_INNER_RADIUS = 0.87`, `BEAKER_BASE_Y = 0.12`, `CAPACITY_ML = 500`, `SOLUBILITY_SUGAR_DEFAULT = 2.0`) được bảo toàn tuyệt đối.

4. **Saturation Equality & Per-Add Limit Regression (UC1 Fixture):**
   - Giới hạn thêm mỗi lần: đường có `maxAddition = 100g`. Lệnh thêm $200\text{g}$ đường một lần bị từ chối với thông báo lỗi hợp lệ.
   - Phân biệt đẳng thức bão hòa và vượt sức chứa:
     * Khi $W = 50\text{ml}, G_t = 100\text{g} \implies \text{capacity} = 100\text{g}$. Vì $G_t == \text{capacity}$, cờ `hasExcess` trả về `false` (bão hòa chuẩn, không phải đường dư vượt sức chứa).
     * Khi $W = 40\text{ml}, G_t = 100\text{g} \implies \text{capacity} = 80\text{g}$. Vì $G_t > \text{capacity} + \varepsilon$, cờ `hasExcess` trả về `true`, đường dư vượt sức chứa là $20\text{g}$.
     * Khi tạm dừng, thêm $10\text{ml}$ nước nâng sức chứa lên $100\text{g}$, cờ `hasExcess` ngay lập tức chuyển về `false`.
