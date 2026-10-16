import type { Note, SearchRequest } from './api'
import { LANG } from './i18n'

/** Glosa de una palabra original en el idioma de la interfaz. */
export const glossOf = (word: { _es_Gloss?: string; stepGloss?: string; gloss?: string }) =>
  ((LANG === 'es' && word._es_Gloss) || word.stepGloss || word.gloss || word._es_Gloss || '').trim()

/** Número de panel cuando la aplicación corre dentro de un panel de lectura, o null si es la ventana principal. */
export const PANE = new URLSearchParams(window.location.search).get('panel')

export interface Location {
  book: string
  chapter: number
  /** Pasaje a medida en OSIS ("John.3.16-John.3.18;Rom.8.28"); si existe, sustituye al capítulo. */
  range?: string
}

export interface Selection {
  version: string
  verse: string
  strong: string
  morph?: string
  text: string
}

export type Panel =
  | { type: 'word'; selection: Selection }
  | { type: 'note'; note: Note; osisId: string }
  | { type: 'verse'; osisId: string }
  | { type: 'stats' }

export interface Query extends SearchRequest {
  /** Lo que se muestra al usuario cuando la consulta es un código (p. ej. una palabra original). */
  label?: string
}

export interface Prefs {
  headings: boolean
  verseNumbers: boolean
  lines: boolean
  notes: boolean
  redLetters: boolean
  interlinear: boolean
  /** Líneas extra del interlineal. */
  glossEnglish: boolean
  glossChinese: boolean
  grammarLine: boolean
  /** Opciones del texto en griego y hebreo. */
  greekAccents: boolean
  hebrewVowels: boolean
  divideHebrew: boolean
  transliterateOriginal: boolean
  grammarColors: boolean
  /** Qué dice el subrayado de los nombres cuando hay colores por gramática. */
  grammarNouns: 'gender' | 'case'
  grammarVerbs: boolean
  grammarNounsOn: boolean
  /** Colores elegidos a mano, por nombre ("present", "masc", "gen"…); los demás son los de fábrica. */
  grammarPalette: Record<string, string>
  dyslexia: boolean
  /** Tamaño del texto de lectura, en porcentaje. */
  fontSize: number
}

/** Letras de opción del motor que corresponden a las preferencias. */
export function optionLetters(prefs: Prefs, interlinear: boolean): string {
  return [
    'HNV',
    prefs.hebrewVowels && 'U',
    prefs.greekAccents && 'G',
    prefs.divideHebrew && 'D',
    prefs.transliterateOriginal && 'O',
    // la glosa del interlineal va en el idioma de la interfaz
    interlinear && (LANG === 'es' ? 'ATB' : 'ATE'),
    interlinear && prefs.glossEnglish && 'E',
    interlinear && prefs.glossChinese && 'Z',
    interlinear && prefs.grammarLine && 'M',
  ]
    .filter(Boolean)
    .join('')
}

export const DEFAULT_PREFS: Prefs = {
  headings: true,
  verseNumbers: true,
  lines: true,
  notes: true,
  redLetters: true,
  interlinear: false,
  glossEnglish: false,
  glossChinese: false,
  grammarLine: false,
  greekAccents: true,
  hebrewVowels: true,
  divideHebrew: false,
  transliterateOriginal: false,
  grammarColors: false,
  grammarNouns: 'gender',
  grammarVerbs: true,
  grammarNounsOn: true,
  grammarPalette: {},
  dyslexia: false,
  fontSize: 100,
}

/** Cómo se muestran varias versiones a la vez. */
export type CompareMode = 'columns' | 'interleaved' | 'diff' | 'diffcolumns' | 'interlinear'

export const COMPARE_LABELS: [CompareMode, string][] = [
  ['columns', 'En columnas'],
  ['interleaved', 'Intercaladas'],
  ['diff', 'Diferencias de redacción'],
  ['diffcolumns', 'Diferencias en columnas'],
  ['interlinear', 'Palabra por palabra'],
]

/** Un lugar guardado: capítulo ("John.3") o versículo ("John.3.16"). */
export interface Visit {
  osisId: string
  at: number
}

// G2424G y G2424 son la misma palabra; el sufijo solo distingue acepciones.
export const lemma = (strong: string) => strong.match(/^[GH]\d+/)?.[0] ?? strong
export const lemmas = (strong: string) => strong.split(/\s+/).map(lemma)

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

export function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // sin almacenamiento disponible: la preferencia dura solo esta visita
  }
}

export const plain = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s.]/g, '')
    .toLowerCase()

/** Identificador OSIS del libro que el usuario ha escrito ("juan", "1 cor", "Sal"), si se reconoce. */
export function resolveBook(name: string, books: { osisID: string; shortName: string; fullName: string }[]): string | null {
  const wanted = plain(name)
  if (!wanted) return null
  const book =
    books.find((b) => plain(b.fullName) === wanted || plain(b.shortName) === wanted || b.osisID.toLowerCase() === wanted) ??
    books.find((b) => plain(b.fullName).startsWith(wanted))
  return book?.osisID ?? null
}

const HEBREW_VERB: Record<string, string> = { p: 'R', q: 'R', i: 'I', w: 'I', v: 'M', r: 'T', s: 'T', a: 'N', c: 'N' }
const GENDER: Record<string, string> = { M: 'm', F: 'f', N: 'n', m: 'm', f: 'f', b: 'n', c: 'n' }

/**
 * Clases de color gramatical de una palabra según su código morfológico: tiempo o forma del verbo,
 * y género y número del nombre. Entiende los códigos griegos (Robinson) y los hebreos (OSHM, TOS).
 */
export function grammarClass(morph?: string): string {
  const code = (morph ?? '').split(/\s+/)[0].replace(/^[a-z]+:/i, '')
  const greekVerb = /^V-2?([PIFARL])[A-Z]([A-Z])/.exec(code)
  if (greekVerb) {
    const mood = greekVerb[2] === 'M' ? ' g-M' : greekVerb[2] === 'P' ? ' g-T' : greekVerb[2] === 'N' ? ' g-N' : ''
    return `g-verb g-${greekVerb[1]}${mood}`
  }
  const greekNoun = /^N-([NGDAV])([SP])([MFN])/.exec(code)
  if (greekNoun) return `g-noun g-${GENDER[greekNoun[3]]} g-c${greekNoun[1]}${greekNoun[2] === 'P' ? ' g-pl' : ''}`
  if (/^N-/.test(code)) return 'g-noun'
  // hebreo: se mira la última parte de la palabra ("HR/Ncfsa" es preposición más nombre)
  if (/^[HA]/.test(code)) {
    const part = code.slice(1).split('/').pop() ?? ''
    const verb = /^V.([pqiwvrsac])/.exec(part)
    if (verb) return `g-verb g-${HEBREW_VERB[verb[1]]}`
    const noun = /^N[cp]([mfbc])([sdp])/.exec(part)
    if (noun) return `g-noun g-${GENDER[noun[1]]}${noun[2] === 's' ? '' : ' g-pl'}`
    if (/^N/.test(part)) return 'g-noun'
  }
  return ''
}

/** "John.3.16" → "Juan 3:16" con el nombre del libro que da el motor. */
export function formatReference(osisId: string, bookName: (osis: string) => string): string {
  const [book, chapter, verse] = osisId.split('.')
  return `${bookName(book)} ${chapter}${verse ? `:${verse}` : ''}`
}
