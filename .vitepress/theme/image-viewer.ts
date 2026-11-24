// 문서 본문 이미지 클릭 시 모달 뷰어 (viewer.js)
// - 마우스 휠 확대·축소, 드래그 이동, 회전, 같은 페이지 이미지 넘겨보기, ESC로 닫기
// - 링크(<a>) 안에 있는 이미지는 링크 동작을 그대로 둔다
import { nextTick, onMounted, onUnmounted, watch } from 'vue'
import { useRoute } from 'vitepress'
import type Viewer from 'viewerjs'
import 'viewerjs/dist/viewer.css'

export function setupImageViewer() {
  const route = useRoute()
  let viewer: Viewer | null = null

  const destroy = () => {
    viewer?.destroy()
    viewer = null
  }

  const init = async () => {
    destroy()
    await nextTick()
    const container = document.querySelector<HTMLElement>('.vp-doc')
    if (!container) return
    const images = Array.from(container.querySelectorAll('img')).filter((img) => !img.closest('a'))
    if (!images.length) return

    // 브라우저에서만 불러온다 (SSR 빌드 시 window 없음)
    const { default: ViewerCtor } = await import('viewerjs')
    viewer = new ViewerCtor(container, {
      filter: (img: HTMLImageElement) => !img.closest('a'),
      title: [1, (img: HTMLImageElement) => img.alt || ''],
      navbar: images.length > 1,
      zoomRatio: 0.2,
      toolbar: {
        zoomIn: true,
        zoomOut: true,
        oneToOne: true,
        reset: true,
        prev: images.length > 1,
        next: images.length > 1,
        rotateLeft: true,
        rotateRight: true
      }
    })
  }

  onMounted(init)
  watch(() => route.path, init)
  onUnmounted(destroy)
}
