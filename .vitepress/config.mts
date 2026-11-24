import { defineConfig, type DefaultTheme } from 'vitepress'

// 프로젝트 목록: 상단 탭과 프로젝트별 사이드바가 여기서 생성된다.
// 새 프로젝트 추가 = docs/project-a 폴더를 복사하고 여기에 한 줄 추가.
const projects = [
  { slug: 'project-a', name: 'A 프로젝트' },
  { slug: 'project-b', name: 'B 프로젝트' },
  { slug: 'project-c', name: 'C 프로젝트' }
]

// 프로젝트 공통 사이드바 구성 (문서 구성이 다른 프로젝트는 여기서 분기)
function projectSidebar({ slug }: { slug: string }): DefaultTheme.SidebarItem[] {
  const b = `/${slug}`
  return [
    { text: '인수인계 요약', link: `${b}/` },
    {
      text: '개요',
      items: [
        { text: '프로젝트 소개', link: `${b}/overview/` },
        { text: '아키텍처', link: `${b}/overview/architecture` },
        { text: '기술 스택', link: `${b}/overview/tech-stack` }
      ]
    },
    {
      text: '환경 구성',
      items: [
        { text: '개발 환경', link: `${b}/setup/` },
        { text: '계정 및 권한', link: `${b}/setup/accounts` },
        { text: '저장소 목록', link: `${b}/setup/repositories` }
      ]
    },
    {
      text: '운영',
      items: [
        { text: '운영 개요', link: `${b}/operations/` },
        { text: '배포', link: `${b}/operations/deploy` },
        { text: '모니터링', link: `${b}/operations/monitoring` },
        { text: '장애 대응', link: `${b}/operations/incident` }
      ]
    },
    {
      text: '업무 현황',
      items: [
        { text: '업무 개요', link: `${b}/tasks/` },
        { text: '진행 중인 업무', link: `${b}/tasks/in-progress` },
        { text: '알려진 이슈', link: `${b}/tasks/known-issues` }
      ]
    },
    {
      text: '기타',
      items: [
        { text: '연락처', link: `${b}/contacts` },
        { text: 'FAQ', link: `${b}/faq` }
      ]
    }
  ]
}

export default defineConfig({
  srcDir: 'docs',
  lang: 'ko-KR',
  title: '인수인계 문서',
  description: '프로젝트 인수인계 문서',
  cleanUrls: true, // CloudFront Function이 /path → /path.html 로 재작성
  lastUpdated: true,

  themeConfig: {
    nav: [
      ...projects.map((p) => ({
        text: p.name,
        link: `/${p.slug}/`,
        activeMatch: `^/${p.slug}/`
      })),
      { text: '사이트 운영', link: '/guide/', activeMatch: '^/guide/' }
    ],

    // 경로 prefix 별로 사이드바가 통째로 바뀐다
    sidebar: {
      ...Object.fromEntries(projects.map((p) => [`/${p.slug}/`, projectSidebar(p)])),
      '/guide/': [{ text: '문서 사이트', items: [{ text: '수정 및 배포', link: '/guide/' }] }]
    },

    search: {
      provider: 'local',
      options: {
        translations: {
          button: { buttonText: '검색', buttonAriaLabel: '검색' },
          modal: {
            noResultsText: '검색 결과가 없습니다',
            resetButtonTitle: '검색어 지우기',
            footer: { selectText: '선택', navigateText: '이동', closeText: '닫기' }
          }
        }
      }
    },

    outline: { level: [2, 3], label: '이 페이지 목차' },
    docFooter: { prev: '이전', next: '다음' },
    lastUpdated: { text: '최종 수정' },
    returnToTopLabel: '맨 위로',
    sidebarMenuLabel: '메뉴',
    darkModeSwitchLabel: '다크 모드',
    lightModeSwitchTitle: '라이트 모드로 전환',
    darkModeSwitchTitle: '다크 모드로 전환',
    notFound: {
      title: '페이지를 찾을 수 없습니다',
      quote: '주소를 다시 확인하거나 사이드바에서 문서를 찾아 주세요.',
      linkText: '홈으로'
    }
  }
})
