# 亲友评分榜 PWA 技术路线

## 1. 当前需求约束

这一版按以下需求设计：

- 应用先做成纯离线 PWA，不接后端，不登录，所有业务数据保存在本地设备。
- 不使用「圈子」模型，改用「标签」管理人员。
- 评分维度暂定为一维，只有一种分数。
- 榜单由用户手动添加，不做定时自动生成。
- 榜单需要有标题字段，但标题允许留空。
- 新建榜单时，默认以上一次榜单为模板继续编辑。
- 查看榜单时，需要展示相对上一期的变动：排名变化、初次进榜、回榜、出榜。
- 如果上一期榜单里有某个评分对象，而本期榜单没有，该对象也要作为「出榜」记录显示在本期榜单内。
- 前端框架使用 Vue。

这意味着第一版的技术路线应尽量轻：前端应用 + PWA 缓存 + IndexedDB 本地数据库 + JSON 备份导入导出。

## 2. 产品定位

目标是做一个可安装、可离线、数据只保存在本地的亲友榜单记录工具。用户可以维护人员列表，用标签分类，并在每一次手动创建榜单时为人员填写单一分数。

建议产品语气仍然保持温和：把它做成「关系记录」「互动评分」「阶段榜单」，而不是鼓励负面比较。亲友数据很敏感，纯离线能降低云端泄露风险，但仍要提醒用户：清除浏览器数据、卸载 PWA 或更换设备可能导致本地数据丢失。

## 3. MVP 功能范围

第一版只做以下闭环：

- 添加、编辑、归档人员。
- 添加、编辑、删除标签。
- 给人员绑定多个标签。
- 在每次新建榜单时，为榜单内人员填写一个分数。
- 查看人员参与过的历史榜单记录。
- 按标签筛选人员。
- 手动新建榜单。
- 新建榜单时填写标题，标题可留空。
- 新建榜单默认复制最近一次榜单的筛选条件和候选对象，作为编辑模板。
- 榜单保存为快照，后续新榜单里的分数变化不影响历史榜单。
- 榜单详情展示与上一期相比的排名变化、初次进榜、回榜和出榜。
- 支持 PWA 安装和离线打开。
- 支持导出 JSON 备份。
- 支持从 JSON 备份恢复数据。

暂不做：

- 云同步。
- 登录注册。
- 多设备协作。
- 自动定时榜单。
- 多维评分。
- 推送通知。
- 服务端权限系统。

## 4. 推荐技术栈

### 前端

- Vue 3 + TypeScript。
- Vite 作为构建工具。
- Vue Router 管理页面。
- Pinia 管理应用状态。
- Dexie.js 封装 IndexedDB。
- VueUse 提供常用组合式工具函数。
- Tailwind CSS 或 UnoCSS 做样式。
- lucide-vue-next 做图标。
- vite-plugin-pwa + Workbox 做 PWA。

### 本地数据

主数据放 IndexedDB，不建议把业务数据放 localStorage。

原因：

- IndexedDB 更适合结构化数据和较多记录。
- IndexedDB 是异步 API，不会像 localStorage 那样阻塞主线程。
- 榜单评分快照、标签关系都更像小型本地数据库。

localStorage 只适合保存少量 UI 偏好，例如主题、最近打开页面、列表展示方式。

### 部署

纯离线应用仍然需要先通过网页访问一次，所以建议：

- 前端部署到 Vercel、Netlify、Cloudflare Pages 或任意静态文件服务。
- 生产环境使用 HTTPS。
- 用户首次打开后安装为 PWA。
- 安装后，应用壳可以离线打开，业务数据保存在本机 IndexedDB。

## 5. 应用架构

```text
Vue PWA
  |
  |-- Vue 页面与组件
  |-- Pinia stores
  |-- Repository 数据访问层
  |-- Dexie / IndexedDB
  |-- Service Worker
  |-- JSON 备份导入导出
```

分层建议：

