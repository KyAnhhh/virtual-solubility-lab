# Scientific Specification — MVP v3

Đề xuất kỹ thuật ngày 2026-10-17, **chưa có runtime hoặc kiểm chứng thí nghiệm**. [IMPLEMENTATION_TASKS.md](IMPLEMENTATION_TASKS.md) là nguồn task/status/estimate duy nhất. R01–R20 là review contract, không phải lỗi P0 đã xác nhận trong source. Các SC-* bên dưới là test được đặc tả, chưa phải test đã chạy.

## 1. Phạm vi và đơn vị

Giữ mô hình giáo dục compartment của v2: nước, đường, cát, dầu; không CFD, nhiệt độ, backend, surfactant, va chạm mọi hạt hoặc tồn kho cốc nguồn. Các hệ số là teaching defaults, chưa hiệu chuẩn. Contact hóa học hữu hiệu: nếu có nước thì đường rắn có thể tiếp xúc nước, chưa mô phỏng dầu chắn hạt. Contact **cơ học** của thìa là điều kiện riêng, không dùng contact hóa học để tạo flow.

Input water/oil dùng ticks 0.1 ml; sugar/sand dùng ticks 0.1 g. Phase masses là float g, không ép về độ chính xác input. Thời gian sim s, góc rad, vận tốc rad/s; vị trí scene units, không gọi là SI. qW/qO/qG/qS là integer ticks. W=rhoW*qW/10; Gt=qG/10; St=qS/10; Ot=rhoO*qO/10. rhoW=1.0 g/ml, rhoO=0.9 g/ml là conversions mẫu, không số liệu đo.

### 1.1 Parser tiếng Việt, quyết định mặc định

UI dùng raw string và inputMode decimal để parser kiểm soát thay vì dựa hoàn toàn number-input của browser. Trim khoảng trắng ngoài; grammar: một hoặc nhiều chữ số, tùy chọn một dấu chấm **hoặc** phẩy và một chữ số thập phân. Cho phép số nguyên/leading zeros; không dấu +/-, không grouping, exponent, whitespace bên trong, đuôi rác hoặc ký hiệu Infinity/NaN.

~~~text
" 1,2 " => 12 ticks; "1.2" => 12; "0001" => 10
"" / " " / ".1" / "1." / "1e2" / "1.2x" / "1,000.0" / "0.14" => reject
"0" / "-1" / "+1" / "1 000" / payload không đúng type => reject
~~~

Parse digits thành integer ticks bằng arithmetic đã kiểm safe integer; không parseFloat. Per-add maxima giữ water500ml/oil200ml/sugar100g/sand100g; checked trước multiplication. Giá trị nội bộ từ command phải Number.isSafeInteger(ticks), ticks>0, đúng ingredient/per-add, reservation hợp lệ. Input 0.1+0.1 lưu 1+1 ticks, không float rounding. Phase display: exact0→“0 g”; 0<m<0.1g→“<0,1 g”; >=0.1g hiển thị xấp xỉ1decimal. Tổng đã thêm luôn exact input ticks.

## 2. Schema và ownership — ví dụ TypeScript chỉ trong Markdown

~~~ts
type Ingredient = "water" | "sugar" | "sand" | "oil";
type Mode = "observe" | "auto" | "manual";
type Intent =
 | { type:"add"; ingredient:Ingredient; ticks:number }
 | { type:"reset"; seed:number }
 | { type:"pause" | "resume" | "releaseDrive" }
 | { type:"setMode"; mode:Mode }
 | { type:"setAutoLevel"; level:"slow"|"medium"|"fast" }
 | { type:"manualSample"; captureGeneration:number; pointerId:number;
     x:number; z:number; omega:number; inputTimeMs:number };
type Command = { clientId:string; seq:number; expectedGeneration:number;
                 payload:Intent };
type Ack = { clientId:string; seq:number; accepted:boolean; duplicate:boolean;
             reason:string|null; generation:number; stateVersion:number;
             appliedAtTick:number; controlOrdinal:number|null };
type RodPose = { x:number; z:number; tipY:number; theta:number; radius:number };
type ScienceState = {
 generation:number; stateVersion:number; tickIndex:number; elapsedSeconds:number;
 seed:number; paused:boolean; mode:Mode;
 autoDriveEnabled:boolean; autoLevel:"slow"|"medium"|"fast";
 input:{ water:number; oil:number; sugar:number; sand:number }; // ticks
 mass:{ W:number; Gt:number; Gu:number; Gd:number;
        St:number; Sb:number; Ss:number; Ot:number; Ol:number; Od:number };
 fGu:number; rod:RodPose; omegaRod:number; omegaDrive:number; omegaFlow:number;
};
type ScalarSnapshot = Readonly<{
 generation:number; stateVersion:number; tickIndex:number; elapsedSeconds:number;
 paused:boolean; mode:Mode; input:Readonly<ScienceState["input"]>;
 mass:Readonly<ScienceState["mass"]>; rod:Readonly<RodPose>;
 intensity:number; contact:number; capacityG:number;
 saturationRatio:number|null; dissolutionProgress:number|null;
}>;
type ClockConfig = { h:number; maxRealDelta:number; maxSteps:number };
type RenderTarget = { positions:Float32Array; weights:Float32Array;
                      materials:Uint8Array; count:number }; // caller-owned
type RenderStamp = { generation:number; stateVersion:number;
                     renderRevision:number; count:number };
interface Engine {
 dispatch(c:Command):Ack; // synchronous control flush, kể cả paused
 advance(realDeltaSeconds:number):void; // scientific ticks nếu running
 snapshot():ScalarSnapshot; // deep copied scalar data
 copyRenderFrame(target:RenderTarget):RenderStamp; // copy, không alias
}
~~~

Với consumed command, controlOrdinal=seq (tăng xuyên ticks/generations); appliedAtTick là số steps đã hoàn thành **trước** command, ack generation/stateVersion là **sau** command. Reset tại g0/tick120 có record expectedGeneration0/appliedAtTick120 nhưng ack g1 và core tick0; replay đi theo seq/generation, không sort mọi generation theo tick số. Malformed/out-of-order không consume có ordinal=null.

generation tăng khi reset mới; seq tăng theo client command, không reset theo generation; tickIndex đếm scientific steps từ reset; stateVersion tăng khi một unique command accepted hoặc một scientific step, không tăng khi rejected/duplicate; renderRevision tăng khi representation/bounds/buffers thay đổi. elapsed=tickIndex*h. Ack high-water/cache thuộc transport-control metadata, không scientific mass/seed. Scalar nested data detached; dev freeze nested scalar objects. Typed arrays **không** được bảo vệ bằng readonly: engine private buffers không bao giờ trả reference ra renderer.

Một app owner/clientId trong MVP; không protocol nhiều client/worker. Zustand chỉ chứa UI flags/actions/acks/copied scalar snapshot. Giữ API add/reset của form khi migrate nhưng bỏ mutable totals thứ hai ngay ở V2-10. Engine và scheduler sống ngoài Canvas; camera reset/context retry không tạo engine mới.

## 3. Control flush, sequence, reset và phân bổ add

### 3.1 Xử lý lệnh không phụ thuộc tick

Facade xử lý từng UI intent đồng bộ, bind expectedGeneration từ engine owner **tại dispatch**, không từ snapshot UI10Hz. dispatch validates→applies→remaps constraints→invariants→ack→forced scalar publish ngay, kể cả paused. Resume không đợi tick nên không deadlock. Khoa học/time/transport integration chỉ chạy trong advance khi running. Rejected command không đổi scientific state/version/seed/representatives; ack UI vẫn cập nhật.

Nếu UI dùng microtask batching trong tương lai, intents vẫn FIFO và bind generation **từng intent**, không bind toàn batch trước reset. External pre-bound payload với generation cũ bị reject, không tự rebase. Manual samples giữ captureGeneration của lần pointerdown, không bind lại khi tới trễ.

### 3.2 Duplicate và thứ tự có bộ nhớ giới hạn

