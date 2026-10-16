import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import {
  SEARCH_KINDS,
  firstReference,
  getBooks,
  getDiff,
  getModules,
  getPassage,
  getSuggestions,
  isToken,
  type BibleModule,
  type Book,
  type DiffVerse,
  type Passage,
  type SearchKind,
  type Suggestion,
  type TextMatch,
} from './api'
import { LANG, LANGUAGES, setLanguage } from './i18n'
import { CHAPTERS, FIRST_NT_BOOK } from './books'
import { NotePanel, VersePanel, WordPanel } from './Panels'
import { Reader, type Layout } from './Reader'
import { Colors, Feedback } from './Dialogs'
import { Help, StatsPanel } from './Extras'
import { SearchView } from './SearchView'
import { Versions } from './Versions'
import {
  COMPARE_LABELS,
  DEFAULT_PREFS,
  PANE,
  formatReference,
  optionLetters,
  resolveBook,
  lemmas,
  load,
  save,
  type CompareMode,
  type Location,
  type Panel,
  type Prefs,
  type Query,
  type Visit,
} from './types'

const DEFAULT_VERSION = 'SpaRV1909'
const DEFAULT_LOCATION: Location = { book: 'John', chapter: 3 }
const HISTORY_LENGTH = 20

const PREF_GROUPS: [string, [keyof Prefs, string][]][] = [
  [
    'Lectura',
    [
      ['headings', 'Encabezados de sección'],
      ['verseNumbers', 'Números de versículo'],
      ['lines', 'Un versículo por línea'],
      ['notes', 'Notas y referencias cruzadas'],
      ['redLetters', 'Palabras de Jesús en rojo'],
      ['grammarColors', 'Colores por gramática'],
      ['dyslexia', 'Letra más legible para dislexia'],
    ],
  ],
  [
    'Interlineal',
    [
      ['interlinear', 'Original, transliteración y glosa'],
      ['glossEnglish', 'Añadir la glosa en inglés'],
      ['glossChinese', 'Añadir la glosa en chino'],
      ['grammarLine', 'Añadir la gramática'],
    ],
  ],
  [
    'Griego y hebreo',
    [
      ['greekAccents', 'Acentos griegos'],
      ['hebrewVowels', 'Vocales hebreas'],
      ['divideHebrew', 'Separar las partes de las palabras hebreas'],
      ['transliterateOriginal', 'Transliteración bajo el original'],
    ],
  ],
]

// Cuántas sugerencias de cada tipo se muestran, y en qué orden.
const SUGGESTION_QUOTA: [Suggestion['type'], number][] = [
  ['Pasaje', 5],
  ['En el texto', 1],
  ['Tema', 2],
  ['Significado', 3],
  ['Griego', 3],
  ['Hebreo', 3],
]

const INTERLINEAR_EXTRAS: (keyof Prefs)[] = ['glossEnglish', 'glossChinese', 'grammarLine']

interface Place {
  location: Location
  osisId?: string
}

/**
 * Lo que el usuario escribe como pasaje: "juan 3:16", "1 cor 13", "Sal 23",
 * o varios tramos como "Juan 3:16-18; Romanos 8:28". Devuelve null si no nombra un libro conocido.
 */
function matchReference(input: string, books: Book[]): Place | null {
  let book: string | null = null
  const parts: { book: string; chapter: number; from?: string; to?: string }[] = []
  for (const piece of input.split(';')) {
    const match = /^\s*(.*?)\s*(\d+)(?:\s*[:.,]\s*(\d+)(?:\s*-\s*(\d+))?)?\s*$/.exec(piece)
    if (!match) return null
    book = match[1] ? resolveBook(match[1], books) : book
    const chapter = Number(match[2])
    if (!book || chapter < 1 || chapter > (CHAPTERS[book] ?? 0)) return null
    parts.push({ book, chapter, from: match[3], to: match[4] })
  }
  const [first] = parts
  if (!first) return null
  const location: Location = { book: first.book, chapter: first.chapter }
  if (parts.length === 1 && !first.to) {
    return { location, osisId: first.from ? `${first.book}.${first.chapter}.${first.from}` : undefined }
  }
  const osis = ({ book: b, chapter, from, to }: (typeof parts)[number]) =>
    !from ? `${b}.${chapter}` : to ? `${b}.${chapter}.${from}-${b}.${chapter}.${to}` : `${b}.${chapter}.${from}`
  return { location: { ...location, range: parts.map(osis).join(';') } }
}

