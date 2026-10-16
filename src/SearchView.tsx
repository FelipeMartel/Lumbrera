import { useEffect, useMemo, useState } from 'react'
import { getTopicVerses, search, type Book, type RelatedWord, type SearchGroup, type SearchKind, type TextMatch, type Topic } from './api'
import { VerseContent } from './Reader'
import { glossOf, lemma, resolveBook, type Query, type Selection } from './types'

interface Props {
  version: string
  versionName: string
  query: Query
  /** Libro abierto en la lectura, para poder limitar la búsqueda a él. */
  book: { osis: string; name: string }
  books: Book[]
  onQuery: (query: Query) => void
  onOpen: (osisId: string) => void
  onWord: (selection: Selection) => void
  onClose: () => void
}

// Las cuatro formas de buscar lo que el usuario ha escrito.
const TABS: [SearchKind, string][] = [
  ['text', 'En el texto'],
  ['meanings', 'Por significado original'],
  ['exactForm', 'Forma exacta en griego o hebreo'],
  ['nave', 'Por tema'],
  ['subject', 'En los encabezados'],
]

const MATCHES: [TextMatch, string][] = [
  ['all', 'Todas las palabras'],
  ['any', 'Cualquiera de las palabras'],
  ['phrase', 'La frase exacta'],
]

