<script setup lang="ts">
import { LineChart, type LineSeriesOption } from "echarts/charts";
import {
  GridComponent,
  LegendComponent,
  TooltipComponent,
  type GridComponentOption,
  type LegendComponentOption,
  type TooltipComponentOption
} from "echarts/components";
import * as echarts from "echarts/core";
import type { ComposeOption, ECharts, ECElementEvent } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";

import { formatScore } from "@/utils/movement";

echarts.use([GridComponent, LegendComponent, LineChart, TooltipComponent, CanvasRenderer]);

export interface PersonTrendPoint {
  leaderboardId: string;
  dateLabel: string;
  score: number | null;
  rank: number | null;
}

type ChartOption = ComposeOption<
  GridComponentOption | LegendComponentOption | LineSeriesOption | TooltipComponentOption
>;

const props = defineProps<{
  points: PersonTrendPoint[];
}>();

const emit = defineEmits<{
  select: [leaderboardId: string];
}>();

const chartEl = ref<HTMLElement | null>(null);
const hasValidPoints = computed(() =>
  props.points.some((point) => point.score !== null && point.rank !== null)
);
let chart: ECharts | null = null;
let resizeObserver: ResizeObserver | null = null;

watch(
  () => props.points,
  () => {
    void nextTick(renderChart);
  },
  { deep: true }
);

onMounted(() => {
  void nextTick(() => {
    renderChart();
    observeResize();
  });
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
  chart?.dispose();
  chart = null;
});

function renderChart(): void {
  if (!chartEl.value || !hasValidPoints.value) {
    chart?.dispose();
    chart = null;
    return;
  }

  chart ??= echarts.init(chartEl.value);
  chart.off("click");
  chart.on("click", handlePointClick);
  chart.setOption(buildOption(), true);
  chart.resize();
}

function observeResize(): void {
  if (!chartEl.value || resizeObserver) {
    return;
  }

  resizeObserver = new ResizeObserver(() => {
    chart?.resize();
  });
  resizeObserver.observe(chartEl.value);
}

function buildOption(): ChartOption {
  const scoreColor = cssVariable("--theme-color", "#5b2a86");
  const rankColor = cssVariable("--theme-accent", "#d4af37");

  return {
    animation: true,
    grid: {
      top: 40,
      right: 48,
      bottom: 36,
      left: 52
    },
    legend: {
      top: 0,
      left: 0,
      itemWidth: 14,
      itemHeight: 8,
      textStyle: {
        color: "#3c4b50"
      }
    },
    tooltip: {
      trigger: "axis",
      formatter: formatTooltip
    },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: props.points.map((point) => point.dateLabel),
      axisLabel: {
        color: "#657276"
      },
      axisLine: {
        lineStyle: {
          color: "#cad8d6"
        }
      }
    },
    yAxis: [
      {
        type: "value",
        name: "分数",
        min: 0,
        axisLabel: {
          color: "#657276"
        },
        splitLine: {
          lineStyle: {
            color: "#edf2f0"
          }
        }
      },
      {
        type: "value",
        name: "排名",
        inverse: true,
        min: 1,
        minInterval: 1,
        axisLabel: {
          color: "#657276",
          formatter: "{value}"
        },
        splitLine: {
          show: false
        }
      }
    ],
    series: [
      {
        name: "分数",
        type: "line",
        yAxisIndex: 0,
        connectNulls: false,
        showSymbol: true,
        symbolSize: 7,
        data: props.points.map((point) => point.score),
        lineStyle: {
          width: 2,
          color: scoreColor
        },
        itemStyle: {
          color: scoreColor
        }
      },
      {
        name: "排名",
        type: "line",
        yAxisIndex: 1,
        connectNulls: false,
        showSymbol: true,
        symbolSize: 7,
        data: props.points.map((point) => point.rank),
        lineStyle: {
          width: 2,
          color: rankColor
        },
        itemStyle: {
          color: rankColor
        }
      }
    ]
  };
}

function formatTooltip(params: unknown): string {
  const items = Array.isArray(params) ? params : [params];
  const firstItem = items[0];
  const dataIndex = typeof firstItem === "object" && firstItem !== null && "dataIndex" in firstItem
    ? Number(firstItem.dataIndex)
    : -1;
  const point = props.points[dataIndex];

  if (!point) {
    return "";
  }

  return [
    `<strong>${escapeHtml(point.dateLabel)}</strong>`,
    `分数：${escapeHtml(formatScore(point.score))}`,
    `排名：${point.rank ?? "-"}`
  ].join("<br />");
}

function handlePointClick(event: ECElementEvent): void {
  const dataIndex = typeof event.dataIndex === "number" ? event.dataIndex : -1;
  const point = props.points[dataIndex];

  if (!point || point.score === null || point.rank === null) {
    return;
  }

  emit("select", point.leaderboardId);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function cssVariable(name: string, fallback: string): string {
  if (!chartEl.value) {
    return fallback;
  }

  const value = getComputedStyle(chartEl.value).getPropertyValue(name).trim();
  return value || fallback;
}
</script>

<template>
  <p v-if="!hasValidPoints" class="empty">暂无可绘制的有效趋势数据。</p>
  <div v-else ref="chartEl" class="person-trend-chart" role="img" aria-label="人员分数和排名趋势图" />
</template>
