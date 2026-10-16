// Cliente del motor de STEPBible. La interfaz original usa estas mismas rutas.

import { LANG } from './i18n'

export interface BibleModule {
  initials: string
  shortInitials: string
  name: string
  category: 'BIBLE' | 'COMMENTARY' | string
  languageCode: string
  languageName?: string
  hasStrongs: boolean
  hasMorphology?: boolean
  hasRedLetter: boolean
  hasNotes?: boolean
}

export interface Book {
  osisID: string
  shortName: string
  fullName: string
}

export interface Token {
  text: string
  strong?: string
  morph?: string
  /** Líneas del interlineal (original, transliteración, glosa u otras versiones) bajo la palabra. */
  lines?: string[]
  /** Palabras de Jesús. */
  red?: boolean
}

export interface DiffPart {
  text: string
  kind: 'same' | 'added' | 'removed'
}

export interface DiffVerse {
  osisId: string
  number: string
  lines: { version: string; parts: DiffPart[] }[]
}

export interface NotePart {
  text: string
  reference?: string
}

export interface Note {
  kind: 'xref' | 'note'
  label: string
  parts: NotePart[]
}

export type Inline = Token | { note: Note }

export interface Verse {
  osisId: string
  number: string
  label: string
  items: Inline[]
}

export type Block = { type: 'heading'; text: string } | { type: 'break' } | { type: 'verse'; verse: Verse }

export interface Passage {
  title: string
  blocks: Block[]
  verses: Verse[]
  previous?: string
  next?: string
}

export interface RelatedWord {
  strongNumber: string
  matchingForm: string
  stepTransliteration: string
  gloss: string
  _es_Gloss?: string
}

export interface VocabInfo {
  strongNumber: string
  accentedUnicode: string
  stepTransliteration: string
  stepGloss: string
  mediumDef?: string
  shortDef?: string
  lsjDefs?: string
  count?: number
  relatedNos?: RelatedWord[]
  _es_Gloss?: string
  _es_Definition?: string
}

export interface MorphInfo {
  function?: string
  tense?: string
  voice?: string
  mood?: string
  person?: string
  number?: string
  gender?: string
  wordCase?: string
}

export interface WordInfo {
  vocabInfos: VocabInfo[]
  morphInfos: MorphInfo[]
}

export type SearchKind = 'text' | 'strong' | 'meanings' | 'exactForm' | 'subject' | 'nave' | 'topicref' | 'relatedrefs'

export const SEARCH_KINDS: SearchKind[] = ['text', 'strong', 'meanings', 'exactForm', 'subject', 'nave', 'topicref', 'relatedrefs']

/** Cómo deben coincidir varias palabras en una búsqueda de texto. */
export type TextMatch = 'all' | 'any' | 'phrase'

export interface SearchRequest {
  kind: SearchKind
  text: string
  /** Libro o tramo al que se limita ("Rom", "Matt-Rev"). */
  scope?: string
  match?: TextMatch
  /** Versículos de contexto alrededor de cada resultado. */
  context?: number
  /** Número de Strong al que se reducen los resultados de una búsqueda por significado. */
  filter?: string
  /** Condiciones añadidas: el versículo debe cumplirlas también. */
  extra?: { kind: 'text' | 'strong'; text: string }[]
  /** Orden de los resultados en las búsquedas por palabra original. */
  sort?: 'VOCABULARY' | 'ORIGINAL_SPELLING'
}

export interface SearchGroup {
  label: string
  osisId: string
  verses: Verse[]
  /** Encabezado de sección encontrado, en las búsquedas por encabezado. */
  heading?: string
}

/** Entrada del índice temático de Nave. */
export interface Topic {
  root: string
  heading: string
  seeAlso?: string
}

export interface SearchPage {
  total: number
  pageSize: number
  results: SearchGroup[]
  topics: Topic[]
  words: RelatedWord[]
}

export const isToken = (item: Inline): item is Token => 'text' in item

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  // el motor da los nombres de los libros y sus propios textos en el idioma que se le pida
  const url = path.includes('lang=') ? path : `${path}${path.includes('?') ? '&' : '?'}lang=${LANG}`
  const res = await fetch(`/rest/${url}`, { signal })
  if (!res.ok) throw new Error(`El motor respondió ${res.status}`)
  const data = await res.json()
  if (data && typeof data === 'object' && 'errorMessage' in data) {
    throw new Error(String(data.errorMessage))
  }
  return data as T
}

