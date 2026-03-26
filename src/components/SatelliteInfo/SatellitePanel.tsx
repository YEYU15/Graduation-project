import React, { useEffect, useState } from 'react';

// 定义属性接口：target 是选中的卫星数据，lastModeledRef 用于跨组件访问 Cesium 实体
interface SatellitePanelProps {
    target: any;
    lastModeledRef: React.RefObject<{
        entity: any;
        snapshot: any;
        overlayEntity: any;
        extraEntities?: any[]
    } | null>;
}

const SatellitePanel: React.FC<SatellitePanelProps> = ({ target, lastModeledRef }) => {
    // 存储实时的四元数和欧拉角
    // 一旦状态更新，React 就会重新渲染面板中的数字
    const [realtimeOrientation, setRealtimeOrientation] = useState<{
        quaternion?: { x: number; y: number; z: number; w: number };
        euler?: { heading: number; pitch: number; roll: number };
    } | null>(null);

    // 处理 Cesium 时钟监听
    useEffect(() => {
        const viewer = (window as any).viewer;
        const Cesium = (window as any).Cesium;
        if (!viewer || !Cesium || !target) return; // 没有目标时，不监听

        // 【核心回调函数】Cesium 每渲染一帧（通常 60fps）都会执行一次
        const handleTick = (clock: any) => {
            // 优先从 ref 中获取高精度的“覆盖层实体”，如果没有则直接从 viewer 获取原始实体
            const activeEntity = lastModeledRef.current?.overlayEntity || viewer.entities.getById(target.id);

            // 如果实体存在且拥有姿态属性（orientation）
            if (activeEntity?.orientation) {
                // 获取当前场景模拟时间
                const currentTime = clock.currentTime;
                // 获取该时间点对应的四元数 (Quaternion)
                const quaternion = activeEntity.orientation.getValue(currentTime);

                if (quaternion && Cesium.Math && Cesium.HeadingPitchRoll) {
                    // 坐标转换：将四元数转换为偏航/俯仰/滚转
                    const hpr = Cesium.HeadingPitchRoll.fromQuaternion(quaternion);

                    // 触发 UI 的局部高频刷新
                    setRealtimeOrientation({
                        quaternion: { x: quaternion.x, y: quaternion.y, z: quaternion.z, w: quaternion.w },
                        euler: {
                            heading: Cesium.Math.toDegrees(hpr.heading), // 弧度转角度
                            pitch: Cesium.Math.toDegrees(hpr.pitch),
                            roll: Cesium.Math.toDegrees(hpr.roll),
                        }
                    });
                }
            }
        };

        // 绑定监听器
        viewer.clock.onTick.addEventListener(handleTick);

        // 清理函数
        return () => {
            // 移除监听器
            viewer.clock.onTick.removeEventListener(handleTick);
            // 重置状态
            setRealtimeOrientation(null);
        };
        // 当 [target, lastModeledRef] 发生变化时，执行 useEffect 
    }, [target, lastModeledRef]);

    // 如果没有选中卫星，或者还没有姿态数据，就不渲染面板
    if (!target || !realtimeOrientation) return null;

    // 3. 纯净的 UI 渲染
    return (
        <div
            className="satellite-info-panel"
            style={{
                position: 'absolute',
                left: 20,
                bottom: 200,
                background: 'rgba(0,0,0,0.7)', // 半透明黑色背景（GIS 常用风格）
                color: 'white',        // 白色文字
                padding: '15px',       // 内边距
                borderRadius: '8px',   // 圆角
                zIndex: 999,           // 确保置于地图最上方
                pointerEvents: 'none'  // 鼠标穿透：面板不挡住下方的地图操作
            }}
        >
            {/* 标题：显示卫星名称，若无则显示默认文字 */}
            <h3 style={{ margin: '0 0 10px 0', fontSize: '16px' }}>
                {target.name || '卫星姿态监控'}
            </h3>

            {/* 欧拉角区域：显示 Heading(偏航)、Pitch(俯仰)、Roll(滚转) */}
            <div style={{ marginBottom: '10px', fontSize: '14px', lineHeight: '1.5' }}>
                <strong style={{ color: '#00ffff' }}>姿态角度 (度):</strong>
                <br />偏航角 (Heading): {Number(realtimeOrientation.euler?.heading || 0).toFixed(2)}°
                <br />俯仰角 (Pitch): {Number(realtimeOrientation.euler?.pitch || 0).toFixed(2)}°
                <br />滚转角 (Roll): {Number(realtimeOrientation.euler?.roll || 0).toFixed(2)}°
            </div>

            {/* 四元数区域：显示底层的 X, Y, Z, W 原始数值 */}
            <div style={{ fontSize: '14px', lineHeight: '1.5' }}>
                <strong style={{ color: '#00ffff' }}>姿态四元数:</strong>
                <br />X: {Number(realtimeOrientation.quaternion?.x || 0).toFixed(4)}
                <br />Y: {Number(realtimeOrientation.quaternion?.y || 0).toFixed(4)}
                <br />Z: {Number(realtimeOrientation.quaternion?.z || 0).toFixed(4)}
                <br />W: {Number(realtimeOrientation.quaternion?.w || 0).toFixed(4)}
            </div>
        </div>
    );
};

export default SatellitePanel;