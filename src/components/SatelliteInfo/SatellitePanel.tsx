import React, { useEffect, useState } from 'react';

// 定义接收的属性类型
interface SatellitePanelProps {
    target: any;
    // 把父组件的 ref 传进来，让我们能拿到那个覆盖上去的 3D 模型
    lastModeledRef: React.MutableRefObject<{ entity: any; snapshot: any; overlayEntity: any; extraEntities?: any[] } | null>;
}

const SatellitePanel: React.FC<SatellitePanelProps> = ({ target, lastModeledRef }) => {
    // 1. 状态现在属于这个 UI 组件自己了
    const [realtimeOrientation, setRealtimeOrientation] = useState<{
        quaternion?: { x: number; y: number; z: number; w: number };
        euler?: { heading: number; pitch: number; roll: number };
    } | null>(null);

    // 2. 时钟监听器也搬到这里
    useEffect(() => {
        const viewer = (window as any).viewer;
        const Cesium = (window as any).Cesium;
        if (!viewer || !Cesium || !target) return; // 没有目标时，不监听

        const handleTick = (clock: any) => {
            // 通过传进来的 ref，拿到带高精度姿态的实体
            const activeEntity = lastModeledRef.current?.overlayEntity || viewer.entities.getById(target.id);

            if (activeEntity?.orientation) {
                const currentTime = clock.currentTime;
                const quaternion = activeEntity.orientation.getValue(currentTime);

                if (quaternion && Cesium.Math && Cesium.HeadingPitchRoll) {
                    const hpr = Cesium.HeadingPitchRoll.fromQuaternion(quaternion);
                    // 仅触发自身组件的刷新
                    setRealtimeOrientation({
                        quaternion: { x: quaternion.x, y: quaternion.y, z: quaternion.z, w: quaternion.w },
                        euler: {
                            heading: Cesium.Math.toDegrees(hpr.heading),
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
            viewer.clock.onTick.removeEventListener(handleTick);
            setRealtimeOrientation(null);
        };
    }, [target, lastModeledRef]);

    // 如果没有选中卫星，或者还没有姿态数据，就不渲染面板
    if (!target || !realtimeOrientation) return null;

    // 3. 纯净的 UI 渲染
    return (
        <div
            className="satellite-info-panel"
            style={{
                position: 'absolute',
                right: 20,
                top: 20,
                background: 'rgba(0,0,0,0.7)',
                color: 'white',
                padding: '15px',
                borderRadius: '8px',
                zIndex: 999,
                pointerEvents: 'none'
            }}
        >
            <h3 style={{ margin: '0 0 10px 0', fontSize: '16px' }}>
                {target.name || '卫星姿态监控'}
            </h3>

            <div style={{ marginBottom: '10px', fontSize: '14px', lineHeight: '1.5' }}>
                <strong style={{ color: '#00ffff' }}>姿态角度 (度):</strong>
                <br />偏航角 (Heading): {Number(realtimeOrientation.euler?.heading || 0).toFixed(2)}°
                <br />俯仰角 (Pitch): {Number(realtimeOrientation.euler?.pitch || 0).toFixed(2)}°
                <br />滚转角 (Roll): {Number(realtimeOrientation.euler?.roll || 0).toFixed(2)}°
            </div>

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