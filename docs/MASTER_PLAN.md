# Master Technical Plan — Virtual Solubility Lab 3D v3

2026-10-17 · **Tài liệu đề xuất, chưa cho phép viết runtime trong lượt này**. Sửa contract theo review, giữ project/stack/source. Không scaffold, package install, browser install, host setup hoặc deploy.

## 1. Nguồn chuẩn và giá trị bằng chứng

[IMPLEMENTATION_TASKS.md](IMPLEMENTATION_TASKS.md) là nguồn duy nhất task/status/dependencies/O-L-P. Các bảng estimate ở đây được **tính từ catalog**, không phải nguồn giờ độc lập. [SCIENTIFIC_SPEC.md](SCIENTIFIC_SPEC.md) giữ schema/đơn vị/commands/regions/equations/thresholds/case72. [task_plan.md](../task_plan.md) giữphase/NextStep; [findings.md](../findings.md) giữdecision/evidence; [progress.md](../progress.md) giữlog. TEST_CASES giữbrowser/benchmark/scenario; ARCHITECTURE vàASSUMPTIONS mô tảsourceNgày1 vàlinkđếnproposal.

User yêu cầu “đọc file rồi fix plan”; review R01–R20 được đối chiếu và chọn defaults có lý do, không tự coi phần prompt tham khảo trong review là quyền viết code. R01–R07 là contract defects trong plan, không gọi source đang cóbugP0. Không tạo bản task_plan(7).md theo tênattachment. Giá trị sourcecheckv2 là lịch sử; v3 không auditlặp khihashkhông đổi.

## 2. Hiện trạng và delta

Stack hiện tại: React/ReactDOM 19.3.1, Vite 6.4.4, TypeScript 5.8.3, Three 0.180.0, Fiber 9.8.2, Drei 10.7.9, Zustand 5.0.15, Tailwind 4.3.3, Vitest 5.0.5, ESLint 9.39.5. `npm ls --depth=0` không báo package missing/invalid. Không đổi framework hoặc cài package trong re-plan.

Module hiện có:

```text
src/app/App.tsx                 composition + lazy scene
src/components/layout         header
src/components/ingredients    custom amount forms
src/components/controls       camera/reset/show rod, chưa stirring/pause
src/components/results        totals + visual capacity, chưa scientific results
src/scene                     geometry/material tĩnh, instanced representative particles
src/stores/experimentStore    add/reject/reset, view flags, history
src/simulation/core           state/clock/engine interfaces only
src/simulation/models         four interfaces only
src/simulation/constants      input definitions + visual occupancy
src/simulation/tests          three store tests
src/interactions, workers     README only; không runtime controller/worker
src/app/providers             README only; hiện chưa cần provider riêng
public/models                 giữ chỗ .gitkeep, không external models
```

Giữ: cấu trúc module, UI foundation, validation hiện có làm baseline, danh sách chất, geometry cốc/bàn/thìa, vật liệu và instancing, camera, typecheck/lint/test/build setup. Mở rộng: store actions thành command bridge, state contract phân pha, render mapping, controls/results. Sửa có căn cứ: precision mismatch, bounds số lặp, camera reset remount không được làm reset science. Không viết lại CSS/scene chỉ vì dòng dài.

Thiếu thực tế: stock vessels 3D cho từng nguyên liệu, auto/manual controller, engine/clock runtime, mass compartments, scientific transfer logic, particle transport, phase-based render, pause/resume và giải thích. Các file interface không được tính implemented runtime. Browser QA hiện không có tool; không xác nhận camera/alpha/fallback chỉ từ build.

Bằng chứng **lịch sử v2**, không chạy lại trong lượt v3: gọi entry points Node cho typecheck/lint/test/build pass; 3 store tests. npm script wrapper lại exit 1 không diagnostic trong lượt v2, V1-02 phải xác minh cách chạy tái lập. Build cảnh báo scene 915.64 kB / 248.25 kB gzip; đây là cảnh báo tải/bundle, không lỗi khoa học hoặc runtime đã xác nhận. Không có scientific tests runtime nào vì engine chưa viết.

