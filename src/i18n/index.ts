// Idioma de la interfaz. Los componentes se escriben en español; este módulo se engancha a la
// creación de elementos (ver jsx-runtime.ts) y sustituye cada texto por su traducción, sin que
// los componentes tengan que llamar a nada. Para añadir un idioma basta con otro diccionario.

import * as en from './en'
import * as fr from './fr'
import * as pt from './pt'

export type Lang = 'es' | 'en' | 'pt' | 'fr'

export const LANGUAGES: [Lang, string][] = [
  ['es', 'Español'],
  ['en', 'English'],
  ['pt', 'Português'],
  ['fr', 'Français'],
]

interface Dictionary {
  words: Record<string, string>
  templates: Record<string, string>
}

const DICTIONARIES: Record<Exclude<Lang, 'es'>, Dictionary> = { en, pt, fr }

function stored(): Lang {
  try {
    const value = JSON.parse(localStorage.getItem('lang') ?? '"es"')
    return LANGUAGES.some(([code]) => code === value) ? value : 'es'
  } catch {
    return 'es'
  }
}

export const LANG: Lang = stored()

/** Cambiar de idioma recarga la aplicación: los textos se resuelven al crear cada elemento. */
export function setLanguage(lang: Lang) {
  try {
    localStorage.setItem('lang', JSON.stringify(lang))
  } catch {
    return
  }
  window.location.reload()
}

const WORDS: Record<string, string> = LANG === 'es' ? {} : DICTIONARIES[LANG].words
const TEMPLATES: Record<string, string> = LANG === 'es' ? {} : DICTIONARIES[LANG].templates

// Textos en español que llevan datos dentro, con el nombre de su plantilla en cada diccionario.
const PATTERNS: [RegExp, string][] = [
  [/^([\d.]+) (versículos?|temas?|encabezados?) en (.+)\.$/, 'found'],
  [/^Ningún versículo de (.+) contiene esto\. Prueba con otra palabra o con otra versión\.$/, 'none'],
  [/^No se pudo completar la búsqueda: (.*)$/, 'searchFailed'],
  [/^Aparece ([\d.]+) veces en la Biblia\.$/, 'appears'],
  [/^(\d+) veces, resaltadas en el texto\.$/, 'highlighted'],
  [/^Comentarios del versículo (\d+)$/, 'commentariesOn'],
  [/^Copiar (\d+) versículos$/, 'copyVerses'],
  [/^Referencias de (.+)$/, 'referencesFor'],
  [/^Nota de (.+)$/, 'noteOn'],
  [/^Vocabulario de (.+)$/, 'vocabularyOf'],
  [/^Temas de (.+)$/, 'topicsFor'],
  [/^Versículos relacionados con (.+)$/, 'relatedTo'],
  [/^Cerrar panel (\d+)$/, 'closePane'],
  [/^(\d+) paneles de lectura$/, 'panes'],
  [/^Panel de lectura (\d+)$/, 'pane'],
  [/^Instalando… (\d+) %$/, 'installing'],
  [/^Quitar el marcador de (.+)$/, 'removeBookmark'],
  [/^Quitar la condición (.+)$/, 'removeCondition'],
  [/^([\d.]+) versiones y comentarios disponibles\. Hace falta conexión a internet para descargarlos\.$/, 'available'],
  [/^Sí, quitar (.+) de este equipo$/, 'confirmRemove'],
]

/** Rellena una plantilla con los datos; los datos que sean a su vez textos de la interfaz se traducen. */
const fill = (template: string, match: RegExpExecArray) => template.replace(/\$(\d)/g, (_, n: string) => WORDS[match[Number(n)]] ?? match[Number(n)])

export function translate(text: string): string {
  if (LANG === 'es') return text
  const core = text.trim()
  if (!core) return text
  const wrap = (out: string) => text.replace(core, () => out)
  const exact = WORDS[core]
  if (exact !== undefined) return wrap(exact)
  for (const [pattern, name] of PATTERNS) {
    const match = pattern.exec(core)
    if (match && TEMPLATES[name]) return wrap(fill(TEMPLATES[name], match))
  }
  // listas como "palabras originales, gramática, notas"
  if (core.includes(', ')) {
    const parts = core.split(', ')
    if (parts.every((part) => WORDS[part] !== undefined)) return wrap(parts.map((part) => WORDS[part]).join(', '))
  }
  return text
}

// Elementos cuyo contenido es texto bíblico, del léxico o de un comentario: no se traducen.
const CONTENT = new Set([
  'verse', 'verse-inline', 'paragraph', 'result-text', 'definition', 'commentary', 'headword', 'translit', 'gloss',
  'unit', 'unit-text', 'unit-line', 'word', 'xref-verse', 'note-body', 'verse-quote', 'diff-line', 'section', 'chapter-book',
])
const ATTRIBUTES = ['placeholder', 'aria-label', 'title']

type Props = Record<string, unknown> | null

/** Devuelve las propiedades de un elemento con sus textos en el idioma elegido. */
export function localize(type: unknown, props: Props): Props {
  if (LANG === 'es' || typeof type !== 'string' || !props) return props
  const className = typeof props.className === 'string' ? props.className : ''
  if (className && className.split(' ').some((name) => CONTENT.has(name))) return props
  let out = props
  const set = (key: string, value: unknown) => {
    if (out === props) out = { ...props }
    out[key] = value
  }
  const { children } = props
  if (typeof children === 'string') {
    const next = translate(children)
    if (next !== children) set('children', next)
  } else if (Array.isArray(children) && children.some((child) => typeof child === 'string')) {
    set('children', children.map((child) => (typeof child === 'string' ? translate(child) : child)))
  }
  for (const name of ATTRIBUTES) {
    const value = props[name]
    if (typeof value === 'string') {
      const next = translate(value)
      if (next !== value) set(name, next)
    }
  }
  return out
}

// Las entradas de JSX (jsx-runtime.ts) llaman a la traducción a través de este gancho.
;(globalThis as { __lumbreraLocalize?: typeof localize }).__lumbreraLocalize = localize