- `views/`：页面，例如人员列表、人员详情、榜单列表。
- `components/`：可复用组件，例如标签选择器、分数输入器。
- `stores/`：Pinia store，负责页面状态和调用 repository。
- `repositories/`：封装 IndexedDB 增删改查。
- `db/`：Dexie 表结构、迁移、索引。
- `types/`：核心数据类型。
- `utils/`：排序、日期、导入导出、ID 生成。

不要让 Vue 组件直接散落调用 IndexedDB。中间加 repository 层，后面如果要加云同步，也更容易替换。

## 6. 页面规划

### 首页 / 仪表盘

展示：

- 人员总数。
- 标签数量。
- 最近创建的榜单。
- 最近编辑的榜单。
- 快捷入口：添加人员、新建榜单、导出备份。

### 人员列表

能力：

- 搜索姓名。
- 按标签筛选。
- 按姓名、创建时间、更新时间排序。
- 显示人员姓名、标签、备注、归档状态。
- 支持归档人员隐藏。

### 人员详情

能力：

- 编辑姓名、备注、标签。
- 查看该人员参与过的历史榜单、分数、名次和变动。
- 删除或归档人员。

### 标签管理

能力：

- 新建标签。
- 编辑标签名称和颜色。
- 删除标签。
- 查看每个标签下的人数。

### 榜单列表

能力：

- 查看所有手动创建的榜单。
- 显示标题或默认占位名。
- 显示创建时间、上榜人数。
- 删除榜单。

### 榜单详情

能力：

- 展示榜单标题。
- 如果标题为空，界面显示「未命名榜单」或日期兜底。
- 展示榜单创建时间。
- 展示上榜人员、名次、快照分数、当时标签、榜单变动。
- 对本期仍在榜的人显示：上升、下降、持平、初次进榜、回榜。
- 对上一期在榜但本期不在榜的人显示：出榜。
- 出榜对象也显示在本期榜单详情内，但不参与本期排名。
- 可编辑标题和备注。

### 新建榜单

建议流程：

1. 点击「新建榜单」。
2. 系统读取最近一次榜单，作为默认模板。
3. 标题输入框可留空；如果从模板复制标题，建议自动追加日期或直接留给用户修改。
4. 默认沿用上一期的标签筛选、人数范围和候选对象。
5. 默认把上一期在榜人员和分数带入草稿，用户可继续编辑。
6. 用户可调整标签筛选、候选人员、人数范围，例如全部、前 10、前 20。
7. 用户在本期榜单草稿里填写或修改分数。
8. 预览本期排名和相对上一期的变动。
9. 如果上一期有人本期不在候选结果中，预览区仍追加显示为「出榜」。
10. 点击保存，生成榜单快照。

MVP 中榜单排序直接按本期榜单草稿分数从高到低。保存后，榜单中的分数、名次、变动状态都固定下来。

模板规则：

- 如果没有历史榜单，新建榜单使用默认设置。
- 如果存在历史榜单，新建榜单默认使用 `createdAt` 最新的榜单作为模板。
- 模板复制筛选条件、人数范围、候选对象、标题草稿和上一期分数，作为本期可编辑草稿。
- 预览和保存时使用本期草稿里的分数生成排名。
- 人员表不保存分数；不存在全局「当前分数」。
- 出榜对象来自上一期榜单的在榜对象集合，不参与本期排名，但必须保存到本期榜单条目中。

## 7. 数据模型草案

所有 ID 建议使用 `crypto.randomUUID()` 生成。

### people

人员表。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | string | 主键 |
| name | string | 姓名或昵称 |
| note | string | 备注，可为空 |
| archived | boolean | 是否归档 |
| createdAt | string | ISO 时间 |
| updatedAt | string | ISO 时间 |

### tags

标签表。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | string | 主键 |
| name | string | 标签名 |
| color | string | 标签颜色 |
| sortOrder | number | 排序 |
| createdAt | string | ISO 时间 |
| updatedAt | string | ISO 时间 |

### person_tags

