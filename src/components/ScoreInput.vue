<script setup lang="ts">
const model = defineModel<number>({ required: true });
const emit = defineEmits<{
  commit: [];
}>();

defineProps<{
  min?: number;
  disabled?: boolean;
}>();

function finishEditing(event: Event): void {
  (event.currentTarget as HTMLInputElement).blur();
}
</script>

<template>
  <input
    v-model.number="model"
    class="field score-field"
    type="number"
    :min="min ?? 0"
    step="0.1"
    :disabled="disabled"
    @blur="emit('commit')"
    @keydown.enter="finishEditing"
  />
</template>
