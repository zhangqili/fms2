<script setup lang="ts">
import { computed, onMounted, ref } from "vue";

import PageHeader from "@/components/PageHeader.vue";
import PersonListItem from "@/components/PersonListItem.vue";
import { usePeopleStore } from "@/stores/peopleStore";
import { useTagsStore } from "@/stores/tagsStore";

const peopleStore = usePeopleStore();
const tagsStore = useTagsStore();
const newName = ref("");
const newNote = ref("");
const query = ref("");
const newPersonTagIds = ref<string[]>([]);

const tagsById = computed(() => new Map(tagsStore.tags.map((tag) => [tag.id, tag])));

const filteredPeople = computed(() => peopleStore.people);

async function addPerson(): Promise<void> {
  const name = newName.value.trim();
  if (!name) {
    return;
  }

  await peopleStore.addPerson({
    name,
    note: newNote.value,
    tagIds: newPersonTagIds.value
  });
  newName.value = "";
  newNote.value = "";
  newPersonTagIds.value = [];
}

function toggleNewPersonTag(tagId: string): void {
  newPersonTagIds.value = newPersonTagIds.value.includes(tagId)
    ? newPersonTagIds.value.filter((id) => id !== tagId)
    : [...newPersonTagIds.value, tagId];
}

async function refreshPeople(): Promise<void> {
  peopleStore.setQuery(query.value);
  await peopleStore.loadPeople();
}

async function toggleFilterTag(tagId: string): Promise<void> {
  peopleStore.toggleSelectedTag(tagId);
  await peopleStore.loadPeople();
}

function tagNamesForPerson(personId: string): string[] {
  const tagIds = peopleStore.tagIdsByPersonId[personId] ?? [];
  return tagIds
    .map((tagId) => tagsById.value.get(tagId)?.name)
    .filter((name): name is string => typeof name === "string");
}

onMounted(async () => {
  await Promise.all([tagsStore.loadTags(), peopleStore.loadPeople()]);
});
</script>

<template>
  <section class="page">
    <PageHeader title="人员" />

    <div class="toolbar">
      <input v-model="query" class="field" placeholder="搜索姓名或备注" @input="refreshPeople" />
      <label class="check-row">
        <input
          v-model="peopleStore.includeArchived"
          type="checkbox"
          @change="peopleStore.loadPeople()"
        />
        显示归档
      </label>
    </div>

    <div v-if="tagsStore.tags.length" class="tag-picker">
      <button
        v-for="tag in tagsStore.tags"
        :key="tag.id"
        class="tag-chip"
        :class="{ selected: peopleStore.selectedTagIds.includes(tag.id) }"
        type="button"
        @click="toggleFilterTag(tag.id)"
      >
        <span class="tag-dot" :style="{ backgroundColor: tag.color }" />
        {{ tag.name }}
      </button>
    </div>

    <section class="panel">
      <form class="inline-form" @submit.prevent="addPerson">
        <input v-model="newName" class="field" placeholder="新人员姓名" />
        <input v-model="newNote" class="field" placeholder="备注" />
        <button class="button primary" type="submit">添加人员</button>
      </form>
      <div v-if="tagsStore.tags.length" class="tag-picker compact">
        <button
          v-for="tag in tagsStore.tags"
          :key="tag.id"
          class="tag-chip"
          :class="{ selected: newPersonTagIds.includes(tag.id) }"
          type="button"
          @click="toggleNewPersonTag(tag.id)"
        >
          <span class="tag-dot" :style="{ backgroundColor: tag.color }" />
          {{ tag.name }}
        </button>
      </div>
    </section>

    <section class="panel">
      <p v-if="filteredPeople.length === 0" class="empty">还没有人员。</p>
      <PersonListItem
        v-for="person in filteredPeople"
        :key="person.id"
        :person="person"
        :tag-names="tagNamesForPerson(person.id)"
      />
    </section>
  </section>
</template>
