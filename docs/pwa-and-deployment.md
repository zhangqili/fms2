# PWA 与部署说明

FMS2 是纯前端 PWA，没有后端依赖。应用可以部署到任意支持 HTTPS 的静态文件服务。

## PWA 配置

PWA 配置位于 `vite.config.ts`，使用 `vite-plugin-pwa`。

关键配置：

- `registerType: "prompt"`：发现新版本时提示用户刷新。
- `navigateFallback: "/index.html"`：支持前端路由刷新。
- `cleanupOutdatedCaches: true`：清理过期缓存。
- `clientsClaim: true`：Service Worker 尽快接管页面。
- `globPatterns`：缓存构建产物、HTML、CSS、图标和 manifest。

Manifest 信息包括：

- `name`: `Friend Management System 2`
- `short_name`: `FMS2`
- `lang`: `zh-CN`
- `display`: `standalone`
- `start_url`: `/`
- 快捷入口：新建榜单、导出。

## PWA 状态组件

PWA 状态提示位于 `src/components/PwaStatus.vue`。

组件负责：

- 监听在线和离线状态。
- 捕获 `beforeinstallprompt`，显示安装按钮。
- 监听 `appinstalled`。
- 注册 Service Worker。
- 每小时检查一次更新。
- 显示“已可离线使用”“发现新版本”“当前离线”等状态。

发现新版本时，用户点击更新按钮会调用 `updateServiceWorker(true)`。

## 离线能力边界

离线缓存负责让应用壳在离线状态下继续打开。业务数据不在 Service Worker 缓存中，而是在当前浏览器的 IndexedDB 中。

这意味着：

- 已安装或已访问过的应用可以离线打开。
- 人员、标签、榜单、分数等数据来自本机 IndexedDB。
- 清除站点数据会删除业务数据。
- PWA 离线能力不等于跨设备同步或云备份。

## 本地开发

```sh
pnpm run dev
```

开发模式下通常不完整验证 PWA 缓存行为。需要验证生产构建时：

```sh
pnpm run build
pnpm run preview
```

然后在浏览器中打开 preview 地址，检查安装提示、离线可用状态和更新提示。

## 部署建议

可以部署到任意 HTTPS 静态托管，例如：

- Cloudflare Pages
- Netlify
- Vercel
- Nginx 静态站点
- Caddy 静态站点

部署要求：

- 必须使用 HTTPS，浏览器才会启用 PWA 和 Service Worker。
- 所有前端路由都应回退到 `index.html`。
- 静态资源应允许长期缓存，但 `index.html` 不宜缓存过久。

Nginx 前端路由示例：

```nginx
location / {
  try_files $uri $uri/ /index.html;
}
```

## 数据备份建议

因为业务数据只在本机 IndexedDB 中，维护者应提醒用户：

- 定期导出 JSON 备份。
- 迁移设备前先导出备份。
- 清除浏览器数据前先导出备份。
- 导入旧 FMS xlsx 前确认已有备份，因为旧导入会清空并重建本地数据。

## 同步功能状态

当前项目尚未实现跨设备同步。

后续如需实现同步，应优先参考根目录的 `fms2-e2ee-distributed-sync-roadmap.md`。该方案以端到端加密事件日志为基础，目标是让 VPS 只保存密文，避免泄露人员、标签、榜单和分数明文。

同步功能落地前，不应在文档或 UI 中承诺自动备份或多设备一致性。
