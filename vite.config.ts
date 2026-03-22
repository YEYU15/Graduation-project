import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import cesium from 'vite-plugin-cesium'

export default defineConfig({
  plugins: [
    react(),
    cesium() // 插件会自动处理 Cesium 的 BaseURL 和资源拷贝
  ],
})