export const getModules = (signal?: AbortSignal) => get<BibleModule[]>('module/getAllModules', signal)

export const getBooks = (version: string, signal?: AbortSignal) =>
  get<Book[]>(`bible/getBibleBookNames/%20/${encodeURIComponent(version)}`, signal)

interface RawPassage {
  value: string
  longName: string
  previousChapter?: { osisKeyId: string }
  nextChapter?: { osisKeyId: string }
}

// Letras de opción del motor: H encabezados, N notas, V números, R palabras de Jesús,
// U/G vocales y acentos del original, A vocabulario original, T transliteración, B glosa en español.
const OPTIONS = 'HNVUG'
const RED_OPTIONS = 'HNVRUG'

const master = (query: string, rest: string) => `search/masterSearch/${encodeURIComponent(query)}/${rest}`

interface PassageOptions {
  /** Letras de opción del motor; si faltan, las de lectura normal. */
  letters?: string
  /** Otras versiones alineadas palabra por palabra bajo la principal. */
  under?: string[]
  /** Marcar las palabras de Jesús. */
  red?: boolean
}

const versionsQuery = (versions: string[]) => versions.map((v) => `version=${v}`).join('|')

export async function getPassage(version: string, reference: string, options: PassageOptions = {}, signal?: AbortSignal): Promise<Passage> {
  const under = options.under ?? []
  const letters = options.letters ?? OPTIONS
  const display = under.length > 0 ? 'HNVUG/INTERLINEAR' : `${letters}/NONE`
  const query = `${versionsQuery([version, ...under])}|reference=${reference}`
  // Con las letras rojas activadas el motor suelta las etiquetas de palabra original en algunas versiones,
  // así que el rojo se pide aparte y se vuelca sobre el texto etiquetado.
  const wantsRed = !!options.red && under.length === 0 && !/[ATBEZMO]/.test(letters)
  const [raw, red] = await Promise.all([
    get<RawPassage>(master(query, display), signal),
    wantsRed ? get<RawPassage>(master(query, `${RED_OPTIONS}/NONE`), signal).catch(() => null) : null,
  ])
  const blocks = parseBlocks(raw.value)
  if (red) applyRed(blocks, parseBlocks(red.value))
  return {
    title: raw.longName,
    blocks,
    verses: blocks.flatMap((b) => (b.type === 'verse' ? [b.verse] : [])),
    previous: raw.previousChapter?.osisKeyId,
    next: raw.nextChapter?.osisKeyId,
  }
}

/** Diferencias de redacción entre versiones, versículo a versículo, tal como las calcula el motor. */
export async function getDiff(versions: string[], reference: string, signal?: AbortSignal): Promise<DiffVerse[]> {
  const raw = await get<RawPassage>(master(`${versionsQuery(versions)}|reference=${reference}`, 'HNVUG/INTERLEAVED_COMPARE'), signal)
  const doc = new DOMParser().parseFromString(raw.value, 'text/html')
  return Array.from(doc.querySelectorAll('.verseGrouping')).map((group) => {
    const osisId = group.querySelector('a.verseLink')?.getAttribute('name') ?? ''
    return {
      osisId,
      number: osisId.split('.').pop() ?? '',
      lines: Array.from(group.querySelectorAll('.singleVerse')).map((line) => {
        const parts: DiffPart[] = []
        line.childNodes.forEach((node) => {
          if (node instanceof Element && node.matches('.smallResultKey')) return
          const kind = !(node instanceof Element) ? 'same' : node.matches('.cmpUnderline') ? 'added' : node.matches('.cmpStrike') ? 'removed' : 'same'
          if (node.textContent) parts.push({ text: node.textContent.replace(/\s+/g, ' '), kind })
        })
        return { version: line.querySelector('.smallResultKey')?.getAttribute('data-version') ?? '', parts }
      }),
    }
  })
}

