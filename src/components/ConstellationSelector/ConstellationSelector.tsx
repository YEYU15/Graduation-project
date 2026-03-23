import React, { useEffect } from 'react';
import { getConstellationCzml } from '../../services/simulationApi';

const ConstellationSelector: React.FC = () => {
    useEffect(() => {
        const loadOrbit = async () => {
            // 1. 获取全局的 viewer 和 Cesium (从阶段一挂载的地方取)
            const viewer = (window as any).viewer;
            const Cesium = (window as any).Cesium;

            if (!viewer || !Cesium) return;

            // 2. 调用 API 获取数据
            const czmlResponse = await getConstellationCzml();

            if (czmlResponse.czml_data && czmlResponse.czml_data.length > 0) {
                // 清理旧数据
                viewer.dataSources.removeAll();

                // 3. 创建数据源并加载 (对应文档 2.2 节)
                const mainDataSource = new Cesium.CzmlDataSource();
                await viewer.dataSources.add(mainDataSource);

                for (const item of czmlResponse.czml_data) {
                    const czmlData = typeof item === 'string' ? JSON.parse(item) : item;
                    await mainDataSource.process(czmlData);
                }
            }
        };

        loadOrbit();
    }, []);

    return null; // 这个组件只负责逻辑，不渲染 UI
};

export default ConstellationSelector;