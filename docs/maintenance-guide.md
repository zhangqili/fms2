# FMS2 维护指南

本文面向后续维护者，说明 FMS2 的代码分层、常见改动入口和容易改错的行为边界。

## 应用分层

FMS2 的业务代码按以下方向组织：

```text
Vue views/components
  ↓
Pinia stores
  ↓
repositories
  ↓
Dexie / IndexedDB
```

- `src/views/` 放页面级组件，例如人员页、榜单页、导出页、比较页。
- `src/components/` 放可复用 UI，例如工作区标签页、趋势图、分数输入、标签选择器。
- `src/stores/` 放 Pinia store，管理页面状态、会话级筛选条件和跨页面共享状态。
- `src/repositories/` 封装 IndexedDB 读写、导入导出、统计计算。Vue 组件不应直接散落访问 `db`。
- `src/db/` 定义 Dexie 数据库名、版本和表索引。
- `src/types/` 定义核心业务类型。
- `src/utils/` 放不依赖 Vue 的工具逻辑，例如日期、ID、排名、变动文本。

## 常见维护流程

新增页面：

1. 在 `src/views/` 新增页面组件。
2. 在 `src/app/router.ts` 注册路由。
3. 如需侧边栏入口，在 `src/App.vue` 的 `navItems` 中添加。
4. 如页面需要共享状态，优先新增或扩展对应 Pinia store。

新增数据访问能力：

1. 优先在 `src/repositories/` 中新增函数。
2. 若只是页面状态，不要新增数据库字段。
3. 若确实需要持久字段，需要同步更新 `src/types/models.ts`、`src/db/schema.ts` 和相关导入导出逻辑。
4. 修改表结构时必须提升 `DB_SCHEMA_VERSION`，并补充迁移策略。

修改人员或榜单功能：

- 人员基础信息在 `people` 表中。
- 标签关系在 `person_tags` 表中。
- 分数不存在“当前值”，只保存在 `leaderboard_entries.scoreSnapshot`。
- 榜单保存的是快照，后续人员改名、改标签不会自动改写旧条目快照。
- 排名和总榜统计口径集中在 `src/repositories/leaderboardsRepository.ts` 和 `src/utils/ranking.ts`。

调整主题样式：

- 全局样式在 `src/assets/styles.css`。
- 默认主题色在 `src/stores/settingsStore.ts` 的 `DEFAULT_THEME_COLOR`。
- 设置页更新主题色后会写入 `app_settings`，并设置 CSS 变量 `--theme-color`。

## 工作区标签页

工作区标签页组件是 `src/components/WorkspaceTabs.vue`，状态在 `src/stores/workspaceTabsStore.ts`。

人员详情、榜单详情和各年份的年榜会进入工作区标签页系统：

- `/people/:id` 打开人员标签。
- `/leaderboards/:id` 打开榜单标签。
- `/annual-leaderboards/:year` 打开该年份的年榜标签，标题为“2025 年榜”等。

`src/App.vue` 监听路由变化，自动根据当前路由同步标签页标题和激活状态。人员标签显示姓名，榜单标签显示日期，不显示榜单标题。

年榜页面确认年份存在并加载成功后创建年度标签页；`App.vue` 在路由切换时激活已有年度标签页。关闭最后一个年度标签页返回首页，避免年榜入口自动打开最新年份。年度标签页与其他标签页一样仅保留在当前会话，不持久化。

维护注意：

- 从表格行跳转详情时，应同时走路由跳转。`App.vue` 会负责同步标签。
- 如果新增需要标签页承载的实体，要扩展 `workspaceTabsStore` 的实体类型、打开逻辑和标题更新逻辑。
- 比较页不进入工作区标签页系统，它读取当前已打开的人员标签作为比较对象。

## 图表维护

图表使用 ECharts modular import，相关组件：

- `src/components/PersonTrendChart.vue`
- `src/components/PeopleCompareChart.vue`

人员详情图表支持：

- `score-rank`：分数和单期排名。
- `overall-rank`：截至每期的历史总榜排名。

比较页图表支持：

- `score`：多人员分数走势。
- `rank`：多人员单期排名走势。
- `overall-rank`：多人员历史总榜排名走势。

图表口径：

- 缺席、出榜、0 分或无排名的数据点使用 `null`，图上断线。
- 排名类图表使用反向 Y 轴，第 1 名在上方。
- 默认不显示数据圆点，只在 hover 时显示提示。
- Tooltip 不使用跟随动画。
- 鼠标滚轮默认无动作，`Ctrl + 滚轮` 横向缩放，`Alt + 滚轮` 纵向缩放。
- 缩放和拖动滚动条时禁用图表动画。

## 人员筛选维护

人员页筛选状态在 `peopleStore.filterState` 中，是会话级状态，刷新页面后恢复默认。

筛选分两层：

- 快速筛选：文本框和标签栏，用于常用筛选。
- 高级筛选：条件组树，支持嵌套 `and` / `or`。

条件类型包括：

- 关键词查询。
- 归档状态。
- 包含标签。
- 排除标签。
- 统计指标范围。

排序支持字段和方向，排序方向由用户选择。默认按总榜排名升序，无统计人员排在有统计人员之后。

维护注意：

- 快速筛选和高级筛选都只影响人员列表展示。
- 筛选不影响导出、新建榜单、榜单详情或比较页。
- 增加新的统计筛选项时，需要确保无历史数据人员的空值处理明确。

## 提交前建议检查

文档改动：

```sh
git diff --check
```

源码改动：

```sh
pnpm run typecheck
pnpm run build
git diff --check
```

涉及导入导出、排名、筛选或图表时，建议额外手动验证一组含有出榜、回榜、同分、0 分和缺席的数据。