// --- Dirección: cada pasaje y cada búsqueda tienen la suya, para poder compartirlos y volver atrás.

interface Route {
  location?: Location
  verse?: string
  versions?: string[]
  compare?: CompareMode
  query?: Query | null
}

function parseHash(hash: string): Route {
  const [path, search = ''] = hash.replace(/^#\/?/, '').split('?')
  const params = new URLSearchParams(search)
  const route: Route = {}
  const versions = params.get('v')?.split(',').filter(Boolean)
  if (versions?.length) route.versions = versions
  const compare = params.get('c')
  if (COMPARE_LABELS.some(([mode]) => mode === compare)) route.compare = compare as CompareMode
  const [first, kind, ...rest] = path.split('/')
  if (first === 'buscar' && SEARCH_KINDS.includes(kind as SearchKind) && rest.length) {
    route.query = {
      kind: kind as SearchKind,
      text: decodeURIComponent(rest.join('/')),
      label: params.get('l') ?? undefined,
      scope: params.get('s') ?? undefined,
      match: (params.get('m') as TextMatch | null) ?? undefined,
      context: Number(params.get('x')) || undefined,
      filter: params.get('f') ?? undefined,
      sort: (params.get('o') as Query['sort'] | null) ?? undefined,
      extra: params.getAll('y').map((text) => ({ kind: 'text' as const, text })),
    }
    if (route.query.extra?.length === 0) delete route.query.extra
    return route
  }
  const reference = decodeURIComponent(first ?? '')
  const target = reference ? firstReference(reference) : null
  if (target && target.book in CHAPTERS) {
    // un tramo o varios se abren tal cual; un versículo suelto abre su capítulo y lo señala
    const range = /[-;]/.test(reference) ? reference : undefined
    route.location = { book: target.book, chapter: target.chapter, range }
    route.verse = range ? undefined : target.osisId
    route.query = null
  }
  return route
}

function buildHash(location: Location, versions: string[], compare: CompareMode, query: Query | null): string {
  const params = new URLSearchParams({ v: versions.join(',') })
  if (versions.length > 1 && compare !== 'columns') params.set('c', compare)
  if (query?.label) params.set('l', query.label)
  if (query?.scope) params.set('s', query.scope)
  if (query?.match && query.match !== 'all') params.set('m', query.match)
  if (query?.context) params.set('x', String(query.context))
  if (query?.filter) params.set('f', query.filter)
  if (query?.sort) params.set('o', query.sort)
  for (const term of query?.extra ?? []) params.append('y', term.text)
  const path = query ? `buscar/${query.kind}/${encodeURIComponent(query.text)}` : (location.range ?? `${location.book}.${location.chapter}`)
  return `#/${path}?${params.toString().replace(/%2C/g, ',')}`
}

interface Loaded {
  layout: Layout
  versions: string[]
  passages: Passage[]
  diff: DiffVerse[]
}

const EMPTY: Loaded = { layout: 'single', versions: [], passages: [], diff: [] }

export function App() {
  const initial = useMemo(() => parseHash(window.location.hash), [])
  const [modules, setModules] = useState<BibleModule[]>([])
  const [books, setBooks] = useState<Book[]>([])
  const [versions, setVersions] = useState<string[]>(
    () => initial.versions ?? load<string[] | null>('versions', null) ?? [load('version', DEFAULT_VERSION)],
  )
  const [compare, setCompare] = useState<CompareMode>(() => initial.compare ?? load<CompareMode>('compare', 'columns'))
  const [location, setLocation] = useState(() => initial.location ?? load('location', DEFAULT_LOCATION))
  const [query, setQuery] = useState<Query | null>(initial.query ?? null)
  const [focusVerse, setFocusVerse] = useState<string | null>(initial.verse ?? null)
  const [prefs, setPrefs] = useState(() => ({ ...DEFAULT_PREFS, ...load<Partial<Prefs>>('prefs', {}) }))
  const [commentary, setCommentary] = useState(() => load('commentary', ''))
  const [dark, setDark] = useState(() => load('dark', window.matchMedia('(prefers-color-scheme: dark)').matches))
  const [visits, setVisits] = useState(() => load<Visit[]>('visits', []))
  const [bookmarks, setBookmarks] = useState(() => load<Visit[]>('bookmarks', []))
  const [searches, setSearches] = useState(() => load<Query[]>('searches', []))
  const [helping, setHelping] = useState(false)
  const [coloring, setColoring] = useState(false)
  const [writing, setWriting] = useState(false)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [suggesting, setSuggesting] = useState(false)
  const [loaded, setLoaded] = useState<Loaded>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [panel, setPanel] = useState<Panel | null>(null)
  const [picking, setPicking] = useState(false)
  const [choosing, setChoosing] = useState(false)
  const [draft, setDraft] = useState('')

  const version = versions[0]
  const commentaries = useMemo(() => modules.filter((m) => m.category === 'COMMENTARY'), [modules])
  const reference = location.range ?? `${location.book}.${location.chapter}`
  const letters = optionLetters(prefs, prefs.interlinear)
  const plainLetters = optionLetters(prefs, false)
  const versionsKey = versions.join(',')
  // versiones abiertas que traen marcadas las palabras de Jesús
  const redKey = versions.filter((v) => modules.find((m) => m.initials === v)?.hasRedLetter).join(',')

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    save('dark', dark)
  }, [dark])

  useEffect(() => {
    const controller = new AbortController()
    getModules(controller.signal).then(setModules).catch(() => {})
    return () => controller.abort()
  }, [attempt])

  useEffect(() => {
    const controller = new AbortController()
    getBooks(version, controller.signal)
      .then((all) => setBooks(all.filter((b) => b.osisID in CHAPTERS)))
      .catch(() => {})
    return () => controller.abort()
  }, [version, attempt])

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    const all = versionsKey.split(',')
    const [main, ...others] = all
    const mode = others.length === 0 ? 'single' : compare
    const red = (v: string) => prefs.redLetters && redKey.split(',').includes(v)
    setLoading(true)
    setError('')

    const request: Promise<Loaded> =
      mode === 'single'
        ? getPassage(main, reference, { letters, red: red(main) }, signal).then((p) => ({ ...EMPTY, versions: [main], passages: [p] }))
        : mode === 'interlinear'
          ? getPassage(main, reference, { under: others }, signal).then((p) => ({ ...EMPTY, versions: [main], passages: [p] }))
          : mode === 'diff' || mode === 'diffcolumns'
            ? Promise.all([getPassage(main, reference, {}, signal), getDiff(all, reference, signal)]).then(([p, diff]) => ({
                layout: mode,
                versions: all,
                passages: [p],
                diff,
              }))
            : Promise.all(all.map((v) => getPassage(v, reference, { letters: plainLetters, red: red(v) }, signal))).then((passages) => ({
                layout: mode,
                versions: all,
                passages,
                diff: [],
              }))

    request
      .then((result) => {
        setLoaded(result)
        setLoading(false)
      })
      .catch((e: Error) => {
        if (signal.aborted) return
        setError(e.message.startsWith('Failed to fetch') || e.message.includes('500') ? 'offline' : e.message)
        setLoading(false)
      })
    return () => controller.abort()
  }, [versionsKey, compare, reference, letters, plainLetters, prefs.redLetters, redKey, attempt])

  useEffect(() => {
    if (!focusVerse) window.scrollTo({ top: 0 })
    const chapter = `${location.book}.${location.chapter}`
    setVisits((prev) => [{ osisId: chapter, at: Date.now() }, ...prev.filter((v) => v.osisId !== chapter)].slice(0, HISTORY_LENGTH))
    // solo al cambiar de capítulo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reference])

  // un panel de lectura no pisa el lugar ni las versiones que guardó la ventana principal
  useEffect(() => {
    if (PANE === null) save('versions', versions)
  }, [versions])
  useEffect(() => {
    if (PANE === null) save('compare', compare)
  }, [compare])
  useEffect(() => {
    if (PANE === null) save('location', location)
  }, [location])
  useEffect(() => save('searches', searches), [searches])
  useEffect(() => {
    if (!query) return
    const same = (q: Query) => q.kind === query.kind && q.text === query.text
    setSearches((prev) => [query, ...prev.filter((q) => !same(q))].slice(0, 12))
  }, [query])
  useEffect(() => save('prefs', prefs), [prefs])
  useEffect(() => save('commentary', commentary), [commentary])
  useEffect(() => save('visits', visits), [visits])
  useEffect(() => save('bookmarks', bookmarks), [bookmarks])

  // La dirección sigue al estado, y Atrás/Adelante devuelven el estado a la dirección.
  const firstHash = useRef(true)
  useEffect(() => {
    const next = buildHash(location, versions, compare, query)
    if (window.location.hash !== next) {
      if (firstHash.current) window.history.replaceState(null, '', next)
      else window.history.pushState(null, '', next)
    }
    firstHash.current = false
    if (PANE !== null) window.parent.postMessage({ lumbreraPane: Number(PANE), hash: next }, window.location.origin)
  }, [location, versions, compare, query])

  useEffect(() => {
    const onNavigate = () => {
      const route = parseHash(window.location.hash)
      setPanel(null)
      if (route.versions) setVersions(route.versions)
      setCompare(route.compare ?? 'columns')
      if (route.location) setLocation(route.location)
      setFocusVerse(route.verse ?? null)
      setQuery(route.query ?? null)
    }
    window.addEventListener('popstate', onNavigate)
    return () => window.removeEventListener('popstate', onNavigate)
  }, [])

  useEffect(() => {
    if (commentaries.length === 0 || commentaries.some((c) => c.initials === commentary)) return
    setCommentary((commentaries.find((c) => c.initials === 'MHC') ?? commentaries[0]).initials)
  }, [commentaries, commentary])

  const bookName = useCallback((osis: string) => books.find((b) => b.osisID === osis)?.fullName ?? osis, [books])
  const format = useCallback((osisId: string) => formatReference(osisId, bookName), [bookName])
  const versionName = (initials: string) => modules.find((m) => m.initials === initials)?.shortInitials ?? initials
  const tagged = modules.find((m) => m.initials === version)?.hasStrongs ?? true

  const go = (next: Location, osisId?: string) => {
    setPanel(null)
    setQuery(null)
    setFocusVerse(osisId ?? null)
    setLocation(next)
  }
  const goToReference = (ref?: string) => {
    const target = ref ? firstReference(ref) : null
    if (target && target.book in CHAPTERS) go({ book: target.book, chapter: target.chapter }, target.osisId)
  }
  const clearFocus = useCallback(() => setFocusVerse(null), [])
  const closePanel = useCallback(() => setPanel(null), [])

  // Sugerencias del motor mientras se escribe, con una pausa para no pedir en cada tecla.
  useEffect(() => {
    const term = draft.trim()
    if (term.length < 2) {
      setSuggestions([])
      return
    }
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      getSuggestions(versions[0], term, controller.signal)
        .then((found) => setSuggestions(SUGGESTION_QUOTA.flatMap(([type, max]) => found.filter((s) => s.type === type).slice(0, max))))
        .catch(() => {})
    }, 250)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, versions[0]])

  const choose = (suggestion: Suggestion) => {
    setDraft('')
    setSuggesting(false)
    if (suggestion.reference) {
      const target = firstReference(suggestion.reference)
      if (target && target.book in CHAPTERS) go({ book: target.book, chapter: target.chapter }, target.osisId)
      else if (suggestion.reference in CHAPTERS) go({ book: suggestion.reference, chapter: 1 })
    } else if (suggestion.search) {
      openSearch(suggestion.search)
    }
  }

  /** Lo escrito en el buscador: un pasaje si nombra un libro, y si no una búsqueda en el texto. */
  const run = (input: string) => {
    const text = input.trim()
    if (!text) return
    const place = matchReference(text, books)
    if (place) go(place.location, place.osisId)
    else {
      setPanel(null)
      setQuery({ kind: 'text', text })
    }
  }
  const submitSearch = (e: FormEvent) => {
    e.preventDefault()
    run(draft)
    setDraft('')
  }
  const addPane = () => {
    const hash = window.location.hash
    save('panes', [hash, hash])
    window.location.reload()
  }

  const openSearch = (q: Query) => {
    setPanel(null)
    setQuery(q)
    window.scrollTo({ top: 0 })
  }

  const toggleBookmark = (osisId: string) =>
    setBookmarks((prev) => (prev.some((b) => b.osisId === osisId) ? prev.filter((b) => b.osisId !== osisId) : [{ osisId, at: Date.now() }, ...prev]))

  const selection = panel?.type === 'word' ? panel.selection : null
  const litLemmas = selection ? lemmas(selection.strong) : []
  const occurrences = selection
    ? (loaded.passages[Math.max(0, loaded.versions.indexOf(selection.version))]?.verses ?? []).reduce(
        (n, v) => n + v.items.filter((t) => isToken(t) && t.strong && lemmas(t.strong).some((l) => litLemmas.includes(l))).length,
        0,
      )
    : 0
  const first = loaded.passages[0]
  const chapterName = location.range ? (first?.title ?? '') : `${bookName(location.book)} ${location.chapter}`
  return (
    <div
      className={[
        'shell',
        panel && 'shell-with-panel',
        prefs.dyslexia && 'shell-dyslexia',
        prefs.grammarNouns === 'case' && 'shell-case',
        !prefs.grammarVerbs && 'shell-no-verbs',
        !prefs.grammarNounsOn && 'shell-no-nouns',
      ]
        .filter(Boolean)
        .join(' ')}
      style={
        {
          '--scale': prefs.fontSize / 100,
          ...Object.fromEntries(Object.entries(prefs.grammarPalette).map(([name, color]) => [`--g-${name}`, color])),
        } as React.CSSProperties
      }>
      <header className="bar">
        {PANE === null && <span className="wordmark">Lumbrera</span>}
        <button className="place" onClick={() => setPicking(true)} aria-haspopup="dialog">
          {chapterName}
        </button>
        <form className="finder" role="search" onSubmit={submitSearch}>
          <input
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value)
              setSuggesting(true)
            }}
            onFocus={() => setSuggesting(true)}
            // el retraso deja que el clic sobre una sugerencia llegue antes de cerrarlas
            onBlur={() => window.setTimeout(() => setSuggesting(false), 150)}
            onKeyDown={(e) => e.key === 'Escape' && setSuggesting(false)}
            placeholder="Busca una palabra o escribe un pasaje"
            aria-label="Buscar una palabra o ir a un pasaje"
            aria-autocomplete="list"
            autoComplete="off"
          />
          {suggesting && suggestions.length > 0 && (
            <ul className="suggestions" aria-label="Sugerencias">
              {suggestions.map((suggestion, i) => (
                <li key={i}>
                  <button type="button" className="suggestion" onMouseDown={(e) => e.preventDefault()} onClick={() => choose(suggestion)}>
                    <span className="suggestion-type">{suggestion.type}</span>
                    <span className="suggestion-label" lang={suggestion.type === 'Hebreo' ? 'he' : suggestion.type === 'Griego' ? 'grc' : undefined}>
                      {suggestion.label}
                    </span>
                    {suggestion.detail && <span className="suggestion-detail">{suggestion.detail}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </form>
        <div className="bar-controls">
          <button className="place" onClick={() => setChoosing(true)} aria-haspopup="dialog">
            {versions.map(versionName).join(' + ')}
          </button>

          <Menu label="Vista">
            {PREF_GROUPS.map(([group, items]) => (
              <div key={group}>
                <p className="menu-title">{group}</p>
                {items.map(([key, label]) => {
                  // con varias versiones cada versículo ocupa su fila y el interlineal lo decide el modo de comparación
                  const fixed =
                    (versions.length > 1 && (key === 'lines' || key === 'interlinear')) ||
                    (INTERLINEAR_EXTRAS.includes(key) && (!prefs.interlinear || versions.length > 1))
                  return (
                    <label key={key} className={fixed ? 'check check-off' : 'check'}>
                      <input
                        type="checkbox"
                        disabled={fixed}
                        checked={fixed ? key === 'lines' : (prefs[key] as boolean)}
                        onChange={(e) => setPrefs({ ...prefs, [key]: e.target.checked })}
                      />
                      {label}
                    </label>
                  )
                })}
              </div>
            ))}
            <label className={prefs.grammarColors ? 'select menu-select' : 'select menu-select check-off'}>
              <span>Subrayar los nombres según</span>
              <select
                value={prefs.grammarNouns}
                disabled={!prefs.grammarColors}
                onChange={(e) => setPrefs({ ...prefs, grammarNouns: e.target.value as Prefs['grammarNouns'] })}
              >
                <option value="gender">Su género</option>
                <option value="case">Su caso (solo en griego)</option>
              </select>
            </label>
            <button className="menu-link" disabled={!prefs.grammarColors} onClick={() => setColoring(true)}>
              Elegir los colores…
            </button>
            <label className="slider">
              <span>Tamaño del texto</span>
              <input
                type="range"
                min={80}
                max={160}
                step={10}
                value={prefs.fontSize}
                onChange={(e) => setPrefs({ ...prefs, fontSize: Number(e.target.value) })}
              />
              <span className="slider-value">{prefs.fontSize} %</span>
            </label>
          </Menu>

          <Menu label="Historial">
            <p className="menu-title">Marcadores</p>
            {bookmarks.length === 0 && <p className="menu-empty">Pulsa un número de versículo y guarda un marcador para verlo aquí.</p>}
            <div className="menu-scroll">
              {bookmarks.map((b) => (
                <div className="menu-row" key={b.osisId}>
                  <button className="menu-link" onClick={() => goToReference(b.osisId)}>
                    {format(b.osisId)}
                  </button>
                  <button className="ghost" onClick={() => toggleBookmark(b.osisId)} aria-label={`Quitar el marcador de ${format(b.osisId)}`}>
                    Quitar
                  </button>
                </div>
              ))}
            </div>
            {searches.length > 0 && (
              <>
                <p className="menu-title">Búsquedas recientes</p>
                <div className="menu-scroll">
                  {searches.map((q, i) => (
                    <button className="menu-link" key={i} onClick={() => openSearch(q)}>
                      {q.label ?? `«${q.text}»`}
                    </button>
                  ))}
                </div>
              </>
            )}
            <p className="menu-title">Leído hace poco</p>
            <div className="menu-scroll">
              {visits
                .filter((v) => v.osisId !== reference)
                .map((v) => (
                  <button className="menu-link" key={v.osisId} onClick={() => goToReference(v.osisId)}>
                    {format(v.osisId)}
                  </button>
                ))}
            </div>
          </Menu>

          <Menu label="Más">
            <button className="menu-link" onClick={() => setPanel({ type: 'stats' })} disabled={!!query}>
              Vocabulario y temas de este pasaje
            </button>
            {PANE === null && (
              <button className="menu-link" onClick={addPane}>
                Abrir otro panel de lectura
              </button>
            )}
            <button className="menu-link" onClick={() => setHelping(true)}>
              Cómo usar Lumbrera
            </button>
            <button className="menu-link" onClick={() => setWriting(true)}>
              Escribir al equipo de STEPBible
            </button>
            <p className="menu-title">Idioma</p>
            {LANGUAGES.map(([code, name]) => (
              <label key={code} className="check">
                <input type="radio" name="language" checked={LANG === code} onChange={() => setLanguage(code)} />
                <span lang={code}>{name}</span>
              </label>
            ))}
          </Menu>

          <button className="ghost" onClick={() => setDark(!dark)}>
            {dark ? 'Modo claro' : 'Modo oscuro'}
          </button>
        </div>
      </header>

      <main className={query ? 'reader reader-search' : 'reader'}>
        {query ? (
          <SearchView
            version={version}
            versionName={versionName(version)}
            query={query}
            book={{ osis: location.book, name: bookName(location.book) }}
            books={books}
            onQuery={setQuery}
            onOpen={(osisId) => goToReference(osisId)}
            onWord={(s) => setPanel({ type: 'word', selection: s })}
            onClose={() => setQuery(null)}
          />
        ) : (
          <>
            <h1 className="chapter-title">
              <span className="chapter-book">{location.range ? chapterName : bookName(location.book)}</span>
              {!location.range && <span className="chapter-number">{location.chapter}</span>}
            </h1>

            {error === 'offline' ? (
              <div className="notice">
                <p>No se pudo conectar con STEPBible. Ábrelo en este equipo y vuelve a intentarlo.</p>
                <button className="solid" onClick={() => setAttempt(attempt + 1)}>
                  Reintentar
                </button>
              </div>
            ) : error ? (
              <div className="notice">
                <p>{error}</p>
              </div>
            ) : (
              <>
                {!panel && !loading && (
                  <p className="hint">
                    {tagged
                      ? 'Pulsa una palabra para ver el original, o un número de versículo para leer los comentarios.'
                      : 'Esta versión no enlaza sus palabras con el original. Elige otra para estudiarlas.'}
                  </p>
                )}
                {prefs.grammarColors && (
                  <p className="legend">
                    <span>Verbos por tiempo:</span> <span className="g-verb g-P">presente</span>, <span className="g-verb g-I">imperfecto</span>,{' '}
                    <span className="g-verb g-F">futuro</span>, <span className="g-verb g-A">aoristo</span>,{' '}
                    <span className="g-verb g-R">perfecto</span>, <span className="g-verb g-L">pluscuamperfecto</span>; <span>en cursiva los</span>{' '}
                    <span className="g-verb g-T">participios</span>, <span className="g-verb g-N">infinitivos</span> <span>e</span>{' '}
                    <span className="g-verb g-M">imperativos</span>.{' '}
                    {prefs.grammarNouns === 'case' ? (
                      <>
                        <span>Nombres subrayados según su caso:</span> <span className="g-noun g-cN">nominativo</span>,{' '}
                        <span className="g-noun g-cG">genitivo</span>, <span className="g-noun g-cD">dativo</span>,{' '}
                        <span className="g-noun g-cA">acusativo</span>, <span className="g-noun g-cV">vocativo</span>;
                      </>
                    ) : (
                      <>
                        <span>Nombres subrayados según su género:</span> <span className="g-noun g-m">masculino</span>,{' '}
                        <span className="g-noun g-f">femenino</span>, <span className="g-noun g-n">neutro o común</span>;
                      </>
                    )}{' '}
                    <span>con doble línea en</span> <span className="g-noun g-n g-pl">plural</span>.{' '}
                    <span>Solo en versiones con gramática.</span>
                  </p>
                )}
                <Reader
                  passages={loaded.passages}
                  versions={loaded.versions}
                  layout={loaded.layout}
                  diff={loaded.diff}
                  modules={modules}
                  prefs={prefs}
                  loading={loading}
                  litLemmas={litLemmas}
                  selection={selection}
                  focusVerse={focusVerse}
                  onFocused={clearFocus}
                  onWord={(s) => setPanel({ type: 'word', selection: s })}
                  onNote={(note, osisId) => setPanel({ type: 'note', note, osisId })}
                  onVerse={(osisId) => setPanel({ type: 'verse', osisId })}
                />
                {!loading && first && (
                  <nav className="pager" aria-label="Capítulos">
                    <button className="ghost" disabled={!first.previous} onClick={() => goToReference(first.previous)}>
                      Capítulo anterior
                    </button>
                    <button className="ghost" disabled={!first.next} onClick={() => goToReference(first.next)}>
                      Capítulo siguiente
                    </button>
                  </nav>
                )}
              </>
            )}
          </>
        )}
      </main>

      {panel?.type === 'word' && (
        <WordPanel
          selection={panel.selection}
          occurrences={occurrences}
          place={chapterName}
          onSelect={(s) => setPanel({ type: 'word', selection: s })}
          onSearch={openSearch}
          onClose={closePanel}
        />
      )}
      {panel?.type === 'note' && (
        <NotePanel
          note={panel.note}
          version={version}
          place={format(panel.osisId)}
          formatReference={format}
          onReference={goToReference}
          onClose={closePanel}
        />
      )}
      {panel?.type === 'verse' && (
        <VersePanel
          osisId={panel.osisId}
          place={format(panel.osisId)}
          verses={first?.verses ?? []}
          version={version}
          versionName={versionName(version)}
          onSelect={(s) => setPanel({ type: 'word', selection: s })}
          bookmarked={bookmarks.some((b) => b.osisId === panel.osisId)}
          onBookmark={() => toggleBookmark(panel.osisId)}
          onSearch={openSearch}
          commentaries={commentaries}
          commentary={commentary}
          onCommentary={setCommentary}
          onReference={goToReference}
          onClose={closePanel}
        />
      )}

      {panel?.type === 'stats' && (
        <StatsPanel
          version={version}
          reference={reference}
          place={chapterName}
          passage={first}
          onSelect={(s) => setPanel({ type: 'word', selection: s })}
          onSearch={openSearch}
          onClose={closePanel}
        />
      )}

      {coloring && <Colors prefs={prefs} onChange={setPrefs} onClose={() => setColoring(false)} />}
      {writing && <Feedback place={chapterName} onClose={() => setWriting(false)} />}
      {helping && <Help onRun={run} onClose={() => setHelping(false)} />}

      {choosing && (
        <Versions
          modules={modules}
          onChanged={() => setAttempt((n) => n + 1)}
          versions={versions}
          compare={compare}
          onVersions={setVersions}
          onCompare={setCompare}
          onClose={() => setChoosing(false)}
        />
      )}

      {picking && (
        <Picker
          books={books}
          current={location}
          onPick={(next) => {
            go(next)
            setPicking(false)
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  )
}

function Menu({ label, children }: { label: string; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null)

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current?.open && !ref.current.contains(e.target as Node)) ref.current.open = false
    }
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [])

  return (
    <details className="menu" ref={ref}>
      <summary className="ghost">{label}</summary>
      {/* elegir una acción del menú lo cierra; las casillas y deslizadores lo dejan abierto */}
      <div
        className="menu-body"
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('.menu-link') && ref.current) ref.current.open = false
        }}
      >
        {children}
      </div>
    </details>
  )
}

function Picker({ books, current, onPick, onClose }: { books: Book[]; current: Location; onPick: (l: Location) => void; onClose: () => void }) {
  const [book, setBook] = useState(current.book)
  const ref = useRef<HTMLDialogElement>(null)
  const split = books.findIndex((b) => b.osisID === FIRST_NT_BOOK)
  const testaments = [
    { name: 'Antiguo Testamento', books: split < 0 ? books : books.slice(0, split) },
    { name: 'Nuevo Testamento', books: split < 0 ? [] : books.slice(split) },
  ].filter((t) => t.books.length > 0)

  useEffect(() => {
    ref.current?.showModal()
  }, [])

  return (
    <dialog ref={ref} className="picker" onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}>
      <div className="picker-body">
        <div className="picker-books">
          {testaments.map((t) => (
            <section key={t.name}>
              <h2>{t.name}</h2>
              <div className="book-grid">
                {t.books.map((b) => (
                  <button key={b.osisID} className={b.osisID === book ? 'chip chip-on' : 'chip'} onClick={() => setBook(b.osisID)}>
                    {b.fullName}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
        <section className="picker-chapters">
          <h2>{books.find((b) => b.osisID === book)?.fullName ?? book}</h2>
          <div className="chapter-grid">
            {Array.from({ length: CHAPTERS[book] ?? 1 }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                className={book === current.book && n === current.chapter ? 'chip chip-on' : 'chip'}
                onClick={() => onPick({ book, chapter: n })}
              >
                {n}
              </button>
            ))}
          </div>
        </section>
      </div>
      <button className="ghost picker-close" onClick={onClose}>
        Cerrar
      </button>
    </dialog>
  )
}
