import { useEffect, useRef } from 'react';
import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css'; // 必须引入 Cesium 原生样式

function App() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // 1. 初始化 Cesium Viewer (对应文档第 1 节)
    const cesiumViewer = new Cesium.Viewer(containerRef.current, {
      animation: true,           // 左下角动画控件
      timeline: true,            // 底部时间轴
      baseLayerPicker: true,     // 右上角图层选择器
      geocoder: false,           // 禁用地名查找（通常卫星项目不需要）
      sceneModePicker: false,    // 禁用 2D/3D 切换
    });

    // 2. 挂载到全局 window (这是后续组件加载模型、计算姿态的基础)
    (window as any).viewer = cesiumViewer;
    (window as any).Cesium = Cesium;

    // 3. 初始相机视角
    cesiumViewer.camera.flyHome(0);

    // 4. 组件卸载时销毁实例，释放 WebGL 内存
    return () => {
      if (cesiumViewer && !cesiumViewer.isDestroyed()) {
        cesiumViewer.destroy();
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      // 强制容器占满全屏
      style={{ width: '100vw', height: '100vh', margin: 0, padding: 0, overflow: 'hidden' }}
    />
  );
}

export default App;