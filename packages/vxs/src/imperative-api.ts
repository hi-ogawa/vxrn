import { store } from './global-state/router-store'
import type { ExpoRouter } from './interfaces/router'

export const router: ExpoRouter.Router = {
  navigate: (href) => store.navigate(href),
  push: (href) => store.push(href),
  dismiss: (count) => store.dismiss(count),
  dismissAll: () => store.dismissAll(),
  canDismiss: () => store.canDismiss(),
  replace: (href) => store.replace(href),
  back: () => store.goBack(),
  canGoBack: () => store.canGoBack(),
  // @ts-ignore TODO
  setParams: (params) => store.setParams(params),
}
