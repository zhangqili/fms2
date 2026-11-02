# 数据模型与排名口径

FMS2 是离线优先应用，业务数据保存在浏览器 IndexedDB 中。数据库配置位于 `src/db/schema.ts`，核心类型位于 `src/types/models.ts`。

## IndexedDB 表

数据库名：

```ts
export const DB_NAME = "fms2";
export const DB_SCHEMA_VERSION = 2;
```

当前表：

| 表名 | 说明 |
| --- | --- |
| `people` | 人员基础信息 |
| `tags` | 标签基础信息，包含颜色和显示顺序 |
| `person_tags` | 人员和标签的多对多关系 |
| `leaderboards` | 榜单基础信息 |
| `leaderboard_entries` | 榜单条目快照 |
| `annual_leaderboard_settings` | 各年的代表人物设置，以年份为主键 |
| `app_settings` | 应用设置 |

数据库保留版本 1 的表结构声明，版本 2 仅新增年度设置表，升级时保留已有业务数据。

## 核心模型

### people

人员表只保存基础资料：

- `id`
- `name`
- `note`
- `archived`
- `createdAt`
- `updatedAt`

人员表不保存当前分数。FMS2 中不存在全局“当前分数”，分数只属于某一期榜单。

### tags

标签表保存：

- `id`
- `name`
- `color`
- `sortOrder`
- `createdAt`
- `updatedAt`

`sortOrder` 控制标签显示顺序。标签颜色会用于人员列表和标签选择组件。

### person_tags

人员标签关系表保存：

- `id`
- `personId`
- `tagId`
- `createdAt`

同一人员可以绑定多个标签。

### leaderboards

榜单表保存：

- `id`
- `title`
- `note`
- `boardDate`
- `legacyDigitalDate`
- `filterTagIds`
- `maxEntries`
- `templateLeaderboardId`
- `previousLeaderboardId`
- `createdAt`
- `updatedAt`

`title` 可以为空。列表展示中，空标题可以留空；需要兜底显示时使用 `leaderboardDisplayTitle()`。

`previousLeaderboardId` 用于计算本期相对上一期的变动和出榜记录。

### leaderboard_entries

榜单条目是历史快照，保存：

- `leaderboardId`
- `personId`
- `personNameSnapshot`
- `tagSnapshots`
- `rank`
- `previousRank`
- `rankDelta`
- `movement`
- `scoreSnapshot`
- `previousScoreSnapshot`
- `includedInRanking`
- `noteSnapshot`
- `createdAt`

维护注意：

- 人员改名后，历史条目的 `personNameSnapshot` 不自动变化。
- 标签修改后，历史条目的 `tagSnapshots` 不自动变化。
- 出榜记录也保存在 `leaderboard_entries` 中，但 `includedInRanking = false`。

## 有效上榜条目

总榜统计、人员统计、趋势图和导出中的有效条目口径应保持一致：

```text
includedInRanking = true
scoreSnapshot > 0
rank !== null
```

出榜记录、0 分记录、空分数和无排名记录不计入有效上榜统计。

## 单期榜单排名

新建榜单时，排名逻辑位于 `src/utils/ranking.ts`。

规则：

- 分数必须大于等于 0。
- 0 分不进入本期排名，视为出榜或缺席。
- 有效人员按分数降序排序。
- 分数相同使用并列排名。
- 同分排序显示时，再按上一期排名和姓名兜底。
- 变动相对 `previousLeaderboardId` 指向的上一期计算。

## 变动状态

`Movement` 类型：

| 值 | 含义 |
| --- | --- |
| `new` | 初次进榜 |
| `returning` | 回榜 |
| `up` | 排名上升 |
| `down` | 排名下降 |
| `same` | 排名不变 |
| `out` | 出榜 |

显示文案由 `src/utils/movement.ts` 统一处理。

## 总榜统计

总榜统计由 `calculatePersonOverallMetrics()` 派生，不写入数据库。

