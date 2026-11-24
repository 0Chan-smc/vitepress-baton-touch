// 문서 Q&A 핵심 로직 (LLM 제공사·Lambda 런타임과 분리해 로컬 테스트 가능하게 유지)

export type ChatMessage = { role: 'user' | 'assistant'; content: string }
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export interface ProjectContext {
  name: string
  /** 해당 프로젝트 문서 전체 (<document path="..."> 블록들) */
  docs: string
}

/** 제공사 어댑터에 넘기는 입력 */
export interface AnswerInput {
  project: string
  instructions: string
  /** 프로젝트 문서 블록 (캐시 대상, 프로젝트별로 고정) */
  documents: string
  messages: ChatMessage[]
}

export type AnswerEvent =
  | { type: 'text'; text: string }
  | { type: 'end'; reason: 'complete' | 'refusal' | 'max_tokens' | 'filtered'; model?: string; usage?: unknown }

/** LLM 제공사 어댑터 (providers/anthropic.ts, providers/openai.ts) */
export interface AnswerProvider {
  name: string
  answer(input: AnswerInput): AsyncIterable<AnswerEvent>
}

/** 어댑터가 제공사 고유 에러를 이 형태로 바꿔 던진다 */
export class ProviderError extends Error {
  constructor(
    message: string,
    public status?: number,
    public rateLimited = false
  ) {
    super(message)
  }
}

export interface ChatDeps {
  originSecret: string
  contexts: Record<string, ProjectContext>
  getProvider: () => Promise<AnswerProvider>
  log?: (msg: string, extra?: Record<string, unknown>) => void
}

export interface ChatRequest {
  method: string
  headers: Record<string, string | undefined>
  body: string
}

/** 응답 출력 대상. start 는 정확히 한 번 호출된다. */
export interface ResponseSink {
  start(statusCode: number, headers: Record<string, string>): void
  write(chunk: string): void
  end(): void
}

export const LIMITS = {
  maxMessages: 20,
  maxMessageChars: 2000,
  maxTotalChars: 20000,
  maxBodyBytes: 64 * 1024,
  maxOutputTokens: 16000
}

export const INSTRUCTIONS = `당신은 사내 인수인계 문서 사이트의 Q&A 도우미입니다.
아래 <documents> 안의 문서만 근거로 한국어로 답하세요.

- 문서에 없는 내용은 추측하지 말고 "문서에 해당 내용이 없습니다"라고 말한 뒤, 누구에게 확인하면 좋을지 문서(연락처 등)에 근거가 있으면 안내하세요.
- 문서의 표나 항목이 비어 있거나 TODO로 남아 있으면 "아직 작성되지 않은 항목"이라고 알려 주세요.
- 답변 끝에 근거가 된 문서를 마크다운 링크로 제시하세요. 링크 주소는 <document path="...">의 path 값을 그대로 사용합니다. 예: [배포](/project-a/operations/deploy)
- 비밀번호, 토큰 같은 비밀 값은 문서에 있더라도 출력하지 말고 보관 위치만 안내하세요.
- 간결하게 답하고, 절차는 번호 목록으로 정리하세요.`

export function documentsBlock(ctx: ProjectContext): string {
  return `<project name="${ctx.name}">\n<documents>\n${ctx.docs}\n</documents>\n</project>`
}

class HttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message)
  }
}

