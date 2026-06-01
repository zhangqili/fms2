import { createRouter, createWebHistory, type RouteRecordRaw } from "vue-router";

import CreateLeaderboardView from "@/views/CreateLeaderboardView.vue";
import ExportsView from "@/views/ExportsView.vue";
import HomeView from "@/views/HomeView.vue";
import LeaderboardDetailView from "@/views/LeaderboardDetailView.vue";
import LeaderboardsView from "@/views/LeaderboardsView.vue";
import PeopleView from "@/views/PeopleView.vue";
import PersonDetailView from "@/views/PersonDetailView.vue";
import SettingsView from "@/views/SettingsView.vue";
import TagsView from "@/views/TagsView.vue";

const routes: RouteRecordRaw[] = [
  { path: "/", name: "home", component: HomeView },
  { path: "/people", name: "people", component: PeopleView },
  { path: "/people/:id", name: "person-detail", component: PersonDetailView, props: true },
  { path: "/tags", name: "tags", component: TagsView },
  { path: "/leaderboards", name: "leaderboards", component: LeaderboardsView },
  { path: "/leaderboards/new", name: "create-leaderboard", component: CreateLeaderboardView },
  {
    path: "/leaderboards/:id",
    name: "leaderboard-detail",
    component: LeaderboardDetailView,
    props: true
  },
  { path: "/exports", name: "exports", component: ExportsView },
  { path: "/settings", name: "settings", component: SettingsView }
];

export const router = createRouter({
  history: createWebHistory(),
  routes
});