Reset seed phải uint32, default1729; không dùng randomseed chưa record. Single client monotonic seq bắt đầu1. Engine giữ high-water lastProcessedSeq và LRU tối đa256 acks kèm payload fingerprint, tồn tại xuyên reset:
- seq=next: validate payload/generation, accepted hoặc rejected đều consume seq và cache ack.
- seq>next: OUT_OF_ORDER, không consume; caller phải đưa seq thiếu trước.
- seq<=high-water: nếu cache còn và payload giống, trả original ack với duplicate=true, không apply; khác payload cùng ID→ID_REUSED. Nếu đã evict→DUPLICATE_EXPIRED, không apply lại.
- ClientId sai hoặc malformed envelope không được thay high-water.
- Không có Set IDs tăng vô hạn. Ack cache chỉ256; high-water số nguyên an toàn, hết safe range thì yêu cầu khởi tạo app session mới, không wrap.
- UI bỏ ack có generation/stateVersion cũ hơn last accepted UI stamp; original duplicate ack không thể ghi đè trạng thái hiện tại.

Reset khác ID làm state vật chất giống baseline paused nhưng generation/version vẫn tăng. “Idempotent reset” chỉ nghĩa là replay **cùng ID** không apply lần nữa, không nghĩa mọi reset mới phải giữ generation.

### 3.3 Timeline chuẩn, initial g0/v0/tick0/paused/empty

| Lệnh facade theo thứ tự | Kết quả | State sau xử lý | Ack/UI policy |
|---|---|---|---|
| seq1 add water100ml, expected g0 | accepted | g0/v1, qW1000, W100, elapsed0 | ack1 g0/v1 |
| seq2 reset, expected g0 | accepted | g1/v2, mọi mass0, tick0, paused | ack2 g1/v2 |
| seq3 add water50ml, facade bind g1 | accepted | g1/v3, qW500, W50 | ack3 g1/v3; không mất B |
| seq4 pointer captureGeneration0 tới trễ | STALE_GENERATION | g1/v3, W50, time0 | ack4 rejected; seq consumed, science không đổi |
| replay seq2 reset cùng payload | duplicate accepted original | vẫn g1/v3/W50 | original g1/v2 bị UI bỏ vì stale |
| seq5 reset ID mới, expected g1 | accepted | g2/v4, empty | distinct reset |
| seq6 reset ID mới, expected g2 | accepted | g3/v5, empty | distinct reset |
| seq7 add water499.9ml, g3 | accepted | g3/v6, reserve499900milli-ml | UI publish ngay |
| seq8 add water0.1ml, g3 | accepted | g3/v7, reserve500000 | capacity authoritative |
| seq9 add oil0.1ml, g3 | CAPACITY | vẫn g3/v7, time0 | không dùng snapshot cũ để accept |
| seq10 resume, g3 | accepted ngay | g3/v8/running, time0 | scientific tick sau mới tăng time |

Một command đã gắn expected g0 từ external payload sau reset bị reject; chỉ high-level UI intent chưa bind được facade gắn g1 đúng lúc. Camera reset là UI action, không tạo scientific command/reset/generation.

### 3.4 Driver enable và pause/stop

ScienceState giữ autoDriveEnabled và autoLevel. setMode(auto) bật enable, observe/manual tắt enable và clearinput; setAutoLevel thaylevel, chỉbật drive nếu đangauto. releaseDrive tắt autoDriveEnabled, đặtomegaRod0, manualsamplehistorycleared; nexttick không tự khởi động auto lại. Pause đặtomegaRod0 nhưng giữ autoDriveEnabled để resume có thểkhôiphục cấu hìnhauto, cònmanual phải down mới. HideRod luônreleaseDrive trướcUIhide, cácnútstartauto disabledkhiẩn; showRod không tựrestartdriver. Resume khôngbật lại auto nếu đãstop/hide. Contextloss explicitpause, restore vẫn paused; resume theoenablecònđượcgiữ. Defaults reset: modeobserve,autoDriveEnabledfalse,levelslow,paused.

### 3.5 Add vào pha nào và paused remap

| Add accepted | Thay đổi tức thì | Giữ nguyên |
|---|---|---|
| water delta ml | qW,W tăng; capacity và regions tính lại | Gd/Gu/Ss/Od/flow/elapsed |
| sugar delta g | qG,Gt,Gu tăng; Gd không tăng; fGu mới=oldGu*oldfGu/newGu | khối lượng đường đang lơ lửng trước add, Gd cũ |
| sand delta g | qS,St,Sb tăng | Ss cũ, không tự suspended |
| oil delta ml | qO,Ot,Ol tăng | Od cũ, không tự droplets |

Sau command dù paused: tạo đại diện của vật chất mới ở bed/layer theo pha ban đầu, cập nhật geometry ngay. Existing representatives giữ p/v nếu còn trong vùng hợp lệ; nếu ngoài bounds mới, project tới điểm gần nhất và bỏ thành phần velocity hướng ra ngoài. Không affine stretch cả pool để “đẹp”, không gọi scientific tick. Gán pool/weights lại theo phase nếu cần nhưng không dùng render sampling thay mass. elapsed/tick không tăng; add không tự resume. Lúc dry→wet fGu/Ss vẫn0 cho tới bước scientific tiếp theo.

## 4. Regions, contact bounds và numerical examples

alphaG=.65ml/g và alphaS=.6ml/g là visual reservation, không density khoa học.

~~~text
Vreserve = Wml+Oml+.65*Gt+.6*St
milliMl = 100*qW+100*qO+65*qG+60*qS <=500000
GuSusp=Gu*fGu; GuBed=Gu-GuSusp
Vbed=.65*GuBed+.6*Sb
base=.12; scale=.0042 sceneUnits/ml; innerRadius=.87
~~~

| Case | Vaqueous | Voil | Pool memberships / gate |
|---|---|---|---|
| Empty/dry Wml=Oml=0 | 0 | 0 | fGu=0,Ss=0, solids ở bed; không liquid drive |
| Water-only Wml>0,Oml=0 | Wml+.65Gd+.65GuSusp+.6Ss | 0 | Sugar/sand suspended ở aqueous; bed pools ở bed |
| Oil-only Wml=0,Oml>0 | 0 | Oml+.65GuSusp+.6Ss | Gd=Od=0,Ol=Ot; solids suspended trong **oil** có dầu nền, không thêm carrier dầu thứ hai |
| Mixed Wml>0,Oml>0 | Wml+.65Gd+.65GuSusp+.6Ss+Od/rhoO | Ol/rhoO | Solids suspended và oil droplets ở aqueous hữu hiệu; layered dầu ở oil; contact hóa học hữu hiệu chưa mô phỏng oil barrier |

Regions không chồng nhau: bed=[base,base+scale*Vbed]; aqueous=[bedTop,bedTop+scale*Vaqueous]; oil=[aqueousTop,aqueousTop+scale*Voil]. Volume0→không pool/mesh của region đó. Empty regions có min=max chỉ metadata, không clamp particle vào vùng không tồn tại. Tổng Vbed+Vaqueous+Voil luôn Vreserve. Oil-only oil envelope là pha dầu có solids displacement; Ol là lượng dầu, không được vẽ thêm khối Ol ngoài envelope này. Mixed droplets volume đã ở aqueous envelope, không cộng lần2.

Clamp representative radius <=innerRadius-particleRadius-margin. Với region height<diameter, scale radius xuống min(defaultRadius,height/2), đặt y midpoint; height0 thì không render active representative của pool đó. Bed nhiều chất chia sublayers nếu cần nhưng không cộng displacement hai lần; simplified visual bed được chấp nhận.

### 4.1 Bảng số: phase states là fixture, không phải trạng thái ngay sau add

Các pha khác baseline được inject bằng test factory hoặc tạo qua tick, không làm command add tự chuyển pha.

