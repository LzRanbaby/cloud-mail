<template>
  <nav
    v-if="isMobile"
    ref="navRef"
    class="bottom-nav"
    :class="{ dragging }"
    aria-label="mailbox navigation"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
  >
    <span class="nav-capsule" :class="{ dragging }" :style="capsuleStyle" aria-hidden="true" />
    <span v-show="dragging" class="drag-bubble" :style="bubbleStyle" aria-hidden="true">{{ dragTitle }}</span>
    <button
      v-for="(item, index) in navItems"
      v-show="!item.perm || hasPerm(item.perm)"
      :key="item.name"
      ref="itemRefs"
      type="button"
      class="nav-item"
      :class="{ active: isActive(item) }"
      :aria-current="isActive(item) ? 'page' : undefined"
      @click="go(item)"
    >
      <span class="nav-content">
        <span class="nav-icon"><Icon :icon="item.icon" width="20" height="20" /></span>
        <span class="nav-label">{{ $t(item.label) }}</span>
      </span>
    </button>
  </nav>
</template>

<script setup>
import router from "@/router";
import { Icon } from "@iconify/vue";
import { useRoute } from "vue-router";
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useUiStore } from "@/store/ui.js";
import { hasPerm } from "@/perm/perm.js";

const { t } = useI18n();
const route = useRoute();
const uiStore = useUiStore();
const navRef = ref(null);
const itemRefs = ref([]);
const isMobile = ref(window.innerWidth < 1025);
const capsuleStyle = ref({ left: "0px", width: "0px", opacity: 0 });
const dragging = ref(false);
const dragTitle = ref("");
const bubbleStyle = ref({ left: "0px" });
let dragPointerId = null;
let dragStartX = 0;
let suppressClick = false;

// Same five entries as the drawer sidebar in layout/aside.
const navItems = [
  { name: "email", label: "inbox", icon: "hugeicons:mailbox-01", perm: null, mailbox: "inbox" },
  { name: "send", label: "sent", icon: "cil:send", perm: "email:send", mailbox: "sent" },
  { name: "draft", label: "drafts", icon: "ep:document", perm: "email:send", mailbox: "draft" },
  { name: "star", label: "starred", icon: "solar:star-line-duotone", perm: null, mailbox: "starred" },
  { name: "setting", label: "settings", icon: "fluent:settings-48-regular", perm: null, mailbox: null },
];

function isActive(item) {
  if (route.meta.name === item.name) return true;
  if (route.meta.name === "content" && item.mailbox && route.params.mailbox === item.mailbox) return true;
  return false;
}

function go(item) {
  if (suppressClick) return;
  uiStore.asideShow = false;
  if (route.name === item.name) return;
  router.push({ name: item.name }).catch(() => {});
}

// Flowing-glass sliding capsule (see @eze_is_1 video): one solid-white
// capsule that glides to the active tab. Only the active tab shows its
// label; the rest stay icon-only, like the video.
function updateCapsule() {
  const activeIndex = navItems.findIndex(
    (item) => isActive(item) && (!item.perm || hasPerm(item.perm))
  );
  if (activeIndex < 0 || !navRef.value) {
    capsuleStyle.value = { ...capsuleStyle.value, opacity: 0 };
    return;
  }
  const btn = itemRefs.value[activeIndex];
  if (!btn) return;
  capsuleStyle.value = {
    left: `${btn.offsetLeft + 5}px`,
    width: `${btn.offsetWidth - 10}px`,
    opacity: 1,
  };
}

// Touch-and-slide: press the bar and drag, no long-press needed. The
// capsule follows the finger; labels near the finger grow (magnify);
// release snaps to the nearest tab.
function tabIndexFromX(x) {
  const nav = navRef.value;
  if (!nav) return 0;
  const tabW = nav.getBoundingClientRect().width / 5;
  return Math.max(0, Math.min(4, Math.floor(x / tabW)));
}

function dragMoveTo(clientX) {
  const nav = navRef.value;
  if (!nav) return;
  const rect = nav.getBoundingClientRect();
  const x = clientX - rect.left;
  const tabW = rect.width / 5;
  const capW = tabW - 10;
  const left = Math.max(5, Math.min(rect.width - capW - 5, x - capW / 2));
  capsuleStyle.value = { left: `${left}px`, width: `${capW}px`, opacity: 1 };
  const idx = tabIndexFromX(x);
  dragTitle.value = t(navItems[idx].label);
  bubbleStyle.value = { left: `${x}px` };
  itemRefs.value.forEach((btn, i) => {
    if (!btn) return;
    const center = btn.offsetLeft + btn.offsetWidth / 2;
    const mag = Math.max(0, 1 - Math.abs(x - center) / (tabW * 1.5));
    btn.style.setProperty("--mag", mag.toFixed(2));
  });
}

