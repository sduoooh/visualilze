# 地震波场传播可视化平台

一个基于 Vue 3 + WebGPU 的三维地震波场传播可视化系统，支持实时渲染和交互式参数调节。

## 🚀 主要特性

- **三维体积渲染**：基于 WebGPU 的高性能三维体积渲染
- **实时可视化**：支持地震波场传播过程的实时可视化
- **交互式参数调节**：可动态调整时间步长、网格大小、模型参数等
- **多文件支持**：支持多个时间步的数据文件切换
- **Web Worker 加速**：使用 Web Worker 进行数据处理和渲染优化

## 📋 系统要求

- 支持 WebGPU 的现代浏览器（Chrome 113+、Firefox 113+、Safari 18+）
- Python 3.8+ （用于后端数据处理）
- Node.js 16+ （用于前端开发）

## 🛠️ 快速开始

### 前端设置

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build
```

### 后端设置

```bash
# 进入服务器目录
cd server/run

# 安装 Python 依赖
pip install fastapi uvicorn torch numpy

# 启动后端服务
python main.py
```

## 📁 项目结构

```
├── src/
│   ├── components/          # Vue 组件
│   │   ├── FilePathInput.vue    # 文件路径输入组件
│   │   ├── MaskDiv.vue          # 遮罩组件
│   │   ├── SameInputs.vue       # 通用输入组件
│   │   └── WithLabel.vue        # 带标签组件
│   ├── global/
│   │   ├── constants.js         # 全局常量
│   │   └── shader.js           # WebGPU 着色器代码
│   ├── utils/
│   │   ├── CameraState.js      # 相机状态管理
│   │   └── workers.js          # Worker 管理器
│   ├── views/
│   │   └── InputGroup.vue      # 参数输入界面
│   ├── worker/
│   │   ├── render.js           # 渲染 Worker
│   │   └── saver.js            # 数据保存 Worker
│   └── App.vue                 # 主应用组件
├── server/run/                 # Python 后端
│   ├── main.py                 # FastAPI 服务器
│   ├── core.py                 # 核心计算逻辑
│   ├── create_v_model.py       # 模型创建工具
│   ├── fileChoose.py           # 文件选择处理
│   └── utils.py                # 工具函数
└── public/
    └── ndarray.js              # NDArray 处理库
```

## 🎮 使用方法

1. **启动服务**：同时启动前端开发服务器和后端 Python 服务
2. **加载数据**：通过文件路径输入组件选择地震波场数据文件
3. **参数设置**：调整时间步长、网格大小、模型尺寸等参数
4. **实时渲染**：观察三维地震波场传播过程
5. **交互控制**：使用鼠标进行视角旋转、缩放等操作

## 🔧 渲染模块移植指南

### WebGPU 渲染核心

渲染模块的核心文件位于：
- `src/worker/render.js` - 主渲染逻辑
- `src/global/shader.js` - WGSL 着色器代码
- `src/utils/CameraState.js` - 相机控制

### 移植步骤

1. **着色器适配**：修改 `shader.js` 中的 WGSL 代码以适应新的数据格式
2. **数据流程**：调整 `render.js` 中的数据处理流程
3. **相机控制**：根据需要修改 `CameraState.js` 中的相机参数
4. **Worker 通信**：修改 `workers.js` 中的数据传输协议

### 关键配置

```javascript
// 体积渲染参数
const volumeConfig = {
    stepLength: 1.0,        // 步长
    maxOpacity: 0.1,        // 最大透明度
    transferFunction: 'colorTransfer'  // 传输函数
};

// 相机参数
const cameraConfig = {
    fov: 45,                // 视场角
    near: 0.1,              // 近裁剪面
    far: 1000               // 远裁剪面
};
```

## 📊 性能优化

- 使用 SharedArrayBuffer 进行高效的 Worker 间通信
- 实现纹理缓存机制减少 GPU 内存占用
- 采用帧率控制避免过度渲染
- 支持多级细节层次（LOD）优化

## 🐛 常见问题

**Q: 浏览器不支持 WebGPU？**
A: 请确保使用支持 WebGPU 的浏览器版本，并在实验性功能中启用 WebGPU。

**Q: 渲染性能低？**
A: 检查数据大小，考虑降低网格分辨率或使用 LOD 技术。

**Q: 无法加载数据文件？**
A: 确保后端服务正常运行，文件路径正确，且文件格式符合要求。

## 📄 许可证

本项目采用 MIT 许可证。详见 LICENSE 文件。

## 🤝 贡献

欢迎提交 Issue 和 Pull Request 来改进此项目。
