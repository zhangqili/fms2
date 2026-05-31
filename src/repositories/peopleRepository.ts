import { db } from "@/db";
import type { Person } from "@/types/models";
import { nowIso } from "@/utils/dates";
import { makeId } from "@/utils/ids";

export interface PeopleListOptions {
  includeArchived?: boolean;
  query?: string;
  tagIds?: string[];
  sort?: "name" | "createdAt" | "updatedAt";
}

export interface CreatePersonInput {
  name: string;
  note?: string;
  tagIds?: string[];
}

export interface UpdatePersonInput {
  name: string;
  note: string;
  archived: boolean;
  tagIds: string[];
}

export interface PersonTagSummary {
  personId: string;
  tagIds: string[];
}

export async function listPeople(options: PeopleListOptions = {}): Promise<Person[]> {
  const includeArchived = options.includeArchived ?? false;
  const sort = options.sort ?? "name";
  let people = await db.people.orderBy(sort).toArray();

  if (sort === "updatedAt" || sort === "createdAt") {
    people = people.reverse();
  }

  if (!includeArchived) {
    people = people.filter((person) => !person.archived);
  }

  const query = options.query?.trim().toLowerCase();
  if (query) {
    people = people.filter((person) => {
      const content = `${person.name} ${person.note}`.toLowerCase();
      return content.includes(query);
    });
  }

  if (options.tagIds?.length) {
    const requiredTagIds = new Set(options.tagIds);
    const relations = await db.person_tags.toArray();
    const tagIdsByPersonId = new Map<string, Set<string>>();

    for (const relation of relations) {
      const tagIds = tagIdsByPersonId.get(relation.personId) ?? new Set<string>();
      tagIds.add(relation.tagId);
      tagIdsByPersonId.set(relation.personId, tagIds);
    }

    people = people.filter((person) => {
      const tagIds = tagIdsByPersonId.get(person.id);
      if (!tagIds) {
        return false;
      }

      return [...requiredTagIds].every((tagId) => tagIds.has(tagId));
    });
  }

  return people;
}

export async function getPerson(id: string): Promise<Person | undefined> {
  return db.people.get(id);
}

export async function createPerson(input: CreatePersonInput): Promise<Person> {
  const name = input.name.trim();
  if (!name) {
    throw new Error("Person name is required.");
  }

  const timestamp = nowIso();
  const person: Person = {
    id: makeId("person"),
    name,
    note: input.note?.trim() ?? "",
    archived: false,
    createdAt: timestamp,
    updatedAt: timestamp
  };

  await db.transaction("rw", db.people, db.person_tags, async () => {
    await db.people.add(person);
    await replacePersonTags(person.id, input.tagIds ?? []);
  });

  return person;
}

export async function updatePerson(id: string, input: UpdatePersonInput): Promise<void> {
  const existing = await db.people.get(id);
  if (!existing) {
    throw new Error(`Person not found: ${id}`);
  }

  const name = input.name.trim();
  if (!name) {
    throw new Error("Person name is required.");
  }

  await db.transaction("rw", db.people, db.person_tags, async () => {
    await db.people.put({
      ...existing,
      name,
      note: input.note.trim(),
      archived: input.archived,
      updatedAt: nowIso()
    });
    await replacePersonTags(id, input.tagIds);
  });
}

export async function setPersonArchived(id: string, archived: boolean): Promise<void> {
  const person = await db.people.get(id);
  if (!person) {
    return;
  }

  await db.people.put({ ...person, archived, updatedAt: nowIso() });
}

export async function deletePerson(id: string): Promise<void> {
  await db.transaction("rw", db.people, db.person_tags, async () => {
    await db.person_tags.where("personId").equals(id).delete();
    await db.people.delete(id);
  });
}

export async function getPersonTagIds(personId: string): Promise<string[]> {
  const relations = await db.person_tags.where("personId").equals(personId).toArray();
  return relations.map((relation) => relation.tagId);
}

export async function listPersonTagSummaries(): Promise<PersonTagSummary[]> {
  const relations = await db.person_tags.toArray();
  const tagIdsByPerson = new Map<string, string[]>();

  for (const relation of relations) {
    const tagIds = tagIdsByPerson.get(relation.personId) ?? [];
    tagIds.push(relation.tagId);
    tagIdsByPerson.set(relation.personId, tagIds);
  }

  return [...tagIdsByPerson.entries()].map(([personId, tagIds]) => ({ personId, tagIds }));
}

export async function replacePersonTags(personId: string, tagIds: string[]): Promise<void> {
  const uniqueTagIds = [...new Set(tagIds)];
  await db.person_tags.where("personId").equals(personId).delete();

  if (uniqueTagIds.length === 0) {
    return;
  }

  await db.person_tags.bulkAdd(
    uniqueTagIds.map((tagId) => ({
      id: makeId("person_tag"),
      personId,
      tagId,
      createdAt: nowIso()
    }))
  );
}