function onPointerDown(e) {
  if (e.pointerType === "mouse" && e.button !== 0) return;
  dragging.value = true;
  dragPointerId = e.pointerId;
  dragStartX = e.clientX;
  try {
    navRef.value?.setPointerCapture(e.pointerId);
  } catch (_) {}
  dragMoveTo(e.clientX);
}

function onPointerMove(e) {
  if (!dragging.value) return;
  if (e.pointerType === "mouse" && e.buttons === 0) return;
  dragMoveTo(e.clientX);
}

function onPointerUp(e) {
  if (!dragging.value) return;
  dragging.value = false;
  itemRefs.value.forEach((btn) => btn?.style.setProperty("--mag", 0));
  const nav = navRef.value;
  if (!nav) return;
  const rect = nav.getBoundingClientRect();
  const idx = tabIndexFromX((e.clientX || dragStartX) - rect.left);
  const item = navItems[idx];
  suppressClick = true;
  setTimeout(() => {
    suppressClick = false;
  }, 350);
  if (item && !isActive(item)) go(item);
  else nextTick(updateCapsule);
}

function onResize() {
  isMobile.value = window.innerWidth < 1025;
  updateCapsule();
}

watch(
  () => [route.meta.name, route.params.mailbox],
  () => nextTick(updateCapsule)
);
watch(isMobile, () => nextTick(updateCapsule));

onMounted(() => {
  window.addEventListener("resize", onResize);
  nextTick(updateCapsule);
  if (document.fonts?.ready) document.fonts.ready.then(() => updateCapsule());
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", onResize);
});
</script>

<style lang="scss" scoped>
.bottom-nav {
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  bottom: calc(10px + env(safe-area-inset-bottom, 0px));
  z-index: 90;
  display: flex;
  align-items: center;
  width: min(340px, calc(100% - 32px));
  height: 74px;
  border-radius: 37px;
  background: rgba(255, 255, 255, 0.7);
  -webkit-backdrop-filter: blur(24px) saturate(160%);
  backdrop-filter: blur(24px) saturate(160%);
  border: 1px solid rgba(15, 23, 42, 0.08);
  box-shadow:
    0 12px 32px rgba(15, 23, 42, 0.16),
    0 2px 8px rgba(15, 23, 42, 0.06);
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}

.bottom-nav.dragging {
  background: rgba(255, 255, 255, 0.85);
}

.nav-capsule {
  position: absolute;
  top: 8px;
  height: calc(100% - 16px);
  border-radius: 28px;
  background: #ffffff;
  border: 1px solid rgba(15, 23, 42, 0.08);
  box-shadow:
    0 6px 18px rgba(15, 23, 42, 0.14),
    inset 0 1px 0 #fff;
  transition:
    left 0.38s cubic-bezier(0.32, 0.72, 0.24, 1),
    width 0.38s cubic-bezier(0.32, 0.72, 0.24, 1),
    opacity 0.2s;
  pointer-events: none;
}

.nav-capsule.dragging {
  transition: none;
  box-shadow:
    0 10px 26px rgba(15, 23, 42, 0.25),
    inset 0 1px 0 #fff;
}

.drag-bubble {
  position: absolute;
  left: 50%;
  bottom: calc(100% + 10px);
  transform: translateX(-50%);
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 999px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.16);
  padding: 7px 14px;
  font-size: 13px;
  font-weight: 700;
  color: #0f172a;
  white-space: nowrap;
  pointer-events: none;
  z-index: 2;
}

.nav-item {
  flex: 1;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 0;
  cursor: pointer;
  color: #475569;
  position: relative;
  z-index: 1;
  padding: 0;
  -webkit-tap-highlight-color: transparent;
}

.nav-item.active {
  color: #2563eb;
}

.nav-content {
  display: inline-flex;
  align-items: center;
}

.nav-icon {
  display: inline-flex;
  transform: scale(calc(1 + var(--mag, 0) * 0.1));
  transform-origin: center;
  transition: transform 0.12s ease-out;
}

.nav-label {
  display: inline-block;
  max-width: 0;
  opacity: 0;
  overflow: hidden;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 700;
  color: #0f172a;
  transform: scale(calc(1 + var(--mag, 0) * 0.15));
  transform-origin: left center;
  transition:
    max-width 0.25s ease,
    opacity 0.2s ease,
    margin-left 0.25s ease,
    transform 0.12s ease-out;
}

.nav-item.active .nav-label,
.bottom-nav.dragging .nav-label {
  max-width: 80px;
  opacity: 1;
  margin-left: 6px;
}
</style>
