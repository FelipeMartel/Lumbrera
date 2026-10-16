// el idioma se carga antes que ningún componente: instala la traducción que usa el JSX
import { LANG } from './i18n'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { Workspace } from './Workspace'
import { PANE, load } from './types'
import './styles.css'

document.documentElement.lang = LANG

const panes = load<string[]>('panes', [])

createRoot(document.getElementById('root')!).render(
  <StrictMode>{PANE === null && panes.length > 1 ? <Workspace initial={panes} /> : <App />}</StrictMode>,
)
