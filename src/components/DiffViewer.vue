<script setup lang="ts">
import * as monaco from 'monaco-editor';
import { onMounted, useTemplateRef } from 'vue';

const props = defineProps<{
    language: string;
}>();

const diffViewerEl = useTemplateRef('diff-viewer');

onMounted(() => {
    monaco.languages.register({ id: props.language });

    const tm = monaco.editor.createModel(
        `class Test {}`,
        props.language,
        monaco.Uri.parse('file:///main.ts')
    );

    monaco.editor.create(diffViewerEl.value!, {
        model: tm,
        language: props.language,
        theme: 'vs-dark',
    });
});
</script>

<template>
    <div>
        <div ref="diff-viewer" class="diff-viewer" />
    </div>
</template>

<style scoped lang="scss">
.diff-viewer {
    width: 500px;
    height: 500px;
}
</style>
