import { fileURLToPath, URL } from "node:url";

import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["app-icon.svg"],
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        navigateFallback: "/index.html",
        globPatterns: ["**/*.{js,css,html,svg,png,ico,webmanifest}"]
      },
      manifest: {
        id: "/",
        name: "Friend Management System 2",
        short_name: "FMS2",
        lang: "zh-CN",
        description: "离线优先的亲友榜单管理 PWA",
        theme_color: "#245c73",
        background_color: "#f7faf8",
        display: "standalone",
        orientation: "any",
        start_url: "/",
        scope: "/",
        categories: ["productivity", "utilities"],
        icons: [
          {
            src: "/app-icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable"
          }
        ],
        shortcuts: [
          {
            name: "新建榜单",
            short_name: "新建",
            url: "/leaderboards/new",
            icons: [
              {
                src: "/app-icon.svg",
                sizes: "any",
                type: "image/svg+xml"
              }
            ]
          },
          {
            name: "导出",
            short_name: "导出",
            url: "/exports",
            icons: [
              {
                src: "/app-icon.svg",
                sizes: "any",
                type: "image/svg+xml"
              }
            ]
          }
        ]
      }
    })
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url))
    }
  }
});
