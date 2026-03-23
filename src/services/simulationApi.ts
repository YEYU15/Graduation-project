// 模拟文档中的 getConstellationCzml 函数
export const getConstellationCzml = async () => {
  // 这里暂时请求我们刚刚创建的本地静态文件
  const response = await fetch('/test.czml');
  const data = await response.json();

  return {
    czml_len: 1,
    czml_data: [JSON.stringify(data)] // 模拟后端返回的字符串数组格式
  };
};