| Fixture và input | Phase masses g / fGu | Volumes ml bed/aqueous/oil | Boundaries y scene units |
|---|---|---|---|
| E empty | mọi0,fGu0 | 0/0/0 | .120/.120/.120/.120 |
| D dry G10g,S10g | Gu10,Gd0,Sb10,Ss0 | 12.5/0/0 | .120/.1725/.1725/.1725 |
| O oil100ml,S10g, stirred fixture | Ot=Ol90,Od0,Sb4,Ss6 | 2.4/0/103.6 | .120/.13008/.13008/.56520 |
| G0 W100ml,G10g, chưa tan | W100,Gu10,Gd0,fGu0 | 6.5/100/0 | .120/.14730/.56730/.56730 |
| G1 cùng input đã tan5g | W100,Gu5,Gd5,fGu0 | 3.25/103.25/0 | .120/.13365/.56730/.56730 |
| L0 W100ml,O20ml, nghỉ | W100,Ol18,Od0 | 0/100/20 | .120/.120/.540/.624 |
| L1 cùng input dispersed9g | Ol9,Od9 | 0/110/10 | .120/.120/.582/.624 |
| X W300ml,O70ml,G100g,S100g | W300,Gd50,Gu50,fGu.2,Sb80,Ss20,Ol45,Od18 | 74/371/50 | .120/.4308/1.9890/2.1990 |
| T W0.1ml,G0 | W.1, mọi solids0 | 0/.1/0 | .120/.120/.12042/.12042 |

X reserve=495ml, tổng495; phase oil63g=70ml. GuSusp10g/GuBed40g; bed26+48=74; aqueous300+32.5+6.5+12+20=371. Không gate saturation theo tổng dầu, capacityG600g ở X.

### 4.2 fGu là state kinematic xác định

Initial/reset fGu=0. Gu=0 hoặc dry→fGu=0. Khi wet và Gu>0 dùng cùng kLift/kSettle như sand trong §5:
fEq=kLift/(kLift+kSettle), fGuNext=fEq+(fGu-fEq)*exp(-(kLift+kSettle)*h); nếu lambda0 giữ fGu. Dissolution loại Gu theo tỷ lệ đều nên fGu giữ nguyên ở riêng bước dissolve; nếu Gu về0 thì fGu0. Add sugar dùng dilution §3.5, add liquid không tự đổi fGu. Pause không advance fGu; command remap vẫn làm đúng bounds. Đây không thêm một chemical mass compartment: GuSusp+GuBed=Gu luôn.

## 5. Flow, dissolution, sedimentation và separation

Defaults **giữ v2**: a=2/s,b=.8/s; speed1/3/6rad/s,cap8; S0=2g/gwater; kG0=.025/s,kG1=.25/s; kLiftMax=.6/s; settleWater=.15/s,settleOil=.06/s; oilBreak=.5/s,separate=.10/s. Giá trị là teaching defaults, không calibrated.

### 5.1 Contact cơ học và flow

Cán thìa đứng; **tipY thích ứng theo mặt bed**, không xuyên đáy: tipY=clamp(bedTop+.02,base+.02,fillTop−.22), fillTop=2.22. Active segment=[tipY,tipY+.20], envelope radius.12, wall margin.01→rAllowed=.74. Bed0 cho tipY=.14. Cập nhật tipY và regions sau mỗi command/step remap; contact ở flow step dùng mapping đã commit trước step đó. Chưa giải collision thìa/hạt, nhưng giữ phần hoạt động trên bed khi còn khoảng trống; không tự hạ tip tới đáy để một giọt tạo full drive. Tính c=độ dài giao active segment với union liquid-containing aqueous/oil regions / .20, clamp[0,1]; gate Wml+Oml=0→c0. Region chứa solid displacement là envelope trộn hữu hiệu, không coi dry bed là liquid.

Thin W.1ml chỉ tới.12042<tip.14→contact0. Bed thay đổi kéo tipY lên theo bedTop; liquid rất mỏng hoặc gần giới hạn cao vẫn có partial/zero contact. X fixture tipY=.4508, activeTop=.6508 nằm trong aqueous→contact1; O fixture tipY=.15008→contact1. Không có contact: omegaDrive0, **không xóa dòng cũ**, dòng decay. UI hướng dẫn “Thìa chưa chạm chất lỏng, hãy thêm nước hoặc dầu” khi có liquid nhưng c0; không thay hóa học, đường có nước vẫn tan nền.

~~~text
radialCoupling=min(radius/.4,1)
omegaDrive=contact*radialCoupling*omegaRod
omegaEq=a/(a+b)*omegaDrive
omegaFlowNext=omegaEq+(omegaFlow-omegaEq)*exp(-(a+b)*h)
I=clamp(abs(omegaFlowNext)/6,0,1)
~~~

Dry→omegaFlow0 vì không carrier; otherwise stop/withdraw c0 chỉ decay. Full contact/radius.4: equilibrium autoI slow=.1190476,medium=.3571429,fast=.7142857. Giữ normalization6; I1 chỉ unit model fixture fixed intensity, không đại diện auto fast. Manualcap8 cho Ieq=.952381 khi fullcontact. Nếu lambda0 thì giữomegaFlow, không chia0.

### 5.2 Đường

~~~text
capacityG=S0*W
gap=max(0,capacityG-Gd)
available=min(Gu,gap)
kG=kG0+kG1*I
dG=(W>0)?available*(1-exp(-kG*h)):0
GuNext=Gu-dG
GdNext=Gt-GuNext
~~~

Stirring chỉ đổi kG, không capacity. Không remove water, không cần precipitation trong MVP. Đường trong dầu-only không tan. W10/Gt30/cap20: fixedI0 Gd1s≈.49380176g; fixedI1≈4.80855754g. Cùng engine fast từomegaFlow0 không dùng fixedI1 oracle vì có coupling/ramp/contact.

### 5.3 Cát và fGu

~~~text
waterFraction=Wml/(Wml+Oml)
kLift=.6*I*I
kSettleBase=.15*waterFraction+.06*(1-waterFraction)
kSettle=kSettleBase/(1+2*I)
lambdaS=kLift+kSettle
SsEq=St*kLift/lambdaS
SsNext=SsEq+(Ss-SsEq)*exp(-lambdaS*h)
SbNext=St-SsNext
~~~

Wet lambda0 giữSs; dry Ss0,SbSt. Cát không có dissolved field. fGu dùng fraction version trong §4.2. Oil-only có carrier dầu, rate settleOil mẫu. FixedI0/carrierwater/Ss10→8.60707976g sau1s; stop engine từflow khác0 lắng chậm hơn fixedI0 đầu tiên.

### 5.4 Dầu

~~~text
if Wml==0 or Ot==0: OdNext=0; OlNext=Ot
else:
  kBreak=.5*I*I*waterFraction
  kSeparate=.10/(1+3*I)
  lambdaO=kBreak+kSeparate
  OdEq=Ot*kBreak/lambdaO
  OdNext=OdEq+(Od-OdEq)*exp(-lambdaO*h)
  OlNext=Ot-OdNext
~~~

lambdaO0 giữOd. No dissolved oil, no permanent emulsion. FixedI0/Od9→8.14353676g sau1s. Các exchanges là convex combinations nên pha trong[0,total]. Không snap về0 để làm UI kết thúc.

## 6. Manual và auto: pose, input clock, lifecycle

Hệ tọa độ thế giới +y lên; theta=atan2(z,x), dtheta>0 từ+x sang+z. Cùng convention cho auto/manual/render, không diễn đạt CW/CCW theo góc camera. Default radius.4,tipY.14 khi bed0; tipY thích ứng theo §5.1. Manual→auto: t0 giữ x/z/theta/r chính xác, radius smoothstep từr0 tới.4 trong.25simseconds, theta advance theo speed; không teleport frame đầu. Auto→manual giữpose. r≈0 theta giữ lầncuối,radialcoupling0 lúcởtâm, ramp out liên tục. Auto radius transition dừng khi paused.

Pointerdown manual trên hit vùngthìa: projection plane ngang chốt ở tipY hiện tại cho suốt drag (tránh jump khi bed đổi); rod tipY vẫn do engine adapt, x/z offsets giữ nguyên. Capture pointerId, store dragOffset=rodXZ-pointerPlaneXZ, giữpose, drive0 và clear angularhistory. Move dùng planePoint+offset→clamp; nearparallel |rayDirY|<1e-5 bỏ. Hai valid samples ngoài deadzone r>=.0435 mới inferomega; delta=atan2(sin(dtheta),cos(dtheta)), dt monotonicms/1000, filtertau.08s, cap±8rad/s. dt<=0/out-of-order bỏ; gap>150ms clearhistory và drive0, samplemới chỉ làmanchor.

