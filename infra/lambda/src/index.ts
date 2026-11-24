// Lambda 진입점: Function URL (RESPONSE_STREAM) → handleChat
import { readFileSync } from 'node:fs'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager'
import { handleChat, type AnswerProvider, type ChatDeps, type Effort, type ProjectContext, type ResponseSink } from './chat'
import { createAnthropicProvider } from './providers/anthropic'
import { createOpenAIProvider } from './providers/openai'

// Node.js Lambda 런타임이 제공하는 전역 (response streaming)
declare const awslambda: {
  streamifyResponse(
    handler: (event: FunctionUrlEvent, responseStream: NodeJS.WritableStream) => Promise<void>
  ): unknown
  HttpResponseStream: {
    from(
      stream: NodeJS.WritableStream,
      meta: { statusCode: number; headers?: Record<string, string> }
    ): NodeJS.WritableStream
  }
}

interface FunctionUrlEvent {
  headers?: Record<string, string | undefined>
  body?: string
  isBase64Encoded?: boolean
  requestContext?: { http?: { method?: string } }
}

const PROVIDER = (process.env.CHAT_PROVIDER || 'openai') as 'openai' | 'anthropic'
const MODEL = process.env.CHAT_MODEL || (PROVIDER === 'openai' ? 'gpt-6-luna' : 'claude-opus-5-5')
const EFFORT = (process.env.CHAT_EFFORT || 'low') as Effort

// 빌드 시 scripts/build-lambda.mjs 가 생성해 번들 옆에 둔다
const contexts: Record<string, ProjectContext> = JSON.parse(
  readFileSync(new URL('./contexts.json', import.meta.url), 'utf8')
)

async function readApiKey(): Promise<string> {
  const sm = new SecretsManagerClient({})
  const out = await sm.send(new GetSecretValueCommand({ SecretId: process.env.CHAT_SECRET_ID }))
  const raw = (out.SecretString ?? '').trim()
  // 평문 키 또는 {"api_key": "..."} 형식 모두 허용
  const key = raw.startsWith('{') ? (JSON.parse(raw).api_key ?? '') : raw
  if (!key) throw new Error('LLM API 키가 Secrets Manager 에 등록되지 않았습니다.')
  return key
}

let providerPromise: Promise<AnswerProvider> | null = null
function getProvider(): Promise<AnswerProvider> {
  // 콜드 스타트 때 한 번만 키를 읽고 클라이언트를 만든다
  providerPromise ??= readApiKey()
    .then((apiKey) =>
      PROVIDER === 'anthropic'
        ? createAnthropicProvider(new Anthropic({ apiKey }), { model: MODEL, effort: EFFORT })
        : createOpenAIProvider(new OpenAI({ apiKey }), { model: MODEL, effort: EFFORT })
    )
    .catch((e) => {
      providerPromise = null // 다음 요청에서 재시도
      throw e
    })
  return providerPromise
}

const deps: ChatDeps = {
  originSecret: process.env.ORIGIN_SECRET ?? '',
  contexts,
  getProvider,
  log: (msg, extra) => console.log(JSON.stringify({ msg, ...extra }))
}

export const handler = awslambda.streamifyResponse(async (event, responseStream) => {
  const body = event.isBase64Encoded
    ? Buffer.from(event.body ?? '', 'base64').toString('utf8')
    : (event.body ?? '')

  let out: NodeJS.WritableStream = responseStream
  const sink: ResponseSink = {
    start(statusCode, headers) {
      out = awslambda.HttpResponseStream.from(responseStream, { statusCode, headers })
    },
    write(chunk) {
      out.write(chunk)
    },
    end() {
      out.end()
    }
  }

  await handleChat(
    { method: event.requestContext?.http?.method ?? 'GET', headers: event.headers ?? {}, body },
    sink,
    deps
  )
})
