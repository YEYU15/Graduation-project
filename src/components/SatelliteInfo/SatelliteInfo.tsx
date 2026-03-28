import React, { useEffect, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import satelliteGltfUrl from '../../assets/Satellite.gltf?url';
import SatellitePanel from './SatellitePanel';

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
    const lastModeledRef = useRef<{ entity: any; snapshot: any; overlayEntity: any; extraEntities?: any[] } | null>(null);
    // setTarget(entity)时：React 接收到通知，重新渲染组件
    const [target, setTarget] = useState<any>(null);

    // ==========================================
    // 新增：为搜索功能添加状态和 Ref
    // ==========================================
    // 存储用户在搜索框中输入的文字
    const [searchInput, setSearchInput] = useState('');
    // 这是一个巧妙的桥梁，用来将 useEffect 内部的作用域函数暴露给外面的按钮使用
    const selectSatelliteRef = useRef<((searchStr: string) => void) | null>(null);

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
            // 修改：直接使用 CZML 自带的姿态信息
            // ==========================================
            const orientationProp = entity.orientation;

            // 3. 创建 Overlay Entity (直接应用 CZML 的姿态)
            const overlayEntity = viewer.entities.add({
                id: `sat-model-overlay-${String(entity.id)}-${Date.now()}`,
                position: positionProp ?? entity.position,
                // 👇 直接使用 CZML 解析出的姿态
                orientation: orientationProp,
                model: {
                    uri: satelliteModelUri,
                    scale: 5.0,
                    minimumPixelSize: 128,
                    maximumScale: 10000,
                    silhouetteColor: Cesium.Color.YELLOW,
                    silhouetteSize: 2.0,
                }
            });

            // ==========================================
            // 报告第 9 节：额外的姿态可视化
            // ==========================================
            // 9.1 星下线（青色）
            const nadirLineEntity = viewer.entities.add({
                id: `sat-nadir-line-${String(entity.id)}-${Date.now()}`,
                polyline: {
                    positions: new Cesium.CallbackProperty(function (time: any) {
                        const pos = positionProp?.getValue(time);
                        if (!pos) return [];
                        const carto = Cesium.Cartographic.fromCartesian(pos);
                        const groundPoint = Cesium.Cartesian3.fromRadians(
                            carto.longitude,
                            carto.latitude,
                            0
                        );
                        return [pos, groundPoint];
                    }, false),
                    width: 3,
                    material: Cesium.Color.CYAN.withAlpha(0.7),
                    arcType: Cesium.ArcType.NONE,
                }
            });

            // 9.2 & 9.3 模型头部朝向线（红色） + 夹角标签
            const forwardLineEntity = viewer.entities.add({
                id: `sat-forward-line-${String(entity.id)}-${Date.now()}`,
                position: positionProp,
                polyline: {
                    positions: new Cesium.CallbackProperty(function (time: any) {
                        const pos = positionProp?.getValue(time);
                        // 👇 修改为直接获取 CZML 的姿态值
                        const ori = orientationProp?.getValue(time);
                        if (!pos || !ori) return [];

                        const forward = Cesium.Cartesian3.normalize(
                            Cesium.Matrix3.getColumn(Cesium.Matrix3.fromQuaternion(ori), 0, new Cesium.Cartesian3()),
                            new Cesium.Cartesian3()
                        );

                        const ray = new Cesium.Ray(pos, forward);
                        const intersectionInterval = Cesium.IntersectionTests.rayEllipsoid(ray, Cesium.Ellipsoid.WGS84);

                        let endPoint;
                        if (intersectionInterval) {
                            endPoint = Cesium.Ray.getPoint(ray, intersectionInterval.start, new Cesium.Cartesian3());
                        } else {
                            const scaledForward = Cesium.Cartesian3.multiplyByScalar(forward, 2000000, new Cesium.Cartesian3());
                            endPoint = Cesium.Cartesian3.add(pos, scaledForward, new Cesium.Cartesian3());
                        }

                        return [pos, endPoint];
                    }, false),
                    width: 3,
                    material: Cesium.Color.RED.withAlpha(0.7),
                    arcType: Cesium.ArcType.NONE,
                },
                label: {
                    text: new Cesium.CallbackProperty(function (time: any) {
                        const pos = positionProp?.getValue(time);
                        // 👇 修改为直接获取 CZML 的姿态值
                        const ori = orientationProp?.getValue(time);
                        if (!pos || !ori) return '';

                        const nadir = Cesium.Cartesian3.normalize(Cesium.Cartesian3.subtract(Cesium.Cartesian3.ZERO, pos, new Cesium.Cartesian3()), new Cesium.Cartesian3());
                        const forward = Cesium.Cartesian3.normalize(Cesium.Matrix3.getColumn(Cesium.Matrix3.fromQuaternion(ori), 0, new Cesium.Cartesian3()), new Cesium.Cartesian3());
                        const angleDegrees = Cesium.Math.toDegrees(Math.acos(Cesium.Math.clamp(Cesium.Cartesian3.dot(nadir, forward), -1.0, 1.0)));

                        return `夹角: ${angleDegrees.toFixed(1)}°`;
                    }, false),
                    font: '14px sans-serif',
                    pixelOffset: new Cesium.Cartesian2(0, -40),
                }
            });

            lastModeledRef.current = { entity, snapshot, overlayEntity, extraEntities: [nadirLineEntity, forwardLineEntity] };
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
                    lastModeledRef.current.extraEntities?.forEach((ent: any) => viewer.entities.remove(ent));
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
                    lastModeledRef.current.extraEntities?.forEach((ent: any) => viewer.entities.remove(ent));
                }

                setTarget(t);
                applySatelliteModelToEntity(ent, t.id); // 执行覆盖
            }

        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

        // ==========================================
        // 新增：搜索特定卫星并自动应用模型
        // ==========================================
        selectSatelliteRef.current = (searchStr: string) => {
            let foundEntity: any = null;

            // 1. 遍历所有的外部数据源 (如 CZML 加载的数据) 寻找匹配项
            for (let i = 0; i < viewer.dataSources.length; i++) {
                const ds = viewer.dataSources.get(i);
                const entities = ds.entities.values;
                // 支持按 ID 或者 按 Name 搜索
                foundEntity = entities.find((e: any) => e.id === searchStr || e.name === searchStr);
                if (foundEntity) break;
            }

            // 2. 如果外部数据源没找到，再到 viewer 默认的总池子里找
            if (!foundEntity) {
                const entities = viewer.entities.values;
                foundEntity = entities.find((e: any) => e.id === searchStr || e.name === searchStr);
            }

            // 3. 没找到的提示
            if (!foundEntity) {
                alert(`未找到名称或 ID 为 "${searchStr}" 的卫星`);
                return;
            }

            // 4. 判断找到的实体是不是卫星，并套用之前写的逻辑
            const t = detectTarget(foundEntity.id, foundEntity.name);
            if (t && t.kind === 'satellite') {
                // 如果当前正好已经是这颗卫星了，那就只飞过去，不重新生成模型
                if (lastModeledRef.current && lastModeledRef.current.entity === foundEntity) {
                    viewer.flyTo(foundEntity, {
                        duration: 1.5,
                        offset: new Cesium.HeadingPitchRange(0, -Math.PI / 4, 10000)
                    });
                    return;
                }

                // 切换卫星时，先恢复上一颗的样子
                if (lastModeledRef.current) {
                    restoreEntityVisuals(lastModeledRef.current.entity, lastModeledRef.current.snapshot);
                    viewer.entities.remove(lastModeledRef.current.overlayEntity);
                    lastModeledRef.current.extraEntities?.forEach((ent: any) => viewer.entities.remove(ent));
                }

                // 更新 React 面板状态
                setTarget(t);
                // 直接复用你写好的核心覆盖方法！
                applySatelliteModelToEntity(foundEntity, t.id);

                // 视角平滑飞向搜索到的卫星
                // Heading(偏航)0, Pitch(俯仰)-45度, Range(距离)10000米 确保能清楚看到模型
                viewer.flyTo(foundEntity, {
                    duration: 1.5,
                    offset: new Cesium.HeadingPitchRange(0, -Math.PI / 4, 10000)
                });
            } else {
                alert('找到的目标不是卫星！');
            }
        };

        // 组件卸载时清理事件和模型
        return () => {
            handler.destroy();
            if (lastModeledRef.current) {
                restoreEntityVisuals(lastModeledRef.current.entity, lastModeledRef.current.snapshot);
                viewer.entities.remove(lastModeledRef.current.overlayEntity);
                lastModeledRef.current.extraEntities?.forEach((ent: any) => viewer.entities.remove(ent));
            }
        };
    }, []);

    return (
        <SatellitePanel
            target={target}
            lastModeledRef={lastModeledRef} // 把 ref 传给儿子，让它自己去拿数据
            // ==========================================
            // 新增：把刚才绑定的搜索方法传给面板组件
            // ==========================================
            onSearchRequest={(searchStr: string) => {
                if (selectSatelliteRef.current) {
                    selectSatelliteRef.current(searchStr);
                }
            }}
        />
    );
};

export default SatelliteInfo;