人员和标签的多对多关系。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | string | 主键 |
| personId | string | 人员 ID |
| tagId | string | 标签 ID |
| createdAt | string | ISO 时间 |

建议对 `[personId+tagId]` 建唯一索引，避免重复绑定。

本设计不在人员表保存分数，也不单独建立全局评分记录表。分数只属于某一次榜单，保存在 `leaderboard_entries.scoreSnapshot` 中。

### leaderboards

榜单表。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | string | 主键 |
| title | string | 标题，可为空字符串 |
| note | string | 备注，可为空 |
| filterTagIds | string[] | 创建榜单时使用的标签筛选条件 |
| maxEntries | number \| null | 创建榜单时的人数范围，`null` 表示全部 |
| templateLeaderboardId | string \| null | 新建时使用的模板榜单 ID |
| previousLeaderboardId | string \| null | 用于计算变动的上一期榜单 ID |
| createdAt | string | 创建时间 |
| updatedAt | string | 更新时间 |

### leaderboard_entries

榜单条目表。它保存的是快照，不是动态查询结果。本期出榜对象也要写入此表。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | string | 主键 |
| leaderboardId | string | 榜单 ID |
| personId | string | 人员 ID |
| personNameSnapshot | string | 创建榜单时的人员姓名 |
| tagSnapshots | string[] | 创建榜单时的标签名 |
| rank | number \| null | 本期名次；出榜对象为 `null` |
| previousRank | number \| null | 上一期名次；初次进榜为 `null` |
| rankDelta | number \| null | 排名变化；正数表示上升，负数表示下降 |
| movement | string | `up` / `down` / `same` / `new` / `returning` / `out` |
| scoreSnapshot | number \| null | 创建榜单时的分数；出榜对象可为空 |
| previousScoreSnapshot | number \| null | 上一期快照分数 |
| includedInRanking | boolean | 是否参与本期排名；出榜对象为 `false` |
| noteSnapshot | string | 创建榜单时的人员备注，可为空 |
| createdAt | string | 创建时间 |

为什么要保存快照：

- 历史榜单不应被未来其他榜单里的分数变化影响。
- 人员改名后，历史榜单仍能显示当时名称。
- 标签变化后，历史榜单仍能保留当时语境。
- 排名变化、回榜、出榜等状态应随本期榜单固定，不被后续榜单影响。

出榜条目说明：

- 如果上一期榜单的某个 `personId` 参与了排名，而本期候选结果中没有它，则本期必须创建一条 `movement = "out"` 的条目。
- 出榜条目的 `rank = null`、`includedInRanking = false`、`previousRank` 使用上一期名次。
- 如果该人员还存在，`personNameSnapshot` 可以使用当前姓名；如果已删除或不可读，则沿用上一期快照姓名。
- 出榜条目在 UI 中显示在在榜列表之后，单独分组为「出榜」更清晰。

### app_settings

应用设置。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | string | 固定为 `app` |
| scoreMin | number | 分数下限 |
| scoreMax | number | 分数上限 |
| defaultSort | string | 默认排序 |
| schemaVersion | number | 本地数据库版本 |
| updatedAt | string | 更新时间 |

初始建议：

- `scoreMin = 0`
- `scoreMax = 100`
- 新建第一份榜单时，默认分数可设为 `60` 或 `0`，按产品语气决定。
- 基于模板新建榜单时，默认沿用上一期条目的 `scoreSnapshot`，用户再修改。

## 8. 排名规则

MVP 排名规则建议透明简单：

1. 分数高者靠前。
2. 分数相同，上一期名次更高者靠前。
3. 仍相同，按姓名排序。
4. 出榜对象不参与本期排名。
5. 榜单保存后，名次和变动状态固定。

变动状态计算：

| 状态 | 条件 | 展示建议 |
| --- | --- | --- |
| `up` | 本期在榜，上一期也在榜，且本期名次数字更小 | 上升 N 名 |
| `down` | 本期在榜，上一期也在榜，且本期名次数字更大 | 下降 N 名 |
| `same` | 本期在榜，上一期也在榜，且名次相同 | 持平 |
| `new` | 本期在榜，历史所有榜单中从未出现过 | 初次进榜 |
| `returning` | 本期在榜，上一期不在榜，但更早榜单出现过 | 回榜 |
| `out` | 上一期在榜，本期不在榜 | 出榜 |