/** Texto de un comentario para una referencia, como HTML del motor (se limpia al pintarlo). */
export async function getCommentary(version: string, reference: string, signal?: AbortSignal): Promise<string> {
  const raw = await get<RawPassage>(master(`version=${version}|reference=${reference}`, `${OPTIONS}/NONE`), signal)
  return raw.value
}

interface RawResult {
  key?: string
  osisId?: string
  preview?: string
  root?: string
  heading?: string
  seeAlso?: string
  headingsSearch?: { results?: RawResult[] }
}

interface RawSearch {
  total?: number
  pageSize?: number
  results?: RawResult[]
  definitions?: RelatedWord[]
}

function searchTerms({ kind, text, match }: SearchRequest): string {
  if (kind !== 'text') return `${kind}=${text}`
  const words = text.split(/\s+/).filter(Boolean)
  if (match === 'phrase' && words.length > 1) return `text="${words.join(' ')}"`
  // el motor une con "o" las palabras de un mismo término y con "y" los términos separados
  return match === 'any' ? `text=${words.join(' ')}` : words.map((w) => `text=${w}`).join('|')
}

const versesOf = (html: string) => parseBlocks(html).flatMap((b) => (b.type === 'verse' ? [b.verse] : []))

export async function search(version: string, request: SearchRequest, page: number, signal?: AbortSignal): Promise<SearchPage> {
  const query = [
    `version=${version}`,
    ...(request.scope ?? '').split(',').filter(Boolean).map((book) => `reference=${book}`),
    searchTerms(request),
    ...(request.extra ?? []).map((term) => searchTerms({ ...term, match: 'all' })),
  ].join('|')
  // filtro y orden vacíos se envían como un espacio: los intermediarios colapsan los tramos vacíos de la ruta
  const raw = await get<RawSearch>(master(query, `${OPTIONS}/NONE/${page}/${request.filter ?? '%20'}/${request.sort ?? '%20'}/${request.context ?? 0}/${LANG}`), signal)
  const rows = raw.results ?? []
  const headings = rows[0]?.headingsSearch?.results
  const verseRows = headings ?? rows.filter((r) => r.preview !== undefined)
  return {
    total: raw.total ?? 0,
    pageSize: raw.pageSize || 60,
    topics: rows.flatMap((r) => (r.root !== undefined ? [{ root: r.root, heading: r.heading ?? '', seeAlso: r.seeAlso }] : [])),
    words: raw.definitions ?? [],
    results: verseRows.map((r) => {
      const html = new DOMParser().parseFromString(r.preview ?? '', 'text/html')
      return {
        label: r.key ?? '',
        osisId: (r.osisId ?? '').split(' ')[0],
        verses: headings ? [] : versesOf(r.preview ?? ''),
        heading: headings ? clean(html.querySelector('.subjectHeading')?.textContent) : undefined,
      }
    }),
  }
}

interface RawTopicVerses {
  subjectEntries?: { value: string; osisId?: string; reference?: string; longName?: string }[]
}

/** Versículos que el índice de Nave reúne bajo una entrada. */
export async function getTopicVerses(version: string, topic: Topic, signal?: AbortSignal): Promise<SearchGroup[]> {
  const raw = await get<RawTopicVerses>(
    `search/getSubjectVerses/${encodeURIComponent(topic.root)}/${encodeURIComponent(topic.heading)}/${encodeURIComponent(version)}`,
    signal,
  )
  return (raw.subjectEntries ?? []).map((entry) => {
    const osisId = (entry.osisId ?? '').split(' ')[0]
    return {
      label: entry.longName ?? entry.reference ?? '',
      osisId,
      // estos versículos llegan sin su ancla; se les da la de la entrada para poder estudiar sus palabras
      verses: versesOf(entry.value).map((v) => (v.osisId ? v : { ...v, osisId })),
    }
  })
}

/** Palabras originales de un versículo, en su orden. */
export async function getVerseVocabulary(version: string, osisId: string, signal?: AbortSignal): Promise<RelatedWord[]> {
  const raw = await get<{ strongData?: Record<string, RelatedWord[]> }>(
    `bible/getStrongNumbersAndSubjects/${encodeURIComponent(version)}/${osisId}/${LANG}`,
    signal,
  )
  return raw.strongData?.[osisId] ?? Object.values(raw.strongData ?? {})[0] ?? []
}

