<script setup lang="ts">
import { ref } from "vue";

import type {
  PeopleArchiveFilter,
  PeopleFilterCondition,
  PeopleFilterConditionType,
  PeopleFilterGroup,
  PeopleFilterGroupOperator,
  PeopleFilterNode,
  PeopleMetricConditionOperator,
  PeopleMetricRangeKey
} from "@/stores/peopleStore";
import type { Tag } from "@/types/models";

interface MetricOption {
  value: PeopleMetricRangeKey;
  label: string;
  step: string;
}

interface ArchiveOption {
  value: PeopleArchiveFilter;
  label: string;
}

interface ConditionTypeOption {
  value: PeopleFilterConditionType;
  label: string;
}

interface GroupOperatorOption {
  value: PeopleFilterGroupOperator;
  label: string;
}

interface MetricOperatorOption {
  value: PeopleMetricConditionOperator;
  label: string;
}

defineOptions({
  name: "PeopleFilterGroupEditor"
});

const group = defineModel<PeopleFilterGroup>({ required: true });
const props = withDefaults(defineProps<{
  depth?: number;
  isRoot?: boolean;
  tags: Tag[];
}>(), {
  depth: 0,
  isRoot: false
});
const emit = defineEmits<{
  remove: [];
}>();

const newConditionType = ref<PeopleFilterConditionType>("query");
let nextItemIndex = 0;

const archiveOptions: ArchiveOption[] = [
  { value: "active", label: "仅正常" },
  { value: "all", label: "含归档" },
  { value: "archived", label: "仅归档" }
];

const conditionTypeOptions: ConditionTypeOption[] = [
  { value: "query", label: "姓名/备注包含" },
  { value: "archive", label: "归档状态" },
  { value: "hasTag", label: "拥有标签" },
  { value: "notHasTag", label: "不拥有标签" },
  { value: "metric", label: "统计指标" }
];

const groupOperatorOptions: GroupOperatorOption[] = [
  { value: "and", label: "全部满足" },
  { value: "or", label: "任一满足" }
];

const metricOperatorOptions: MetricOperatorOption[] = [
  { value: "gte", label: ">=" },
  { value: "lte", label: "<=" },
  { value: "between", label: "区间" }
];

const metricOptions: MetricOption[] = [
  { value: "appearanceCount", label: "上榜次数", step: "1" },
  { value: "totalScore", label: "总点数", step: "any" },
  { value: "weightedScore", label: "加权点数", step: "any" },
  { value: "overallRank", label: "总榜排名", step: "1" },
  { value: "peakTierRank", label: "峰值排名", step: "1" },
  { value: "highestScore", label: "峰值点数", step: "any" }
];

function addCondition(): void {
  group.value.items = [
    ...group.value.items,
    createCondition(newConditionType.value)
  ];
}

function addGroup(): void {
  group.value.items = [
    ...group.value.items,
    createGroup()
  ];
}

function removeItem(itemId: string): void {
  group.value.items = group.value.items.filter((item) => item.id !== itemId);
}

function replaceItem(itemId: string, nextItem: PeopleFilterGroup): void {
  group.value.items = group.value.items.map((item) => item.id === itemId ? nextItem : item);
}

function resetConditionPayload(condition: PeopleFilterCondition): void {
  Object.assign(condition, createCondition(condition.type, condition.id));
}

function createCondition(
  type: PeopleFilterConditionType,
  id = makeItemId()
): PeopleFilterCondition {
  return {
    id,
    kind: "condition",
    type,
    query: "",
    archiveMode: "active",
    tagId: type === "hasTag" || type === "notHasTag" ? props.tags[0]?.id ?? "" : "",
    metricKey: "overallRank",
    metricOperator: "between",
    min: "",
    max: ""
  };
}

function createGroup(): PeopleFilterGroup {
  return {
    id: makeItemId(),
    kind: "group",
    operator: "and",
    items: []
  };
}

function makeItemId(): string {
  nextItemIndex += 1;
  return `people_filter_${Date.now()}_${nextItemIndex}`;
}

function isCondition(item: PeopleFilterNode): item is PeopleFilterCondition {
  return item.kind === "condition";
}

function isGroup(item: PeopleFilterNode): item is PeopleFilterGroup {
  return item.kind === "group";
}

function metricStep(metricKey: PeopleMetricRangeKey): string {
  return metricOptions.find((option) => option.value === metricKey)?.step ?? "any";
}
</script>

<template>
  <section
    class="filter-group-editor"
    :class="{ root: isRoot }"
    :style="{ '--filter-depth': props.depth }"
  >
    <div class="filter-group-header">
      <label class="field-label">
        <span>{{ isRoot ? "根条件组" : "条件组" }}</span>
        <select v-model="group.operator" class="field">
          <option v-for="option in groupOperatorOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </label>
      <div class="field-label">
        <span>新增条件</span>
        <div class="filter-add-row">
          <select v-model="newConditionType" class="field">
            <option v-for="option in conditionTypeOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
          <button class="button primary" type="button" @click="addCondition">添加</button>
        </div>
      </div>
      <button class="button" type="button" @click="addGroup">添加子组</button>
      <button v-if="!isRoot" class="button danger" type="button" @click="emit('remove')">删除组</button>
    </div>

    <p v-if="group.items.length === 0" class="empty">该条件组为空，不参与筛选。</p>
    <div v-else class="condition-list">
      <template v-for="item in group.items" :key="item.id">
        <div v-if="isCondition(item)" class="filter-condition-row">
          <select v-model="item.type" class="field" @change="resetConditionPayload(item)">
            <option v-for="option in conditionTypeOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>

          <div class="condition-value">
            <input
              v-if="item.type === 'query'"
              v-model="item.query"
              class="field"
              placeholder="输入姓名或备注关键词"
            />

            <select
              v-else-if="item.type === 'archive'"
              v-model="item.archiveMode"
              class="field"
            >
              <option v-for="option in archiveOptions" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>

            <select
              v-else-if="item.type === 'hasTag' || item.type === 'notHasTag'"
              v-model="item.tagId"
              class="field"
            >
              <option value="">选择标签</option>
              <option v-for="tag in tags" :key="tag.id" :value="tag.id">
                {{ tag.name }}
              </option>
            </select>

            <div v-else class="metric-condition-fields">
              <select v-model="item.metricKey" class="field">
                <option v-for="option in metricOptions" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </select>
              <select v-model="item.metricOperator" class="field">
                <option v-for="option in metricOperatorOptions" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </select>
              <input
                v-if="item.metricOperator !== 'lte'"
                v-model="item.min"
                class="field metric-range-field"
                type="number"
                :step="metricStep(item.metricKey)"
                :placeholder="item.metricOperator === 'between' ? '最小' : '数值'"
              />
              <input
                v-if="item.metricOperator !== 'gte'"
                v-model="item.max"
                class="field metric-range-field"
                type="number"
                :step="metricStep(item.metricKey)"
                :placeholder="item.metricOperator === 'between' ? '最大' : '数值'"
              />
            </div>
          </div>

          <button class="button danger" type="button" @click="removeItem(item.id)">删除</button>
        </div>

        <PeopleFilterGroupEditor
          v-else-if="isGroup(item)"
          :model-value="item"
          :depth="props.depth + 1"
          :tags="tags"
          @update:model-value="replaceItem(item.id, $event)"
          @remove="removeItem(item.id)"
        />
      </template>
    </div>
  </section>
</template>
