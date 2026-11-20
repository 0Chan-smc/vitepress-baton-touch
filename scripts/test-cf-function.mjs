// CloudFront Function 로직 로컬 테스트: node scripts/test-cf-function.mjs
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const tpl = readFileSync(new URL('../infra/cloudfront-function.js.tftpl', import.meta.url), 'utf8')
const creds = Buffer.from('tester:secret').toString('base64')

assert.equal((tpl.match(/\$\{/g) || []).length, 1, '템플릿 placeholder는 ${basic_auth} 하나여야 합니다')
const code = tpl.replace('${basic_auth}', creds)
const handler = new Function(`${code}; return handler;`)()

const req = (uri, auth) => ({
  request: { uri, method: 'GET', headers: auth ? { authorization: { value: auth } } : {} }
})
const ok = `Basic ${creds}`
const wrong = `Basic ${Buffer.from('tester:nope').toString('base64')}`

const cases = [
  ['헤더 없음 → 401', () => assert.equal(handler(req('/')).statusCode, 401)],
  ['비밀번호 틀림 → 401', () => assert.equal(handler(req('/', wrong)).statusCode, 401)],
  ['401 응답에 WWW-Authenticate 포함', () =>
    assert.match(handler(req('/')).headers['www-authenticate'].value, /^Basic realm=/)],
  ['/ → /index.html', () => assert.equal(handler(req('/', ok)).uri, '/index.html')],
  ['/setup/ → /setup/index.html', () => assert.equal(handler(req('/setup/', ok)).uri, '/setup/index.html')],
  ['/setup/accounts → .html', () => assert.equal(handler(req('/setup/accounts', ok)).uri, '/setup/accounts.html')],
  ['/assets/app.js 유지', () => assert.equal(handler(req('/assets/app.js', ok)).uri, '/assets/app.js')],
  ['/404.html 유지', () => assert.equal(handler(req('/404.html', ok)).uri, '/404.html')]
]

let failed = 0
for (const [name, fn] of cases) {
  try {
    fn()
    console.log(`  ✓ ${name}`)
  } catch (e) {
    failed++
    console.error(`  ✗ ${name}\n    ${e.message}`)
  }
}
console.log(failed ? `\n${failed}건 실패` : `\n${cases.length}건 모두 통과`)
process.exit(failed ? 1 : 0)