/** Entradas breves del léxico para varias palabras a la vez. */
export const getGlosses = (version: string, reference: string, strongs: string[], signal?: AbortSignal) =>
  get<WordInfo>(`module/getQuickInfo/${encodeURIComponent(version)}/${reference}/${encodeURIComponent(strongs.join(' '))}/%20/${LANG}`, signal).then(
    (info) => info.vocabInfos,
  )

/** Temas del índice de Nave que toca un pasaje, del más al menos citado. */
export async function getSubjectStats(version: string, reference: string, signal?: AbortSignal): Promise<[string, number][]> {
  const raw = await get<{ passageStat?: { stats?: Record<string, number[]> } }>(
    `analysis/analyseStats/${encodeURIComponent(version)}/${reference}/SUBJECT/PASSAGE/false/${LANG}/true`,
    signal,
  )
  return Object.entries(raw.passageStat?.stats ?? {})
    .map(([topic, counts]): [string, number] => [topic, counts[0] ?? 0])
    .sort((a, b) => b[1] - a[1])
}

export interface Suggestion {
  type: 'Pasaje' | 'En el texto' | 'Tema' | 'Significado' | 'Griego' | 'Hebreo'
  label: string
  detail?: string
  /** Referencia OSIS a la que lleva, o búsqueda que lanza. */
  reference?: string
  search?: SearchRequest & { label?: string }
}

interface RawSuggestion {
  itemType: string
  count?: number
  suggestion?: Partial<RelatedWord> & { fullName?: string; osisID?: string; text?: string; value?: string }
  extraExamples?: RelatedWord[]
}

/** Lo que el motor propone mientras se escribe: pasajes, palabras del texto, temas y palabras originales. */
export async function getSuggestions(version: string, term: string, signal?: AbortSignal): Promise<Suggestion[]> {
  // el motor exige el contexto de versión, terminado en "@"
  const raw = await get<RawSuggestion[]>(`search/suggest/${encodeURIComponent(term)}/${encodeURIComponent(`version=${version}@`)}?lang=${LANG}`, signal)
  const gloss = (word: Partial<RelatedWord>) => ((LANG === 'es' && word._es_Gloss) || word.gloss || '').trim()
  const original = (type: 'Griego' | 'Hebreo', word: Partial<RelatedWord>): Suggestion[] =>
    word.strongNumber
      ? [
          {
            type,
            label: word.matchingForm ?? word.strongNumber,
            detail: [word.stepTransliteration, gloss(word)].filter(Boolean).join(', '),
            search: { kind: 'strong', text: word.strongNumber, label: `${word.matchingForm} (${gloss(word)})` },
          },
        ]
      : []
  return raw.flatMap((item): Suggestion[] => {
    const s = item.suggestion ?? {}
    switch (item.itemType) {
      case 'reference':
        return s.osisID ? [{ type: 'Pasaje', label: s.fullName ?? s.osisID, reference: s.osisID }] : []
      case 'text':
        return s.text ? [{ type: 'En el texto', label: s.text, search: { kind: 'text', text: s.text } }] : []
      case 'subject':
        return s.value ? [{ type: 'Tema', label: s.value, search: { kind: 'nave', text: s.value } }] : []
      case 'meanings':
        return s.gloss ? [{ type: 'Significado', label: s.gloss, search: { kind: 'meanings', text: s.gloss } }] : []
      case 'greekMeanings':
      case 'greek':
        return [s, ...(item.extraExamples ?? []).slice(0, 2)].flatMap((w) => original('Griego', w))
      case 'hebrewMeanings':
      case 'hebrew':
        return [s, ...(item.extraExamples ?? []).slice(0, 2)].flatMap((w) => original('Hebreo', w))
      default:
        return []
    }
  })
}

/**
 * Mensaje al equipo de STEPBible por el mismo canal que usa su interfaz: un formulario por partes
 * con los campos del mensaje y una imagen en base64.
 */
