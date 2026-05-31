<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";

import PageHeader from "@/components/PageHeader.vue";
import { getPerson } from "@/repositories/peopleRepository";
import { usePeopleStore } from "@/stores/peopleStore";
import { useTagsStore } from "@/stores/tagsStore";
import type { Person } from "@/types/models";

const props = defineProps<{
  id: string;
}>();

const router = useRouter();
const peopleStore = usePeopleStore();
const tagsStore = useTagsStore();
const person = ref<Person | null>(null);
const selectedTagIds = ref<string[]>([]);
const form = reactive({
  name: "",
  note: "",
  archived: false
});

const canSave = computed(() => form.name.trim().length > 0);

function fillForm(nextPerson: Person, tagIds: string[]): void {
  form.name = nextPerson.name;
  form.note = nextPerson.note;
  form.archived = nextPerson.archived;
  selectedTagIds.value = tagIds;
}

function toggleTag(tagId: string): void {
  selectedTagIds.value = selectedTagIds.value.includes(tagId)
    ? selectedTagIds.value.filter((id) => id !== tagId)
    : [...selectedTagIds.value, tagId];
}

async function save(): Promise<void> {
  if (!person.value || !canSave.value) {
    return;
  }

  await peopleStore.savePerson(person.value.id, {
    name: form.name,
    note: form.note,
    archived: form.archived,
    tagIds: selectedTagIds.value
  });
  const updated = await getPerson(person.value.id);
  if (updated) {
    person.value = updated;
    fillForm(updated, selectedTagIds.value);
  }
}

async function toggleArchived(): Promise<void> {
  if (!person.value) {
    return;
  }

  await peopleStore.archivePerson(person.value.id, !form.archived);
  const updated = await getPerson(person.value.id);
  if (updated) {
    person.value = updated;
    fillForm(updated, selectedTagIds.value);
  }
}

async function remove(): Promise<void> {
  if (!person.value) {
    return;
  }

  const confirmed = window.confirm("删除人员会移除其标签绑定，但不会改写历史榜单快照。确定删除吗？");
  if (!confirmed) {
    return;
  }

  await peopleStore.removePerson(person.value.id);
  await router.push("/people");
}

onMounted(async () => {
  await tagsStore.loadTags();
  const [loadedPerson, tagIds] = await Promise.all([
    getPerson(props.id),
    peopleStore.loadTagIdsForPerson(props.id)
  ]);
  person.value = loadedPerson ?? null;
  if (loadedPerson) {
    fillForm(loadedPerson, tagIds);
  }
});
</script>

<template>
  <section class="page">
    <PageHeader :title="person?.name ?? '人员详情'">
      <button v-if="person" class="button" type="button" @click="toggleArchived">
        {{ form.archived ? "取消归档" : "归档" }}
      </button>
    </PageHeader>

    <section class="panel">
      <p v-if="!person" class="empty">未找到该人员。</p>
      <form v-else class="form-grid" @submit.prevent="save">
        <label>
          <span>姓名</span>
          <input v-model="form.name" class="field" />
        </label>
        <label>
          <span>备注</span>
          <textarea v-model="form.note" class="field text-field" />
        </label>
        <label class="check-row">
          <input v-model="form.archived" type="checkbox" />
          已归档
        </label>

        <div>
          <span class="field-label">标签</span>
          <div class="tag-picker">
            <button
              v-for="tag in tagsStore.tags"
              :key="tag.id"
              class="tag-chip"
              :class="{ selected: selectedTagIds.includes(tag.id) }"
              type="button"
              @click="toggleTag(tag.id)"
            >
              <span class="tag-dot" :style="{ backgroundColor: tag.color }" />
              {{ tag.name }}
            </button>
          </div>
        </div>

        <div class="actions-row">
          <button class="button primary" type="submit" :disabled="!canSave">保存</button>
          <button class="button danger" type="button" @click="remove">删除</button>
        </div>
      </form>
    </section>

    <section class="panel">
      <div class="section-title">
        <h2>历史榜单</h2>
      </div>
      <p class="empty">榜单条目功能完成后，这里会展示该人员参与过的分数快照。</p>
    </section>
  </section>
</template>
