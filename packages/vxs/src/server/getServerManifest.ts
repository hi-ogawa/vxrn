/**
 * Copyright © 2023 650 Industries.
 * Copyright © 2023 Vercel, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Based on https://github.com/vercel/next.js/blob/1df2686bc9964f1a86c444701fa5cbf178669833/packages/next/src/shared/lib/router/utils/route-regex.ts
 */
import type { RouteNode } from '../Route'
import { getContextKey, matchGroupName } from '../matchers'
import { sortRoutes } from '../sortRoutes'

// TODO: Share these types across cli, server, router, etc.
export type ExpoRouterServerManifestV1Route<TRegex = string> = {
  file: string
  page: string
  routeKeys: Record<string, string>
  namedRegex: TRegex
  generated?: boolean
  layouts?: string[]
}

export type ExpoRouterServerManifestV1<TRegex = string> = {
  apiRoutes: ExpoRouterServerManifestV1Route<TRegex>[]
  htmlRoutes: ExpoRouterServerManifestV1Route<TRegex>[]
  notFoundRoutes: ExpoRouterServerManifestV1Route<TRegex>[]
}

export interface Group {
  pos: number
  repeat: boolean
  optional: boolean
}

export interface RouteRegex {
  groups: Record<string, Group>
  re: RegExp
}

function isNotFoundRoute(route: RouteNode) {
  return route.dynamic && route.dynamic[route.dynamic.length - 1].notFound
}

function uniqueBy<T>(arr: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>()
  return arr.filter((item) => {
    const id = key(item)
    if (seen.has(id)) {
      return false
    }
    seen.add(id)
    return true
  })
}

// Given a nested route tree, return a flattened array of all routes that can be matched.
export function getServerManifest(route: RouteNode): ExpoRouterServerManifestV1 {
  function getFlatNodes(route: RouteNode, layouts?: string[]): [string, RouteNode][] {
    if (route.children.length) {
      return route.children.flatMap((child) =>
        getFlatNodes(child, [...(layouts || []), route.contextKey])
      )
    }

    // API Routes are handled differently to HTML routes because they have no nested behavior.
    // An HTML route can be different based on parent segments due to layout routes, therefore multiple
    // copies should be rendered. However, an API route is always the same regardless of parent segments.
    let key: string
    if (route.type === 'api') {
      key = getContextKey(route.contextKey).replace(/\/index$/, '') ?? '/'
    } else {
      key = getContextKey(route.route).replace(/\/index$/, '') ?? '/'
    }
    return [[key, { ...route, layouts }]]
  }

  // Remove duplicates from the runtime manifest which expands array syntax.
  const flat = getFlatNodes(route)
    .sort(([, a], [, b]) => sortRoutes(b, a))
    .reverse()

  const apiRoutes = uniqueBy(
    flat.filter(([, route]) => route.type === 'api'),
    ([path]) => path
  )
  const otherRoutes = uniqueBy(
    flat.filter(([, route]) => route.type === 'route'),
    ([path]) => path
  )
  const standardRoutes = otherRoutes.filter(([, route]) => !isNotFoundRoute(route))
  const notFoundRoutes = otherRoutes.filter(([, route]) => isNotFoundRoute(route))

  return {
    apiRoutes: getMatchableManifestForPaths(
      apiRoutes.map(([normalizedRoutePath, node]) => [normalizedRoutePath, node])
    ),
    htmlRoutes: getMatchableManifestForPaths(
      standardRoutes.map(([normalizedRoutePath, node]) => [normalizedRoutePath, node])
    ),
    notFoundRoutes: getMatchableManifestForPaths(
      notFoundRoutes.map(([normalizedRoutePath, node]) => [normalizedRoutePath, node])
    ),
  }
}

function getMatchableManifestForPaths(
  paths: [string, RouteNode][]
): ExpoRouterServerManifestV1Route[] {
  return paths.map((normalizedRoutePath) => {
    const matcher: ExpoRouterServerManifestV1Route = getNamedRouteRegex(
      normalizedRoutePath[0],
      getContextKey(normalizedRoutePath[1].route),
      normalizedRoutePath[1].contextKey,
      normalizedRoutePath[1].layouts
    )
    if (normalizedRoutePath[1].generated) {
      matcher.generated = true
    }
    return matcher
  })
}

