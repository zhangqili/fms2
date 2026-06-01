import { db } from "@/db";
import type { PersonTag, Tag } from "@/types/models";
import { nowIso } from "@/utils/dates";
import { makeId } from "@/utils/ids";

export interface TagWithUsage extends Tag {
  usageCount: number;
}

export type TagMoveDirection = "up" | "down";

export async function listTags(): Promise<Tag[]> {
  const tags = await db.tags.toArray();
  return sortTagsByOrder(tags);
}

export async function listTagsWithUsage(): Promise<TagWithUsage[]> {
  const [tags, relations] = await Promise.all([listTags(), db.person_tags.toArray()]);
  const usageByTagId = new Map<string, number>();

  for (const relation of relations) {
    usageByTagId.set(relation.tagId, (usageByTagId.get(relation.tagId) ?? 0) + 1);
  }

  return tags.map((tag) => ({ ...tag, usageCount: usageByTagId.get(tag.id) ?? 0 }));
}

export async function createTag(name: string, color = "#245c73"): Promise<Tag> {
  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error("Tag name is required.");
  }

  const timestamp = nowIso();
  const tag: Tag = {
    id: makeId("tag"),
    name: trimmedName,
    color,
    sortOrder: await nextTagSortOrder(),
    createdAt: timestamp,
    updatedAt: timestamp
  };

  await db.tags.add(tag);
  return tag;
}

export async function updateTag(tag: Tag): Promise<void> {
  const name = tag.name.trim();
  if (!name) {
    throw new Error("Tag name is required.");
  }

  await db.tags.put({
    ...tag,
    name,
    updatedAt: nowIso()
  });
}

export async function deleteTag(id: string): Promise<void> {
  await db.transaction("rw", db.tags, db.person_tags, async () => {
    await db.person_tags.where("tagId").equals(id).delete();
    await db.tags.delete(id);
  });
}

export async function moveTag(id: string, direction: TagMoveDirection): Promise<void> {
  const tags = await listTags();
  const index = tags.findIndex((tag) => tag.id === id);
  const targetIndex = direction === "up" ? index - 1 : index + 1;

  if (index < 0 || targetIndex < 0 || targetIndex >= tags.length) {
    return;
  }

  const reorderedTags = [...tags];
  [reorderedTags[index], reorderedTags[targetIndex]] = [
    reorderedTags[targetIndex],
    reorderedTags[index]
  ];

  await normalizeTagSortOrders(reorderedTags);
}

export async function attachTag(personId: string, tagId: string): Promise<PersonTag> {
  const existing = await db.person_tags.where("[personId+tagId]").equals([personId, tagId]).first();
  if (existing) {
    return existing;
  }

  const personTag: PersonTag = {
    id: makeId("person_tag"),
    personId,
    tagId,
    createdAt: nowIso()
  };

  await db.person_tags.add(personTag);
  return personTag;
}

export async function detachTag(personId: string, tagId: string): Promise<void> {
  await db.person_tags.where("[personId+tagId]").equals([personId, tagId]).delete();
}

function sortTagsByOrder(tags: Tag[]): Tag[] {
  return [...tags].sort((left, right) => {
    const orderDelta = tagSortOrder(left) - tagSortOrder(right);
    if (orderDelta !== 0) {
      return orderDelta;
    }

    const createdAtDelta = left.createdAt.localeCompare(right.createdAt);
    if (createdAtDelta !== 0) {
      return createdAtDelta;
    }

    return left.name.localeCompare(right.name, "zh-CN");
  });
}

async function nextTagSortOrder(): Promise<number> {
  const tags = await db.tags.toArray();
  const maxSortOrder = tags.reduce(
    (max, tag) => Math.max(max, Number.isFinite(tag.sortOrder) ? tag.sortOrder : 0),
    0
  );

  return maxSortOrder + 1000;
}

async function normalizeTagSortOrders(tags: Tag[]): Promise<void> {
  const timestamp = nowIso();
  await db.tags.bulkPut(
    tags.map((tag, index) => ({
      ...tag,
      sortOrder: (index + 1) * 1000,
      updatedAt: timestamp
    }))
  );
}

function tagSortOrder(tag: Tag): number {
  return Number.isFinite(tag.sortOrder) ? tag.sortOrder : Number.POSITIVE_INFINITY;
}