`rankDelta` 建议定义为：

```text
rankDelta = previousRank - currentRank
```

因此：

- `rankDelta > 0` 表示排名上升。
- `rankDelta < 0` 表示排名下降。
- `rankDelta = 0` 表示持平。
- 初次进榜、回榜、出榜可设为 `null`，避免误读。

生成一份新榜单时，需要同时拿到三类数据：

- 本期候选对象：由当前标签筛选、人数范围和手动编辑结果决定。
- 上一期在榜对象：来自 `previousLeaderboardId` 的 `includedInRanking = true` 条目。
- 历史出现对象：来自所有更早榜单的 `includedInRanking = true` 条目，用于判断初次进榜或回榜。

空标题处理：

- 数据层允许 `title = ""`。
- UI 层显示兜底名，例如「未命名榜单」。
- 导出文件中保留空字符串，不强行改写用户输入。

归档人员处理：

- 默认不进入新建榜单预览。
- 历史榜单中如果已有归档人员，仍继续展示快照。

## 9. PWA 与离线策略

PWA 需要关注两类数据：

- 应用壳：HTML、JS、CSS、图标、字体。
- 业务数据：人员、标签、榜单、榜单评分条目。

建议策略：

| 类型 | 存储位置 | 策略 |
| --- | --- | --- |
| HTML / JS / CSS | Service Worker Cache | 构建时预缓存 |
| 图标和字体 | Service Worker Cache | 预缓存或 stale while revalidate |
| 人员数据 | IndexedDB | 本地持久化 |
| 标签数据 | IndexedDB | 本地持久化 |
| 榜单快照 | IndexedDB | 本地持久化 |
| 榜单评分条目 | IndexedDB | 本地持久化 |
| 主题偏好 | localStorage | 少量配置 |

重点：

- Service Worker 只负责让应用能打开，不负责保存业务数据。
- 业务数据全部进 IndexedDB。
- 应用启动时从 IndexedDB 读取数据并填充 Pinia store。
- 数据写入时先落 IndexedDB，再更新界面状态。

更新策略：

- MVP 可以使用 `registerType: "prompt"`，有新版本时提示用户刷新。
- 不建议第一版自动强刷，避免用户正在录入时页面刷新。

## 10. 备份与恢复

纯离线应用最大的风险是数据只在本机。第一版就应该做备份功能。

### 导出

导出一个 JSON 文件，包含：

- `exportedAt`
- `appVersion`
- `schemaVersion`
- `people`
- `tags`
- `person_tags`
- `leaderboards`
- `leaderboard_entries`
- `app_settings`

### 导入

导入时建议提供三种模式：

- 覆盖导入：清空当前数据，再恢复备份。
- 合并导入：按 ID 合并，冲突时保留更新时间较新的记录。
- 仅预览：先显示备份内容概览，不写入。

MVP 可以先做覆盖导入，简单可靠。

### 风险提示

需要在设置页明确提示：

- 清除浏览器网站数据会删除本地记录。
- 卸载 PWA 可能删除本地记录。
- 换设备不会自动同步。
- 建议定期导出备份。

第二阶段可以加：

- 备份文件加密。
- 自动提醒备份。
- WebDAV / iCloud Drive / 本地文件系统备份。
- 可选云同步。

## 11. 开发阶段计划

### 阶段 0：确认规则，0.5-1 天

需要定下来：

- 分数范围：0-100、1-5、还是 -10 到 10。
- 新人员默认分数。
- 榜单是否默认包含所有未归档人员。
- 标题为空时 UI 显示「未命名榜单」还是日期。
- 删除人员时是否保留历史榜单快照，或只允许归档。

建议 MVP 决策：

