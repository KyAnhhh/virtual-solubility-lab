# ====================================================================
# Script: git_commit_and_push.ps1
# Tự động chia 4 commits chuẩn Conventional Commits, tạo nhánh và push
# lên https://github.com/KyAnhhh/virtual-solubility-lab.git
# ====================================================================

Write-Host ">>> [1/6] Kiểm tra cấu hình Remote origin..." -ForegroundColor Cyan
git remote set-url origin https://github.com/KyAnhhh/virtual-solubility-lab.git
git remote -v

Write-Host "`n>>> [2/6] Tạo Commit 1: Sửa lỗi chất lỏng & đế cốc 500ml..." -ForegroundColor Cyan
git add src/scene/Beaker.tsx `
        src/scene/WaterVolume.tsx `
        src/scene/OilVolume.tsx `
        src/scene/fluidSurfaceRipple.ts `
        src/scene/particleMeshHelpers.ts `
        src/scene/ParticleRenderer.tsx `
        src/simulation/tests/visualFluidPolish.test.ts `
        src/simulation/tests/particleVisualSmoothing.test.ts
git commit -m "fix(scene): correct fluid tilt deformation and beaker base coloring"

Write-Host "`n>>> [3/6] Tạo Commit 2: Presets thí nghiệm 1-click & biểu đồ khối lượng..." -ForegroundColor Cyan
git add src/components/presets/ `
        src/components/results/MassTimeChart.tsx `
        src/simulation/tests/presetExperiments.test.ts `
        src/simulation/tests/massTimeChart.test.ts
git commit -m "feat(analytics): add 1-click preset experiments and mass-time chart"

Write-Host "`n>>> [4/6] Tạo Commit 3: Tương tác kéo cốc chạm cốc 500ml tự nâng rót (2 chế độ)..." -ForegroundColor Cyan
git add src/scene/pouringAnimationMath.ts `
        src/interactions/VesselPourAdapter.ts `
        src/interactions/ManualStirAdapter.ts `
        src/scene/IngredientVessels.tsx `
        src/scene/LaboratoryScene.tsx `
        src/scene/StirringRod.tsx `
        src/simulation/constants/beaker.ts `
        src/simulation/constants/ingredients.ts `
        src/simulation/bridge/SimulationBridge.ts `
        src/stores/experimentStore.ts `
        src/types/experiment.ts `
        src/simulation/tests/vesselInteraction.test.ts `
        src/simulation/tests/ingredientPourInteraction.test.ts `
        src/simulation/tests/spoonInteractionUx.test.ts
git commit -m "feat(interaction): implement 3D vessel touch-triggered pouring with by-dose and free-pour modes"

Write-Host "`n>>> [5/6] Tạo Commit 4: Tinh gọn giao diện, tối ưu không gian 3D & tài liệu..." -ForegroundColor Cyan
git add src/components/ingredients/IngredientPanel.tsx `
        src/components/controls/ControlPanel.tsx `
        src/components/results/ContentsPanel.tsx `
        vite.config.ts `
        task_plan.md `
        findings.md `
        progress.md
git add -A
git commit -m "feat(ui): streamline control panels, inline validation, and compact 3D viewport"

Write-Host "`n>>> [6/6] Tạo các nhánh và đẩy code lên GitHub..." -ForegroundColor Cyan
# Nhánh main chính thức
git branch -M main
# Nhánh develop tích hợp
git branch develop

Write-Host "Đang đẩy nhánh main lên origin..." -ForegroundColor Yellow
git push -u origin main

Write-Host "Đang đẩy nhánh develop lên origin..." -ForegroundColor Yellow
git push -u origin develop

Write-Host "`n>>> HOÀN TẤT! Toàn bộ code đã được commit và push lên GitHub thành công." -ForegroundColor Green