function getNamedRouteRegex(
  normalizedRoute: string,
  page: string,
  file: string,
  layouts?: string[]
): ExpoRouterServerManifestV1Route {
  const result = getNamedParametrizedRoute(normalizedRoute)
  return {
    file,
    page,
    namedRegex: `^${result.namedParameterizedRoute}(?:/)?$`,
    routeKeys: result.routeKeys,
    layouts,
  }
}

/**
 * Builds a function to generate a minimal routeKey using only a-z and minimal
 * number of characters.
 */
function buildGetSafeRouteKey() {
  let currentCharCode = 96 // Starting one before 'a' to make the increment logic simpler
  let currentLength = 1

  return () => {
    let result = ''
    let incrementNext = true

    // Iterate from right to left to build the key
    for (let i = 0; i < currentLength; i++) {
      if (incrementNext) {
        currentCharCode++
        if (currentCharCode > 122) {
          currentCharCode = 97 // Reset to 'a'
          incrementNext = true // Continue to increment the next character
        } else {
          incrementNext = false
        }
      }
      result = String.fromCharCode(currentCharCode) + result
    }

    // If all characters are 'z', increase the length of the key
    if (incrementNext) {
      currentLength++
      currentCharCode = 96 // This will make the next key start with 'a'
    }

    return result
  }
}

function removeTrailingSlash(route: string): string {
  return route.replace(/\/$/, '') || '/'
}

function getNamedParametrizedRoute(route: string) {
  const segments = removeTrailingSlash(route).slice(1).split('/')
  const getSafeRouteKey = buildGetSafeRouteKey()
  const routeKeys: Record<string, string> = {}
  return {
    namedParameterizedRoute: segments
      .map((segment, index) => {
        if (segment === '+not-found' && index === segments.length - 1) {
          segment = '[...not-found]'
        }
        if (/^\[.*\]$/.test(segment)) {
          const { name, optional, repeat } = parseParameter(segment)
          // replace any non-word characters since they can break
          // the named regex
          let cleanedKey = name.replace(/\W/g, '')
          let invalidKey = false

          // check if the key is still invalid and fallback to using a known
          // safe key
          if (cleanedKey.length === 0 || cleanedKey.length > 30) {
            invalidKey = true
          }
          if (!Number.isNaN(Number.parseInt(cleanedKey.slice(0, 1), 10))) {
            invalidKey = true
          }

          // Prevent duplicates after sanitizing the key
          if (cleanedKey in routeKeys) {
            invalidKey = true
          }

          if (invalidKey) {
            cleanedKey = getSafeRouteKey()
          }

          routeKeys[cleanedKey] = name
          return repeat
            ? optional
              ? `(?:/(?<${cleanedKey}>.+?))?`
              : `/(?<${cleanedKey}>.+?)`
            : `/(?<${cleanedKey}>[^/]+?)`
        }
        if (/^\(.*\)$/.test(segment)) {
          const groupName = matchGroupName(segment)!
            .split(',')
            .map((group) => group.trim())
            .filter(Boolean)
          if (groupName.length > 1) {
            const optionalSegment = `\\((?:${groupName.map(escapeStringRegexp).join('|')})\\)`
            // Make section optional
            return `(?:/${optionalSegment})?`
          }
          // Use simpler regex for single groups
          return `(?:/${escapeStringRegexp(segment)})?`
        }
        return `/${escapeStringRegexp(segment)}`
      })
      .join(''),
    routeKeys,
  }
}

// regexp is based on https://github.com/sindresorhus/escape-string-regexp
const reHasRegExp = /[|\\{}()[\]^$+*?.-]/
const reReplaceRegExp = /[|\\{}()[\]^$+*?.-]/g

function escapeStringRegexp(str: string) {
  // see also: https://github.com/lodash/lodash/blob/2da024c3b4f9947a48517639de7560457cd4ec6c/escapeRegExp.js#L23
  if (reHasRegExp.test(str)) {
    return str.replace(reReplaceRegExp, '\\$&')
  }
  return str
}

export function parseParameter(param: string) {
  let repeat = false
  let optional = false
  let name = param

  if (/^\[.*\]$/.test(name)) {
    optional = true
    name = name.slice(1, -1)
  }

  if (/^\.\.\./.test(name)) {
    repeat = true
    name = name.slice(3)
  }

  return { name, repeat, optional }
}
