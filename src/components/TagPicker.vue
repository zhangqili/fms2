<script setup lang="ts">
import type { Tag } from "@/types/models";

defineProps<{
  tags: Tag[];
  selectedIds: string[];
}>();

defineEmits<{
  toggle: [tagId: string];
}>();
</script>

<template>
  <div class="tag-picker">
    <button
      v-for="tag in tags"
      :key="tag.id"
      class="tag-chip"
      :class="{ selected: selectedIds.includes(tag.id) }"
      type="button"
      @click="$emit('toggle', tag.id)"
    >
      <span class="tag-dot" :style="{ backgroundColor: tag.color }" />
      {{ tag.name }}
    </button>
  </div>
</template>
