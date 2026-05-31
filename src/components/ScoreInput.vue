<script setup lang="ts">
const model = defineModel<number>({ required: true });

defineProps<{
  min?: number;
}>();
</script>

<template>
  <input v-model.number="model" class="field score-field" type="number" :min="min ?? 0" step="0.01" />
</template>
