import { defineStore } from "pinia";
import { computed, ref } from "vue";

import {
  createPerson,
  deletePerson,
  getPersonTagIds,
  listPeople,
  listPersonTagSummaries,
  setPersonArchived,
  updatePerson,
  type CreatePersonInput,
  type PeopleListOptions,
  type UpdatePersonInput
} from "@/repositories/peopleRepository";
import type { Person } from "@/types/models";

export const usePeopleStore = defineStore("people", () => {
  const people = ref<Person[]>([]);
  const tagIdsByPersonId = ref<Record<string, string[]>>({});
  const loading = ref(false);
  const includeArchived = ref(false);
  const query = ref("");
  const selectedTagIds = ref<string[]>([]);
  const sort = ref<PeopleListOptions["sort"]>("name");

  const activePeople = computed(() => people.value.filter((person) => !person.archived));

  async function loadPeople(options: Partial<PeopleListOptions> = {}): Promise<void> {
    loading.value = true;
    try {
      const listOptions: PeopleListOptions = {
        includeArchived: options.includeArchived ?? includeArchived.value,
        query: options.query ?? query.value,
        tagIds: options.tagIds ?? selectedTagIds.value,
        sort: options.sort ?? sort.value
      };

      people.value = await listPeople(listOptions);
      await loadPersonTagSummaries();
    } finally {
      loading.value = false;
    }
  }

  async function loadPersonTagSummaries(): Promise<void> {
    const summaries = await listPersonTagSummaries();
    tagIdsByPersonId.value = Object.fromEntries(
      summaries.map((summary) => [summary.personId, summary.tagIds])
    );
  }

  async function addPerson(input: CreatePersonInput): Promise<void> {
    await createPerson(input);
    await loadPeople();
  }

  async function savePerson(id: string, input: UpdatePersonInput): Promise<void> {
    await updatePerson(id, input);
    await loadPeople();
  }

  async function archivePerson(id: string, archived: boolean): Promise<void> {
    await setPersonArchived(id, archived);
    await loadPeople();
  }

  async function removePerson(id: string): Promise<void> {
    await deletePerson(id);
    await loadPeople();
  }

  async function loadTagIdsForPerson(personId: string): Promise<string[]> {
    const tagIds = await getPersonTagIds(personId);
    tagIdsByPersonId.value = {
      ...tagIdsByPersonId.value,
      [personId]: tagIds
    };
    return tagIds;
  }

  function setQuery(value: string): void {
    query.value = value;
  }

  function setIncludeArchived(value: boolean): void {
    includeArchived.value = value;
  }

  function toggleSelectedTag(tagId: string): void {
    selectedTagIds.value = selectedTagIds.value.includes(tagId)
      ? selectedTagIds.value.filter((id) => id !== tagId)
      : [...selectedTagIds.value, tagId];
  }

  return {
    people,
    activePeople,
    tagIdsByPersonId,
    loading,
    includeArchived,
    query,
    selectedTagIds,
    sort,
    loadPeople,
    loadPersonTagSummaries,
    addPerson,
    savePerson,
    archivePerson,
    removePerson,
    loadTagIdsForPerson,
    setQuery,
    setIncludeArchived,
    toggleSelectedTag
  };
});
