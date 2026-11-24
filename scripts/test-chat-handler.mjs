// 챗봇 로컬 테스트 (실제 LLM API 는 호출하지 않음): node scripts/test-chat-handler.mjs
// - handleChat: 요청 검증, 스트리밍, 종료 안내, 에러 처리 (가짜 provider)
// - providers/anthropic, providers/openai: 요청 파라미터와 스트림 이벤트 변환 (가짜 SDK 클라이언트)
import assert from 'node:assert/strict'
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import { buildContexts } from './build-lambda.mjs'

// 프로젝트 node_modules 를 그대로 해석하도록 repo 내부 캐시 디렉터리에 컴파일.
// splitting 으로 chat.ts 를 공유 청크로 만들어 ProviderError 클래스가 하나만 존재하게 한다.
const root = fileURLToPath(new URL('..', import.meta.url))
const src = join(root, 'infra', 'lambda', 'src')
const outdir = join(root, 'node_modules', '.cache', 'chat-test')
rmSync(outdir, { recursive: true, force: true })
await build({
  entryPoints: { chat: join(src, 'chat.ts'), anthropic: join(src, 'providers', 'anthropic.ts'), openai: join(src, 'providers', 'openai.ts') },
  outdir,
  outExtension: { '.js': '.mjs' },
  bundle: true,
  splitting: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
  logLevel: 'error'
})
const load = (name) => import(pathToFileURL(join(outdir, `${name}.mjs`)).href)
const { handleChat, LIMITS, INSTRUCTIONS, ProviderError } = await load('chat')
const { createAnthropicProvider } = await load('anthropic')
const { createOpenAIProvider } = await load('openai')

const contexts = buildContexts()
const SECRET = 'test-secret'
const body = (o) => JSON.stringify(o)
const userMsg = (content = '배포 어떻게 해?') => [{ role: 'user', content }]

function fakeProvider({ events = [{ type: 'text', text: '안녕' }, { type: 'text', text: '하세요' }, { type: 'end', reason: 'complete' }], error, capture } = {}) {
  return {
    name: 'fake',
    async *answer(input) {
      if (capture) capture.input = input
      yield* events
      if (error) throw error
    }
  }
}

async function run(reqOverrides = {}, provider = fakeProvider()) {
  const out = { status: null, headers: null, body: '', ended: 0 }
  const sink = {
    start(s, h) {
      assert.equal(out.status, null, 'start 는 한 번만 호출')
      out.status = s
      out.headers = h
    },
    write(c) {
      out.body += c
    },
    end() {
      out.ended++
    }
  }
  const req = {
    method: 'POST',
    headers: { 'x-origin-secret': SECRET },
    body: body({ project: 'project-a', messages: userMsg() }),
    ...reqOverrides
  }
  await handleChat(req, sink, { originSecret: SECRET, contexts, getProvider: async () => provider })
  assert.equal(out.ended, 1, 'end 는 한 번만 호출')
  return out
}

// 가짜 SDK 스트림
const asyncIter = (items) => ({
  async *[Symbol.asyncIterator]() {
    yield* items
  }
})
const input = (project = 'project-b') => ({
  project,
  instructions: INSTRUCTIONS,
  documents: `<project name="B">\n<documents>DOCS-${project}</documents>\n</project>`,
  messages: userMsg('q')
})
async function collect(iterable) {
  const out = []
  for await (const ev of iterable) out.push(ev)
  return out
}

function fakeAnthropic({ text = ['가', '나'], stopReason = 'end_turn', capture, throwError } = {}) {
  return {
    beta: {
      messages: {
        stream(params) {
          if (capture) capture.params = params
          if (throwError) throw throwError
          const s = asyncIter(text.map((t) => ({ type: 'content_block_delta', delta: { type: 'text_delta', text: t } })))
          s.finalMessage = async () => ({ model: params.model, stop_reason: stopReason, usage: {} })
          return s
        }
      }
    }
  }
}

function fakeOpenAI({ events, capture, throwError } = {}) {
  return {
    responses: {
      async create(params) {
        if (capture) capture.params = params
        if (throwError) throw throwError
        return asyncIter(events)
      }
    }
  }
}
const oaDelta = (t) => ({ type: 'response.output_text.delta', delta: t })
const oaResp = (extra = {}) => ({ model: 'gpt-6-luna', usage: {}, ...extra })

