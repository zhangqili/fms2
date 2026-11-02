import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";
import { fileURLToPath } from "node:url";

import vue from "@vitejs/plugin-vue";
import { createPinia } from "pinia";
import { createRenderer, getCurrentInstance, h, nextTick, ssrContextKey } from "vue";
import { createMemoryHistory, createRouter, RouterView } from "vue-router";
import { createServer } from "vite";

let vite;
let AnnualPage;
let useWorkspaceTabsStore;
const mountedApps = [];

// Exercise the page's actual setup and router without opening or changing a browser database.
const renderer = createRenderer({
  createElement: (tag) => ({ tag, children: [] }),
  createText: (text) => ({ text }),
  createComment: (text) => ({ text }),
  insert(node, parent, anchor = null) {
    if (node.parent) {
      node.parent.children.splice(node.parent.children.indexOf(node), 1);
    }
    const index = anchor ? parent.children.indexOf(anchor) : -1;
    parent.children.splice(index < 0 ? parent.children.length : index, 0, node);
    node.parent = parent;
  },
  remove(node) {
    node.parent?.children.splice(node.parent.children.indexOf(node), 1);
    node.parent = null;
  },
  setText: (node, text) => { node.text = text; },
  setElementText: (node, text) => { node.text = text; },
  parentNode: (node) => node.parent,
  nextSibling: (node) => node.parent?.children[node.parent.children.indexOf(node) + 1] ?? null,
  patchProp() {}
});

before(async () => {
  const repositoryPath = fileURLToPath(new URL("../src/repositories/annualLeaderboardsRepository.ts", import.meta.url));
  vite = await createServer({
    configFile: false,
    appType: "custom",
    optimizeDeps: { noDiscovery: true, include: [] },
    resolve: { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) } },
    server: { middlewareMode: true, ws: false, watch: null },
    plugins: [
      {
        name: "annual-navigation-fixture",
        enforce: "pre",
        load(id) {
          if (id === repositoryPath) {
            return `
              export const listAnnualYears = () => globalThis.__fmsAnnualFixture.listYears();
              export const getAnnualLeaderboard = (year) => globalThis.__fmsAnnualFixture.getData(year);
              export const saveAnnualRepresentatives = (year, ids) => globalThis.__fmsAnnualFixture.save(year, ids);
            `;
          }
        }
      },
      vue()
    ]
  });
  ({ default: AnnualPage } = await vite.ssrLoadModule("/src/views/AnnualLeaderboardsView.vue"));
  ({ useWorkspaceTabsStore } = await vite.ssrLoadModule("/src/stores/workspaceTabsStore.ts"));
});

function createFixture(years = [2025, 2024]) {
  const fixture = {
    years,
    data: Object.fromEntries(years.map((year) => [year, {
      year,
      rows: [{ personId: `person-${year}`, personName: `Person ${year}`, annualRank: 1,
        weeklyAverageScore: 10, annualPeakScore: 20, weeklyPeakRank: 1 }],
      representativePersonIds: []
    }])),
    async listYears() { return [...fixture.years]; },
    async getData(year) { return structuredClone(fixture.data[year]); },
    async save(year, ids) {
      fixture.data[year].representativePersonIds = [...ids];
      return { year, representativePersonIds: [...ids], updatedAt: new Date().toISOString() };
    }
  };
  globalThis.__fmsAnnualFixture = fixture;
  return fixture;
}

async function mountPage(path) {
  const pinia = createPinia();
  const tabs = useWorkspaceTabsStore(pinia);
  let pageInstance;
  const page = { ...AnnualPage, render() { pageInstance = getCurrentInstance(); return null; } };
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", component: { render: () => null } },
      { path: "/annual-leaderboards", component: page },
      { path: "/annual-leaderboards/:year", component: page },
      { path: "/people/:id", component: { render: () => null } }
    ]
  });
  await router.push(path);
  await router.isReady();
  const app = renderer.createApp({ render: () => h(RouterView) });
  app.use(pinia);
  app.use(router);
  app.provide(ssrContextKey, { modules: new Set() });
  app.mount({ children: [] });
  mountedApps.push(app);
  await nextTick();
  return { router, tabs, state: () => pageInstance.setupState };
}

async function waitFor(predicate) {
  const deadline = Date.now() + 1000;
  while (!predicate()) {
    if (Date.now() > deadline) {
      assert.fail("Timed out waiting for the annual page state");
    }
    await new Promise((resolve) => setImmediate(resolve));
    await nextTick();
  }
}