**Stale-input default150ms** đo bởi monotonic host input clock, không elapsed sim. Khi pointer vẫndown mà không có sample hợp lệ mới, scheduler watchdog release drive≤150ms+1hostframe; flow vẫndecay. Không có scheduler khi paused/hidden thì exit event đãcleardrive; sauresume lastFrame/inputhistorynull. Đểreplay không phụ thuộc renderFPS, record synthesized stale release ở tick/controlOrdinal; harness replay recorded events, không tự tính timeout từwallframe mới.

Deadzone entry clearhistory/smoothed/drive0 ngay; exit cầnanchor+sample mới, không unwrap đối diện xuyên tâm. Khi paused không nhận move làm khoa học thay đổi. Phiên MVP mousemanual, touchcamera/widthresponsive riêng; pointerType khácmouse không trở thành manual driver.

| Event | Capture / camera | Pose | Drive / flow / samples |
|---|---|---|---|
| down manual-idle hợp lệ | capture id, camera off | giữ t0, tạooffset | drive0, clearhistory |
| move active id hợp lệ | giữ capture | clamp update | infer/filter, flowchỉscientificstep |
| move pointerId khác/nearparallel | không đổi | không đổi | khôngthayhistory hoặcstalevalidtime |
| deadzone / gap>150ms / stale watchdog | giữcapture,cameraoff | clamp điểm hợp lệ/giữ nếustale | drive0,clearhistory; flowdecay |
| up ngoài canvas | release,cameraon | giữpose | drive0,clearhistory,flowdecay |
| cancel/lostpointercapture/blur | release ifowned,cameraon | giữpose | drive0,clearhistory,flowdecay |
| hideRod | release,cameraon; khôngmanualdragkhithìaẩn | giữpose | stopdriver auto/manual; flowdecay; clockcontinues |
| modechange | release,cameraon | continuity/radiusramp nếuauto | exclusiveowner,clearhistory |
| pause | release,cameraon | giữ | drive0,samplesclear;flowfrozen, không reset |
| reset | release,cameraon | defaultpose | flow0/drive0/time0,mass0,paused,g++ |
| pagehidden/unmount | release,cameraon nếucanvascòn | giữ | clearinput; suspendclock, khôngfastforward |
| camera reset/context retry | releaseoldcanvas,cameraon | scientificposegiữ | enginekhông reset,khôngloopmới |
| resume/visible | cameraon,manual-idle | giữ | inputhistorynull; autoresume theo preset nếu modeauto và showRod; manual cần down mới |

HideRod dừng auto input: resume/visible không tự bật lại drive khi showRod=false; muốn khuấy phải hiện thìa. Với auto stop UI chuyểnobserve hoặc auto driverInactive theo status đã định nghĩa, không dùng hidden rod vẫn drive âm thầm.

## 7. Clock, tick timeline và replay

Initial và reset **paused**; controls Bắt đầu/tiếp tục rõ. Control flush §3 luôn hoạt động ngoài time advance. Scientific tick order: flow→dissolve→sand/fGu→oil→transport→invariants→tick/version. Commands đồng bộ có thể ở cùngtick giữaframes; replay ghi appliedAtTick (sốstep đãhoànthành) + controlOrdinal tăng giữa ticks. Record thực tếexpected generation/seq/payload/ack, không ghi từstalesnapshot.

advance(dt): dt<0/nonfinite reject với diagnostic và không đổi clock; dt0 là noop time (controldispatch đãriêng), khôngreject. Running dt clamped≤.1s; droppedActiveWallTime += phần dt-.1 bịbỏ. Accumulator cộngphầnclamp, processh1/60 tối đa6steps, giữ fractional remainder<h. Nếucustombudgetthấp, bỏfloor(backlog/h)*h vào droppedActiveWallTime, giữ fractional remainder; không tăngscientificdt. Numericclockepsilon1e-12s chỉ cho soaccumulator, khôngmassepsilon.

Pause/hidden clears fractional remainder vào droppedActiveWallTime (đây là active time đãthu nhưngbỏ), lastFrameTimestamp=null. Hidden/paused duration không được cộng vào droppedActiveWallTime vì không thuactive delta. Visible/resume firstframe dt0, không dùngwallgap. Visibility có flag suspend riêng vớiuserpaused; nếu trước hidden đangrunning thì visible có thể tiếp tục, nhưng manualsamplescleared. Contextloss chọnpauseexplicit, restored vẫn paused chờresume.

h configurable cho tests: h1/120→maxSteps12 giữmaxDelta.1, không giữ6rồiclaimdtmodel sai. elapsed=tickIndex*h. FPS replayharnessinjectcommands tại tickBoundary chứkhông frame gầnnhất; mỗi step kiểm duecommands trướcstep kế. Pausedcommands cùngtick vẫn được replayflush theoordinal, resume ởcurrenttick đểthoát; timeline đặtfuture-tickresume khiđangpaused màkhôngcontrol-event tới phải fail harnessdeadlockdiagnostic, khôngspin.

Numeric examples: dt5s/remainder0/h60→6steps=.1simseconds,dropped4.9s,remainder0. dt1/240×4→1step h60,remainder0 trongclockepsilon. N30/60/120frames cùng10sactive+same ticktrace→600steps; h120→1200steps vớibudgettương ứng.

## 8. Numerical epsilon, labels, visibility và thời gian demo

Không dùng numerical epsilon để quyết định toàn bộ UX:
- Mass eps=max(1e-8g,1e-9*totalg) chỉ invariant. Không snap residualmass trong MVP.
- Significance label threshold L(total)=max(.01g,.01*totalg). Hysteresis cho near-complete: enter residual<=L, exit residual>1.2L. Đường “đã tan gần hết” không phải Gu=0.
- W0→capacity0,saturationRatio=null/N/A,dissolutionProgress=null. W>0: saturationRatio=Gd/capacity. “Gần bão hòa” enter>=.99,exit<.98; “đạt giới hạn trong sai số” chỉ gap<=eps. Không label saturated vì không cónước.
- “Có đường dư so với sức chứa” iff Gt>capacity+eps vàW>0; “còn đường rắn” khiGu>L(Gt). Gd/min(Gt,capacity) là tiến độ lượng **có thể** tan, denominator0→N/A; hiển thịtổngGt riêng.
- Mixing iff |omegaDrive|>=.05rad/s; residualflow khi drive nhỏ nhưng|omegaFlow|>.02rad/s. Settling nếuSs>L(St) và dSs/dt<−1e-4g/s; separating nếuOd>L(Ot) và dOd/dt<−1e-4g/s. Predicate ưu tiênpaused/no-water/dry trướcprogress; cả settling/separating có thểđồngthời.
- Visual hide pool khi mass<.001g; khôngxóa ledger. Bảng vẫn “<0,1g”. Threshold hide kháclabel, khôngảnhlàmtruth.
- Equilibrium diagnostic nếu |omegaFlow|<.001rad/s và max|phaseRate|<1e-5g/s liên tục5simseconds; MVP không tựpause/stopclock vì condition này.

### 8.1 Thời gian mô hình dự kiến, không thời gian thực nghiệm

50/90/95% tính đối với lượng có thểchuyển. Fixed-I dùng k không đổi, t_p=−ln(1−p)/k. Auto dissolution fixture W100ml/G1g,radius.4,fullcontact,omegaFlow0,khôngsaturation cap: I(t)=Ieq*(1−exp(−2.8t)); integratedrate K=(.025+.25Ieq)t−(.25Ieq/2.8)*(1−exp(−2.8t)). Giải K=−ln(1−p), không dùngfixedI1 làm fastoracle.

