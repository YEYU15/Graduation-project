import React, { useEffect, useState, useRef } from 'react';
import Stats from 'stats.js';

// 定义属性接口：target 是选中的卫星数据，lastModeledRef 用于跨组件访问 Cesium 实体
interface SatellitePanelProps {
    target: any;
    lastModeledRef: React.RefObject<{
        entity: any;
        snapshot: any;
        overlayEntity: any;
        extraEntities?: any[]
    } | null>;
    // 父组件传递过来的搜索执行函数
    onSearchRequest: (searchStr: string) => void;
}

const SatellitePanel: React.FC<SatellitePanelProps> = ({ target, lastModeledRef, onSearchRequest }) => {
    // 组件内部输入框状态
    // 存储用户在面板内搜索框中输入的文字
    const [inputValue, setInputValue] = useState('');

    // 存储实时的四元数和欧拉角
    // 一旦状态更新，React 就会重新渲染面板中的数字
    const [realtimeOrientation, setRealtimeOrientation] = useState<{
        quaternion?: { x: number; y: number; z: number; w: number };
        euler?: { heading: number; pitch: number; roll: number };
    } | null>(null);

    // 用于挂载 Stats 面板的容器
    const statsContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const stats = new Stats();
        const container = stats.dom;

        container.style.position = 'static';
        container.style.display = 'flex';
        container.style.width = '100%';
        container.style.justifyContent = 'flex-start'; // 改为靠左排列，方便放4个面板
        container.style.gap = '5px'; // 面板之间的间距
        container.style.pointerEvents = 'none';

        const fpsCanvas = container.children[0] as HTMLElement;
        const msCanvas = container.children[1] as HTMLElement;
        const mbCanvas = container.children[2] as HTMLElement;

        // 显示原生的 FPS 和 MS，隐藏原生的 MB 面板
        fpsCanvas.style.display = 'block';
        msCanvas.style.display = 'block';
        mbCanvas.style.display = 'none';

        // 面板 1：原有的实时 Draw Calls 面板 (青色)
        const dcPanel = document.createElement('div');
        dcPanel.style.width = '80px';
        dcPanel.style.height = '48px';
        dcPanel.style.background = '#002';
        dcPanel.style.color = '#0ff';
        dcPanel.style.fontFamily = 'Helvetica, Arial, sans-serif';
        dcPanel.style.fontSize = '9px';
        dcPanel.style.fontWeight = 'bold';
        dcPanel.style.lineHeight = '15px';
        dcPanel.style.padding = '2px 0 0 3px';
        dcPanel.style.boxSizing = 'border-box';
        dcPanel.innerHTML = `DRAW CALLS<br><span id="cesium-dc-value" style="font-size:24px; line-height:26px;">0</span>`;

        // 面板 2：全新的平均数据聚合面板 (黄绿色)
        const avgPanel = document.createElement('div');
        avgPanel.style.width = '90px'; // 稍微宽一点容纳三行字
        avgPanel.style.height = '48px';
        avgPanel.style.background = '#020'; // 深绿色背景区分一下
        avgPanel.style.color = '#8f8';      // 浅绿色标题文字
        avgPanel.style.fontFamily = 'Helvetica, Arial, sans-serif';
        avgPanel.style.fontSize = '9px';
        avgPanel.style.fontWeight = 'bold';
        avgPanel.style.lineHeight = '13px'; // 行高调小，塞下三行
        avgPanel.style.padding = '2px 0 0 3px';
        avgPanel.style.boxSizing = 'border-box';
        avgPanel.innerHTML = `AVERAGES<br>
            <div style="color:#ffeb3b; font-size:10px; margin-top:1px;">
                FPS: <span id="avg-fps-val">0</span><br>
                MS: <span id="avg-ms-val">0</span><br>
                DC: <span id="avg-dc-val">0</span>
            </div>`;

        // 将自定义的两个面板塞进 Stats 容器
        container.appendChild(dcPanel);
        container.appendChild(avgPanel);

        if (statsContainerRef.current) {
            statsContainerRef.current.innerHTML = '';
            statsContainerRef.current.appendChild(container);
        }

        // --- 用于计算平均值的全局状态 ---
        let animationFrameId: number;
        let frameCount = 0;
        let totalMs = 0;
        let totalDc = 0;
        let startTime = performance.now();
        let lastFrameTime = startTime;

        const animate = () => {
            stats.update(); // 更新原生的 FPS 和 MS

            const now = performance.now();
            const deltaMs = now - lastFrameTime;
            lastFrameTime = now;

            const viewer = (window as any).viewer;
            let currentDrawCalls = 0;

            if (viewer && viewer.scene) {
                // 1. 获取当前帧真实的 Draw Calls
                currentDrawCalls =
                    viewer.scene._performanceDisplay?._drawCommands ||
                    viewer.scene.frameState?.commandList?.length ||
                    viewer.scene._commandList?.length ||
                    0;

                // 2. 更新原有的实时 Draw Calls 面板
                const dcSpan = document.getElementById('cesium-dc-value');
                if (dcSpan) {
                    dcSpan.innerText = currentDrawCalls.toString();
                }
            }

            // 3. 计算并更新平均值面板 (剔除前 2 秒的初始化波动卡顿)
            if (now - startTime > 2000) {
                frameCount++;
                totalMs += deltaMs;
                totalDc += currentDrawCalls;

                // 为了不影响渲染性能，每 30 帧更新一次 DOM 文字
                if (frameCount % 30 === 0) {
                    const avgFps = Math.round((frameCount / totalMs) * 1000);
                    const avgMs = (totalMs / frameCount).toFixed(1);
                    const avgDc = Math.round(totalDc / frameCount);

                    const fpsNode = document.getElementById('avg-fps-val');
                    const msNode = document.getElementById('avg-ms-val');
                    const dcNode = document.getElementById('avg-dc-val');

                    if (fpsNode) fpsNode.innerText = avgFps.toString();
                    if (msNode) msNode.innerText = avgMs.toString();
                    if (dcNode) dcNode.innerText = avgDc.toString();
                }
            }

            animationFrameId = requestAnimationFrame(animate);
        };

        animate();

        return () => {
            cancelAnimationFrame(animationFrameId);
            if (statsContainerRef.current) {
                statsContainerRef.current.innerHTML = '';
            }
        };
    }, []);

    // 处理 Cesium 时钟监听
    useEffect(() => {
        const viewer = (window as any).viewer;
        const Cesium = (window as any).Cesium;

        // 即使没有 target，useEffect 也要运行，
        // 但需要判断 viewer 是否存在，且只在有 target 时清理旧状态
        if (!viewer || !Cesium) return;

        // 绑定监听器的前提是必须有 target 且 viewer 已准备好
        // 两次取反强行转为布尔型
        const hasTarget = !!target;

        // 【核心回调函数】Cesium 每渲染一帧都会执行一次
        const handleTick = (clock: any) => {
            if (!hasTarget) return; // 没有目标时不执行具体计算逻辑

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

        // 仅在有 target 时绑定监听器
        if (hasTarget) {
            viewer.clock.onTick.addEventListener(handleTick);
        }

        // 清理函数
        return () => {
            // 移除监听器
            if (hasTarget) {
                viewer.clock.onTick.removeEventListener(handleTick);
            }
            // 重置状态
            setRealtimeOrientation(null);
        };
        // 当 [target, lastModeledRef] 发生变化时，执行 useEffect 
    }, [target, lastModeledRef]);

    // 内部处理搜索提交的辅助函数
    const handleDoSearch = () => {
        if (inputValue.trim() && onSearchRequest) {
            onSearchRequest(inputValue.trim());
        }
    };

    // 3. 纯净的 UI 渲染
    return (
        <div
            className="satellite-info-panel"
            style={{
                position: 'absolute',
                left: 20,
                top: 20,
                background: 'rgba(0,0,0,0.7)',
                color: 'white',        // 白色文字
                padding: '15px',       // 内边距
                borderRadius: '8px',   // 圆角
                zIndex: 999,           // 确保置于地图最上方
                // 必须改为 'auto'，否则无法点击输入框和按钮
                pointerEvents: 'auto',
                // 使用 Flex 布局，让内部元素从上到下垂直排列
                // 并给一个最小宽度，防止面板被内容挤变形
                display: 'flex',
                flexDirection: 'column',
                minWidth: '280px'
            }}
        >
            {/* ==========================================
            新增改动 Stats.js 挂载点
            增加了 display: flex 和 justifyContent: 'flex-end'
            作用是把 FPS 面板推到容器的右上角
            ========================================== */}
            <div
                ref={statsContainerRef}
                style={{
                    marginBottom: '15px',
                    width: '100%' // 确保外层容器撑满 100%
                }}
            />
            {/* ==========================================
                面板内的搜索工具栏区域
                ========================================== */}
            <div style={{
                display: 'flex',
                gap: '8px',
                marginBottom: '15px',
                borderBottom: '1px solid rgba(255,255,255,0.2)',
                paddingBottom: '10px'
            }}>
                <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder="输入卫星名称或 ID"
                    // 按下回车键也能直接搜索
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') handleDoSearch();
                    }}
                    style={{
                        flex: 1, // 占据剩余空间
                        padding: '6px 10px',
                        borderRadius: '4px',
                        border: 'none',
                        outline: 'none',
                        background: 'rgba(255,255,255,0.9)',
                        color: '#333',
                        fontSize: '13px'
                    }}
                />
                <button
                    onClick={handleDoSearch}
                    style={{
                        padding: '6px 12px',
                        cursor: 'pointer',
                        borderRadius: '4px',
                        border: 'none',
                        background: '#007bff',
                        color: 'white',
                        fontWeight: 'bold',
                        fontSize: '13px',
                        transition: 'background 0.2s'
                    }}
                    // 简单的 hover 效果
                    onMouseOver={(e) => e.currentTarget.style.background = '#0069d9'}
                    onMouseOut={(e) => e.currentTarget.style.background = '#007bff'}
                >
                    搜索
                </button>
            </div>

            {/* ==========================================
                对数据展示区域采用条件渲染
                只有选中了卫星且有数据时才显示下方的姿态信息
                ========================================== */}
            {(!target || !realtimeOrientation) ? (
                // 未选择卫星时的提示文字
                <div style={{ fontSize: '13px', color: '#bbb', fontStyle: 'italic', textAlign: 'center', padding: '10px 0' }}>
                    请在地图上选择或使用上方搜索卫星
                </div>
            ) : (
                // 选中卫星后的原数据展示 UI (保持不变)
                <>
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
                </>
            )}
        </div>
    );
};

export default SatellitePanel;