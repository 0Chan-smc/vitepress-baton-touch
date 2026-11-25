// 배포 전부터 열려 있던 탭이 예전 문서를 계속 보여 주지 않게 한다.
// - VitePress는 SPA라서 처음 받은 HTML의 페이지 목록으로 다른 페이지를 불러온다.
//   새로고침 없이 이동하면 배포 후에도 예전 내용이 보인다.
// - 페이지를 이동할 때 /version.json(빌드 ID)을 확인하고, 새 배포가 있으면
//   SPA 이동 대신 전체 로드로 바꿔 새 HTML을 받게 한다.
// - 지금 보고 있는 페이지는 자동으로 새로고침하지 않는다.
import { withBase, type Router } from 'vitepress'

declare const __BUILD_ID__: string

const CHECK_INTERVAL_MS = 60_000

export function setupVersionCheck(router: Router) {
  if (import.meta.env.SSR || import.meta.env.DEV) return

  let lastChecked = 0
  let stale = false
  let pending: Promise<boolean> | null = null

  const check = (): Promise<boolean> => {
    if (stale) return Promise.resolve(true)
    if (pending) return pending
    if (Date.now() - lastChecked < CHECK_INTERVAL_MS) return Promise.resolve(false)

    pending = fetch(withBase('/version.json'), { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { build?: string } | null) => {
        lastChecked = Date.now()
        stale = !!data?.build && data.build !== __BUILD_ID__
        return stale
      })
      // 확인에 실패하면 평소대로 이동한다
      .catch(() => false)
      .finally(() => {
        pending = null
      })
    return pending
  }

  const prev = router.onBeforeRouteChange
  router.onBeforeRouteChange = async (to) => {
    if (prev && (await prev(to)) === false) return false
    if (await check()) {
      window.location.href = to
      return false
    }
  }

  // 탭으로 돌아왔을 때 미리 확인해 둔다 (새로고침은 하지 않음)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void check()
  })
}