| Điều kiện | 50% | 90% | 95% |
|---|---:|---:|---:|
| fixed I=0 | 27.73 s | 92.10 s | 119.83 s |
| fixed I=1 | 2.52 s | 8.37 s | 10.89 s |
| auto 1 rad/s contact1 | 12.85 s | 42.24 s | 54.90 s |
| auto 3 rad/s contact1 | 6.34 s | 20.43 s | 26.49 s |
| auto 6 rad/s contact1 | 3.72 s | 11.62 s | 15.03 s |
| sand rest water I0 | 4.62 s | 15.35 s | 19.97 s |
| oil rest I0 | 6.93 s | 23.03 s | 29.96 s |
| engine stop sand W100/O20/S10 Ss10 | 5.47 s | 17.38 s | 22.52 s |
| engine stop oil W100/O20/S10 Od18 | 7.35 s | 23.43 s | 30.37 s |

Hai hàng engine-stop dùng W100ml/O20ml/S10g, initialSs10g/Od18g/omegaFlow4.285714, stopt0, h1/60. Đây là phép tính từ equations v3, chưa chạy engine source. Tolerance thời gianmodel cho analytic/root1e-6s, displaytable.02s; step-integratedstopfixture±.05s. Khi integration thực tế contact thayđổi bởibed/regions, phải dùngstatefixture kiểmchuẩn, khôngép UXsốđúng bảng.

Mục tiêu UX: thấybiếnđổi trong≤3s khiauto fullcontact; quantile95 đườngfast khoảng15s, cát/dầurest khoảng20–31s; người dùng đượchướngdẫnchờkhi nghỉnềnkhoảng120s. Kiểm3scenario browser trước tuning; muốn đổi rates phải versionconstants/spec/oracles/re-estimate, **không thêm timeScale âm thầm**.

## 9. RNG, transport và render-copy contract

Scalar physics deterministic, không gọi RNGvisual. Visualsampling stateless hash32(seed,generation,material,index,birthOrdinal), mọi keysđượcrecord; Nkhác khônglàmtiêuthụstreamchung. Retainedindex giữ nguyênbirthOrdinal nếuNđổi; newindices dùnghashriêng. Rejectedcommands không đổi birth counters hoặcscience. Reset cùng seed táilập patterntronggeneration mới theo keyđãquyđịnh; replay so cảgeneration, khôngđòipattern bằnggkhác.

Transport giữv2: horizontal=.25*omegaFlow*(-z,x)*falloff; vertical=.1I*seededboundedfield−settleSpeed(sugar/sand) hoặc+riseSpeed(droplets); drag4/s, settle .08water/.03oil sceneunits/s,rise.06sceneunits/s. pNext=p+vNext*h, v relax vềfield bằngexp(−drag*h); clamptoregion theo§4, bỏoutwardnormalvelocity. fGu/Ss/Od làmassstate truth, weightrepresentatives phải sumđúngpha. Reconciliation aftercommand hoặctransfer không tựđổiphysics.

Engine private typedarrays. copyRenderFrame(target) **copy mọi active slice** sangarrays do renderer sởhữu; metadata/version từcùngsynccapture. Caller mutate output đượcnhưngkhôngtácđộngcore. Khôngunsafegetter trảtypedarrayview, không SharedArrayBuffer baseline. Target valid chođếnlầncopy kế, renderer có thểreusespace; no promisesaliaslifetime. Capturedframe gồmconsistentgeneration/stateVersion/renderRevision; từchối dùngoldgeneration sau reset/remount. Snapshot scalar copy nestedobjects mỗi publish10Hz hoặc forcedcommand; freeze dev giúp bắt nhầm, test mutateởprod-shapedobject phảivẫnkhôngảnhhưởngcore.

Stock vessels chỉnguồntrựcquan procedural, khôngsubscribe phasepools hoặcdùngmass thí nghiệm làmkho tồn.

## 10. Invariants và evidence

Giữv2: |Gu+Gd−Gt|,|Sb+Ss−St|,|Ol+Od−Ot|,|W−rhoW*Wml|<=eps(total); Gd<=S0W+eps; allfinite/nonnegative; reserve<=500000milli-ml; W0→Gd0/Od0; bounds/poolmemberships theo§4; |omega|<=8; scalartrajectory independentN. Khi numeric driftvượt eps, failtest/devdiagnostic, khôngclamp tổng mù.

Scientificoracle dùngscalarstate, regionnumeric/boundsoracle dùngmath; browserchứngminhinteraction/render. Không dùngimage làm massoracle. Checks sourcev2 là lịch sử; các SC case v3 chưa chạy. Testcase defaults vàchi tiết bên dưới là contract, không test skeleton đãimplemented.

## 11. Case catalog v3

### 11.1 Fixture và evidence chung

Mọi case mặc định seed=1729, generation0, h1/60, clock paused ởtick0; khi setup nói run thì resume trước rồi áp timeline. Unit fixture factory có thể inject phase state hợp lệ và constantI, không gọi command add để tạo pha đãtan/đãphân tán. F=water100ml/fullcontact,radius.4; D=water10ml/sugar30g; S=water100ml/sand10g; O=water100ml/oil20ml; M=water100/sugar10/sand10/oil20; L=water100/sugar1; X/T/Ddry/Ooil là bảng§4. Fixture I1 là unit intensity, khôngautoengine.

Timeline dùng scientific tick/ordinal; pointertrace dùng input ms rồirecord appliedtick, khôngwallframeinjection. Mỗi log case phải có ID/task, seed/generation, commands/acks/ticks, expected vs actual scalar/range và đơn vị, renderregions/bounds nếu có, browserdevice/evidence nếu cần. Không claims pass trong tài liệu kế hoạch.

