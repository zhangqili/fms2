<script setup lang="ts">
import { Award, Home, Settings, Tags, Users } from "lucide-vue-next";
import { RouterLink, RouterView } from "vue-router";

const navItems = [
  { to: "/", label: "首页", icon: Home },
  { to: "/people", label: "人员", icon: Users },
  { to: "/tags", label: "标签", icon: Tags },
  { to: "/leaderboards", label: "榜单", icon: Award },
  { to: "/settings", label: "设置", icon: Settings }
];
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar" aria-label="主导航">
      <div class="brand">
        <div class="brand-mark">F2</div>
        <div>
          <p class="brand-title">FMS2</p>
          <p class="brand-subtitle">离线榜单</p>
        </div>
      </div>

      <nav class="nav-list">
        <RouterLink v-for="item in navItems" :key="item.to" :to="item.to" class="nav-link">
          <component :is="item.icon" :size="18" aria-hidden="true" />
          <span>{{ item.label }}</span>
        </RouterLink>
      </nav>
    </aside>

    <main class="main-panel">
      <RouterView />
    </main>
  </div>
</template>
