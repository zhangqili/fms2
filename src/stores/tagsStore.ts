import { defineStore } from "pinia";
import { ref } from "vue";

import {
  createTag,
  deleteTag,
  listTagsWithUsage,
  updateTag,
  type TagWithUsage
} from "@/repositories/tagsRepository";
import type { Tag } from "@/types/models";

export const useTagsStore = defineStore("tags", () => {
  const tags = ref<TagWithUsage[]>([]);
  const loading = ref(false);

  async function loadTags(): Promise<void> {
    loading.value = true;
    try {
      tags.value = await listTagsWithUsage();
    } finally {
      loading.value = false;
    }
  }

  async function addTag(name: string, color?: string): Promise<void> {
    await createTag(name, color);
    await loadTags();
  }

  async function saveTag(tag: Tag): Promise<void> {
    await updateTag(tag);
    await loadTags();
  }

  async function removeTag(id: string): Promise<void> {
    await deleteTag(id);
    await loadTags();
  }

  return {
    tags,
    loading,
    loadTags,
    addTag,
    saveTag,
    removeTag
  };
});
