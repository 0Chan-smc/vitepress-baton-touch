// 프로젝트 목록 (단일 출처)
// - 상단 탭/사이드바 (.vitepress/config.mts)
// - AI 챗봇 문서 컨텍스트 (scripts/build-lambda.mjs)
// - 챗 위젯 표시 여부 (.vitepress/theme/components/ChatWidget.vue)
// 새 프로젝트 추가: docs/project-a 를 복사하고 여기에 한 줄 추가 (Claude Code: /new-project)

/** @type {{ slug: string, name: string }[]} */
export const projects = [
  { slug: 'project-a', name: 'A 프로젝트' },
  { slug: 'project-b', name: 'B 프로젝트' },
  { slug: 'project-c', name: 'C 프로젝트' }
]
