<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { ArrowDown, ArrowUp } from "lucide-vue-next";

import PageHeader from "@/components/PageHeader.vue";
import { useTagsStore } from "@/stores/tagsStore";
import type { Tag } from "@/types/models";

const tagsStore = useTagsStore();
const newTagName = ref("");
const newTagColor = ref("#245c73");
const editingTags = reactive<Record<string, { name: string; color: string }>>({});

async function addTag(): Promise<void> {
  const name = newTagName.value.trim();
  if (!name) {
    return;
  }

  await tagsStore.addTag(name, newTagColor.value);
  newTagName.value = "";
  newTagColor.value = "#245c73";
}

function ensureEditState(tag: Tag): { name: string; color: string } {
  editingTags[tag.id] ??= {
    name: tag.name,
    color: tag.color
  };
  return editingTags[tag.id];
}

async function saveTag(tag: Tag): Promise<void> {
  const draft = ensureEditState(tag);
  await tagsStore.saveTag({
    ...tag,
    name: draft.name,
    color: draft.color
  });
}

async function removeTag(tag: Tag): Promise<void> {
  const confirmed = window.confirm(`删除标签「${tag.name}」会同时解除人员绑定。确定删除吗？`);
  if (!confirmed) {
    return;
  }

  await tagsStore.removeTag(tag.id);
}

async function moveTag(tag: Tag, direction: "up" | "down"): Promise<void> {
  await tagsStore.moveTag(tag.id, direction);
}

onMounted(() => {
  void tagsStore.loadTags();
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
        <input v-model="ensureEditState(tag).name" class="field" />
        <input
          v-model="ensureEditState(tag).color"
          class="field color-field"
          type="color"
          aria-label="标签颜色"
        />
        <span class="list-meta">{{ tag.usageCount }} 人</span>
        <button class="button" type="button" @click="saveTag(tag)">保存</button>
        <button class="button danger" type="button" @click="removeTag(tag)">删除</button>
      </div>
    </section>
  </section>
</template>
