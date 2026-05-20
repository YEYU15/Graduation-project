import { useEffect, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import ConstellationSelector from './components/ConstellationSelector/ConstellationSelector';
import SatelliteInfo from './components/SatelliteInfo/SatelliteInfo';

function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  // 新增：用一个状态记录 Viewer 是否已经初始化完毕
  const [isViewerReady, setIsViewerReady] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    // 1. 初始化 Cesium Viewer
    Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJjNzA4ZDEzZS03ZTYxLTRiOWItOTA5NS0xYTQyOWEwMmFlZTkiLCJpZCI6NDI2MzIyLCJpc3MiOiJodHRwczovL2lvbi5jZXNpdW0uY29tIiwiYXVkIjoidW5kZWZpbmVkX2RlZmF1bHQiLCJpYXQiOjE3Nzc2OTA1NDd9.hAiRKUZlNbpOC0d-y8dLHpjCbRRYEmCKqyzJZQR4Rfc';
    const cesiumViewer = new Cesium.Viewer(containerRef.current, {
      animation: true,           // 左下角动画控件
      timeline: true,            // 底部时间轴
      baseLayerPicker: true,     // 右上角图层选择器
      geocoder: false,           // 禁用地名查找
      sceneModePicker: false,    // 禁用 2D/3D 切换
      infoBox: false,            // 新增：彻底关闭右上角的原生态黑框
    });

    // 2. 挂载到全局 window
    (window as any).viewer = cesiumViewer;
    (window as any).Cesium = Cesium;

    // 3. 初始相机视角
    cesiumViewer.camera.flyHome(0);

    // 地球初始化彻底完成后，通知 React 加载子组件
    setIsViewerReady(true);

    // 4. 组件卸载时销毁实例
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
    >
      {/* 当地球准备就绪后，同时渲染“数据加载组件”和“模型点击组件” */}
      {isViewerReady && (
        <>
          <ConstellationSelector />
          <SatelliteInfo />
        </>
      )}
    </div>
  );
}

export default App;