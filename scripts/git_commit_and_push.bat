@echo off
chcp 65001 >nul
echo ====================================================================
echo Script: git_commit_and_push.bat
echo Tu dong chia 4 commits, tao nhanh va push len GitHub
echo ====================================================================

echo.
echo [1/6] Kiem tra Remote origin...
git remote set-url origin https://github.com/KyAnhhh/virtual-solubility-lab.git
git remote -v

echo.
echo [2/6] Tao Commit 1: Sua loi chat long va de coc 500ml...
git add src/scene/Beaker.tsx src/scene/WaterVolume.tsx src/scene/OilVolume.tsx src/scene/fluidSurfaceRipple.ts src/scene/particleMeshHelpers.ts src/scene/ParticleRenderer.tsx src/simulation/tests/visualFluidPolish.test.ts src/simulation/tests/particleVisualSmoothing.test.ts
git commit -m "fix(scene): correct fluid tilt deformation and beaker base coloring"

echo.
echo [3/6] Tao Commit 2: Presets thi nghiem 1-click va bieu do khoi luong...
git add src/components/presets/ src/components/results/MassTimeChart.tsx src/simulation/tests/presetExperiments.test.ts src/simulation/tests/massTimeChart.test.ts
git commit -m "feat(analytics): add 1-click preset experiments and mass-time chart"

echo.
echo [4/6] Tao Commit 3: Tuong tac keo coc cham coc 500ml tu nang rot...
git add src/scene/pouringAnimationMath.ts src/interactions/VesselPourAdapter.ts src/interactions/ManualStirAdapter.ts src/scene/IngredientVessels.tsx src/scene/LaboratoryScene.tsx src/scene/StirringRod.tsx src/simulation/constants/beaker.ts src/simulation/constants/ingredients.ts src/simulation/bridge/SimulationBridge.ts src/stores/experimentStore.ts src/types/experiment.ts src/simulation/tests/vesselInteraction.test.ts src/simulation/tests/ingredientPourInteraction.test.ts src/simulation/tests/spoonInteractionUx.test.ts
git commit -m "feat(interaction): implement 3D vessel touch-triggered pouring with by-dose and free-pour modes"

echo.
echo [5/6] Tao Commit 4: Tinh gon giao dien, toi uu khong gian 3D va tai lieu...
git add src/components/ingredients/IngredientPanel.tsx src/components/controls/ControlPanel.tsx src/components/results/ContentsPanel.tsx vite.config.ts task_plan.md findings.md progress.md scripts/
git add -A
git commit -m "feat(ui): streamline control panels, inline validation, and compact 3D viewport"

echo.
echo [6/6] Tao cac nhanh va day code len GitHub...
git branch -M main
git branch develop
echo Dang day nhanh main len origin...
git push -u origin main
echo Dang day nhanh develop len origin...
git push -u origin develop

echo.
echo ====================================================================
echo HOAN TAT! Toan bo code da duoc commit va push thanh cong.
echo ====================================================================
pause
