# Video Browser (Static)

静态网页版 `video-analysis-browser`，用于读取 `index.json` 并浏览分段、关键词时间轴、文本定位结果。

## 启动

```bash
cd /mnt/aigc_image/chengwei/Project/video-browser
python3 -m http.server 8765
```

浏览器打开：`http://127.0.0.1:8765`

## 使用步骤

1. 在页面顶部加载 `index.json`：
   - 方式 A：上传本地 JSON 文件。
   - 方式 B：填写可访问的 URL（同源或允许 CORS）。
2. 选择视频源：
   - 上传本地视频文件（推荐，支持精确时间跳转）。
   - 粘贴视频链接（YouTube/B站会转 embed；抖音/快手按网页嵌入尝试）。
3. 在搜索框输入文本并点击“文本定位”。

## 资源目录绑定（可选）

如果你是通过“本地文件上传”加载 `index.json`，浏览器不能自动读取同目录帧图。
这时可再选择一次“资源目录”（`webkitdirectory`），页面会把 `frame_paths` 映射到本地对象 URL，从而展示帧图。

## 说明

- 这是纯前端静态版，不依赖后端 `/api/search`。
- 搜索打分逻辑已迁移到前端，尽量对齐原服务行为。
- 第三方站点是否允许 `iframe` 取决于目标站点策略，可能出现可打开但不可嵌入的情况。