| Case | Setup / seed1729 / timeline | Expected scalar/range | Expected visual/UI | Tolerance có đơn vị | Task | Evidence cần lưu |
|---|---|---|---|---|---|---|
| SC-IN01 | Z; tick0 dispatch từng malformed/unknown/sai bước từ §1.1 | NaN/Infinity/negative/0/unknown ID/sai bước: reject nguyên tử | UI ack/reject đúng, totals hiển thị exact ticks | inputticks/ackexact; phases eps(g) | V1-04, V2-01 | Unit/integration log seed/tick/command/expected/actual |
| SC-IN02 | Z; tick0 10 unique add0.1g sugar | 10×0.1→1.0 đúng input ticks; display tương ứng | UI ack/reject đúng, totals hiển thị exact ticks | inputticks/ackexact; phases eps(g) | V1-04 | Unit/integration log seed/tick/command/expected/actual |
| SC-IN03 | Z; tick0 W500ml rồi oil0.1ml; riêng D chạy tan và thử add vượtreserve | Reservation đúng 500000 nhận, thêm 1 tick khi vượt từ chối; không nhả chỗ khi tan | UI ack/reject đúng, totals hiển thị exact ticks | inputticks/ackexact; phases eps(g) | V3-01 | Unit/integration log seed/tick/command/expected/actual |
| SC-IN04 | Z; tick0 per-add=max vàmax+.1 cho từngchất; reset→stale envelope | Per-add max mỗi chất, reset, queue stale generation | UI ack/reject đúng, totals hiển thị exact ticks | inputticks/ackexact; phases eps(g) | V2-01, V2-09 | Unit/integration log seed/tick/command/expected/actual |
| SC-F01 | F; tick0 rod1/3/6, run600ticks; unitcompareanalytic | omegaF đáp ứng analytic, signed direction và speed order | Rod/flow hướng đúng, camera gate theo state | mass eps(g); numeric1sfixtures≤1e-6g; pose≤1e-6units | V2-03 | Unit/integration log seed/tick/command/expected/actual |
| SC-F02 | F; omegaFlow4.285714, tick0stop, run60ticks; thêm dryZ | Stop không zero instant, exponential decay; dry no-flow | Rod/flow hướng đúng, camera gate theo state | mass eps(g); numeric1sfixtures≤1e-6g; pose≤1e-6units | V2-03 | Unit/integration log seed/tick/command/expected/actual |
| SC-F03 | Fmanual; +π−.01→−π+.01 trong16ms; dt0/âm, tâm | ±π unwrap, r≈0, dt=0/âm, tốc độ chuột và cap | Rod/flow hướng đúng, camera gate theo state | mass eps(g); numeric1sfixtures≤1e-6g; pose≤1e-6units | V2-06 | Unit/integration log seed/tick/command/expected/actual |
| SC-F04 | Fmanual; ray parallel/outside/startpose.4,tip.14; tick0drag | Pose radial/base bounds, ray invalid, capture/cancel/blur | Rod/flow hướng đúng, camera gate theo state | mass eps(g); numeric1sfixtures≤1e-6g; pose≤1e-6units | V2-05, V2-07 | Unit/integration log seed/tick/command/expected/actual |
| SC-D01 | Z; tick0G10g/O100ml, resume600ticks khôngnước | W=0 với đường+dầu hoặc chỉ đường: Gd=0 mọi tick | Sugar solids giảm theoGu, dư/near-cap đúnglabel | mass eps(g); numeric1sfixtures≤1e-6g; pose≤1e-6units | V3-02 | Unit/integration log seed/tick/command/expected/actual |
| SC-D02 | D; fixedI0 vàI1, run60ticks tức1s | Numeric W=10/Gt=30/I=0,1 sau 1 s khớp analytic khi I giữ cố định | Sugar solids giảm theoGu, dư/near-cap đúnglabel | mass eps(g); numeric1sfixtures≤1e-6g; pose≤1e-6units | V3-02 | Unit/integration log seed/tick/command/expected/actual |
| SC-D03 | D; fixedI1, run36000ticks=600s | Long run saturation không vượt 20 g, còn dư ≥10 g trong tolerance | Sugar solids giảm theoGu, dư/near-cap đúnglabel | mass eps(g); numeric1sfixtures≤1e-6g; pose≤1e-6units | V3-02 | Unit/integration log seed/tick/command/expected/actual |
| SC-D04 | D; fixedI0/1, cùng W/Gt, 60/600ticks | Khuấy đổi tốc độ, capacity không đổi; Gd không giảm | Sugar solids giảm theoGu, dư/near-cap đúnglabel | mass eps(g); numeric1sfixtures≤1e-6g; pose≤1e-6units | V3-02 | Unit/integration log seed/tick/command/expected/actual |
| SC-D05 | D gầncap; tick600addW10ml, tick601addO20ml | Thêm nước sau khi gần bão hòa: tan tiếp; add oil không tăng capacity | Sugar solids giảm theoGu, dư/near-cap đúnglabel | mass eps(g); numeric1sfixtures≤1e-6g; pose≤1e-6units | V3-02 | Unit/integration log seed/tick/command/expected/actual |
| SC-D06 | Z/T; Gu0 hoặcW0 hoặcG.1/W.1, tick0→60 | Gu=0, water=0, tiny amounts: không division/NaN | Sugar solids giảm theoGu, dư/near-cap đúnglabel | mass eps(g); numeric1sfixtures≤1e-6g; pose≤1e-6units | V3-02 | Unit/integration log seed/tick/command/expected/actual |
| SC-S01 | M gồm16subsets, seed1729, run3600ticks | Cát không tạo dissolved ở mọi combo | Sand bed/suspended đúngregion, không dissolved | mass eps(g); numeric1sfixtures≤1e-6g; pose≤1e-6units | V3-03 | Unit/integration log seed/tick/command/expected/actual |
| SC-S02 | S vớiSb10,Ss0; unitI1,60ticks | Intensity lớn có Ss tăng từ bed; số trong [0,St] | Sand bed/suspended đúngregion, không dissolved | mass eps(g); numeric1sfixtures≤1e-6g; pose≤1e-6units | V3-03 | Unit/integration log seed/tick/command/expected/actual |
| SC-S03 | S vớiSs10; fixedI0,60ticks | I=0 constant: Ss10→8.6071 g sau 1 s; mass invariant | Sand bed/suspended đúngregion, không dissolved | mass eps(g); numeric1sfixtures≤1e-6g; pose≤1e-6units | V3-03 | Unit/integration log seed/tick/command/expected/actual |
| SC-S04 | DdryG10/S10→O100→W100 tick0/60/120; reverse branch | Dry→oil/water, oil-only settle; không nhầm carrier | Sand bed/suspended đúngregion, không dissolved | mass eps(g); numeric1sfixtures≤1e-6g; pose≤1e-6units | V3-03 | Unit/integration log seed/tick/command/expected/actual |
| SC-S05 | S wet; omegaFlow4.285714, tick0stop,600ticks | Stop có flow inertia, sand settling liên tục | Sand bed/suspended đúngregion, không dissolved | mass eps(g); numeric1sfixtures≤1e-6g; pose≤1e-6units | V3-03 | Unit/integration log seed/tick/command/expected/actual |
| SC-O01 | Z→O20ml hoặcW100ml riêng,600ticks | Oil-only hoặc water-only: Od=0 | Oil layer/droplet tách đúng, không doublevolume | mass eps(g); numeric1sfixtures≤1e-6g; pose≤1e-6units | V3-04 | Unit/integration log seed/tick/command/expected/actual |
| SC-O02 | O Ol18/Od0, fixedI1,60ticks | Water+oil với I>0: droplets tăng, layer giảm cùng mass | Oil layer/droplet tách đúng, không doublevolume | mass eps(g); numeric1sfixtures≤1e-6g; pose≤1e-6units | V3-04 | Unit/integration log seed/tick/command/expected/actual |
| SC-O03 | O Od9/Ol9,fixedI0,60ticks | Nghỉ I=0: Od9→8.1435 g sau 1 s, layer bù đúng | Oil layer/droplet tách đúng, không doublevolume | mass eps(g); numeric1sfixtures≤1e-6g; pose≤1e-6units | V3-04 | Unit/integration log seed/tick/command/expected/actual |
| SC-O04 | O Od9,omegaFlow4.285714,stop,3600ticks | Flow decay → Od giảm dài hạn; no dissolved oil | Oil layer/droplet tách đúng, không doublevolume | mass eps(g); numeric1sfixtures≤1e-6g; pose≤1e-6units | V3-04 | Unit/integration log seed/tick/command/expected/actual |
| SC-O05 | L1 fixture trong §4, query render ởtick0 | Render layer+droplet reserve không double-count | Oil layer/droplet tách đúng, không doublevolume | mass eps(g); numeric1sfixtures≤1e-6g; pose≤1e-6units | V3-04, V4-03 | Unit/integration log seed/tick/command/expected/actual |
| SC-P01 | M; N10/100/700, replay600ticks cùng seed | N=10/100/700 đại diện cho cùng mass, cùng khoa học | Pools đúngbounds, không massoracle từảnh | mass eps(g); bounds≤1e-6scene units | V3-05 | Unit/integration scalar+region logs; browserảnh chỉbổsung |
| SC-P02 | M; pools initialized, run36000ticks | Mọi vị trí hữu hạn trong bounds sau 600 s sim | Pools đúngbounds, không massoracle từảnh | mass eps(g); bounds≤1e-6scene units | V3-05 | Unit/integration scalar+region logs; browserảnh chỉbổsung |
| SC-P03 | L; run600ticks, reconcile theoGu; injectedGu0fixture riêng | Dissolution/reweight không làm mất ledger; Gu=0 không hạt đường | Pools đúngbounds, không massoracle từảnh | mass eps(g); bounds≤1e-6scene units | V3-05 | Unit/integration scalar+region logs; browserảnh chỉbổsung |
| SC-P04 | T; W.1ml, clamp representative defaultdiameter.056 | Carrier height→0: không min/max đảo, không xuyên đáy | Pools đúngbounds, không massoracle từảnh | mass eps(g); bounds≤1e-6scene units | V3-05 | Unit/integration scalar+region logs; browserảnh chỉbổsung |
| SC-P05 | M; samegeneration replay; pause ởtick120, kiểmtick120 trước/sau no-command | Seed/reset/replay tái lập; paused positions bất biến | Pools đúngbounds, không massoracle từảnh | mass eps(g); bounds≤1e-6scene units | V3-05 | Unit/integration scalar+region logs; browserảnh chỉbổsung |
| SC-M01 | 16subsets liềuM undercapacity;0→3600ticks | 16 subsets gồm empty, mỗi trường hợp 60 s sim | 4chất labels/totals đúng, không áp transient-equality sai | mass eps(g); numeric1sfixtures≤1e-6g; pose≤1e-6units | V3-07 | Unit/integration scalar+region logs; browserảnh chỉbổsung |
| SC-M02 | 24orders W100/G10/S10/O20, acceptedcommands tick0→3 | 24 permutations đủ bốn chất liều nhỏ: input ledger giống, trạng thái động có thể khác | 4chất labels/totals đúng, không áp transient-equality sai | mass eps(g); numeric1sfixtures≤1e-6g; pose≤1e-6units | V3-07 | Unit/integration scalar+region logs; browserảnh chỉbổsung |
| SC-M03 | M; add.1g/ml tại ticks0/60/120 và pausedtick120 | Thêm giữa chừng khi auto/manual/rest/paused; totals chỉ tăng khi accepted | 4chất labels/totals đúng, không áp transient-equality sai | mass eps(g); numeric1sfixtures≤1e-6g; pose≤1e-6units | V3-06, V3-07 | Unit/integration scalar+region logs; browserảnh chỉbổsung |
| SC-M04 | W10/G30/S10/O20; fixeddriveauto1→600ticks | Saturated sugar + sand + oil: mọi invariants đồng thời | 4chất labels/totals đúng, không áp transient-equality sai | mass eps(g); numeric1sfixtures≤1e-6g; pose≤1e-6units | V3-07 | Unit/integration scalar+region logs; browserảnh chỉbổsung |
| SC-M05 | X reserve495ml; addW5ml rồi addO.1ml samecontrolflush | Liều sát capacity và lượt reject không thay seed/totals/compartments | 4chất labels/totals đúng, không áp transient-equality sai | mass eps(g); numeric1sfixtures≤1e-6g; pose≤1e-6units | V3-07 | Unit/integration scalar+region logs; browserảnh chỉbổsung |
| SC-M06 | W100/G10 input khác timeline tick0/600; compareinputonly | Cùng final totals khác timeline: không assert state transient bằng nhau | 4chất labels/totals đúng, không áp transient-equality sai | mass eps(g); numeric1sfixtures≤1e-6g; pose≤1e-6units | V3-07 | Unit/integration scalar+region logs; browserảnh chỉbổsung |
| SC-N01 | M; commands recorded at ticks0/120/240; render30/60/120FPS→tick600 | 30/60/120 FPS cùng timeline/fixed step cho scalar state sai khác ≤1e-6 g/rad | Không claim browser/FPS đãđo bởi unitclock | mass eps(g); N01≤1e-6 g/rad, N05≤1%inputg/poseRMS.05units; N04 clock≤1e-12s | V3-08 | Unit/integration log seed/tick/command/expected/actual |
| SC-N02 | M; run36000ticks, assert mỗi step | 600 s sim, assert error mỗi tick ≤epsilonMass | Không claim browser/FPS đãđo bởi unitclock | mass eps(g); N01≤1e-6 g/rad, N05≤1%inputg/poseRMS.05units; N04 clock≤1e-12s | V3-08 | Unit/integration log seed/tick/command/expected/actual |
| SC-N03 | Z; seed1729 chọn1000command inputs bounded, fixedreplay | Random commands fixed seed, ghi max error và không NaN | Không claim browser/FPS đãđo bởi unitclock | mass eps(g); N01≤1e-6 g/rad, N05≤1%inputg/poseRMS.05units; N04 clock≤1e-12s | V3-08 | Unit/integration log seed/tick/command/expected/actual |
| SC-N04 | F; advance5s h60/maxSteps6, remainder0 | 5 s frame gap: không chạy bù, tối đa6steps; sim t và droppedWallTime đúng policy | Không claim browser/FPS đãđo bởi unitclock | mass eps(g); N01≤1e-6 g/rad, N05≤1%inputg/poseRMS.05units; N04 clock≤1e-12s | V2-02, V3-08 | Unit/integration log seed/tick/command/expected/actual |
| SC-N05 | M; 10simseconds h60/max6 vs h120/max12 | h=1/120 vs1/60 cho 10 s cùng drive: mass invariants vẫn strict, phase amounts khác ≤1% input và pose RMS≤0.05 scene units | Không claim browser/FPS đãđo bởi unitclock | mass eps(g); N01≤1e-6 g/rad, N05≤1%inputg/poseRMS.05units; N04 clock≤1e-12s | V3-08 | Unit/integration log seed/tick/command/expected/actual |
| SC-C01 | Z; seq1addW100/seq2resume ở pausedtick0 | W100,time0 sauadd; resumeacceptedngay; step1 mớitimeh | Bắtđầu/tiếp tục phảnhồi ngay, khôngdeadlock | 0ticks exact; W epsg | V2-01, V2-10 | Integration ack/snapshot before/after |
| SC-C02 | Z; sameflushseq1W499.9/seq2W.1/seq3O.1 | Reserve499900→500000; lastCAPACITY, qO0 | 2 accepted/1 error dùUIchưa10Hzpublish | integer milli-ml/seq exact | V1-04, V2-01 | Integration authoritativequeue log |
| SC-C03 | Z; add100→reset→add50 (§3.3) tick0 | g1/v3/qW500/W50, paused/time0 | Hiện50ml, không resurrect100 | g/v/ticks exact; mass epsg | V2-01, V2-10 | Ack trace and UIunit |
| SC-C04 | SauC03 replayresetseq2; seq5/seq6distinctresets | duplicatekhôngg++; distinctg2/v4 rồig3/v5 | Stale originalack không ghiđèlatest | seq/g/version exact | V2-01, V2-09 | Dedup reset integration |
| SC-C05 | C03 rồi captureg0pointerseq4/staleackg0 | STALE_GENERATION, g1/v3/W50 giữ | Camera/canvas mới không nhận samples cũ | mass epsg; versions exact | V2-01, V2-07 | Oldcapture/ackreorder fixtures |
| SC-C06 | Z; 300valid unique pausecommands rồi replayseq1 vàseq300 | cache≤256; seq1DUPLICATE_EXPIRED; seq300originalduplicate; khôngreapply | Không tràn history/acks hoặc đổistate | count/seq exact | V2-01 | Cache size and snapshot comparison |
| SC-C07 | Z; addW100 khi paused, readZsnapshot trướcnextframe | forcedpublish snapshotv1, W100,tick0 | Form/results cậpnhậtngay không đợiRAF | versions exact; 0s time | V2-10, V4-01 | Integration publish counter |
| SC-R01 | O fixture §4: O100ml,S10g,Ss6/Sb4 | bed2.4/aq0/oil103.6,Ol90,Od0; solidsboundsoil | Cát lơlửng trong chính dầu, không khối dầu kép | volume1e-9ml; y1e-6units; mass epsg | V1-05, V3-03, V4-03 | Numeric volumes+membership; browseroil-only |
| SC-R02 | DryG10/S10→O100 tick0→W100 tick60; reverse W→O branch | Gd0 trướcnước; sauaddW Gdcũgiữ và vềsau tăng; sumregions=reserve | Region chuyển oil-only→mixed đúngpool | mass epsg; sumvol1e-9ml | V3-03, V3-04, V3-06 | Timeline and region arrays |
| SC-R03 | L0/L1/X fixtures §4 querytick0 | L1=0/110/10ml; X=74/371/50, total495 | Layer giảm theoOl; droplet volume chỉtrongaq | volume1e-9ml; y1e-6units | V4-03 | Mathfixtures and browsercomparison |
| SC-R04 | M pausedtick120, addS1g làmbedtopthayđổi | Oldparticles trongbounds giữp/v; outsideprojectonly; elapsedgiữ | Geometryhiệnaddkhông chạyphysics/affinestretch | p/v1e-6units; elapsed0sdelta | V3-05, V3-06 | Before/after arrays+state |
| SC-R05 | T W.1ml, rồi addG.1/S.1 pausedtick0 | No minY>maxY; radius≤height/2 khi thin; zeroregion noactivepool | Hạtkhôngxuyênđáy hoặcNaN; remapchỉcầnthiết | bound1e-6units; mass epsg | V3-05, V4-02 | Thin/zero region fixtures |
| SC-H01 | W.1/G.1, auto6radius.4;0→60ticks | contact0/drive0/flow0 nhưngGd>0 vìcónước | Thìachưachạmliquid; không swirlgiả | flow1e-9rad/s; mass epsg | V1-05, V2-03 | Contact+chemistry independenttest |
| SC-H02 | W7ml/G0,auto6,r.4,tip.14 | liquidtop.1494,c=.047,drive=.282rad/s; omegaEq≈.2014286 | Partialcontact khácfull, dryflow0 | contact1e-9; flow1e-6rad/s | V1-05, V2-03 | Analyticcontactandcoupling |
| SC-J01 | Fmanual t0pose(.3,.2),pointerplane(.1,.1), down rồimodeauto | downpositiongiữoffset(.2,.1); autostartposegiữ, r→.4 sau.25s | Khôngteleportdown/modeswitch | p1e-9units t0; bounds1e-6units | V2-04, V2-05, V2-07 | Unitposecurve+browser |
| SC-J02 | Fmanual move ở input0/16ms, holdđến200ms khôngup | watchdogdrive0 sau150ms+1hostframe; flowdecay | Giữchuộtđứngyên khôngkhuấyvôhạn | timeout150ms+frame; flowanalytic1e-6rad/s | V2-06 | Monotonicfakeinputclock + recordedrelease |
| SC-J03 | Mdragactive, từngevent cancel/lostcapture/blur/hidden/hideRod/pause/reset/unmount | §6transitiontable đúngowner/drive/samples/generation; khôngduplicateowner | Cameraphụchồi, no stuckdrag; hideRod khôngẩn drive | capture/loopcounts exact; mass epsg | V2-07, V2-08, V4-10 | State machine + browser eventlog |
| SC-J04 | Fmanual, xuyênr<.0435 rồiđốidiện; gap200ms; pointerId2 | entryclearhistory, exit2samples, gapanchoronly; id2ignored | Không angularspike hoặc secondpointertakeover | abs(omega)≤8rad/s; samplecount exact | V2-06, V2-07 | Pointertrace fixtures |
| SC-U01 | Z then W10/G30 fixtureGd19.8; Gu.0005 fixture riêng | W0 ratio/progressnull; ratio.99nearlabel, .98hysteresis; residualnot0 | N/A khi khôngnước; <0,1g vẫnledger; hiddenpoolkhôngzero | predicatesexact; epsg unchanged | V4-04, V4-02 | Selectors threshold table |
| SC-U02 | W10/G30/Gd19.9/Gu10.1; paused then resume | progress19.9/20=.995, Gd/Gt=.6633khôngdùngprogress; capacity20 | Cóđườngdư, gầncap, khônglabeltấtcảđườngđãtan | ratio1e-9; mass epsg | V3-02, V4-04 | Selectors + UC1 teachingcheck |
| SC-A01 | Paused baseline W100,G10/Gd5/fGu.4,S10/Ss3,O20/Od9; addG1/S1/O1/W1 | W101;Gu6/Gd5/fGu1/3;Sb8/Ss3;Ol9.9/Od9;timegiữ | Chấtmới ởbed/layer, khôngtang/treongay | mass epsg; f1e-9; time0sdelta | V2-01, V3-01, V3-06 | Exact phaseallocation before/after |
| SC-B01 | M copyScalar/copyRenderFrame rồi mutate nested/W/positions | Corestate/nextstep nhưcontrolengine, noalias | Mutaterenderoutput không đổi khoa học | mass epsg; arraysbyteisolation exact | V1-07, V3-05, V4-01 | Mutation tests prod-shaped outputs |
| SC-B02 | M same seed/generation/timeline,N10/100/700,600ticks | Mọi scalartrajectory như nhau; retainedhashindexkeys ổnđịnh | Visualdensitykhácđược phép, no masschange | scalar1e-9g/rad; seedkeys exact | V3-05, V3-08 | Replaytrajectory+samplingkeys log |
| SC-B03 | M20cameraRemount +20scientificresetcycles riêng | Camera:ghóa họcgiữ/1loop; scientificreset:g++mỗiID vàempty/paused | No ghostlisteners/resources; khôngnhầmresetcamera | owner/loop/listenercounts exact; mass epsg | V2-08, V4-01 | Fake scheduler and browser20cycles |
| SC-T01 | M tracecommands tại tick0/120/240,0→600 ở30/60/120FPS | State/tick/acks consistentboundary; khôngframe-nearestinjection | Scene chỉsamplefrequencykhác | scalar1e-6g/rad; tickexact | V2-02, V3-08 | Logicaltick/ordinal replay logs |
| SC-T02 | F runningtick120,remainderh/2→hidden5wallseconds→visible | clearremainder/drop h/2; gapkhôngdropactive; firstdelta0; tickgiữtớinextstep | Nofast-forward; manualrequiresnewdrag | clock1e-12s; tickexact | V2-02, V2-07 | Clock/visibility fake timestamps |
| SC-T03 | Z advance0 rồi4×1/240; Fadvance5s, compareh60/h120 | dt0noop, h60one stepquad; gap6steps/drop4.9s; h12012steps | Clock khôngspiral; UI timeconsistent | clock1e-12s; budgetexact | V2-02, V3-08 | Accumulatorfixtures |
| SC-W01 | Browser init WebGLfail; fallbackaddW100 paused; retryCanvas | W100/generationgiữ, noengine/loopmới | Hướngdẫnretry/reloadrõ, formcòn dùng | versions/countsexact; noobservedconsoleerrorngoàiexpectedfailure | V1-03, V4-10 | Browser initfailure log/screenshot |
| SC-W02 | M runningtick120drag, WEBGL_lose_context lost→restore | Pause/time/massgiữ, captureclear; restoredstaypaused, resumefirstdelta0 | Retry không resetexperiment; unsupportedextension=BLOCKEDcase | mass epsg; ownercount1 | V4-10 | Browser context events/counters |
| SC-W03 | M resize/DPR1→1.5→2,20remount/resetcameracycles | No monotonicresource/listenergrowth afterwarmcache, loop1 | Canvasresize/alphacorrect, sciencegiữ | loop/listenercounts exact; resourcesplateaubenchmarkpolicy | V4-10, V4-05 | OS/GPU/browser/DPR and counters |
| SC-W04 | X fixture495ml,N700eachpool; reset/refill trước mỗi window, warm5s rồi30sauto hoặcmanual | medianFPS≥30,p95frame≤50ms eachwindow; ledgerinvariant | Realinteractive viewport1366×768DPR1.5; mobile390×844 riêng | FPS/frame ms measured; mass epsg | V4-05 | Rawframeintervals/drawcalls/instances + device logs |
| SC-W05 | HTTP productionpreview root/basepath; reload; missinglazyasset | 200assetpathswhenvalid; missingchunkfallbacknoresetengine | Usefulloadfailure/retry, localartifactverifiedkhông cầnhost | HTTPstatusexact; mass epsg; nounexpectedruntimeerrors | V4-09, V4-10 | HTTP requests + browserconsole/screenshot |

## 12. Giới hạn và điều kiện nghiệm thu

Precision0.1 và capacityreservation minh họa là default đãchọn cho MVP; không thêm câu hỏi xác nhận lại kỹthuật thườngngày. Product fullMVP giữ nguyên; calibrated quantitative accuracy hoặc manualtouch/fullCFD là scope mới cần yêu cầu khác. Coefficients chưavalidated; khoa họcđịnh tính/invariants phảipass nhưng không suyrađộ chính xác đođược.

Browser thiếu→giữ BLOCKED ở bước nghiệm thu cần browser, làm core/math độc lập khi được phép code. Các công thức/numericexamples/estimates v3 đã được kiểm toán tài liệu không đồng nghĩa engine runtime đã viết.
