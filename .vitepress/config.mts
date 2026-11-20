import { defineConfig } from 'vitepress'

export default defineConfig({
  srcDir: 'docs',
  lang: 'ko-KR',
  title: '인수인계 문서',
  description: '프로젝트 인수인계 문서',
  cleanUrls: true, // CloudFront Function이 /path → /path.html 로 재작성
  lastUpdated: true,

  themeConfig: {
    nav: [
      { text: '개요', link: '/overview/' },
      { text: '환경 구성', link: '/setup/' },
      { text: '운영', link: '/operations/' },
      { text: '업무 현황', link: '/tasks/' },
      { text: '연락처', link: '/contacts' },
      { text: 'FAQ', link: '/faq' }
    ],

    sidebar: [
      {
        text: '개요',
        items: [
          { text: '프로젝트 소개', link: '/overview/' },
          { text: '아키텍처', link: '/overview/architecture' },
          { text: '기술 스택', link: '/overview/tech-stack' }
        ]
      },
      {
        text: '환경 구성',
        items: [
          { text: '개발 환경', link: '/setup/' },
          { text: '계정 및 권한', link: '/setup/accounts' },
          { text: '저장소 목록', link: '/setup/repositories' }
        ]
      },
      {
        text: '운영',
        items: [
          { text: '운영 개요', link: '/operations/' },
          { text: '배포', link: '/operations/deploy' },
          { text: '모니터링', link: '/operations/monitoring' },
          { text: '장애 대응', link: '/operations/incident' }
        ]
      },
      {
        text: '업무 현황',
        items: [
          { text: '업무 개요', link: '/tasks/' },
          { text: '진행 중인 업무', link: '/tasks/in-progress' },
          { text: '알려진 이슈', link: '/tasks/known-issues' }
        ]
      },
      {
        text: '기타',
        items: [
          { text: '연락처', link: '/contacts' },
          { text: 'FAQ', link: '/faq' }
        ]
      }
    ],

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