const cases = [
  // ---- handleChat: 요청 검증 ----
  ['secret 불일치 → 403', async () => assert.equal((await run({ headers: { 'x-origin-secret': 'nope' } })).status, 403)],
  ['secret 헤더 없음 → 403', async () => assert.equal((await run({ headers: {} })).status, 403)],
  ['GET → 405', async () => assert.equal((await run({ method: 'GET' })).status, 405)],
  ['잘못된 JSON → 400', async () => assert.equal((await run({ body: '{' })).status, 400)],
  ['알 수 없는 project → 400', async () =>
    assert.equal((await run({ body: body({ project: 'nope', messages: userMsg() }) })).status, 400)],
  ['prototype 키 project → 400', async () =>
    assert.equal((await run({ body: body({ project: 'toString', messages: userMsg() }) })).status, 400)],
  ['마지막이 assistant → 400', async () =>
    assert.equal(
      (await run({ body: body({ project: 'project-a', messages: [...userMsg(), { role: 'assistant', content: 'a' }] }) })).status,
      400
    )],
  ['질문 길이 초과 → 400', async () =>
    assert.equal((await run({ body: body({ project: 'project-a', messages: userMsg('x'.repeat(LIMITS.maxMessageChars + 1)) }) })).status, 400)],

  // ---- handleChat: 응답 ----
  ['정상 요청 → 200 + 스트림 텍스트', async () => {
    const o = await run()
    assert.equal(o.status, 200)
    assert.equal(o.body, '안녕하세요')
  }],
  ['해당 프로젝트 문서만 provider 로 전달', async () => {
    const capture = {}
    await run({ body: body({ project: 'project-b', messages: userMsg() }) }, fakeProvider({ capture }))
    assert.equal(capture.input.project, 'project-b')
    assert.match(capture.input.documents, /path="\/project-b\/operations\/deploy"/)
    assert.doesNotMatch(capture.input.documents, /\/project-a\//)
  }],
  ['오래된 대화는 잘라내고 user 로 시작', async () => {
    const capture = {}
    const msgs = []
    for (let i = 0; i < 30; i++) msgs.push({ role: i % 2 ? 'assistant' : 'user', content: `m${i}` })
    msgs.push({ role: 'user', content: 'last' })
    await run({ body: body({ project: 'project-a', messages: msgs }) }, fakeProvider({ capture }))
    assert.ok(capture.input.messages.length <= LIMITS.maxMessages)
    assert.equal(capture.input.messages[0].role, 'user')
    assert.equal(capture.input.messages.at(-1).content, 'last')
  }],
  ['refusal → 안내 문구', async () =>
    assert.match((await run({}, fakeProvider({ events: [{ type: 'end', reason: 'refusal' }] }))).body, /답할 수 없습니다/)],
  ['max_tokens → 잘림 안내', async () =>
    assert.match((await run({}, fakeProvider({ events: [{ type: 'text', text: 'x' }, { type: 'end', reason: 'max_tokens' }] }))).body, /잘렸습니다/)],
  ['rate limit → 재시도 안내', async () =>
    assert.match((await run({}, fakeProvider({ events: [], error: new ProviderError('rl', 429, true) }))).body, /잠시 후/)],
  ['키 미등록 등 일반 에러 → 오류 안내 + 응답 종료', async () => {
    const o = await run({}, null)
    assert.equal(o.status, 200)
    assert.match(o.body, /오류가 발생했습니다/)
  }],

  // ---- Claude 어댑터 ----
  ['anthropic: 모델/effort/fallback/문서 캐시 파라미터', async () => {
    const capture = {}
    await collect(createAnthropicProvider(fakeAnthropic({ capture }), { model: 'claude-opus-5-5', effort: 'low' }).answer(input()))
    const p = capture.params
    assert.equal(p.model, 'claude-opus-5-5')
    assert.equal(p.output_config.effort, 'low')
    assert.equal(p.fallbacks, 'default')
    assert.deepEqual(p.betas, ['server-side-fallback-2026-07-01'])
    assert.equal(p.system[0].text, INSTRUCTIONS)
    assert.match(p.system[1].text, /DOCS-project-b/)
    assert.deepEqual(p.system[1].cache_control, { type: 'ephemeral' })
  }],
  ['anthropic: 텍스트 스트림 + refusal 변환', async () => {
    const evs = await collect(
      createAnthropicProvider(fakeAnthropic({ stopReason: 'refusal' }), { model: 'm', effort: 'low' }).answer(input())
    )
    assert.deepEqual(evs.filter((e) => e.type === 'text').map((e) => e.text), ['가', '나'])
    assert.equal(evs.at(-1).reason, 'refusal')
  }],
  ['anthropic: RateLimitError → ProviderError(rateLimited)', async () => {
    const err = new Anthropic.RateLimitError(429, {}, 'rate limited', new Headers())
    await assert.rejects(
      collect(createAnthropicProvider(fakeAnthropic({ throwError: err }), { model: 'm', effort: 'low' }).answer(input())),
      (e) => e instanceof ProviderError && e.rateLimited
    )
  }],

  // ---- OpenAI 어댑터 ----
  ['openai: 모델/effort/문서/스트리밍 파라미터', async () => {
    const capture = {}
    await collect(
      createOpenAIProvider(fakeOpenAI({ capture, events: [{ type: 'response.completed', response: oaResp() }] }), {
        model: 'gpt-6-luna',
        effort: 'low'
      }).answer(input())
    )
    const p = capture.params
    assert.equal(p.model, 'gpt-6-luna')
    assert.deepEqual(p.reasoning, { effort: 'low' })
    assert.equal(p.stream, true)
    assert.equal(p.store, false)
    assert.ok(p.instructions.startsWith(INSTRUCTIONS), '지시문이 prefix 맨 앞 (캐시 안정성)')
    assert.match(p.instructions, /DOCS-project-b/)
    assert.equal(p.prompt_cache_key, 'handover-docs:project-b')
    assert.deepEqual(p.input, [{ role: 'user', content: 'q' }])
    assert.equal(p.max_output_tokens, LIMITS.maxOutputTokens)
  }],
  ['openai: 텍스트 delta + completed', async () => {
    const evs = await collect(
      createOpenAIProvider(
        fakeOpenAI({ events: [oaDelta('가'), oaDelta('나'), { type: 'response.completed', response: oaResp() }] }),
        { model: 'm', effort: 'low' }
      ).answer(input())
    )
    assert.deepEqual(evs.filter((e) => e.type === 'text').map((e) => e.text), ['가', '나'])
    assert.equal(evs.at(-1).reason, 'complete')
    assert.equal(evs.at(-1).model, 'gpt-6-luna')
  }],
  ['openai: incomplete(max_output_tokens) → max_tokens', async () => {
    const evs = await collect(
      createOpenAIProvider(
        fakeOpenAI({ events: [oaDelta('x'), { type: 'response.incomplete', response: oaResp({ incomplete_details: { reason: 'max_output_tokens' } }) }] }),
        { model: 'm', effort: 'low' }
      ).answer(input())
    )
    assert.equal(evs.at(-1).reason, 'max_tokens')
  }],
  ['openai: incomplete(content_filter) → filtered', async () => {
    const evs = await collect(
      createOpenAIProvider(
        fakeOpenAI({ events: [{ type: 'response.incomplete', response: oaResp({ incomplete_details: { reason: 'content_filter' } }) }] }),
        { model: 'm', effort: 'low' }
      ).answer(input())
    )
    assert.equal(evs.at(-1).reason, 'filtered')
  }],
  ['openai: refusal delta → refusal', async () => {
    const evs = await collect(
      createOpenAIProvider(
        fakeOpenAI({ events: [{ type: 'response.refusal.delta', delta: 'no' }, { type: 'response.completed', response: oaResp() }] }),
        { model: 'm', effort: 'low' }
      ).answer(input())
    )
    assert.equal(evs.at(-1).reason, 'refusal')
    assert.equal(evs.filter((e) => e.type === 'text').length, 0, '거절 문구 원문은 그대로 노출하지 않음')
  }],
  ['openai: response.failed → ProviderError', async () => {
    await assert.rejects(
      collect(
        createOpenAIProvider(fakeOpenAI({ events: [{ type: 'response.failed', response: oaResp({ error: { message: 'boom' } }) }] }), {
          model: 'm',
          effort: 'low'
        }).answer(input())
      ),
      (e) => e instanceof ProviderError && e.message === 'boom'
    )
  }],
  ['openai: RateLimitError → ProviderError(rateLimited)', async () => {
    const err = new OpenAI.RateLimitError(429, {}, 'rate limited', new Headers())
    await assert.rejects(
      collect(createOpenAIProvider(fakeOpenAI({ throwError: err }), { model: 'm', effort: 'low' }).answer(input())),
      (e) => e instanceof ProviderError && e.rateLimited
    )
  }]
]

let failed = 0
for (const [name, fn] of cases) {
  try {
    await fn()
    console.log(`  ✓ ${name}`)
  } catch (e) {
    failed++
    console.error(`  ✗ ${name}\n    ${e.message}`)
  }
}
rmSync(outdir, { recursive: true, force: true })
console.log(failed ? `\n${failed}건 실패` : `\n${cases.length}건 모두 통과`)
process.exit(failed ? 1 : 0)
