// Entrada de JSX para producción: la de React, pasando antes cada elemento por el idioma de la interfaz.
//
// Vite preempaqueta este archivo como si fuera una dependencia, así que no importa el diccionario:
// lo recibe por el gancho global que instala ./index, que sí se recarga al editarlo.
import * as runtime from 'react/jsx-runtime'

export type { JSX } from 'react'
export const Fragment = runtime.Fragment

type Props = Record<string, unknown> | null
type Create = (type: unknown, props: Props, key?: unknown) => unknown

const localized = (type: unknown, props: Props): Props =>
  (globalThis as { __lumbreraLocalize?: (type: unknown, props: Props) => Props }).__lumbreraLocalize?.(type, props) ?? props

export const jsx: Create = (type, props, key) => (runtime.jsx as Create)(type, localized(type, props), key)
export const jsxs: Create = (type, props, key) => (runtime.jsxs as Create)(type, localized(type, props), key)
