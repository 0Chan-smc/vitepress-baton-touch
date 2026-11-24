<script setup lang="ts">
// vitepress-plugin-llms 의 composable 을 사용한 "페이지 복사" 버튼.
// 플러그인 기본 컴포넌트의 "Open in ChatGPT/Claude" 는 외부 서비스가 URL 을 직접 읽는 방식이라
// Basic Auth 뒤에 있는 이 사이트에서는 동작하지 않으므로 제외했다.
import { useCopyOrDownloadAsMarkdownButtons } from 'vitepress-plugin-llms/vitepress-components'

const { copied, copyAsMarkdown, viewAsMarkdown } = useCopyOrDownloadAsMarkdownButtons({
  aiProviders: []
})
</script>

<template>
  <div class="copy-page-buttons">
    <button type="button" @click="copyAsMarkdown" title="이 페이지를 마크다운으로 복사해 AI 도구에 붙여넣을 수 있습니다">
      {{ copied ? '복사됨' : '페이지 복사' }}
    </button>
    <button type="button" @click="viewAsMarkdown">마크다운 보기</button>
  </div>
</template>

<style scoped>
.copy-page-buttons {
  display: flex;
  gap: 8px;
  margin: 8px 0 16px;
}
.copy-page-buttons button {
  font-size: 12px;
  line-height: 1;
  padding: 6px 10px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  color: var(--vp-c-text-2);
  background: var(--vp-c-bg-soft);
  transition: border-color 0.2s, color 0.2s;
}
.copy-page-buttons button:hover {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}
</style>