Đối chiếu v3: source/public/config/lock SHA-256 khớp v2; spot-check call path IngredientCard submit→store.add→capacity/reject→scene đọc quantities. SceneBoundary/Canvasfallback cócode, không có bằng chứng contextloss hồi phục. Store chưa cóparserlocale/deci-units, snapshots khoa học; các interface vẫn chưa runtime. Không cóAGENTS.md được phát hiện ởworkspace/cáccha đãkiểm tra. Không có source delta yêu cầu re-audit toàn bộ.

## 3. Phạm vi, defaults và ownership

MVP vẫn đủ cốc/thìa/bốn cốcnguồnprocedural, thêm4chất bằngform theoquantities/thứ tựbấtkỳ, auto3levels/manualmouse, khoa họcđịnh tính+bảo toàn, kết quả/giải thích, stop/pause/resume/reset, responsive và **static artifact verified qua HTTP**. Khôngnhiệtđộ, gia nhiệt, CFD, backend/database/login, tồn kho/cốcđong, animationrót, modelngoài, undoredo hoặcworkerbắtbuộc. Publicpublish là V4-11 tùychọnngoàiDoDlocalartifact; shader/flow/particles/calibration V5ngoàiMVP.

Một engine thuầnTS cóinput ledger/phase masses/flow/rod/time. Mộtapp-owner sốngngoàiCanvas, mộtRAF scheduler. Zustand giữUIstate/actions/acks/detachedscalars, không mutabletotalsthứhai. Renderstate copied từcore sangcallerownedbuffers; khôngunsafealias. Scalar deterministic khôngvisualRNG, representatives cóstatelesshash32keyriêng. Input integer0.1g/ml, phasefloatg, visualreservation khôngmậtđộthật.

Default quyết định đãchốtđểtriển khai: parserstrictdấu. hoặcphẩy; initial/resetpaused; controlsflushđồngbộ; LRUack256+highwater; manualstale150ms; tiptheobed/contactoverlap; autotransi .25s; no mass snap; keepfastIeq.7143; mainthreadengine; nopublichostgate. Không cần hỏi lại từngdefault kỹthuật; nếu người dùng yêu cầu quantitativecalibration/manualtouch thìscope mới.

## 4. Data/control flow và tích hợp sớm

~~~mermaid
flowchart LR
  FORM[Form raw string] --> PARSE[Strict locale parser to integer ticks]
  PARSE --> FACADE[Single synchronous facade]
  PTR[Pointer adapter + watchdog] --> FACADE
  FACADE --> CTRL[Control flush validation generation ack]
  CTRL --> CORE[Authoritative engine]
  CLOCK[One fixed-step clock] --> CORE
  CORE --> SCALAR[Deep copied scalar snapshot]
  SCALAR --> Z[Zustand UI/results]
  CORE --> COPY[copyRenderFrame caller-owned arrays]
  COPY --> R3F[Mesh and rod refs]
~~~

Facade không đọcgeneration từUI snapshot10Hz; bindtừngcontrolintent từengine ngay lúcdispatch. Pointer giữcapturegeneration củađợtdrag, staleeventphảireject. Commands cóseq/ack/tickordinal; acceptedadd/reset/pause/resume publish ngay kểcảpaused; scientificadvance làđườngkhác. Replay dùngrecordedtick/controlordinal, không frame walltime gầnnhất. Exactschemas/timeline/phaseallocation SPEC§2–3.

### 4.1 Thứ tự work thực tế