- 分数范围 0-100。
- 新人员默认 60。
- 新建榜单默认包含所有未归档人员。
- 空标题显示「未命名榜单」。
- 人员优先归档，删除需要二次确认。

### 阶段 1：Vue 项目骨架，1 天

产出：

- Vite + Vue + TypeScript 项目。
- Vue Router。
- Pinia。
- 基础布局。
- 移动端优先样式。
- 图标系统。

验收：

- 首页、人员列表、榜单列表、设置页能切换。
- 手机宽度下布局不溢出。

### 阶段 2：IndexedDB 数据层，1-2 天

产出：

- Dexie 数据库定义。
- 数据类型定义。
- Repository 层。
- 数据库版本迁移方案。
- 基础 seed 数据，可选。

验收：

- 能新增、编辑、读取人员。
- 刷新页面后数据仍存在。
- 能新增、编辑、删除标签。
- 能维护人员和标签关系。

### 阶段 3：榜单内评分草稿，1-2 天

产出：

- 分数输入组件。
- 新建榜单时的人员分数编辑表格。
- 基于上一期榜单条目预填分数。
- 草稿分数范围校验。
- 根据草稿分数实时生成排名预览。

验收：

- 编辑草稿分数不会修改人员表。
- 编辑草稿分数不会修改上一期榜单。
- 分数超出范围时前端阻止保存。
- 保存榜单后，分数写入 `leaderboard_entries.scoreSnapshot`。

### 阶段 4：手动榜单，1-2 天

产出：

- 新建榜单页面。
- 最近一次榜单模板加载。
- 标签筛选。
- 排名预览。
- 榜单变动预览。
- 榜单快照写入。
- 出榜条目写入。
- 榜单详情展示。
- 榜单标题可为空。

验收：

- 新建榜单时能默认沿用最近一次榜单的筛选条件和候选对象。
- 创建榜单后，修改下一期草稿分数不影响旧榜单。
- 空标题榜单能正常保存和展示。
- 本期榜单能显示排名上升、下降、持平、初次进榜、回榜。
- 上期在榜但本期缺失的对象，会作为出榜条目显示在本期榜单中。
- 榜单删除不会删除人员；是否删除该榜单条目需由数据层级联处理。

### 阶段 5：PWA，1 天

产出：

- Web App Manifest。
- PWA 图标：192x192、512x512、maskable。
- Service Worker。
- 应用壳缓存。
- 离线启动页。
- 新版本提示。

验收：

- Chrome / Edge 可安装。
- 断网后可打开应用。
- 刷新页面后本地数据仍可读取。

### 阶段 6：备份恢复与打磨，1-2 天

产出：

- JSON 导出。
- JSON 覆盖导入。
- 设置页。
- 数据风险提示。
- 基础错误处理。

验收：

- 导出的 JSON 能在新浏览器环境恢复。
- 导入前有确认提示。
- JSON 结构版本不匹配时给出提示。

## 12. 测试策略

单元测试：

- 排名排序。
- 排名变化计算。
- 初次进榜判断。
- 回榜判断。
- 出榜条目生成。
- 空标题展示。
- 分数范围校验。
- 标签筛选。
- 榜单快照生成。
- 导入导出序列化。

集成测试：

- 新增人员后刷新仍存在。
- 新建榜单后保存 entries 快照。
- 榜单分数只写入 `leaderboard_entries.scoreSnapshot`，不会写入 `people`。
- 新建榜单默认加载最近一次榜单为模板。
- 上期存在、本期缺失的人员会写入本期 `leaderboard_entries`，并标记为 `out`。
- 删除标签后人员列表仍稳定。

E2E 测试：

- 添加人员。
- 添加标签。
- 按标签筛选。
- 新建空标题榜单。
- 基于上一期模板创建下一期榜单。
- 在榜单草稿中填写或修改分数。
- 验证旧榜单不变化。
- 验证榜单详情显示上升、下降、初次进榜、回榜、出榜。
- 导出备份。
- 清空后导入恢复。

PWA 手动测试：