export async function sendFeedback(fields: Record<string, string>, imageBase64: string): Promise<boolean> {
  const boundary = '--step-form-data123456'
  const lines: string[] = []
  for (const [key, value] of Object.entries(fields)) {
    lines.push(`--${boundary}`, `Content-Disposition: form-data; name="${key}"`, '', value)
  }
  lines.push(`--${boundary}`, 'Content-Disposition: form-data; name="screenshot-part"; filename="file"', '', imageBase64, `--${boundary}--`, '')
  try {
    const res = await fetch('/rest/support/createRequest/', {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; charset=UTF-8; boundary=${boundary}` },
      body: lines.join('\r\n'),
    })
    if (!res.ok) return false
    const data = await res.json().catch(() => null)
    return !(data && typeof data === 'object' && 'errorMessage' in data)
  } catch {
    return false
  }
}

// --- Módulos: los que se pueden descargar, instalar y quitar

export const getInstallable = (signal?: AbortSignal) => get<BibleModule[]>('module/getAllInstallableModules/-1/BIBLE,COMMENTARY', signal)

export const installModule = (initials: string) => fetch(`/rest/setup/installBible/-1/${encodeURIComponent(initials)}`).then(() => undefined)

/** Avance de una instalación, de 0 a 1. */
export const getInstallProgress = (initials: string) =>
  fetch(`/rest/setup/getProgressOnInstallation/${encodeURIComponent(initials)}`)
    .then((r) => r.json())
    .then((value) => Number(Array.isArray(value) ? value[0] : value) || 0)
    .catch(() => 0)

export const removeModule = (initials: string) => fetch(`/rest/setup/removeModule/${encodeURIComponent(initials)}`).then(() => undefined)

export const getWordInfo = (version: string, verse: string, strong: string, morph = '', signal?: AbortSignal) =>
  get<WordInfo>(
    `module/getInfo/${encodeURIComponent(version)}/${verse}/${encodeURIComponent(strong)}/${encodeURIComponent(morph)}/${LANG}`,
    signal,
  )

/** Primera referencia de una lista del motor ("Luke.2.14+Rom.5.8", "John.3.1-John.3.5"). */
export function firstReference(reference: string): { book: string; chapter: number; osisId?: string } | null {
  const [book, chapter, verse] = reference.split(/[+\-,; ]/)[0].split('.')
  if (!book || !Number(chapter)) return null
  return { book, chapter: Number(chapter), osisId: verse ? `${book}.${chapter}.${verse}` : undefined }
}

// --- El motor devuelve el pasaje ya maquetado en HTML; aquí se reduce a bloques, versículos y palabras.

function parseBlocks(html: string): Block[] {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const holder = doc.querySelector('.passageContentHolder') ?? doc.body
  const margin = Array.from(holder.querySelectorAll('.notesPane .margin')).map((el) => ({
    label: el.querySelector('.sideNote')?.textContent?.trim() ?? '',
    parts: parseParts(el),
  }))
  const blocks: Block[] = []
  let cursor = 0

  const crossReference = (label: string): Note | null => {
    const index = margin.findIndex((m, i) => i >= cursor && m.label === label)
    if (index < 0) return null
    cursor = index + 1
    return { kind: 'xref', label, parts: margin[index].parts }
  }

  const collect = (node: Node, items: Inline[], red = false) => {
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        items.push({ text: child.textContent ?? '', red: red || undefined })
        return
      }
      if (!(child instanceof Element) || child.matches('a.verseLink, .inlineNote')) return
      if (/^H[1-6]$/.test(child.tagName)) {
        blocks.push({ type: 'heading', text: clean(child.textContent) })
        return
      }
      if (child.matches('sup.note, .note')) {
        const inline = child.querySelector('.inlineNote')
        const label = child.querySelector('a')?.textContent?.trim() ?? ''
        const note = inline ? { kind: 'note' as const, label: '*', parts: parseParts(inline) } : crossReference(label)
        if (note && note.parts.length > 0) items.push({ note })
        return
      }
      const strong = child.getAttribute('strong')
      if (strong) {
        items.push({
          text: child.textContent ?? '',
          strong: strong.trim(),
          morph: child.getAttribute('morph') ?? undefined,
          red: red || child.matches('.jesus') || undefined,
        })
      } else {
        collect(child, items, red || child.matches('.jesus'))
      }
    })
  }

  const pushVerse = (osisId: string, label: string, items: Inline[]) => {
    blocks.push({ type: 'verse', verse: { osisId, number: osisId.split('.').pop() ?? '', label, items: mergeText(items) } })
  }

  const interlinear = (container: Element) => {
    let osisId = ''
    let items: Inline[] = []
    const flush = () => {
      if (osisId) pushVerse(osisId, osisId, items)
      items = []
    }
    container.querySelectorAll(':scope .w').forEach((unit) => {
      if (unit.classList.contains('verseStart')) {
        flush()
        osisId = unit.querySelector('a.verseLink')?.getAttribute('name') ?? ''
        return
      }
      const [text, ...lines] = Array.from(unit.children).map((c) => clean(c.textContent))
      if (!text && lines.every((l) => !l)) return
      items.push({
        text: `${text} `,
        strong: unit.getAttribute('strong')?.trim() || undefined,
        morph: unit.getAttribute('morph') || undefined,
        lines,
      })
    })
    flush()
  }

  const walk = (node: Element) => {
    Array.from(node.children).forEach((child) => {
      if (child.matches('.notesPane, .xgen, script, style')) return
      if (child.matches('.interlinear')) return interlinear(child)
      if (child.matches('.verse')) {
        // collect() deja delante del versículo los encabezados que venían dentro de él
        const items: Inline[] = []
        collect(child, items)
        const osisId = child.querySelector('a.verseLink')?.getAttribute('name') ?? ''
        pushVerse(osisId, clean(child.querySelector('.verseNumber')?.textContent), items)
        return
      }
      if (/^H[1-6]$/.test(child.tagName)) {
        const text = clean(child.textContent)
        if (text) blocks.push({ type: 'heading', text })
        return
      }
      if (child.tagName === 'P' || child.tagName === 'BR') blocks.push({ type: 'break' })
      walk(child)
    })
  }

  walk(holder)
  return blocks
}

const letters = (text: string) => text.replace(/\s/g, '').length

/** Copia la marca de "palabras de Jesús" de un pasaje a otro con el mismo texto, letra a letra. */
function applyRed(target: Block[], source: Block[]) {
  const flags = new Map<string, boolean[]>()
  for (const block of source) {
    if (block.type !== 'verse') continue
    flags.set(
      block.verse.osisId,
      block.verse.items.filter(isToken).flatMap((t) => Array<boolean>(letters(t.text)).fill(!!t.red)),
    )
  }
  for (const block of target) {
    if (block.type !== 'verse') continue
    const tokens = block.verse.items.filter(isToken)
    const verse = flags.get(block.verse.osisId)
    if (!verse || !verse.includes(true) || verse.length !== tokens.reduce((n, t) => n + letters(t.text), 0)) continue
    let index = 0
    for (const token of tokens) {
      const length = letters(token.text)
      if (length > 0 && verse[index]) token.red = true
      index += length
    }
  }
}

function parseParts(root: Element): NotePart[] {
  const parts: NotePart[] = []
  const walk = (node: Node) => {
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        if (child.textContent) parts.push({ text: child.textContent })
        return
      }
      if (!(child instanceof Element) || child.matches('.sideNote')) return
      const href = child.getAttribute('href') ?? ''
      const reference = /reference=([^&|]+)/.exec(href)?.[1]
      if (reference) parts.push({ text: child.textContent ?? '', reference: decodeURIComponent(reference) })
      else walk(child)
    })
  }
  walk(root)
  return parts
}

const clean = (text: string | null | undefined) => (text ?? '').replace(/[\s‏]+/g, ' ').trim()

function mergeText(items: Inline[]): Inline[] {
  const merged: Inline[] = []
  for (const item of items) {
    if (!isToken(item)) {
      merged.push(item)
      continue
    }
    const text = item.text.replace(/\s+/g, ' ')
    const last = merged[merged.length - 1]
    if (!item.strong && !item.lines && last && isToken(last) && !last.strong && !last.lines && !last.red === !item.red) {
      last.text = (last.text + text).replace(/\s+/g, ' ')
    } else {
      merged.push({ ...item, text })
    }
  }
  return merged.filter((item) => !isToken(item) || item.text !== '')
}