- V1-04/V1-05/V1-07 chốtparser/bounds/statecontract; V1-02 timebox30phútlauncher cóNodefallback, V1-03 browserbaseline song song nếu cómôi trường.
- V2-01/V2-02 tạoenginecommands+clock; **V2-10 nốiadd/reset/ack/scalar/pose vào engine duy nhất ngay**. Không đểbản quantitiesNgày1mutable cùngscience.
- V3-01ledgerprimitive và V2-03flow làmđủđể V3-02dissolution; V2-04auto dùngbridge sớm.
- **V2-11 milestone nước–đường**: water100ml/sugar1g→start→tick→phase snapshot→UI/scene→pause/add.1g/resume/reset. Khônganimategiả, dùngdissolutionthật. Phânbiệt unitintegration evidence và browser evidence.
- Sauđóưu tiên mở rộng manual/cát/dầu/transport. Unitmath độc lập có thể song song trong khi browserblocked; dependencies không ép chờV1-03 cho mọi puremodel. V2-11 chỉcompletekhiđủbrowseracceptance; fullrelease V4-05 phụ thuộcV2-11.
- V4-01 **chỉ mở rộng** bridge/outputpools/phase selectors, khôngmigrationtotal/ownerlần2. V4-10context lifecycle có thể làm từ earlybridge/baseline, không đợi sciencecomplete.

### 4.2 Scheduler, ownership và snapshot contract

Owner created app-level, dispose listeners/RAF khiunmount; StrictMode replaymount phải1activeowner/scheduler. Canvasremount chỉattachnewrenderer, giữcoregeneration/time. Không cảRAFscientifictick lẫnuseFrame tick. scalarpublish10Hz khiadvance vàforcedpublish khiacceptedcommand; rendercopy/invalidatedemand mỗiactiveframe. Stop không ngừngscheduler, pause/hidden ngừngscientificadvance; resume resetlastframe/inputhistory.

Regions bốn trườnghợpbed/aqueous/oil và poolmembership SPEC§4. OilOnly solids ởoil envelope **có dầu nền**, không aqueousrỗng. Tipadaptbed, contactflowchỉkhiactive segment chạmregioncóliquid. Cốcnguồnkhôngsubscribeexperimentpool. ĐiềuchỉnhpoolN/quality chỉvisual, khôngmass/changeRNGscience.

## 5. Milestones và evidence gates

| Mốc | Task scope tham chiếu | Acceptance |
|---|---|---|
| M0 Contracts/baseline | V1-01…V1-07 | Runtime/placeholder phânbiệt, parser/bounds/schema; browserblocked ghi riêng |
| M1A Early owner/bridge | V2-01,V2-02,V2-10 | Add/reset/ack/scalar/pose dùng1engine, pausedflush cóevidence |
| M1B Water–sugar vertical slice | V3-01,V2-03,V3-02,V2-04,V2-11 | Model thật→UI/scene,pause/resume/reset; khôngclaimcát/dầu/manualxong |
| M2 Full stirring/science | V2remaining,V3remaining | Manual/stale/contact/lifecycle + tấtcảchemicalcases/invariants |
| M3 Local integrated artifact | V4-01…V4-10 trừprofiledeepoptional | Browser/benchmark/context/checks/docs/HTTPartifact |
| M4 Optional publish | V4-11 | URL/access/version verified chỉkhiyêucầupublish |
| Future | V5-01…V5-04 | NgoàiMVP |

M1B browser chưa có không đượccompletedverified; unitbranch vẫntiếnhành trongphạm viđượccho phép. Không lấpnhãnpassđểvừangày. Browserdefaults/evidence TECH§3–5 trong TEST_CASES; modelcases72 trongSPEC chưa đượcchạybởiviệcviếtdocument.

## 6. Estimate v3, uncertainty và đường găng

Giảđịnh một ngườiquenReact/Three,8giờcông/ngày, sourcehiện tại, mainthread/noexternalmodels, browser/HTTPpreviewkhảdụngkhi cần. Giờbao gồmlocaltests,cóoverheadtíchhợp; chờmôi trường/user/host ghi riêng, khôngquyđổi0giờ. O/L/P làkịchbản, khôngcamkết. Pđãphảnánh rủi ro nên khôngcộngthêmbufferchồng lênP; lịchlikely dùngL+20% cho lỗi phát sinh chưa xác định.

| Phase | Số task | O giờ MVP | L giờ MVP | P giờ MVP |
|---|---:|---:|---:|---:|
| 1 | 7 | 7 | 9.5 | 15.5 |
| 2 | 11 | 14 | 21 | 34.5 |
| 3 | 8 | 13 | 17.5 | 28.5 |
| 4 | 11 | 13.5 | 19.5 | 33 |
| 5 | 4 | 0 | 0 | 0 |

