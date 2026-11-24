<script setup lang="ts">
// 프로젝트 문서 Q&A 위젯
// - /project-x/ 경로에서만 표시, 해당 프로젝트 문서만 근거로 답변
// - POST /api/chat → CloudFront → Lambda(스트리밍) → LLM API (OpenAI 또는 Anthropic, infra chat_provider)
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute } from 'vitepress'
import { projects } from '../../projects.mjs'

type Msg = { role: 'user' | 'assistant'; content: string }

const MAX_INPUT = 2000

const route = useRoute()
const project = computed(() => projects.find((p) => route.path.startsWith(`/${p.slug}/`)) ?? null)

const open = ref(false)
const input = ref('')
const loading = ref(false)
const messages = ref<Msg[]>([])
const listEl = ref<HTMLElement | null>(null)
let controller: AbortController | null = null

const storageKey = (slug: string) => `handover-chat:${slug}`

function load(slug: string) {
  try {
    messages.value = JSON.parse(sessionStorage.getItem(storageKey(slug)) || '[]')
  } catch {
    messages.value = []
  }
}
function save() {
  if (!project.value) return
  try {
    sessionStorage.setItem(storageKey(project.value.slug), JSON.stringify(messages.value))
  } catch {
    /* 저장 불가 환경은 무시 */
  }
}

watch(
  () => project.value?.slug,
  (slug) => {
    controller?.abort()
    loading.value = false
    if (slug && typeof window !== 'undefined') load(slug)
    else messages.value = []
  },
  { immediate: true }
)

async function scrollToEnd() {
  await nextTick()
  listEl.value?.scrollTo({ top: listEl.value.scrollHeight })
}

watch(open, (v) => v && scrollToEnd())

async function send() {
  const text = input.value.trim()
  if (!text || loading.value || !project.value) return
  input.value = ''
  messages.value.push({ role: 'user', content: text })
  const answer: Msg = { role: 'assistant', content: '' }
  messages.value.push(answer)
  const reply = messages.value[messages.value.length - 1]
  loading.value = true
  scrollToEnd()

  controller = new AbortController()
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        project: project.value.slug,
        // 직전 답변(빈 값) 제외하고 전송
        messages: messages.value.slice(0, -1).filter((m) => m.content)
      }),
      signal: controller.signal
    })
    if (!res.ok || !res.body) {
      const detail = await res.text().catch(() => '')
      reply.content =
        res.status === 404
          ? '챗봇 API에 연결할 수 없습니다. (로컬 개발 중이라면 README의 CHAT_API_URL 설정을 확인하세요.)'
          : `요청에 실패했습니다 (${res.status}). ${detail.slice(0, 200)}`
      return
    }
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      reply.content += decoder.decode(value, { stream: true })
      scrollToEnd()
    }
  } catch (e) {
    if ((e as Error).name !== 'AbortError') reply.content += '\n\n연결이 끊어졌습니다. 다시 시도해 주세요.'
  } finally {
    loading.value = false
    controller = null
    if (!reply.content) reply.content = '답변을 받지 못했습니다.'
    save()
    scrollToEnd()
  }
}

function reset() {
  controller?.abort()
  messages.value = []
  save()
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault()
    send()
  }
}

// 최소한의 마크다운 렌더링 (HTML 이스케이프 후 코드/굵게/링크/줄바꿈만 변환)
function render(md: string): string {
  const esc = md.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  return esc
    .replace(/```[\w-]*\n([\s\S]*?)```/g, (_, code) => `<pre><code>${code}</code></pre>`)
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]\n]+)\]\(((?:\/|https?:\/\/)[^)\s]+)\)/g, (_, t, u) => {
      const ext = u.startsWith('http')
      return `<a href="${u}"${ext ? ' target="_blank" rel="noopener"' : ''}>${t}</a>`
    })
    .replace(/\n/g, '<br>')
    .replace(/(<pre><code>[\s\S]*?<\/code><\/pre>)/g, (m) => m.replace(/<br>/g, '\n'))
}
</script>

