# 🛰️ Starlink Real-time Orbit Simulation (毕业设计)

这是一个基于真实 TLE (两行轨道数据) 的星链卫星轨道推演与可视化项目。项目通过 Python 进行 SGP4 轨道计算，生成 CZML 并在前端 Cesium 场景中实时展示，同时提供卫星姿态的实时监控与前端性能分析。

## 🌟 核心功能
- **真实数据驱动**：解析最新的 `starlink.txt` 数据，覆盖 14,000+ 颗卫星。
- **高精度推演**：采用 `skyfield` 库进行 SGP4 轨道计算，坐标系同步至地球固连坐标系 (ITRS)。
- **动态展示与检索**：在 Cesium 场景中实现卫星平滑运行，支持按名称或 ID 实时搜索定位卫星，并展示实时的四元数与欧拉角姿态数据。
- **实时性能监控**：集成 `Stats.js`，在前端面板提供专业的 FPS 实时图表监控，便于评估渲染性能。

## 📦 主要技术栈
- **后端/数据处理**：Python 3.10+, Skyfield (SGP4 模型)
- **前端框架**：Vite + React + TypeScript
- **WebGIS 引擎**：Cesium.js
- **辅助工具**：Stats.js (性能监控)

## 🛠️ 快速开始

### 1. 准备 Python 环境
项目要求 **Python 3.10+**。建议使用虚拟环境：

```powershell
# 进入项目目录并创建环境
cd code
python -m venv venv

# 激活虚拟环境 (Windows)
.\venv\Scripts\activate

# 安装依赖
pip install skyfield
2. 生成轨道数据
运行脚本解析 src/scripts/data/starlink.txt。该脚本将通过 SGP4 模型推演未来 2 小时的轨道。

PowerShell
# 运行轨道推演脚本
python src/scripts/generate_real_czml.py
💡 提示：生成的 public/real_starlink_orbit.czml 较大（约 100MB+），已被 .gitignore 忽略，请确保在前端启动前完成此步骤。

3. 启动前端展示
确保已安装 Node.js。

PowerShell
# 安装前端依赖 (会自动安装 Cesium, React, stats.js 等相关库)
npm install

# 启动本地开发服务器
npm run dev
⚠️ 性能与坐标说明
性能评估与优化：本项目加载了海量卫星数据，您可以通过左上角的 FPS 监控面板 实时观察浏览器的渲染帧率。若 Cesium 渲染卡顿（FPS 持续低于 30），可修改 generate_real_czml.py 中的 TIME_STEP_SECONDS（采样间隔），将其从 60 调大至 180 或 300，可显著减小文件体积并提升前端流畅度。

坐标系统：推演采用 ITRS (ECEF) 地球固连坐标系，确保卫星位置与地球自转完全同步。