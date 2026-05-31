import { db } from "@/db";
import type { PersonTag, Tag } from "@/types/models";
import { nowIso } from "@/utils/dates";
import { makeId } from "@/utils/ids";

export interface TagWithUsage extends Tag {
  usageCount: number;
}

export async function listTags(): Promise<Tag[]> {
  return db.tags.orderBy("sortOrder").toArray();
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
    sortOrder: Date.now(),
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