- 首次访问后安装。
- 离线打开。
- 新版本发布后出现更新提示。
- 清除站点数据后确认数据被删除，并验证备份恢复可用。

## 13. 风险清单

| 风险 | 影响 | 应对 |
| --- | --- | --- |
| 本地数据丢失 | 用户记录全部消失 | 第一版就做 JSON 导出导入 |
| 用户误删人员 | 历史记录断裂 | 优先归档，删除二次确认 |
| 历史榜单被动态数据影响 | 榜单失去历史意义 | 榜单 entries 保存快照 |
| 出榜对象没有保存 | 无法复盘榜单变化 | 本期 entries 必须写入 `movement = "out"` 条目 |
| 榜单模板复用造成误操作 | 用户以为是全新榜单 | 新建页明确显示「基于上一期」并允许重置 |
| 浏览器存储被清理 | 数据不可恢复 | 设置页提示定期备份 |
| PWA 缓存旧版本 | 页面异常 | 使用版本提示，不强制自动刷新 |
| IndexedDB 迁移失败 | 升级后打不开 | 每次 schema 变更写迁移和备份提醒 |
| 评分引发负面体验 | 用户抵触 | 文案尽量中性或正向 |

## 14. 初始目录建议

```text
src/
  app/
    router.ts
    pinia.ts
  assets/
  components/
    AppShell.vue
    ScoreInput.vue
    TagPicker.vue
    PersonListItem.vue
    LeaderboardPreview.vue
  db/
    index.ts
    schema.ts
    migrations.ts
  repositories/
    peopleRepository.ts
    tagsRepository.ts
    leaderboardsRepository.ts
    backupRepository.ts
  stores/
    peopleStore.ts
    tagsStore.ts
    leaderboardsStore.ts
    settingsStore.ts
  types/
    models.ts
  utils/
    ranking.ts
    dates.ts
    ids.ts
    backup.ts
  views/
    HomeView.vue
    PeopleView.vue
    PersonDetailView.vue
    TagsView.vue
    LeaderboardsView.vue
    LeaderboardDetailView.vue
    CreateLeaderboardView.vue
    SettingsView.vue
```

## 15. 初始任务拆分

建议按这个顺序开工：

1. 创建 Vite + Vue + TypeScript 项目。
2. 安装 Vue Router、Pinia、Dexie、vite-plugin-pwa。
3. 搭建基础路由和移动端布局。
4. 定义 `people`、`tags`、`person_tags`、`leaderboards`、`leaderboard_entries` 表。
5. 实现人员增删改查。
6. 实现标签管理和人员标签绑定。
7. 实现人员列表搜索、标签筛选和人员详情历史榜单展示。
8. 实现榜单草稿里的单一分数录入和排名预览。
9. 实现手动新建榜单、最近榜单模板加载和快照保存。
10. 实现榜单详情和历史榜单列表。
11. 实现榜单变动计算：排名变化、初次进榜、回榜、出榜。
12. 接入 PWA manifest、icons、Service Worker。
13. 实现 JSON 导出和覆盖导入。
14. 补充排序、快照、变动计算、导入导出测试。

## 16. 后续可扩展方向

如果 MVP 使用体验稳定，再考虑：

- 多个评分方案，例如 0-100、五星、加减分。
- 趋势图。
- 人员关系图。
- 榜单模板。
- 榜单手动拖拽排序。
- 备份文件加密。
- 可选云同步。
- 可选多设备同步。
- 可选多人共享。

## 17. 参考资料

- Vue TypeScript 官方文档：<https://vuejs.org/guide/typescript/overview>
- Vite 官方文档：<https://vite.dev/guide/>
- vite-plugin-pwa 文档：<https://vite-pwa-org.netlify.app/>
- vite-plugin-pwa Workbox：<https://vite-pwa-org.netlify.app/workbox/>
- MDN IndexedDB：<https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API>
- MDN IndexedDB 使用指南：<https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB>
- MDN Service Worker API：<https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API>
- MDN 可安装 PWA：<https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable>
