// Claude (Anthropic Messages API) 어댑터
import Anthropic from '@anthropic-ai/sdk'
import { LIMITS, ProviderError, type AnswerEvent, type AnswerProvider, type Effort } from '../chat'

export function createAnthropicProvider(
  client: Pick<Anthropic, 'beta'>,
  opts: { model: string; effort: Effort }
): AnswerProvider {
  return {
    name: 'anthropic',
    async *answer(input): AsyncIterable<AnswerEvent> {
      try {
        const stream = client.beta.messages.stream({
          model: opts.model,
          max_tokens: LIMITS.maxOutputTokens,
          output_config: { effort: opts.effort },
          // 안전 분류기에 의한 거절 시 서버 측에서 다른 모델로 자동 재시도
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          system: [
            { type: 'text', text: input.instructions },
            // 프로젝트 문서 전체를 캐시해 반복 질문 비용 절감
            { type: 'text', text: input.documents, cache_control: { type: 'ephemeral' } }
          ],
          messages: input.messages
        })

        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            yield { type: 'text', text: event.delta.text }
          }
        }

        const final = await stream.finalMessage()
        const reason =
          final.stop_reason === 'refusal' ? 'refusal' : final.stop_reason === 'max_tokens' ? 'max_tokens' : 'complete'
        yield { type: 'end', reason, model: final.model, usage: final.usage }
      } catch (e) {
        if (e instanceof Anthropic.RateLimitError) throw new ProviderError(e.message, 429, true)
        if (e instanceof Anthropic.APIError) throw new ProviderError(e.message, e.status)
        throw e
      }
    }
  }
}