Phase4 có1OPTIONAL_DEPLOYtask khôngtính vàoMVP; Phase5 là4POST_MVPtasks vớiO15.5/L22/P33hngoàibảnggiờMVP. Taskcounttổng41; localMVP36task, optionalpublish1, postMVP4. Catalogchịutráchnhiệm mọiước lượng,status; cácsốởđây làsnapshotderivedv3.

- LocalMVP O=47.5h, L=67.5h, P=111.5h còn lại.
- L+buffer20%=67.5+13.5=**81h** còn lại, khoảng10.1ngày8h; cộngNgày1đãthực hiện→**khoảng11–12ngày tổng**.
- MUST_HAVE trong scopeMVP=66h, profileSHOULD=1.5h; hoãnprofile chỉgiảm1.5h, vẫnkhôngvừa3–4ngày.
- V2-01 transaction L3.5/P7, V3-05transport L3/P6, V4-01fullbridge L2/P4, V4-05E2E L3/P6 làriskdrivers. Thời giankhông được hiểu làchắcthànhcông ởL.
- Browserblocked/hostchưa chọnkhôngcộngvào81hnhưngcó thểkéo dài lịch; publichostkhông chặnlocalMVP.

Critical-path lower bound theo L và DAG hiện tại, nguồn lựcparallelkhônggiớihạn, khôngbuffer/blocking: **30.5h**, thay21.5hv2:
~~~text
V1-04 → V1-07 → V2-01 → V2-02 → V2-10 → V2-04 → V2-07 → V2-08 → V2-09 → V3-06 → V4-01 → V4-02 → V4-05 → V4-07 → V4-08 → V4-09
~~~
Mộtđườnggăngcó thểcóties; dependencieskhácvẫnphảixong. Đây không tổng giờ1ngườivàkhônghứadeadline. NhánhV2-04earlyauto/bridge có thểđồnghạngmanual hoặcscience tùyactuals. Recomputeafteractuals thaychỉđổisố.

Cóthểsong song nếu cónguồn lực/ngườiđượcbốtrí: baselinebrowser/parser/bounds; puremodelsledger+flow→dissolve/sand/oil; manualmath; V4-10contexttest saubridge; V4phase-render/results saumodelcontracts. Khôngtựspawnagents trong lượtplan. Mộtownerstatecontract vàplan, khôngsửaEnginecùnglúckhôngphốihợp.

### 6.1 Lịch gợi ý một người, milestone không giả complete

M0≈9.5h; earlybridge/sugar/auto slice được ưu tiên Ngày3–4 sauNgày1. Nhữngpuremodel/dependenciesđãlàmtrongslice khôngtínhgiờlần2ởPhase3. ĐạtM2 sauphầnlớn~48h cumulative còn lại; M3 sau67.5h; buffer13.5h trải qua cácgates vàđợtfinal. Actuals sauM1B phảire-estimatecatalog; không gánmỗiPhase=mộtngày.

### 6.2 Demo nếu deadline3–4ngày cứng

FullMVP giữmục tiêu, không tựchuyểnsangdemo. Nếuuserchọndemo thìphảighi deliverableđãgiới hạn:
- D0 foundation+authoritativecommands/clock/bridge, taskset dependency-closed V1-01,V1-02,V1-03,V1-04,V1-05,V1-07,V2-01,V2-02,V2-10: L16.5h+20%=19.8h còn lại. Acceptance input/deci/capacity/pausedadd/clock/start/pause/reset/oneowner/scalarUI; scenevẫnminhhọatĩnhchochất, **chưa auto/manual/scientificmodel/bốncốcnguồnfullQA/artifactrelease**. Đây làdemohạtầng, khôngMVPhoặcscience demo.
- D1 actualwater–sugar slice mởrộngD0 vớiV3-01,V2-03,V3-02,V2-04,V2-11: L26h+20%=31.2h còn lại; science/UI/scene/pause/resume/resetthật, cònthiếumanual/cát/dầufullmodel/combos/context/fullQA/artifact. VìvậykhônghứaD1vừa3–4ngày tổng.
- ChỉbỏV4-06deep profile/worker/shader/fancyeffects khôngđủkéofullscopevào16–24h. Khôngcắtmassinvariant/no-water/saturation/bounds/testsđểgọifullMVP.