async function flush() {
  await new Promise((resolve) => setImmediate(resolve));
  await nextTick();
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

test("entry opens the latest year; year selection, back/forward and person round trips restore the URL year", async () => {
  createFixture();
  const { router, tabs, state } = await mountPage("/annual-leaderboards");
  await waitFor(() => state().annualData?.year === 2025);
  assert.equal(router.currentRoute.value.path, "/annual-leaderboards/2025");
  assert.equal(tabs.tabs[0].title, "2025 年榜");
  state().selectYear(2024);
  await waitFor(() => state().annualData?.year === 2024);
  assert.equal(state().selectedYear, 2024);
  assert.equal(tabs.tabs.length, 2);
  router.back();
  await waitFor(() => state().annualData?.year === 2025);
  router.forward();
  await waitFor(() => state().annualData?.year === 2024);
  await router.push("/people/person-2024");
  router.back();
  await waitFor(() => state().annualData?.year === 2024);
  assert.equal(tabs.tabs.length, 2);
  assert.equal(tabs.activeTab.title, "2024 年榜");
});

test("direct year URLs load that year and repeated navigation reuses its annual tab", async () => {
  createFixture();
  const { router, tabs, state } = await mountPage("/annual-leaderboards/2024");
  await waitFor(() => state().annualData?.year === 2024);
  assert.equal(tabs.tabs.length, 1);
  await router.push("/annual-leaderboards/2025");
  await waitFor(() => state().annualData?.year === 2025);
  await router.push("/annual-leaderboards/2024");
  await waitFor(() => state().annualData?.year === 2024);
  assert.equal(tabs.tabs.length, 2);
  assert.equal(tabs.activeTab.title, "2024 年榜");
});

test("an empty database creates no annual tab and invalid or missing years show errors", async () => {
  createFixture([]);
  const empty = await mountPage("/annual-leaderboards");
  await waitFor(() => !empty.state().loading);
  assert.equal(empty.state().annualData, null);
  assert.equal(empty.tabs.tabs.length, 0);
  createFixture();
  const invalid = await mountPage("/annual-leaderboards/not-a-year");
  await waitFor(() => !invalid.state().loading);
  assert.match(invalid.state().loadError, /年份无效/);
  assert.equal(invalid.tabs.tabs.length, 0);
  await invalid.router.push("/annual-leaderboards/2030");
  await waitFor(() => !invalid.state().loading);
  assert.match(invalid.state().loadError, /2030 年暂无榜单/);
  assert.equal(invalid.tabs.tabs.length, 0);
});

test("a slow previous year's load cannot replace the current year or open a stale tab", async () => {
  const fixture = createFixture();
  const slow = deferred();
  fixture.getData = (year) => year === 2025 ? slow.promise : Promise.resolve(structuredClone(fixture.data[year]));
  const { router, tabs, state } = await mountPage("/annual-leaderboards/2025");
  await router.push("/annual-leaderboards/2024");
  await waitFor(() => state().annualData?.year === 2024);
  slow.resolve(structuredClone(fixture.data[2025]));
  await flush();
  assert.equal(state().annualData.year, 2024);
  assert.deepEqual(tabs.tabs.map((tab) => tab.title), ["2024 年榜"]);
});

test("switching years discards drafts and an old save cannot cancel the new year's editing", async () => {
  const fixture = createFixture();
  const oldSave = deferred();
  fixture.save = () => oldSave.promise;
  const { router, state } = await mountPage("/annual-leaderboards/2025");
  await waitFor(() => state().annualData?.year === 2025);
  state().startEditing();
  state().draftRepresentativeIds = ["person-2025"];
  const saving = state().saveRepresentatives();
  await router.push("/annual-leaderboards/2024");
  await waitFor(() => state().annualData?.year === 2024);
  assert.equal(state().editingRepresentatives, false);
  assert.deepEqual(state().draftRepresentativeIds, []);
  state().startEditing();
  state().draftRepresentativeIds = ["person-2024"];
  oldSave.resolve({ year: 2025, representativePersonIds: ["person-2025"] });
  await saving;
  assert.equal(state().annualData.year, 2024);
  assert.deepEqual(state().annualData.representativePersonIds, []);
  assert.equal(state().editingRepresentatives, true);
  assert.deepEqual(state().draftRepresentativeIds, ["person-2024"]);
  assert.equal(state().statusMessage, "");
});

test("a save failure keeps the current selection available for retry", async () => {
  const fixture = createFixture();
  fixture.save = async () => { throw new Error("Simulated save failure"); };
  const { state } = await mountPage("/annual-leaderboards/2024");
  await waitFor(() => state().annualData?.year === 2024);
  state().startEditing();
  state().draftRepresentativeIds = ["person-2024"];
  await state().saveRepresentatives();
  assert.equal(state().editingRepresentatives, true);
  assert.equal(state().saving, false);
  assert.deepEqual(state().draftRepresentativeIds, ["person-2024"]);
  assert.match(state().saveError, /Simulated save failure/);
});

afterEach(() => {
  for (const app of mountedApps.splice(0)) app.unmount();
  delete globalThis.__fmsAnnualFixture;
});
after(() => vite?.close());
