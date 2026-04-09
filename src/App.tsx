import { useEffect, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css'; // 必须引入 Cesium 原生样式
import ConstellationSelector from './components/ConstellationSelector/ConstellationSelector';
// 【改动 1】：引入刚刚创建的卫星模型与控制组件
import SatelliteInfo from './components/SatelliteInfo/SatelliteInfo';

function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  // 新增：用一个状态记录 Viewer 是否已经初始化完毕
  const [isViewerReady, setIsViewerReady] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    // 1. 初始化 Cesium Viewer
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

    // 新增：地球初始化彻底完成后，通知 React 可以加载子组件了
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
      {/* 【改动 2】：当地球准备就绪后，同时渲染“数据加载组件”和“模型点击组件” */}
      {/* 注意：因为有两个同级组件，需要用 <> ... </> (React Fragment) 包裹起来 */}
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