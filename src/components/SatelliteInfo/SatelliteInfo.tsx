import React, { useEffect, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import satelliteGltfUrl from '../../assets/Satellite.gltf?url';

// ==========================================
// 报告第 4 节：快照与恢复机制
// ==========================================
// any：可以是任何类型
function snapshotEntityVisuals(entity: any) {
    if (!entity) return null;
    return {
        // 如果左边有东西，就用左边的；如果左边是 null 或 undefined，就给它 undefined
        billboard: entity.billboard ?? undefined,
        point: entity.point ?? undefined,
        label: entity.label ?? undefined,
        model: entity.model ?? undefined,
        // 如果 entity 根本没有 show 属性：typeof entity.show 会返回字符串 "undefined"。
        // 如果 entity.show = false：typeof entity.show 会返回字符串 "boolean"。
        show: typeof entity.show !== 'undefined' ? entity.show : undefined,
    };
}

function restoreEntityVisuals(entity: any, snapshot: any) {
    if (!entity || !snapshot) return;
    entity.billboard = snapshot.billboard ?? undefined;
    entity.point = snapshot.point ?? undefined;
    entity.label = snapshot.label ?? undefined;
    entity.model = snapshot.model ?? undefined;
    if (typeof snapshot.show !== 'undefined') entity.show = snapshot.show;
}

// === 补充：根据报告推断的辅助函数 ===
// 识别拾取到的目标到底是不是卫星
function detectTarget(rawId: string, rawName: string) {
    if (!rawId) return null;
    // 假设测试数据的 id 是 'sat-1'
    return { kind: 'satellite', id: rawId, name: rawName };
}

// 在 Viewer 的所有数据源中查找真实的实体对象
function findEntityById(id: string, viewer: Cesium.Viewer) {
    for (let i = 0; i < viewer.dataSources.length; i++) {
        // 拿到第 i 个数据源
        const ds = viewer.dataSources.get(i);
        // 在这个特定的数据源里找 ID
        const ent = ds.entities.getById(id);
        if (ent) return ent;
    }
    // 意味着外部文件里都没这个 ID，在 viewer.entities（默认的总池子）里找。
    return viewer.entities.getById(id);
}
// ==========================================

const SatelliteInfo: React.FC = () => {
    // useState 变了页面会跟着变；useRef 变了页面不会变
    // 要么装着下面的对象，要么 null
    // 初始值 null
    const lastModeledRef = useRef<{ entity: any; snapshot: any; overlayEntity: any } | null>(null);
    // setTarget(entity)时：React 接收到通知，重新渲染组件
    const [target, setTarget] = useState<any>(null);

    useEffect(() => {
        const viewer = (window as any).viewer;
        const Cesium = (window as any).Cesium;
        if (!viewer || !Cesium) return;

        // 解析模型 URI
        let satelliteModelUri: string;
        if (typeof satelliteGltfUrl === 'string') {
            satelliteModelUri = satelliteGltfUrl;
        } else {
            satelliteModelUri = typeof import.meta !== 'undefined'
                ? new URL('../../assets/Satellite.gltf', import.meta.url).href
                : '/assets/Satellite.gltf';
        }

        // ==========================================
        // 报告中引用的核心方法：应用模型到实体
        // ==========================================
        const applySatelliteModelToEntity = (entity: any, originalId: string) => {
            // 1. 拍快照保存现场
            const snapshot = snapshotEntityVisuals(entity);

            // 2. 隐藏原始的点图标/标签 (利用 entity.show 整体隐藏，最安全)
            entity.show = false;

            // 获取位置属性
            const positionProp = entity.position;

            // ==========================================
            // 新增：第7节 动态姿态计算
            // ==========================================
            let dynamicOrientationProp = entity.orientation; // 默认拿原始姿态兜底

            try {
                if (Cesium && positionProp) {
                    // Cesium 的渲染引擎每一帧都会调用这个回调函数
                    dynamicOrientationProp = new Cesium.CallbackProperty(function (time: any, result: any) {
                        try {
                            // 从位置属性中提取卫星在空间中的笛卡尔坐标 
                            const position = positionProp.getValue(time);
                            if (!position) return result;

                            // 1. 星下线方向
                            // 地球的球心
                            const earthCenter = Cesium.Cartesian3.ZERO;
                            // 用“地心坐标”减去“卫星当前坐标”
                            const nadirAxis = Cesium.Cartesian3.subtract(earthCenter, position, new Cesium.Cartesian3());
                            Cesium.Cartesian3.normalize(nadirAxis, nadirAxis);

                            // 2. 速度方向 (t + 0.1s)
                            // 检查 entity 及其 position 属性是否存在，如果获取不到位置信息，它会给一个默认的方向向量 (0, 1, 0)
                            const velocity = entity?.position?.getValue ?
                                Cesium.Cartesian3.subtract(
                                    // 未来0.1s的位置-当前position
                                    entity.position.getValue(Cesium.JulianDate.addSeconds(time, 0.1, new Cesium.JulianDate())),
                                    position,
                                    new Cesium.Cartesian3()
                                ) : new Cesium.Cartesian3(0, 1, 0);
                            // 获取一个表示卫星运动方向的单位向量
                            Cesium.Cartesian3.normalize(velocity, velocity);

                            // 3. 右向量
                            // 星下线方向 × 速度方向
                            let right = Cesium.Cartesian3.cross(nadirAxis, velocity, new Cesium.Cartesian3());
                            Cesium.Cartesian3.normalize(right, right);

                            // 处理极点奇异性
                            if (Cesium.Cartesian3.magnitude(right) < 0.01) {
                                // 地心指向卫星，好像仍然平行，无法计算
                                const up = Cesium.Cartesian3.normalize(position, new Cesium.Cartesian3());
                                right = Cesium.Cartesian3.cross(nadirAxis, up, new Cesium.Cartesian3());
                                Cesium.Cartesian3.normalize(right, right);
                            }

                            // 4. 绕星下线自旋
                            const julianTime = Cesium.JulianDate.toDate(time).getTime();
                            const spinAngle = (julianTime / 3000) % (2 * Math.PI);
                            const spinQuat = Cesium.Quaternion.fromAxisAngle(nadirAxis, spinAngle, new Cesium.Quaternion());
                            const rotatedRight = Cesium.Matrix3.multiplyByVector(
                                Cesium.Matrix3.fromQuaternion(spinQuat),
                                right,
                                new Cesium.Cartesian3()
                            );

                            // 5. 加入 15° 倾角
                            const tiltAngle = Cesium.Math.toRadians(15);
                            const forward = new Cesium.Cartesian3(
                                nadirAxis.x * Math.cos(tiltAngle) + rotatedRight.x * Math.sin(tiltAngle),
                                nadirAxis.y * Math.cos(tiltAngle) + rotatedRight.y * Math.sin(tiltAngle),
                                nadirAxis.z * Math.cos(tiltAngle) + rotatedRight.z * Math.sin(tiltAngle)
                            );
                            Cesium.Cartesian3.normalize(forward, forward);

                            // 6. 确保正交并合成四元数
                            // 星下线（nadirAxis）和刚才倾斜了 15° 的前向轴（forward）做叉乘，得到最终右轴
                            const finalRight = Cesium.Cartesian3.cross(nadirAxis, forward, new Cesium.Cartesian3());
                            Cesium.Cartesian3.normalize(finalRight, finalRight);
                            // 得到上轴
                            const up = Cesium.Cartesian3.cross(forward, finalRight, new Cesium.Cartesian3());
                            Cesium.Cartesian3.normalize(up, up);

                            const matrix = new Cesium.Matrix3(
                                forward.x, finalRight.x, up.x,
                                forward.y, finalRight.y, up.y,
                                forward.z, finalRight.z, up.z
                            );

                            return Cesium.Quaternion.fromRotationMatrix(matrix, new Cesium.Quaternion());
                        } catch (e) {
                            return result;
                        }
                    }, false);
                }
            } catch (e) {
                console.error('[SatelliteInfo] 动态姿态计算失败，回退至原始姿态:', e);
            }
            // ==========================================

            // 3. 创建 Overlay Entity (报告第 6 节)
            const overlayEntity = viewer.entities.add({
                id: `sat-model-overlay-${String(entity.id)}-${Date.now()}`,
                position: positionProp ?? entity.position,
                // 👇 这里使用我们刚刚计算出来的 dynamicOrientationProp
                orientation: dynamicOrientationProp,
                model: {
                    uri: satelliteModelUri,
                    scale: 5.0,
                    minimumPixelSize: 128,
                    maximumScale: 10000,
                    silhouetteColor: Cesium.Color.YELLOW,
                    silhouetteSize: 2.0,
                }
            });

            // 记录到 Ref 中，方便下次点击时恢复
            lastModeledRef.current = { entity, snapshot, overlayEntity };
        };

        // ==========================================
        // 报告第 5 节：点击事件与模型加载入口
        // ==========================================
        const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

        // 专门监听场景中的鼠标 左键点击 操作
        // movement 对象中包含一个名为 position 的属性，而这个属性的类型是 二维笛卡尔坐标
        handler.setInputAction((movement: { position: Cesium.Cartesian2 }) => {
            const picked = viewer.scene.pick(movement.position);

            // 如果没有点到任何东西，或者点到的东西没有 ID（说明点到了地球表面或太空背景）
            if (!Cesium.defined(picked) || !Cesium.defined(picked.id)) {
                // 如果当前有处于“高精度模型”状态的卫星
                if (lastModeledRef.current) {
                    // 恢复它原本的粗糙外观
                    restoreEntityVisuals(lastModeledRef.current.entity, lastModeledRef.current.snapshot);
                    // 从场景中彻底移除那个高精度 3D 模型
                    viewer.entities.remove(lastModeledRef.current.overlayEntity);
                    lastModeledRef.current = null;
                    // 清空相关的数据引用和 React 状态
                    setTarget(null);
                }
                return;
            }

            const entity = picked.id;
            const rawId = entity.id;
            const rawName = entity.name;

            // 判断：如果点到了已经生成的 Overlay 模型自身
            // 首先确保 rawId 是字符串，然后检查它是否以 sat-model-overlay- 开头
            if (typeof rawId === 'string' && rawId.startsWith('sat-model-overlay-')) {
                // 正则表达式提取原始 ID
                const match = rawId.match(/sat-model-overlay-(.+)-\d+$/);
                if (match && match[1]) {
                    // 拿到原始 ID
                    const originalId = match[1];
                    // 根据原始 ID 重新获取卫星对象数据
                    const t = detectTarget(originalId, rawName);
                    if (t) {
                        setTarget(t); // 仅刷新状态，不重复创建模型
                    }
                }
                return;
            }

            // 判断：如果点到的是原始卫星实体
            const t = detectTarget(rawId, rawName);
            // 类型是卫星
            if (t && t.kind === 'satellite') {
                const ent = findEntityById(t.id, viewer) || entity;

                // 如果点的是当前已经加载了模型的卫星，跳过重绘
                if (lastModeledRef.current && lastModeledRef.current.entity === ent) {
                    setTarget(t);
                    return;
                }

                // 切换不同卫星时，先恢复上一颗
                if (lastModeledRef.current) {
                    restoreEntityVisuals(lastModeledRef.current.entity, lastModeledRef.current.snapshot);
                    viewer.entities.remove(lastModeledRef.current.overlayEntity);
                }

                setTarget(t);
                applySatelliteModelToEntity(ent, t.id); // 执行覆盖
            }

        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

        // 组件卸载时清理事件和模型
        return () => {
            handler.destroy();
            if (lastModeledRef.current) {
                restoreEntityVisuals(lastModeledRef.current.entity, lastModeledRef.current.snapshot);
                viewer.entities.remove(lastModeledRef.current.overlayEntity);
            }
        };
    }, []);

    return null;
};

export default SatelliteInfo;