const ENGLISH_ONLY: SearchKind[] = ['meanings', 'nave', 'subject']

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function SearchView({ version, versionName, query, book, books, onQuery, onOpen, onWord, onClose }: Props) {
  const [also, setAlso] = useState('')
  const [bookList, setBookList] = useState('')
  const presets = ['Gen-Mal', 'Matt-Rev', book.osis]
  const custom = !!query.scope && !presets.includes(query.scope)
  const [choosingBooks, setChoosingBooks] = useState(custom)
  const nameOf = (osis: string) => books.find((b) => b.osisID === osis)?.fullName ?? osis

  const applyBooks = () => {
    const found = bookList.split(/[,;]/).flatMap((name) => resolveBook(name, books) ?? [])
    if (found.length > 0) onQuery({ ...query, scope: found.join(',') })
    setBookList('')
  }
  const addCondition = () => {
    const text = also.trim()
    if (text) onQuery({ ...query, extra: [...(query.extra ?? []), { kind: 'text', text }] })
    setAlso('')
  }
  const [results, setResults] = useState<SearchGroup[]>([])
  const [topics, setTopics] = useState<Topic[]>([])
  const [words, setWords] = useState<RelatedWord[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const key = JSON.stringify([version, query.kind, query.text, query.scope, query.match, query.context, query.filter, query.extra, query.sort])

  useEffect(() => {
    setResults([])
    setTopics([])
    setTotal(null)
    setPage(1)
  }, [key])

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    search(version, query, page, controller.signal)
      .then((found) => {
        setTotal(found.total)
        setResults((prev) => (page === 1 ? found.results : [...prev, ...found.results]))
        setTopics((prev) => (page === 1 ? found.topics : [...prev, ...found.topics]))
        // al filtrar por una palabra el motor ya no devuelve las demás: se conserva la lista completa
        if (!query.filter) setWords(found.words)
        setLoading(false)
      })
      .catch((e: Error) => {
        if (controller.signal.aborted) return
        setError(e.message)
        setLoading(false)
      })
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, page])

  const mark = useMemo(() => {
    if (query.kind !== 'text') return undefined
    // cada palabra del texto es un elemento aparte, así que una frase se resalta por sus palabras con peso
    const terms = query.text.split(/\s+/).filter((w) => w.length > (query.match === 'phrase' ? 2 : 1))
    return terms.length ? new RegExp(`(${terms.map(escape).join('|')})`, 'gi') : undefined
  }, [query])
  const litLemmas =
    query.kind === 'strong' ? [lemma(query.text)] : query.filter ? [lemma(query.filter)] : query.kind === 'meanings' ? words.map((w) => lemma(w.strongNumber)) : []

  const typed = TABS.some(([kind]) => kind === query.kind)
  const scoped = query.kind === 'text' || query.kind === 'strong' || query.kind === 'meanings'
  const shown = results.length + topics.length
  const noun = topics.length > 0 || query.kind === 'nave' || query.kind === 'topicref' ? ['tema', 'temas'] : query.kind === 'subject' ? ['encabezado', 'encabezados'] : ['versículo', 'versículos']

  return (
    <section className="search">
      <div className="search-head">
        <h1 className="search-title">{query.label ?? `«${query.text}»`}</h1>
        <button className="ghost" onClick={onClose}>
          Volver a la lectura
        </button>
      </div>

      {typed && (
        <div className="tabs" role="tablist" aria-label="Dónde buscar">
          {TABS.map(([kind, label]) => (
            <button
              key={kind}
              role="tab"
              aria-selected={query.kind === kind}
              className={query.kind === kind ? 'tab tab-on' : 'tab'}
              onClick={() => onQuery({ kind, text: query.text, scope: kind === 'text' || kind === 'meanings' ? query.scope : undefined })}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {scoped && (
        <div className="filters">
          <label className="select">
            <span>Dónde</span>
            <select
              value={choosingBooks ? 'custom' : (query.scope ?? '')}
              onChange={(e) => {
                setChoosingBooks(e.target.value === 'custom')
                if (e.target.value !== 'custom') onQuery({ ...query, scope: e.target.value || undefined })
              }}
            >
              <option value="">Toda la Biblia</option>
              <option value="Gen-Mal">Antiguo Testamento</option>
              <option value="Matt-Rev">Nuevo Testamento</option>
              <option value={book.osis}>Solo {book.name}</option>
              <option value="custom">Los libros que elija…</option>
            </select>
          </label>
          {choosingBooks && (
            <form
              className="inline-form"
              onSubmit={(e) => {
                e.preventDefault()
                applyBooks()
              }}
            >
              <input
                value={bookList}
                onChange={(e) => setBookList(e.target.value)}
                placeholder={custom ? query.scope!.split(',').map(nameOf).join(', ') : 'Romanos, Gálatas'}
                aria-label="Libros en los que buscar, separados por comas"
              />
              <button className="ghost outlined">Aplicar</button>
            </form>
          )}
          {(query.kind === 'strong' || query.kind === 'meanings') && (
            <label className="select">
              <span>Orden</span>
              <select value={query.sort ?? ''} onChange={(e) => onQuery({ ...query, sort: (e.target.value || undefined) as Query['sort'] })}>
                <option value="">El de la Biblia</option>
                <option value="VOCABULARY">Por palabra original</option>
                <option value="ORIGINAL_SPELLING">Por forma escrita</option>
              </select>
            </label>
          )}
          {query.kind === 'text' && query.text.trim().includes(' ') && (
            <label className="select">
              <span>Coincidencia</span>
              <select value={query.match ?? 'all'} onChange={(e) => onQuery({ ...query, match: e.target.value as TextMatch })}>
                {MATCHES.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="select">
            <span>Contexto</span>
            <select value={query.context ?? 0} onChange={(e) => onQuery({ ...query, context: Number(e.target.value) || undefined })}>
              <option value={0}>Solo el versículo</option>
              <option value={1}>Un versículo alrededor</option>
              <option value={2}>Dos versículos alrededor</option>
            </select>
          </label>
        </div>
      )}

      {scoped && (
        <div className="conditions">
          {(query.extra ?? []).map((term, i) => (
            <button
              key={i}
              className="chip chip-on"
              aria-label={`Quitar la condición ${term.text}`}
              onClick={() => onQuery({ ...query, extra: query.extra!.filter((_, j) => j !== i) })}
            >
              y además «{term.text}» ✕
            </button>
          ))}
          <form
            className="inline-form"
            onSubmit={(e) => {
              e.preventDefault()
              addCondition()
            }}
          >
            <input value={also} onChange={(e) => setAlso(e.target.value)} placeholder="Que además contenga…" aria-label="Añadir otra palabra que deba aparecer" />
            <button className="ghost outlined">Añadir</button>
          </form>
        </div>
      )}

      {query.kind === 'meanings' && words.length > 0 && (
        <div className="word-filter">
          <p>Palabras originales con este significado. Elige una para ver solo sus versículos.</p>
          <div className="chips">
            {words.map((w) => (
              <button
                key={w.strongNumber}
                className={query.filter === w.strongNumber ? 'chip chip-on' : 'chip'}
                aria-pressed={query.filter === w.strongNumber}
                onClick={() => onQuery({ ...query, filter: query.filter === w.strongNumber ? undefined : w.strongNumber })}
              >
                <span lang={w.strongNumber.startsWith('H') ? 'he' : 'grc'}>{w.matchingForm}</span> {glossOf(w)}
              </button>
            ))}
          </div>
        </div>
      )}

      <p className="hint">
        {error
          ? `No se pudo completar la búsqueda: ${error}`
          : total === null
            ? 'Buscando…'
            : total === 0
              ? query.kind === 'exactForm'
                ? 'Sin resultados. Escribe la palabra en griego o hebreo tal como aparece en el texto, con sus acentos o vocales.'
                : ENGLISH_ONLY.includes(query.kind)
                ? 'Sin resultados. Los temas, los significados y los encabezados están indexados en inglés: prueba con la palabra en inglés.'
                : `Ningún versículo de ${versionName} contiene esto. Prueba con otra palabra o con otra versión.`
              : `${total.toLocaleString('es')} ${total === 1 ? noun[0] : noun[1]} en ${versionName}.`}
      </p>

      {topics.length > 0 && (
        <ul className="topics">
          {topics.map((topic, i) => (
            <TopicEntry key={`${topic.root}-${topic.heading}-${i}`} topic={topic} version={version} onOpen={onOpen} onWord={onWord} />
          ))}
        </ul>
      )}

      <ol className="results">
        {results.map((group, i) => (
          <li key={`${group.osisId}-${i}`} className="result">
            <button className="result-ref" onClick={() => onOpen(group.osisId)}>
              {group.label}
            </button>
            {group.heading !== undefined ? (
              <p className="result-text result-heading">{group.heading}</p>
            ) : (
              <Verses group={group} version={version} litLemmas={litLemmas} mark={mark} onWord={onWord} />
            )}
          </li>
        ))}
      </ol>

      {total !== null && shown > 0 && shown < total && !error && (
        <button className="solid" disabled={loading} onClick={() => setPage(page + 1)}>
          {loading ? 'Cargando…' : 'Mostrar más'}
        </button>
      )}
    </section>
  )
}

interface VersesProps {
  group: SearchGroup
  version: string
  litLemmas: string[]
  mark?: RegExp
  onWord: (selection: Selection) => void
}

function Verses({ group, version, litLemmas, mark, onWord }: VersesProps) {
  return (
    <p className="result-text">
      {group.verses.map((verse, i) => (
        <span key={i}>
          {group.verses.length > 1 && <span className="tag">{verse.number}</span>}
          <VerseContent verse={verse} version={version} litLemmas={litLemmas} mark={mark} onWord={verse.osisId ? onWord : undefined} />{' '}
        </span>
      ))}
    </p>
  )
}

function TopicEntry({ topic, version, onOpen, onWord }: { topic: Topic; version: string; onOpen: (osisId: string) => void; onWord: (s: Selection) => void }) {
  const [open, setOpen] = useState(false)
  const [groups, setGroups] = useState<SearchGroup[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open || groups) return
    const controller = new AbortController()
    getTopicVerses(version, topic, controller.signal)
      .then(setGroups)
      .catch((e: Error) => {
        if (!controller.signal.aborted) setError(e.message)
      })
    return () => controller.abort()
  }, [open, groups, version, topic])

  return (
    <li className="topic">
      <button className="topic-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="topic-root">{topic.root.trim()}</span>
        <span>{topic.heading}</span>
      </button>
      {open && (
        <div className="topic-body">
          {topic.seeAlso && <p className="panel-note">Véase también: {topic.seeAlso.replace(/;\s*$/, '')}</p>}
          {error && <p className="panel-note">No se pudieron cargar los versículos: {error}</p>}
          {!groups && !error && <p className="panel-note">Cargando los versículos…</p>}
          {groups?.length === 0 && <p className="panel-note">Esta entrada no tiene versículos en la versión abierta.</p>}
          {groups?.map((group, i) => (
            <div className="result" key={i}>
              <button className="result-ref" onClick={() => onOpen(group.osisId)}>
                {group.label}
              </button>
              <Verses group={group} version={version} litLemmas={[]} onWord={onWord} />
            </div>
          ))}
        </div>
      )}
    </li>
  )
}
