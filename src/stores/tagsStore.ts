import { defineStore } from "pinia";
import { ref } from "vue";

import {
  createTag,
  deleteTag,
  listTagsWithUsage,
  moveTag as moveStoredTag,
  updateTag,
  type TagMoveDirection,
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
    const index = tags.value.findIndex((item) => item.id === tag.id);
    if (index >= 0) {
      tags.value[index] = {
        ...tags.value[index],
        ...tag,
        name: tag.name.trim()
      };
    }
  }

  async function removeTag(id: string): Promise<void> {
    await deleteTag(id);
    await loadTags();
  }

  async function moveTag(id: string, direction: TagMoveDirection): Promise<void> {
    const moved = moveTagLocally(id, direction);
    if (!moved) {
      return;
    }

    await moveStoredTag(id, direction);
    await loadTags();
  }

  function moveTagLocally(id: string, direction: TagMoveDirection): boolean {
    const index = tags.value.findIndex((tag) => tag.id === id);
    const targetIndex = direction === "up" ? index - 1 : index + 1;

    if (index < 0 || targetIndex < 0 || targetIndex >= tags.value.length) {
      return false;
    }

    const reorderedTags = [...tags.value];
    [reorderedTags[index], reorderedTags[targetIndex]] = [
      reorderedTags[targetIndex],
      reorderedTags[index]
    ];
    tags.value = reorderedTags.map((tag, nextIndex) => ({
      ...tag,
      sortOrder: (nextIndex + 1) * 1000
    }));

    return true;
  }

  return {
    tags,
    loading,
    loadTags,
    addTag,
    saveTag,
    removeTag,
    moveTag
  };
});