有效条目参与以下计算：

| 字段 | 口径 |
| --- | --- |
| `totalScore` | 有效上榜分数求和 |
| `highestScore` | 历史最高有效分数 |
| `peakRank` | 历史最小单期排名 |
| `weightedScore` | `totalScore * highestScore` |
| `effectiveEntryCount` | 有效上榜次数 |
| `scoreRank` | 按 `totalScore` 降序的并列排名 |
| `weightedRank` | 按 `weightedScore` 降序的并列排名 |
| `peakTierRank` | 按进入前 10/20/30/40/50/60/70 名次数排序的并列排名 |
| `overallRank` | 总榜排名，无并列 |

## 峰值排名

`peakTierRank` 的排序规则：

1. 进入前 10 名次数多者靠前。
2. 若相同，比较进入前 20 名次数。
3. 依次比较前 30、前 40、前 50、前 60、前 70。
4. 完全相同时按姓名 `zh-CN` 排序显示。
5. 赋名次时使用并列排名。

## 总榜排名

`overallRank` 是唯一顺序排名，不允许并列。

排序规则：

1. `peakTierRank + weightedRank` 越小越靠前。
2. 若相同，`weightedScore` 越高越靠前。
3. 若仍相同，`peakTierRank` 越小越靠前。
4. 若仍相同，`weightedRank` 越小越靠前。
5. 最后按姓名 `zh-CN` 排序。
6. 赋名次时直接使用排序后的位置 `index + 1`。

人员列表、人员详情、比较页总榜排名曲线和总榜导出都应读取同一个计算结果。

## 历史总榜排名走势

历史总榜排名走势不是数据库字段，而是运行时重新计算。

规则：

1. 榜单按日期升序排列。
2. 第 n 个点只使用第 1 到第 n 期的历史条目。
3. 每一期都调用 `calculatePersonOverallMetrics()` 重新计算。
4. 当前人员首次有效上榜前显示为空值。
5. 首次有效上榜后，即使某一期缺席或出榜，也继续显示截至当期的累计总榜排名。

导出中的 `总榜排名走势` sheet 使用导出页面所选人员和所选榜单范围重新计算，不使用全局范围。

## 年榜

年榜入口为 `/annual-leaderboards`，统计由 `annualLeaderboardsRepository` 运行时派生，不保存成绩快照。

入口自动跳转至最新年份的 `/annual-leaderboards/:year`。年份通过列表选择，每年独立加入工作区标签页，重复查看同一年只激活已有标签页。页面可用宽度达到 1280px 时采用“年份、表格、代表人物”三列，较窄时纵向排列。

- 按 `boardDate` 的自然年统计；未设置日期时使用 `createdAt` 的本地显示年份。无法解析日期的榜单不参与年榜。
- 年份列表包含已有榜单的年份，倒序排列，首次进入默认选择最新年份。
- 每期榜单视为一周，不合并同一自然周中的多期榜单。
- 年榜名次仅使用当年条目调用 `calculatePersonOverallMetrics()`，沿用总榜算法和无并列名次规则。
- 年内周平均点数 = 本人当年有效点数总和 ÷ 本人当年有效上榜期数，显示最多两位小数。
- 年内峰值点数 = 本人当年有效条目的最高单期分数，复用 `highestScore`，显示最多两位小数。
- 年内周 peak 排名 = 本人当年有效条目的最小单周名次，不是峰值分档排名。
- 缺席、出榜、零分和无排名条目不计入平均点数的分子或分母。归档人员仍保留历史年榜成绩，无当年有效上榜记录的人员不进入年榜。

`annual_leaderboard_settings` 保存 `year`、`representativePersonIds` 和 `updatedAt`。各年可独立设置多个代表人物，仅允许选择该年榜中的现有人员，默认不选。删除人员会清理其年度代表人物引用；旧 FMS 覆盖导入会清空年度设置。JSON 备份包含该表，旧 FMS xlsx 格式不包含该设置。
