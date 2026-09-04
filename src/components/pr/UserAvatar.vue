<script setup lang="ts">
import { computed, ref, watch } from 'vue';

const props = withDefaults(defineProps<{ login: string; size?: number }>(), { size: 22 });

// True once the avatar image fails (a bot, an unknown login, or offline); then the
// colored initials show instead. Reset when the login changes, since the component
// is reused across authors in the conversation list.
const failed = ref(false);
watch(
    () => props.login,
    () => {
        failed.value = false;
    }
);

const initials = computed(
    () =>
        props.login
            .split(/[.\s@_-]/)
            .filter(Boolean)
            .slice(0, 2)
            .map((part) => part[0]!.toUpperCase())
            .join('') || '?'
);

// A stable hue per login, so each user keeps the same avatar color across the view.
const hue = computed(() => {
    let h = 0;
    for (const char of props.login) {
        h = (h * 31 + char.charCodeAt(0)) % 360;
    }
    return h;
});

const style = computed(() => ({
    width: `${props.size}px`,
    height: `${props.size}px`,
    fontSize: `${Math.max(8, Math.round(props.size * 0.42))}px`,
    backgroundColor: `hsla(${hue.value}, 52%, 55%, 0.2)`,
    color: `hsl(${hue.value}, 55%, 58%)`,
}));

// GitHub serves each user's avatar at github.com/<login>.png; ask for 2x so it stays
// crisp. On error the colored initials underneath show through.
const src = computed(
    () => `https://github.com/${encodeURIComponent(props.login)}.png?size=${props.size * 2}`
);
</script>

<template>
    <span
        class="relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold"
        :style="style"
    >
        {{ initials }}
        <img
            v-if="login && !failed"
            :src="src"
            alt=""
            class="absolute inset-0 size-full object-cover"
            @error="failed = true"
        />
    </span>
</template>