function parseRequest(req: ChatRequest, deps: ChatDeps): { project: string; messages: ChatMessage[] } {
  if (req.method !== 'POST') throw new HttpError(405, 'POST 만 허용됩니다.')
  if (!deps.originSecret || req.headers['x-origin-secret'] !== deps.originSecret) {
    throw new HttpError(403, 'Forbidden')
  }
  if (Buffer.byteLength(req.body, 'utf8') > LIMITS.maxBodyBytes) throw new HttpError(413, '요청이 너무 큽니다.')

  let data: unknown
  try {
    data = JSON.parse(req.body)
  } catch {
    throw new HttpError(400, 'JSON 형식이 아닙니다.')
  }
  const { project, messages } = (data ?? {}) as { project?: unknown; messages?: unknown }

  if (typeof project !== 'string' || !Object.hasOwn(deps.contexts, project)) {
    throw new HttpError(400, '알 수 없는 프로젝트입니다.')
  }
  if (!Array.isArray(messages) || messages.length === 0) throw new HttpError(400, 'messages 가 비어 있습니다.')

  // 최근 대화만 유지 (항상 user 로 시작)
  let recent = messages.slice(-LIMITS.maxMessages)
  while (recent.length && (recent[0] as ChatMessage)?.role !== 'user') recent = recent.slice(1)

  let total = 0
  const clean: ChatMessage[] = recent.map((m, i) => {
    const role = (m as ChatMessage)?.role
    const content = (m as ChatMessage)?.content
    const expected = i % 2 === 0 ? 'user' : 'assistant'
    if (role !== expected || typeof content !== 'string' || !content.trim()) {
      throw new HttpError(400, '대화 형식이 올바르지 않습니다.')
    }
    if (role === 'user' && content.length > LIMITS.maxMessageChars) {
      throw new HttpError(400, `질문은 ${LIMITS.maxMessageChars}자 이하로 입력하세요.`)
    }
    total += content.length
    return { role, content }
  })
  if (clean.length === 0 || clean[clean.length - 1].role !== 'user') {
    throw new HttpError(400, '마지막 메시지는 질문이어야 합니다.')
  }
  if (total > LIMITS.maxTotalChars) throw new HttpError(400, '대화가 너무 깁니다. 새 대화를 시작하세요.')

  return { project, messages: clean }
}

const END_NOTICES: Record<string, string> = {
  refusal: '\n\n이 질문에는 답할 수 없습니다. 질문을 바꿔 다시 시도해 주세요.',
  filtered: '\n\n이 질문에는 답할 수 없습니다. 질문을 바꿔 다시 시도해 주세요.',
  max_tokens: '\n\n(답변이 길어 중간에 잘렸습니다. 범위를 좁혀 다시 질문해 주세요.)'
}

export async function handleChat(req: ChatRequest, sink: ResponseSink, deps: ChatDeps): Promise<void> {
  const log = deps.log ?? (() => {})
  let parsed: ReturnType<typeof parseRequest>
  try {
    parsed = parseRequest(req, deps)
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 400
    sink.start(status, { 'content-type': 'text/plain; charset=utf-8' })
    sink.write(e instanceof Error ? e.message : '잘못된 요청입니다.')
    sink.end()
    return
  }

  const ctx = deps.contexts[parsed.project]
  sink.start(200, {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  })

  let providerName = 'unknown'
  try {
    const provider = await deps.getProvider()
    providerName = provider.name
    const events = provider.answer({
      project: parsed.project,
      instructions: INSTRUCTIONS,
      documents: documentsBlock(ctx),
      messages: parsed.messages
    })
    for await (const ev of events) {
      if (ev.type === 'text') {
        sink.write(ev.text)
      } else {
        log('chat.done', { provider: providerName, project: parsed.project, model: ev.model, reason: ev.reason, usage: ev.usage })
        const notice = END_NOTICES[ev.reason]
        if (notice) sink.write(notice)
      }
    }
  } catch (e) {
    if (e instanceof ProviderError && e.rateLimited) {
      log('chat.rate_limited', { provider: providerName })
      sink.write('\n\n요청이 많아 잠시 후 다시 시도해 주세요.')
    } else if (e instanceof ProviderError) {
      log('chat.api_error', { provider: providerName, status: e.status, message: e.message })
      sink.write(`\n\nAI 응답 중 오류가 발생했습니다 (${e.status ?? 'network'}).`)
    } else {
      log('chat.error', { provider: providerName, message: (e as Error)?.message })
      sink.write('\n\nAI 응답 중 오류가 발생했습니다.')
    }
  } finally {
    sink.end()
  }
}
