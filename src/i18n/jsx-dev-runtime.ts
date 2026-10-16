// Entrada de JSX para desarrollo: la de React, pasando antes cada elemento por el idioma de la interfaz.
// Como jsx-runtime.ts, recibe la traducción por el gancho global que instala ./index.
import * as runtime from 'react/jsx-dev-runtime'

export type { JSX } from 'react'
export const Fragment = runtime.Fragment

type Props = Record<string, unknown> | null
type Create = (type: unknown, props: Props, ...rest: unknown[]) => unknown

const localized = (type: unknown, props: Props): Props =>
  (globalThis as { __lumbreraLocalize?: (type: unknown, props: Props) => Props }).__lumbreraLocalize?.(type, props) ?? props

export const jsxDEV: Create = (type, props, ...rest) => (runtime.jsxDEV as Create)(type, localized(type, props), ...rest)
