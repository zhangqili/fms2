<script setup lang="ts">
import { LineChart, type LineSeriesOption } from "echarts/charts";
import {
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  type DataZoomComponentOption,
  type GridComponentOption,
  type LegendComponentOption,
  type TooltipComponentOption
} from "echarts/components";
import * as echarts from "echarts/core";
import type { ComposeOption, ECharts } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";

import { formatScore } from "@/utils/movement";

echarts.use([DataZoomComponent, GridComponent, LegendComponent, LineChart, TooltipComponent, CanvasRenderer]);

export type PeopleCompareChartMode = "score" | "rank" | "overall-rank";

export interface PeopleCompareChartPoint {
  leaderboardId: string;
  dateLabel: string;
  score: number | null;
  rank: number | null;
  overallRank: number | null;
}

export interface PeopleCompareChartSeries {
  personId: string;
  personName: string;
  points: PeopleCompareChartPoint[];
}

type ChartOption = ComposeOption<
  DataZoomComponentOption | GridComponentOption | LegendComponentOption | LineSeriesOption | TooltipComponentOption
>;

const props = defineProps<{
  mode: PeopleCompareChartMode;
  series: PeopleCompareChartSeries[];
}>();

const chartEl = ref<HTMLElement | null>(null);
const hasValidPoints = computed(() =>
  props.series.some((personSeries) => personSeries.points.some((point) => valueForPoint(point) !== null))
);
let chart: ECharts | null = null;
let resizeObserver: ResizeObserver | null = null;

watch(
  () => [props.mode, props.series],
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
  const isRankMode = props.mode !== "score";

  return {
    animation: false,
    grid: {
      top: 52,
      right: 64,
      bottom: 78,
      left: 56
    },
    legend: {
      type: "scroll",
      top: 0,
      left: 0,
      right: 0,
      itemWidth: 14,
      itemHeight: 8,
      textStyle: {
        color: "#3c4b50"
      }
    },
    tooltip: {
      trigger: "axis",
      transitionDuration: 0,
      axisPointer: {
        animation: false
      },
      formatter: formatTooltip
    },
    dataZoom: [
      {
        type: "inside",
        xAxisIndex: 0,
        filterMode: "none",
        zoomOnMouseWheel: "ctrl",
        moveOnMouseMove: true,
        moveOnMouseWheel: false
      },
      {
        type: "inside",
        yAxisIndex: 0,
        filterMode: "none",
        zoomOnMouseWheel: "alt",
        moveOnMouseMove: false,
        moveOnMouseWheel: false
      },
      {
        type: "slider",
        xAxisIndex: 0,
        filterMode: "none",
        height: 24,
        bottom: 12,
        borderColor: "#cad8d6",
        fillerColor: "rgba(91, 42, 134, 0.16)",
        handleStyle: {
          color: "#5b2a86"
        },
        textStyle: {
          color: "#657276"
        }
      },
      {
        type: "slider",
        yAxisIndex: 0,
        filterMode: "none",
        width: 18,
        right: 8,
        top: 54,
        bottom: 78,
        borderColor: "#cad8d6",
        fillerColor: "rgba(91, 42, 134, 0.16)",
        handleStyle: {
          color: "#5b2a86"
        },
        textStyle: {
          color: "#657276"
        }
      }
    ],
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: xAxisLabels(),
      axisLabel: {
        color: "#657276"
      },
      axisLine: {
        lineStyle: {
          color: "#cad8d6"
        }
      }
    },
    yAxis: {
      type: "value",
      name: modeLabel(),
      inverse: isRankMode,
      min: isRankMode ? 1 : 0,
      minInterval: isRankMode ? 1 : undefined,
      axisLabel: {
        color: "#657276",
        formatter: "{value}"
      },
      splitLine: {
        lineStyle: {
          color: "#edf2f0"
        }
      }
    },
    series: props.series.map((personSeries) => ({
      name: personSeries.personName,
      type: "line",
      connectNulls: false,
      showSymbol: false,
      symbolSize: 7,
      data: personSeries.points.map(valueForPoint),
      emphasis: {
        focus: "series"
      }
    }))
  };
}

function formatTooltip(params: unknown): string {
  const items = Array.isArray(params) ? params : [params];
  const firstItem = items[0];
  const dataIndex = typeof firstItem === "object" && firstItem !== null && "dataIndex" in firstItem
    ? Number(firstItem.dataIndex)
    : -1;
  const label = props.series[0]?.points[dataIndex]?.dateLabel;

  if (!label) {
    return "";
  }

  const lines = [`<strong>${escapeHtml(label)}</strong>`];

  for (const item of items) {
    if (typeof item !== "object" || item === null) {
      continue;
    }

    const seriesName = "seriesName" in item ? String(item.seriesName) : "";
    const data = "data" in item ? item.data : null;
    if (data === null || data === undefined || data === "-") {
      continue;
    }

    lines.push(`${escapeHtml(seriesName)}：${escapeHtml(formatModeValue(Number(data)))}`);
  }

  return lines.join("<br />");
}

function valueForPoint(point: PeopleCompareChartPoint): number | null {
  if (props.mode === "rank") {
    return point.rank;
  }

  if (props.mode === "overall-rank") {
    return point.overallRank;
  }

  return point.score;
}

function formatModeValue(value: number): string {
  return props.mode === "score" ? formatScore(value) : String(value);
}

function modeLabel(): string {
  if (props.mode === "rank") {
    return "排名";
  }

  if (props.mode === "overall-rank") {
    return "总榜排名";
  }

  return "分数";
}

function xAxisLabels(): string[] {
  return props.series[0]?.points.map((point) => point.dateLabel) ?? [];
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
</script>

<template>
  <p v-if="!hasValidPoints" class="empty">暂无可绘制的有效趋势数据。</p>
  <div v-else ref="chartEl" class="people-compare-chart" role="img" :aria-label="`${modeLabel()}比较图`" />
</template>
