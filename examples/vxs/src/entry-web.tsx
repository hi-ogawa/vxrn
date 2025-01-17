import { Root, render } from 'vxs'

const routes = import.meta.glob('../app/**/*.tsx')

export function App(props: { path: string }) {
  return <Root routes={routes} path={props.path} />
}

render(App)