## 7. Release blockers, browser và artifact

Severityđánh tácđộng, không nhãnreview:
- P0 blocker: mất/saiinputledger, massviolation, doubletick, crash/khôngthểkhởitạohoặckhôngfallback.
- P1 blocker: saiđịnh tính đường/dầu/cát/bão hòa; manualstuck/thoátcốc/cameracapturekẹt; pausedresume/resetfence sai; contexterrorlàmmấtstate; resourcegrowth liên tục; benchmarkbaselinenotpass trênmáynghiệm thu; misleadinglabel có thểdẫnsaiscientificconclusion.
- P1 cosmetic/non-blocking chỉdefer khi impact/workaround/owner/evidence và lýdohợp lệ được ghi rõ; người dùng chấpnhậnknownissue. Khôngchỉ“noP0” đểrelease.
- HistoricalnpmwrapperissuecóNodefallbacktươngđươngpass làknownenvironmentissue, khônggiảsourcepassvừađượcchạy. V1-02timeboxrecordđủ; khikhôngfallbackkiểm chứngđượcthìpipelinegateBLOCKED.

LocalartifactDoD: allMUST localtasksverified, scientifictests/72plannedcases relevantimplementedpass, browserdesktop/mobilewidth+actualtouchclaimseparate, median/p95perfmandatory, contextrecovery/retry, finalcommandslogs, docs đúngbehavior, productionHTTPasset/lazychunk/basepathsmoke. Chưachọnpublichostkhông chặnlocalartifactcomplete; V4-11 riêng,có thểNOT_STARTED/BLOCKEDmàlocalMVPđạt. No deploylượt này.

## 8. Checkpoint, phục hồi và lỗi môi trường

Trướcđợtcode, V1-02preflight ghi sourcehash và nếuGittồn tại ghi dirtybaseline; hiện chưaGit, **không git init/reset/clean**. Đềxuất checkpointzip duy nhất ở workspace .checkpoints/plan-v3-YYYYMMDD-HHMMSS.zip chỉgồmsrc/public, package+lock, vite/ts/eslint/index vàcanonicalMarkdown; exclude node_modules/dist/.git/.env/credentials/attachments. Verifyresolvedtargetởworkspace, khôngoverwritebackupcũ, khôngxóa. Chưa tạocheckpointtrong lượtplan; thao tác saucodeauthorization làreversiblekhông thêmscope.

Phiênmới đọcrootresolver→task_plan/findings/progress→catalog/spec, khôngtranscript hoặchostconfig. Sau mỗi task ghi ID/changes/command exit/phạm vi/seed/tick/ack/browserenvironment; appendfindingsnếupháthiện; cậpnhậtNextStep. Rejections làinputvalidationkhácapproval/toolrejection, phảighiđúngloại.

Npmwrappertimebox30phút, khôngrerunvôhạn: kiểmpath/script-shell/stdout/exit, gọiNodeentrypoints cósẵn khi cần; khôngcàipackage/sửaconfigmù. Lượtv3 sourcehashunchanged nênkhôngrerunfullsuitekhông cầnthiết; evidencev2giữ nguyênlịch sử. Docchecks/hash/formulacalculationsv3đượclogriêng.

## 9. Review coverage R01–R20

Mọi điểm dưới đây đã có quyết định/spec/task/case, không chỉ ghi chung chung “đã xem”. ReviewP0 làđộ ưu tiênđặc tả, không kết luận source cóbug đãverified.