<template>
  <div v-if="project" class="hc-chat">
    <button v-if="!open" class="hc-fab" type="button" @click="open = true" aria-label="문서 Q&A 열기">
      AI에게 묻기
    </button>

    <section v-else class="hc-panel" role="dialog" aria-label="문서 Q&A">
      <header class="hc-head">
        <div>
          <strong>{{ project.name }} 문서 Q&A</strong>
          <small>이 프로젝트 문서만 근거로 답합니다</small>
        </div>
        <div class="hc-actions">
          <button type="button" @click="reset" :disabled="!messages.length">새 대화</button>
          <button type="button" @click="open = false" aria-label="닫기">✕</button>
        </div>
      </header>

      <div ref="listEl" class="hc-list">
        <p v-if="!messages.length" class="hc-empty">
          예: "운영 배포는 어떻게 하나요?", "남은 업무 중 기한이 급한 건?"
        </p>
        <div v-for="(m, i) in messages" :key="i" :class="['hc-msg', m.role]">
          <div v-if="m.role === 'assistant'" class="hc-bubble" v-html="render(m.content) || '…'" />
          <div v-else class="hc-bubble">{{ m.content }}</div>
        </div>
      </div>

      <form class="hc-form" @submit.prevent="send">
        <textarea
          v-model="input"
          :maxlength="MAX_INPUT"
          rows="2"
          placeholder="질문을 입력하세요 (Enter 전송, Shift+Enter 줄바꿈)"
          @keydown="onKeydown"
        />
        <button type="submit" :disabled="loading || !input.trim()">{{ loading ? '답변 중' : '전송' }}</button>
      </form>
      <p class="hc-note">AI 답변은 틀릴 수 있습니다. 중요한 내용은 원문 문서를 확인하세요.</p>
    </section>
  </div>
</template>

<style scoped>
.hc-chat {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 60;
}
.hc-fab {
  padding: 10px 16px;
  border-radius: 999px;
  background: var(--vp-c-brand-1);
  color: var(--vp-c-white);
  font-weight: 600;
  font-size: 14px;
  box-shadow: var(--vp-shadow-3);
}
.hc-fab:hover {
  background: var(--vp-c-brand-2);
}
.hc-panel {
  width: min(420px, calc(100vw - 32px));
  height: min(600px, calc(100vh - 120px));
  display: flex;
  flex-direction: column;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  box-shadow: var(--vp-shadow-4);
  overflow: hidden;
}
.hc-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--vp-c-divider);
}
.hc-head small {
  display: block;
  color: var(--vp-c-text-3);
  font-size: 12px;
}
.hc-actions {
  display: flex;
  gap: 6px;
}
.hc-actions button {
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 6px;
  color: var(--vp-c-text-2);
  border: 1px solid var(--vp-c-divider);
}
.hc-actions button:disabled {
  opacity: 0.4;
}
.hc-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.hc-empty {
  color: var(--vp-c-text-3);
  font-size: 13px;
}
.hc-msg {
  display: flex;
}
.hc-msg.user {
  justify-content: flex-end;
}
.hc-bubble {
  max-width: 88%;
  padding: 8px 12px;
  border-radius: 10px;
  font-size: 14px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  background: var(--vp-c-bg-soft);
}
.hc-msg.assistant .hc-bubble {
  white-space: normal;
}
.hc-msg.user .hc-bubble {
  background: var(--vp-c-brand-soft);
}
.hc-bubble :deep(pre) {
  overflow-x: auto;
  padding: 8px;
  border-radius: 6px;
  background: var(--vp-c-bg-alt);
  font-size: 12px;
}
.hc-bubble :deep(code) {
  font-size: 0.9em;
}
.hc-bubble :deep(a) {
  color: var(--vp-c-brand-1);
  text-decoration: underline;
}
.hc-form {
  display: flex;
  gap: 8px;
  padding: 10px 14px 4px;
  border-top: 1px solid var(--vp-c-divider);
}
.hc-form textarea {
  flex: 1;
  resize: none;
  padding: 6px 8px;
  font-size: 14px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg-soft);
}
.hc-form button {
  padding: 0 14px;
  border-radius: 8px;
  background: var(--vp-c-brand-1);
  color: var(--vp-c-white);
  font-size: 13px;
  font-weight: 600;
}
.hc-form button:disabled {
  opacity: 0.5;
}
.hc-note {
  margin: 0;
  padding: 4px 14px 10px;
  font-size: 11px;
  color: var(--vp-c-text-3);
}
@media (max-width: 640px) {
  .hc-chat {
    right: 16px;
    bottom: 16px;
  }
}
</style>
