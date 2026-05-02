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

                            // ==========================================
                            // 3. 右向量计算与奇异点容错处理
                            // ==========================================
                            // 初算：星下线方向 × 速度方向
                            let right = Cesium.Cartesian3.cross(nadirAxis, velocity, new Cesium.Cartesian3());

                            // 容错降级机制：如果叉乘结果趋近于零向量（速度与星下线平行）
                            if (Cesium.Cartesian3.magnitude(right) < 0.01) {
                                // 一级容错：采用地球北极向量（正北Z轴）作为全局恒定参考
                                const northPole = new Cesium.Cartesian3(0, 0, 1);
                                right = Cesium.Cartesian3.cross(nadirAxis, northPole, new Cesium.Cartesian3());

                                // 二次容错：如果卫星恰巧位于地球两极正上方（星下线与Z轴共线）
                                if (Cesium.Cartesian3.magnitude(right) < 0.01) {
                                    const xAxis = new Cesium.Cartesian3(1, 0, 0);
                                    right = Cesium.Cartesian3.cross(nadirAxis, xAxis, new Cesium.Cartesian3());
                                }
                            }
                            // 最终统一进行归一化，确保得到单位向量
                            Cesium.Cartesian3.normalize(right, right);
                            // ==========================================

                            // 4. 绕星下线自旋
                            const julianTime = Cesium.JulianDate.toDate(time).getTime();
                            const spinAngle = (julianTime / 600000) % (2 * Math.PI);
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

            // ==========================================
            // 报告第 9 节：额外的姿态可视化
            // ==========================================
            // 9.1 星下线（青色）
            const nadirLineEntity = viewer.entities.add({
                // 为实体生成一个唯一的 ID：前缀 + 卫星实体ID + 当前时间戳
                id: `sat-nadir-line-${String(entity.id)}-${Date.now()}`,
                polyline: {
                    // 使用 CallbackProperty 实现动态更新，让线条随卫星移动而实时重绘
                    positions: new Cesium.CallbackProperty(function (time: any) {
                        // 1. 获取卫星在当前时间点（time）的笛卡尔坐标 (X, Y, Z)
                        const pos = positionProp?.getValue(time);
                        if (!pos) return [];
                        // 2. 先将笛卡尔空间直角坐标 (X, Y, Z) 转换为地理弧度坐标 (Long, Lat, Height)
                        const carto = Cesium.Cartographic.fromCartesian(pos);
                        // 3. 【构造线段端点】
                        // 端点 1: 卫星在太空中的实际位置 (pos)
                        // 端点 2: 保持相同的经纬度，但将高度设为 0（即地表垂直投影点）
                        const groundPoint = Cesium.Cartesian3.fromRadians(
                            carto.longitude,
                            carto.latitude,
                            0
                        );

                        return [pos, groundPoint];
                    }, false),
                    width: 3,
                    material: Cesium.Color.CYAN.withAlpha(0.7),
                    // NONE: 强制两点之间走绝对直线（穿过大气层直达地心方向）
                    // 如果设为 GEODESIC，线条会尝试贴合地球曲率，在高空场景下会显得扭曲
                    arcType: Cesium.ArcType.NONE,
                }
            });

            // 9.2 & 9.3 模型头部朝向线（红色） + 夹角标签
            const forwardLineEntity = viewer.entities.add({
                id: `sat-forward-line-${String(entity.id)}-${Date.now()}`,
                position: positionProp,
                polyline: {
                    positions: new Cesium.CallbackProperty(function (time: any) {
                        // 获取当前时刻的位置 (pos) 和 姿态/旋转四元数 (ori)
                        const pos = positionProp?.getValue(time);
                        const ori = dynamicOrientationProp?.getValue(time);
                        if (!pos || !ori) return [];

                        // 将四元数转为 3x3 旋转矩阵，从中提取第一列（通常代表实体的 X 轴，即前进方向）
                        // 并将其归一化为单位向量
                        const forward = Cesium.Cartesian3.normalize(
                            Cesium.Matrix3.getColumn(Cesium.Matrix3.fromQuaternion(ori), 0, new Cesium.Cartesian3()),
                            new Cesium.Cartesian3()
                        );

                        // 构造从卫星位置出发，沿 forward 方向发射的射线
                        const ray = new Cesium.Ray(pos, forward);
                        // 计算射线与 WGS84 地球椭球体的相交情况
                        const intersectionInterval = Cesium.IntersectionTests.rayEllipsoid(ray, Cesium.Ellipsoid.WGS84);

                        let endPoint;
                        if (intersectionInterval) {
                            // 如果射线击中了地球，计算击中点的具体三维坐标
                            // intersectionInterval.start 是射线起点到第一个交点的距离
                            endPoint = Cesium.Ray.getPoint(ray, intersectionInterval.start, new Cesium.Cartesian3());
                        } else {
                            // 如果射线射向太空（没击中地球），则画一条 2000 公里长的虚构线段
                            const scaledForward = Cesium.Cartesian3.multiplyByScalar(forward, 2000000, new Cesium.Cartesian3());
                            // 将卫星的当前位置与 2,000 公里的向量相加
                            endPoint = Cesium.Cartesian3.add(pos, scaledForward, new Cesium.Cartesian3());
                        }

                        // 现在的数组是严格的 [Cartesian3, Cartesian3]，Cesium 可以安全渲染
                        return [pos, endPoint];
                    }, false),
                    width: 3,
                    material: Cesium.Color.RED.withAlpha(0.7),
                    arcType: Cesium.ArcType.NONE,
                },
                label: {
                    text: new Cesium.CallbackProperty(function (time: any) {
                        const pos = positionProp?.getValue(time);
                        const ori = dynamicOrientationProp?.getValue(time);
                        if (!pos || !ori) return '';

                        // 计算【天底向量】(Nadir)：从卫星指向地心的单位向量
                        const nadir = Cesium.Cartesian3.normalize(Cesium.Cartesian3.subtract(Cesium.Cartesian3.ZERO, pos, new Cesium.Cartesian3()), new Cesium.Cartesian3());
                        // 获取【前向向量】(Forward)
                        const forward = Cesium.Cartesian3.normalize(Cesium.Matrix3.getColumn(Cesium.Matrix3.fromQuaternion(ori), 0, new Cesium.Cartesian3()), new Cesium.Cartesian3());
                        // 通过两个单位向量的点积 (Dot Product) 计算它们之间的夹角弧度，并转为角度
                        const angleDegrees = Cesium.Math.toDegrees(Math.acos(Cesium.Math.clamp(Cesium.Cartesian3.dot(nadir, forward), -1.0, 1.0)));

                        return `夹角: ${angleDegrees.toFixed(1)}°`;
                    }, false),
                    font: '14px sans-serif',
                    pixelOffset: new Cesium.Cartesian2(0, -40),
                }
            });

            // 👇 最后，更新这行记录 Ref 的代码，把两条线存进去
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