| Review | Quyết định v3 | Section | Task | Test/evidence |
|---|---|---|---|---|
| R01 | Oil-only solids trong oil envelope có dầu nền; explicit 4cases | SPEC §4 | V3-03,V4-03 | SC-R01/R03 |
| R02 | Synchronous control flush độc lập clock, paused resume/add ngay | SPEC §3 | V2-01,V2-10 | SC-C01/C07 |
| R03 | seq/high-water/LRU256, reset-ID dedup khác reset mới, bindgeneration từngintent | SPEC §2–3 | V2-01,V2-09 | SC-C03–C06 |
| R04 | Stale150ms host-inputclock, deadzone/gapclearhistory | SPEC §6 | V2-06 | SC-J02/J04 |
| R05 | Adaptive tip trênbed+contactoverlap, thin/dry gate | SPEC §4–5 | V1-05,V2-03 | SC-H01/H02 |
| R06 | Early owner/bridge V2-10, slice V2-11, V4-01 chỉ mở rộng | MASTER §4 | V2-10,V2-11,V4-01 | SC-C07/SC-B03 + slice |
| R07 | Stateless visualhash, privatebuffers/copytoownedtarget, noalias | SPEC §9 | V3-05,V4-01 | SC-B01/B02 |
| R08 | Giữnormalize6,fastIeq.7143; modelconstantI1 riêngengine | SPEC §5/8 | V2-03,V3-02 | SC-F01/D02 |
| R09 | Numerical/label/hide/equilibrium thresholds riêng, no mass snap,N/A0water | SPEC §8 | V4-04,V4-02 | SC-U01/U02 |
| R10 | 50/90/95modeltimings fixedI vàcoupledauto, UX trước tuning | SPEC §8.1 | V4-04,V4-08 | SC-D02/UC1 |
| R11 | Add→Gu/Sb/Ol/W, preserveexistingphases, pausedconstraintremap | SPEC §3.5 | V2-01,V3-06 | SC-A01/R04 |
| R12 | Localeparserstrict . hoặc ,; safeintegerdeciticks; rapidcapacityserialize | SPEC §1.1/3 | V1-04,V2-01 | SC-IN01/C02 |
| R13 | Axis/dragoffset/auto-radiusramp/pointerlifecycle/hideRod | SPEC §6 | V2-04…V2-07 | SC-J01–J04 |
| R14 | Tick+ordinaltrace,remainder/drop policy,h12012steps,hiddenfirstdelta0 | SPEC §7 | V2-02,V3-08 | SC-T01–T03 |
| R15 | Mandatoryfixture495ml,N700,5swarmup+30swindows,median/p95/resources | TEST_CASES §3 | V4-05 | SC-W04/B03 |
| R16 | Init/lost/restored/retry/DPR behavior,engineoutsideCanvas | SPEC §6; TEST_CASES §4 | V4-10 | SC-W01–W03 |
| R17 | P0/P1blockingtaxonomy; artifactMUST/publicdeployoptional | MASTER §7 | V4-07,V4-09,V4-11 | SC-W05 |
| R18 | OLPcatalog,assumptions+buffer, recomputedDAG/criticalpath | MASTER §6 | Allcatalog | DocDAG/estimate validation |
| R19 | Legend/condition explanations,3validdose scenarios,tanvsphân tán | TEST_CASES §5 | V4-04,V4-08 | UC1–UC3 |
| R20 | Canonicalroot,logs/versionedhandoff,scopedcheckpointbeforecode | MASTER §8 | V1-02,alltasks | Hash/link/handoff validation |

## 10. Hành động kế tiếp

Planv3 đãchọn defaults kỹthuật; không có câu hỏi sản phẩm mới cầnchặnviệchoànthiệntàiliệu. ScopefullMVP không đổi, định lượngcalibration/manualtouch làfuture request nếu muốn.

**V1-04 (parser/precision) và V1-05 (hình học cốc/dụng cụ) đã hoàn thành (COMPLETED_VERIFIED).** Task tiếp theo trong Phase 1: V1-07 (Chốt contract command/state/đơn vị) hoặc V1-06 (Bốn cốc chứa 3D) → engine/clock (V2-01/V2-02) → early bridge (V2-10), không nhảy thẳng full science hoặc Phase 5.
