// OpenAI (Responses API) 어댑터 — GPT Luna 등
import OpenAI from 'openai'
import { LIMITS, ProviderError, type AnswerEvent, type AnswerProvider, type Effort } from '../chat'

export function createOpenAIProvider(
  client: Pick<OpenAI, 'responses'>,
  opts: { model: string; effort: Effort }
): AnswerProvider {
  return {
    name: 'openai',
    async *answer(input): AsyncIterable<AnswerEvent> {
      try {
        const stream = await client.responses.create({
          model: opts.model,
          // 지시문 + 프로젝트 문서를 고정 prefix 로 두면 OpenAI 자동 prompt caching 이 적용된다
          instructions: `${input.instructions}\n\n${input.documents}`,
          input: input.messages.map((m) => ({ role: m.role, content: m.content })),
          reasoning: { effort: opts.effort },
          max_output_tokens: LIMITS.maxOutputTokens,
          prompt_cache_key: `handover-docs:${input.project}`,
          store: false,
          stream: true
        })

        let refused = false
        for await (const event of stream) {
          switch (event.type) {
            case 'response.output_text.delta':
              yield { type: 'text', text: event.delta }
              break
            case 'response.refusal.delta':
              refused = true
              break
            case 'response.completed':
              yield {
                type: 'end',
                reason: refused ? 'refusal' : 'complete',
                model: event.response.model,
                usage: event.response.usage
              }
              return
            case 'response.incomplete': {
              const why = event.response.incomplete_details?.reason
              yield {
                type: 'end',
                reason: why === 'max_output_tokens' ? 'max_tokens' : why === 'content_filter' ? 'filtered' : 'complete',
                model: event.response.model,
                usage: event.response.usage
              }
              return
            }
            case 'response.failed':
              throw new ProviderError(event.response.error?.message ?? 'response.failed')
            case 'error':
              throw new ProviderError(event.message)
          }
        }
      } catch (e) {
        if (e instanceof OpenAI.RateLimitError) throw new ProviderError(e.message, 429, true)
        if (e instanceof OpenAI.APIError) throw new ProviderError(e.message, e.status)
        throw e
      }
    }
  }
}
