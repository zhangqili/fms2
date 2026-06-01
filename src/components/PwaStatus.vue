<script setup lang="ts">
import { CheckCircle2, Download, RefreshCw, WifiOff, X } from "lucide-vue-next";
import { computed, onMounted, onUnmounted, ref, shallowRef } from "vue";
import { useRegisterSW } from "virtual:pwa-register/vue";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt(): Promise<void>;
}

const isOnline = ref(navigator.onLine);
const installPrompt = shallowRef<BeforeInstallPromptEvent | null>(null);
const installDismissed = ref(false);
const showOfflineReady = ref(false);
const registerError = ref("");
const isStandalone = ref(isAppStandalone());
let updateTimer = 0;

const { needRefresh, updateServiceWorker } = useRegisterSW({
  immediate: true,
  onOfflineReady() {
    showOfflineReady.value = true;
  },
  onRegisteredSW(_swScriptUrl, registration) {
    if (!registration) {
      return;
    }

    updateTimer = window.setInterval(() => {
      void registration.update();
    }, 60 * 60 * 1000);
  },
  onRegisterError(error) {
    registerError.value = "离线缓存注册失败。";
    console.error("PWA registration failed", error);
  }
});

const canInstall = computed(
  () => installPrompt.value !== null && !installDismissed.value && !isStandalone.value
);
const isVisible = computed(
  () => !isOnline.value || needRefresh.value || showOfflineReady.value || canInstall.value || registerError.value
);
const statusKind = computed(() => {
  if (!isOnline.value) {
    return "offline";
  }
  if (needRefresh.value) {
    return "refresh";
  }
  if (showOfflineReady.value) {
    return "ready";
  }
  if (canInstall.value) {
    return "install";
  }
  return "error";
});
const statusText = computed(() => {
  if (!isOnline.value) {
    return "当前离线，本地数据仍可使用。";
  }
  if (needRefresh.value) {
    return "发现新版本。";
  }
  if (showOfflineReady.value) {
    return "已可离线使用。";
  }
  if (canInstall.value) {
    return "可安装到设备。";
  }
  return registerError.value;
});

async function installApp(): Promise<void> {
  const promptEvent = installPrompt.value;
  if (!promptEvent) {
    return;
  }

  installPrompt.value = null;
  installDismissed.value = true;
  await promptEvent.prompt();
  await promptEvent.userChoice.catch(() => undefined);
}

async function refreshApp(): Promise<void> {
  await updateServiceWorker(true);
}

function dismiss(): void {
  installDismissed.value = true;
  showOfflineReady.value = false;
  registerError.value = "";
}

function handleOnlineChange(): void {
  isOnline.value = navigator.onLine;
}

function handleBeforeInstallPrompt(event: Event): void {
  event.preventDefault();
  installPrompt.value = event as BeforeInstallPromptEvent;
  installDismissed.value = false;
}

function handleAppInstalled(): void {
  installPrompt.value = null;
  installDismissed.value = true;
  isStandalone.value = true;
}

function isAppStandalone(): boolean {
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || navigatorWithStandalone.standalone === true;
}

onMounted(() => {
  window.addEventListener("online", handleOnlineChange);
  window.addEventListener("offline", handleOnlineChange);
  window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  window.addEventListener("appinstalled", handleAppInstalled);
});

onUnmounted(() => {
  window.removeEventListener("online", handleOnlineChange);
  window.removeEventListener("offline", handleOnlineChange);
  window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  window.removeEventListener("appinstalled", handleAppInstalled);
  if (updateTimer) {
    window.clearInterval(updateTimer);
  }
});
</script>

<template>
  <aside v-if="isVisible" class="pwa-status" :data-kind="statusKind" role="status">
    <WifiOff v-if="statusKind === 'offline'" :size="18" aria-hidden="true" />
    <RefreshCw v-else-if="statusKind === 'refresh'" :size="18" aria-hidden="true" />
    <CheckCircle2 v-else-if="statusKind === 'ready'" :size="18" aria-hidden="true" />
    <Download v-else :size="18" aria-hidden="true" />

    <span>{{ statusText }}</span>

    <button
      v-if="needRefresh"
      class="pwa-action"
      type="button"
      title="更新"
      aria-label="更新"
      @click="refreshApp"
    >
      <RefreshCw :size="16" aria-hidden="true" />
    </button>
    <button
      v-else-if="canInstall"
      class="pwa-action"
      type="button"
      title="安装"
      aria-label="安装"
      @click="installApp"
    >
      <Download :size="16" aria-hidden="true" />
    </button>
    <button
      v-if="statusKind !== 'offline' && !needRefresh"
      class="pwa-action"
      type="button"
      title="关闭"
      aria-label="关闭"
      @click="dismiss"
    >
      <X :size="16" aria-hidden="true" />
    </button>
  </aside>
</template>
