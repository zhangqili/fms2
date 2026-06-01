<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { ArrowDown, ArrowUp } from "lucide-vue-next";

import PageHeader from "@/components/PageHeader.vue";
import { useTagsStore } from "@/stores/tagsStore";
import type { Tag } from "@/types/models";

const tagsStore = useTagsStore();
const newTagName = ref("");
const newTagColor = ref("#5b2a86");
const pendingSaveTimers = new Map<string, number>();

async function addTag(): Promise<void> {
  const name = newTagName.value.trim();
  if (!name) {
    return;
  }

  await tagsStore.addTag(name, newTagColor.value);
  newTagName.value = "";
  newTagColor.value = "#5b2a86";
}

function queueTagSave(tagId: string): void {
  clearPendingTagSave(tagId);
  pendingSaveTimers.set(
    tagId,
    window.setTimeout(() => {
      pendingSaveTimers.delete(tagId);
      void saveTagNow(tagId);
    }, 300)
  );
}

async function flushTagSave(tagId: string): Promise<void> {
  clearPendingTagSave(tagId);
  await saveTagNow(tagId);
}

async function saveTagNow(tagId: string): Promise<void> {
  const tag = tagsStore.tags.find((item) => item.id === tagId);
  if (!tag || !tag.name.trim()) {
    return;
  }

  await tagsStore.saveTag({
    ...tag,
    name: tag.name.trim()
  });
}

function clearPendingTagSave(tagId: string): void {
  const timer = pendingSaveTimers.get(tagId);
  if (timer === undefined) {
    return;
  }

  window.clearTimeout(timer);
  pendingSaveTimers.delete(tagId);
}

async function removeTag(tag: Tag): Promise<void> {
  const confirmed = window.confirm(`删除标签「${tag.name}」会同时解除人员绑定。确定删除吗？`);
  if (!confirmed) {
    return;
  }

  clearPendingTagSave(tag.id);
  await tagsStore.removeTag(tag.id);
}

async function moveTag(tag: Tag, direction: "up" | "down"): Promise<void> {
  await flushTagSave(tag.id);
  await tagsStore.moveTag(tag.id, direction);
}

onMounted(() => {
  void tagsStore.loadTags();
});

onBeforeUnmount(() => {
  for (const timer of pendingSaveTimers.values()) {
    window.clearTimeout(timer);
  }
  pendingSaveTimers.clear();
});
</script>

<template>
  <section class="page">
    <PageHeader title="标签" />

    <form class="toolbar" @submit.prevent="addTag">
      <input v-model="newTagName" class="field" placeholder="新标签名称" />
      <input v-model="newTagColor" class="field color-field" type="color" aria-label="标签颜色" />
      <button class="button primary" type="submit">添加标签</button>
    </form>

    <section class="panel">
      <p v-if="tagsStore.tags.length === 0" class="empty">还没有标签。</p>
      <div v-for="(tag, index) in tagsStore.tags" :key="tag.id" class="editable-row tag-edit-row">
        <div class="tag-sort-actions">
          <button
            class="button icon-button"
            type="button"
            :disabled="index === 0 || tagsStore.loading"
            :aria-label="`上移 ${tag.name}`"
            :title="`上移 ${tag.name}`"
            @click="moveTag(tag, 'up')"
          >
            <ArrowUp :size="16" />
          </button>
          <button
            class="button icon-button"
            type="button"
            :disabled="index === tagsStore.tags.length - 1 || tagsStore.loading"
            :aria-label="`下移 ${tag.name}`"
            :title="`下移 ${tag.name}`"
            @click="moveTag(tag, 'down')"
          >
            <ArrowDown :size="16" />
          </button>
        </div>
        <input
          v-model="tag.name"
          class="field"
          required
          @input="queueTagSave(tag.id)"
          @blur="flushTagSave(tag.id)"
        />
        <input
          v-model="tag.color"
          class="field color-field"
          type="color"
          aria-label="标签颜色"
          @input="queueTagSave(tag.id)"
          @change="flushTagSave(tag.id)"
        />
        <span class="list-meta">{{ tag.usageCount }} 人</span>
        <button class="button danger" type="button" @click="removeTag(tag)">删除</button>
      </div>
    </section>
  </section>
</template>
