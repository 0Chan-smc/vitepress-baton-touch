import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import { h } from 'vue'
import ChatWidget from './components/ChatWidget.vue'
import CopyPageButtons from './components/CopyPageButtons.vue'
import { setupImageViewer } from './image-viewer'
import './custom.css'

export default {
  extends: DefaultTheme,
  Layout: () =>
    h(DefaultTheme.Layout, null, {
      // 프로젝트 문서 페이지에서만 표시되는 AI Q&A 위젯
      'layout-bottom': () => h(ChatWidget)
    }),
  enhanceApp({ app }) {
    app.component('CopyPageButtons', CopyPageButtons)
  },
  setup() {
    // 본문 이미지 클릭 시 모달로 확대 보기
    setupImageViewer()
  }
} satisfies Theme
