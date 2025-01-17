import { NavigationRouteContext } from '@react-navigation/native'
import React, { type ReactNode, createContext, useContext, useEffect } from 'react'
import { Freeze } from 'react-freeze'
import { store, useStoreRootState, useStoreRouteInfo } from './global-state/router-store'
import type { ExpoRouter } from './interfaces/router'
import { enableFreeze } from 'react-native-screens'

type SearchParams = Record<string, string | string[]>

export function useRootNavigationState() {
  return useStoreRootState()
}

export function useRouteInfo() {
  return useStoreRouteInfo()
}

/** @deprecated use `useNavigationContainerRef()` instead, which returns a React ref. */
export function useRootNavigation() {
  return store.navigationRef.current
}

/** @return the root `<NavigationContainer />` ref for the app. The `ref.current` may be `null` if the `<NavigationContainer />` hasn't mounted yet. */
export function useNavigationContainerRef() {
  return store.navigationRef
}

const FrozeContext = createContext(false)

export function Frozen({ on = false, children }: { on?: boolean; children: ReactNode }) {
  // useEffect(() => {
  //   enableFreeze(true)
  //   return () => {
  //     enableFreeze(false)
  //   }
  // }, [on])

  if (typeof window === 'undefined') {
    return children
  }

  return (
    <FrozeContext.Provider value={on}>
      {/* <Freeze freeze={on}> */}
      <div
        // @ts-ignore
        inert
        style={{ display: 'contents' }}
      >
        {children}
      </div>
      {/* </Freeze> */}
    </FrozeContext.Provider>
  )
}

export function useRouter(): ExpoRouter.Router {
  const isFrozen = useContext(FrozeContext)

  // @ts-ignore TODO
  return React.useMemo(
    () =>
      isFrozen
        ? {
            push: emptyFn,
            dismiss: emptyFn,
            dismissAll: emptyFn,
            canDismiss: emptyFn,
            back: emptyFn,
            replace: emptyFn,
            setParams: emptyFn,
            canGoBack: () => false,
            navigate: emptyFn,
          }
        : {
            push: store.push,
            dismiss: store.dismiss,
            dismissAll: store.dismissAll,
            canDismiss: store.canDismiss,
            back: store.goBack,
            replace: store.replace,
            setParams: store.setParams,
            canGoBack: store.canGoBack,
            navigate: store.navigate,
            // TODO(EvanBacon): add `reload`
          },
    [isFrozen]
  )
}

const emptyFn = () => {}

/**
 * @private
 * @returns the current global pathname with query params attached. This may change in the future to include the hostname from a predefined universal link, i.e. `/foobar?hey=world` becomes `https://acme.dev/foobar?hey=world`
 */
export function useUnstableGlobalHref(): string {
  return useStoreRouteInfo().unstable_globalHref
}

/**
 * Get a list of selected file segments for the currently selected route. Segments are not normalized, so they will be the same as the file path. e.g. /[id]?id=normal -> ["[id]"]
 *
 * `useSegments` can be typed using an abstract.
 * Consider the following file structure, and strictly typed `useSegments` function:
 *
 * ```md
 * - app
 *   - [user]
 *     - index.js
 *     - followers.js
 *   - settings.js
 * ```
 * This can be strictly typed using the following abstract:
 *
 * ```ts
 * const [first, second] = useSegments<['settings'] | ['[user]'] | ['[user]', 'followers']>()
 * ```
 */
export function useSegments<TSegments extends string[] = string[]>(): TSegments {
  return useStoreRouteInfo().segments as TSegments
}

/** @returns global selected pathname without query parameters. */
export function usePathname(): string {
  return useStoreRouteInfo().pathname
}

/**
 * Get the globally selected query parameters, including dynamic path segments. This function will update even when the route is not focused.
 * Useful for analytics or other background operations that don't draw to the screen.
 *
 * When querying search params in a stack, opt-towards using `useLocalSearchParams` as these will only
 * update when the route is focused.
 *
 * @see `useLocalSearchParams`
 */
export function useGlobalSearchParams<
  TParams extends SearchParams = SearchParams,
>(): Partial<TParams> {
  return useStoreRouteInfo().params as Partial<TParams>
}

/**
 * Returns the URL search parameters for the contextually focused route. e.g. `/acme?foo=bar` -> `{ foo: "bar" }`.
 * This is useful for stacks where you may push a new screen that changes the query parameters.
 *
 * To observe updates even when the invoking route is not focused, use `useGlobalSearchParams()`.
 */
export function useLocalSearchParams<
  TParams extends SearchParams = SearchParams,
>(): Partial<TParams> {
  const params = React.useContext(NavigationRouteContext)?.params ?? {}
  return Object.fromEntries(
    Object.entries(params).map(([key, value]) => {
      if (Array.isArray(value)) {
        return [
          key,
          value.map((v) => {
            try {
              return decodeURIComponent(v)
            } catch {
              return v
            }
          }),
        ]
      }
      try {
        return [key, decodeURIComponent(value as string)]
      } catch {
        return [key, value]
      }
    })
  ) as Partial<TParams>
}
