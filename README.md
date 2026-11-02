# FMS2

FMS2 是一个离线优先的亲友榜单管理 PWA。应用使用 Vue 3 构建，业务数据保存在浏览器 IndexedDB 中，支持人员、标签、手动榜单、年榜与年度代表人物、排名走势、Excel 导入导出和旧 FMS 数据迁移。

这个仓库同时保留了旧版 FMS C# 项目，位于 `FMS/`，主要作为旧格式导入导出的行为参考。

## 技术栈

- Vue 3 + TypeScript
- Vite
- Vue Router
- Pinia
- Dexie / IndexedDB
- vite-plugin-pwa / Workbox
- ECharts
- SheetJS xlsx
- lucide-vue-next

## 开发命令

```sh
pnpm install
pnpm run dev
pnpm run typecheck
pnpm run test:annual
pnpm run build
pnpm run preview
```

`pnpm run build` 会先执行 `vue-tsc --noEmit`，再执行 Vite 构建。

## 目录导览

```text
src/
  app/            Pinia 与 Vue Router 初始化
  assets/         全局样式
  components/     通用组件、图表、工作区标签页
  db/             Dexie 数据库名、版本、表结构
  repositories/   IndexedDB 访问、导入导出、统计计算
  stores/         Pinia store 与页面会话状态
  types/          核心业务类型
  utils/          日期、ID、排名、变动文本等工具
  views/          页面级组件
public/           PWA 图标等静态资源
FMS/              旧版 FMS 项目，仅作为兼容参考
```

## 维护文档

- [维护指南](docs/maintenance-guide.md)
- [数据模型与排名口径](docs/data-model-and-ranking.md)
- [导入导出说明](docs/import-export.md)
- [PWA 与部署说明](docs/pwa-and-deployment.md)

历史设计资料：

- [FMS2 技术路线](friend-management-system-2-roadmap.md)
- [端到端加密与多 VPS 分布式同步方案](fms2-e2ee-distributed-sync-roadmap.md)

## 数据安全提醒

FMS2 当前没有后端和账号系统。人员、标签、榜单、分数、设置等业务数据都保存在当前浏览器的 IndexedDB 中。

维护或使用时需要注意：

- 清除浏览器站点数据会删除业务数据。
- 卸载 PWA 或更换设备前应先导出备份。
- 旧 FMS xlsx 导入会清空并重建当前本地业务数据。
- PWA 离线缓存只缓存应用壳，不等于业务数据云备份。

## 当前同步状态

跨设备同步尚未实现。同步相关设计暂时记录在 [端到端加密与多 VPS 分布式同步方案](fms2-e2ee-distributed-sync-roadmap.md) 中。
