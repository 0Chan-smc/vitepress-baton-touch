// 챗봇 Lambda 빌드
// 1) docs/<project>/**/*.md 를 프로젝트별 컨텍스트로 묶어 contexts.json 생성
// 2) esbuild 로 Lambda 핸들러 번들 → infra/lambda/.build/
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { projects } from '../.vitepress/projects.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const docsDir = join(root, 'docs')
const outDir = join(root, 'infra', 'lambda', '.build')

function walk(dir) {
  return readdirSync(dir)
    .sort()
    .flatMap((name) => {
      const p = join(dir, name)
      return statSync(p).isDirectory() ? walk(p) : name.endsWith('.md') ? [p] : []
    })
}

/** docs/project-a/setup/index.md → /project-a/setup/ , docs/project-a/faq.md → /project-a/faq */
function toUrlPath(file) {
  const rel = relative(docsDir, file).split(sep).join('/').replace(/\.md$/, '')
  return '/' + (rel.endsWith('index') ? rel.slice(0, -'index'.length) : rel)
}

export function buildContexts() {
  const contexts = {}
  for (const { slug, name } of projects) {
    const files = walk(join(docsDir, slug))
    if (!files.length) throw new Error(`docs/${slug} 에 문서가 없습니다.`)
    const docs = files
      .map((f) => `<document path="${toUrlPath(f)}">\n${readFileSync(f, 'utf8').trim()}\n</document>`)
      .join('\n\n')
    contexts[slug] = { name, docs }
  }
  return contexts
}

export async function buildLambda() {
  rmSync(outDir, { recursive: true, force: true })
  mkdirSync(outDir, { recursive: true })

  const contexts = buildContexts()
  writeFileSync(join(outDir, 'contexts.json'), JSON.stringify(contexts))

  await build({
    entryPoints: [join(root, 'infra', 'lambda', 'src', 'index.ts')],
    outfile: join(outDir, 'index.mjs'),
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'esm',
    minify: true,
    sourcemap: false,
    // Lambda Node.js 런타임에 AWS SDK v3 가 포함되어 있으므로 번들에서 제외
    external: ['@aws-sdk/*'],
    // ESM 번들 안의 CommonJS 의존성용 require 제공
    banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
    logLevel: 'warning'
  })

  for (const [slug, c] of Object.entries(contexts)) {
    console.log(`  ${slug}: 문서 ${c.docs.split('<document ').length - 1}개, ${c.docs.length.toLocaleString()}자`)
  }
  console.log(`✔ Lambda 빌드 완료: ${relative(root, outDir)}/`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await buildLambda()
}
