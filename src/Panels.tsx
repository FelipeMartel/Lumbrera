import { useEffect, useState, type ReactNode } from 'react'
import {
  getCommentary,
  getPassage,
  getVerseVocabulary,
  getWordInfo,
  isToken,
  type BibleModule,
  type MorphInfo,
  type Note,
  type RelatedWord,
  type Verse,
  type WordInfo,
} from './api'
import { hasText, renderHtml } from './rich'
import { LANG } from './i18n'
import { glossOf, type Query, type Selection } from './types'

const MORPH_ES: Record<string, string> = {
  Verb: 'verbo', Noun: 'sustantivo', Adjective: 'adjetivo', Adverb: 'adverbio', Conjunction: 'conjunción',
  Preposition: 'preposición', Pronoun: 'pronombre', Article: 'artículo', Particle: 'partícula',
  Aorist: 'aoristo', Present: 'presente', Imperfect: 'imperfecto', Future: 'futuro', Perfect: 'perfecto', Pluperfect: 'pluscuamperfecto',
  Active: 'voz activa', Passive: 'voz pasiva', Middle: 'voz media',
  Indicative: 'indicativo', Subjunctive: 'subjuntivo', Imperative: 'imperativo', Infinitive: 'infinitivo', Participle: 'participio', Optative: 'optativo',
  '1st': '1.ª persona', '2nd': '2.ª persona', '3rd': '3.ª persona',
  Singular: 'singular', Plural: 'plural',
  Masculine: 'masculino', Feminine: 'femenino', Neuter: 'neutro',
  Nominative: 'nominativo', Genitive: 'genitivo', Dative: 'dativo', Accusative: 'acusativo', Vocative: 'vocativo',
}

function describeMorph(m: MorphInfo): string {
  return [m.function, m.tense, m.voice, m.mood, m.wordCase, m.person, m.number, m.gender]
    .filter((part): part is string => !!part)
    .map((part) => MORPH_ES[part] ?? part.toLowerCase())
    .join(', ')
}

function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
}

export function Shell({ label, title, onClose, children }: { label: string; title: ReactNode; onClose: () => void; children: ReactNode }) {
  useEscape(onClose)
  return (
    <aside className="panel" aria-label={label}>
      <div className="panel-head">
        <p className="panel-quote">{title}</p>
        <button className="ghost" onClick={onClose}>
          Cerrar
        </button>
      </div>
      {children}
    </aside>
  )
}

// --- Palabra original

interface WordProps {
  selection: Selection
  occurrences: number
  place: string
  onSelect: (selection: Selection) => void
  onSearch: (query: Query) => void
  onClose: () => void
}

export function WordPanel({ selection, occurrences, place, onSelect, onSearch, onClose }: WordProps) {
  const [info, setInfo] = useState<WordInfo | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    setInfo(null)
    setError('')
    getWordInfo(selection.version, selection.verse, selection.strong, selection.morph, controller.signal)
      .then(setInfo)
      .catch((e: Error) => {
        if (!controller.signal.aborted) setError(e.message)
      })
    return () => controller.abort()
  }, [selection])

  const morph = info?.morphInfos[0] ? describeMorph(info.morphInfos[0]) : ''

  return (
    <Shell label="Palabra original" title={`«${selection.text.trim()}»`} onClose={onClose}>
      {error && <p className="panel-note">No se pudo cargar esta palabra: {error}</p>}
      {!info && !error && <p className="panel-note">Buscando en el léxico…</p>}
      {info && info.vocabInfos.length === 0 && <p className="panel-note">El léxico no tiene entrada para esta palabra.</p>}

      {info?.vocabInfos.map((word) => {
        const hebrew = word.strongNumber.startsWith('H')
        const gloss = glossOf(word)
        const definition = LANG === 'es' && word._es_Definition && word._es_Definition !== gloss ? word._es_Definition : ''
        const english = word.mediumDef || word.shortDef
        return (
          <section className="entry" key={word.strongNumber}>
            <p className={hebrew ? 'headword headword-hebrew' : 'headword'} lang={hebrew ? 'he' : 'grc'} dir={hebrew ? 'rtl' : 'ltr'}>
              {word.accentedUnicode}
            </p>
            <p className="translit">
              {word.stepTransliteration}
              <span className="strong-number">{word.strongNumber}</span>
            </p>
            <p className="gloss">{gloss}</p>
            {definition && <p className="definition">{renderHtml(definition)}</p>}
            {english && (
              <p className="definition definition-english" lang="en">
                {renderHtml(english)}
              </p>
            )}
            {word.count !== undefined && (
              <p className="count">
                {word.count === 1 ? 'Aparece una sola vez en la Biblia.' : `Aparece ${word.count.toLocaleString('es')} veces en la Biblia.`}
              </p>
            )}
            <button
              className="solid entry-action"
              onClick={() => onSearch({ kind: 'strong', text: word.strongNumber, label: `${word.accentedUnicode} (${gloss.trim()})` })}
            >
              Ver los versículos con esta palabra
            </button>

            {word.relatedNos && word.relatedNos.length > 0 && (
              <div className="related">
                <h3>Palabras emparentadas</h3>
                <ul>
                  {word.relatedNos.map((r) => (
                    <li key={r.strongNumber}>
                      <button
                        className="related-word"
                        onClick={() => onSelect({ ...selection, strong: r.strongNumber, morph: undefined, text: r.matchingForm })}
                      >
                        <span lang={hebrew ? 'he' : 'grc'}>{r.matchingForm}</span>
                        <span>{glossOf(r)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {word.lsjDefs && (
              <details className="lexicon">
                <summary>Entrada completa del léxico</summary>
                <div className="definition definition-english" lang="en">
                  {renderHtml(word.lsjDefs)}
                </div>
              </details>
            )}
          </section>
        )
      })}

      {info && info.vocabInfos.length > 0 && (
        <dl className="facts">
          {morph && (
            <>
              <dt>Forma en este versículo</dt>
              <dd>{morph}</dd>
            </>
          )}
          <dt>En {place}</dt>
          <dd>{occurrences === 0 ? 'No aparece.' : occurrences === 1 ? 'Solo aquí.' : `${occurrences} veces, resaltadas en el texto.`}</dd>
        </dl>
      )}
    </Shell>
  )
}

// --- Nota o referencias cruzadas

interface NoteProps {
  note: Note
  version: string
  place: string
  formatReference: (osisId: string) => string
  onReference: (reference: string) => void
  onClose: () => void
}

export function NotePanel({ note, version, place, formatReference, onReference, onClose }: NoteProps) {
  const references = note.parts.flatMap((p) => (p.reference ? [p.reference] : []))
  const [texts, setTexts] = useState<Record<string, Verse[]>>({})

  useEffect(() => {
    const controller = new AbortController()
    setTexts({})
    references.forEach((reference) => {
      getPassage(version, reference, {}, controller.signal)
        .then((p) => setTexts((prev) => ({ ...prev, [reference]: p.verses })))
        .catch(() => {})
    })
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note, version])

  return (
    <Shell label="Nota" title={note.kind === 'xref' ? `Referencias de ${place}` : `Nota de ${place}`} onClose={onClose}>
      <p className="note-body">
        {note.parts.map((part, i) =>
          part.reference ? (
            <button key={i} className="reference" onClick={() => onReference(part.reference!)}>
              {part.text}
            </button>
          ) : (
            <span key={i}>{part.text}</span>
          ),
        )}
      </p>
      {references.map((reference) => (
        <section className="xref" key={reference}>
          {(texts[reference] ?? []).map((verse) => (
            <button className="xref-verse" key={verse.osisId} onClick={() => onReference(verse.osisId)}>
              <span className="xref-label">{formatReference(verse.osisId)}</span>
              {verse.items.filter(isToken).map((t) => t.text).join('')}
            </button>
          ))}
        </section>
      ))}
    </Shell>
  )
}

// --- Comentarios de un versículo

interface VerseProps {
  osisId: string
  place: string
  /** Versículos del pasaje abierto en la versión principal, para copiar uno o un tramo. */
  verses: Verse[]
  version: string
  versionName: string
  onSelect: (selection: Selection) => void
  bookmarked: boolean
  onBookmark: () => void
  onSearch: (query: Query) => void
  commentaries: BibleModule[]
  commentary: string
  onCommentary: (initials: string) => void
  onReference: (reference: string) => void
  onClose: () => void
}

export function VersePanel(props: VerseProps) {
  const { osisId, place, verses, version, versionName, bookmarked, onBookmark, onSearch, onSelect, commentaries, commentary, onCommentary, onReference, onClose } = props
  const [html, setHtml] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [until, setUntil] = useState(osisId)
  const [vocabulary, setVocabulary] = useState<RelatedWord[] | null>(null)
  const [showVocabulary, setShowVocabulary] = useState(false)

  const plainText = (verse: Verse) => verse.items.filter(isToken).map((t) => t.text).join('').replace(/\s+/g, ' ').trim()
  const start = verses.findIndex((v) => v.osisId === osisId)
  const end = Math.max(start, verses.findIndex((v) => v.osisId === until))
  const range = start < 0 ? [] : verses.slice(start, end + 1)
  const text = start < 0 ? '' : plainText(verses[start])
  const copyPlace = range.length > 1 ? `${place}-${range[range.length - 1].number}` : place

  useEffect(() => {
    setCopied(false)
    setUntil(osisId)
    setVocabulary(null)
  }, [osisId])

  useEffect(() => {
    if (!showVocabulary || vocabulary) return
    const controller = new AbortController()
    getVerseVocabulary(version, osisId, controller.signal)
      .then(setVocabulary)
      .catch(() => !controller.signal.aborted && setVocabulary([]))
    return () => controller.abort()
  }, [showVocabulary, vocabulary, version, osisId])

  const copy = async () => {
    try {
      const body = range.length > 1 ? range.map((v) => `${v.number} ${plainText(v)}`).join(' ') : text
      await navigator.clipboard.writeText(`${body} (${copyPlace}, ${versionName})`)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  const [wholeChapter, setWholeChapter] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!commentary) return
    const controller = new AbortController()
    setHtml(null)
    setError('')
    setWholeChapter(false)
    // Muchos comentarios anotan tramos, no versículos sueltos: si el versículo viene vacío se pide el capítulo.
    getCommentary(commentary, osisId, controller.signal)
      .then(async (verse) => {
        if (hasText(verse)) return setHtml(verse)
        const chapter = await getCommentary(commentary, osisId.split('.').slice(0, 2).join('.'), controller.signal)
        setWholeChapter(true)
        setHtml(chapter)
      })
      .catch((e: Error) => {
        if (!controller.signal.aborted) setError(e.message)
      })
    return () => controller.abort()
  }, [commentary, osisId])

  return (
    <Shell label="Versículo" title={place} onClose={onClose}>
      {text && <p className="verse-quote">{text.trim()}</p>}
      <div className="actions">
        <button className="solid" onClick={copy} disabled={!text}>
          {copied ? 'Copiado' : range.length > 1 ? `Copiar ${range.length} versículos` : 'Copiar versículo'}
        </button>
        {start >= 0 && start < verses.length - 1 && (
          <label className="select">
            <span>hasta el</span>
            <select
              value={until}
              onChange={(e) => {
                setUntil(e.target.value)
                setCopied(false)
              }}
            >
              {verses.slice(start).map((v) => (
                <option key={v.osisId} value={v.osisId}>
                  {v.number}
                </option>
              ))}
            </select>
          </label>
        )}
        <button className="ghost outlined" onClick={onBookmark} aria-pressed={bookmarked}>
          {bookmarked ? 'Quitar marcador' : 'Guardar marcador'}
        </button>
        <button className="ghost outlined" onClick={() => onSearch({ kind: 'relatedrefs', text: osisId, label: `Versículos relacionados con ${place}` })}>
          Versículos relacionados
        </button>
        <button className="ghost outlined" onClick={() => onSearch({ kind: 'topicref', text: osisId, label: `Temas de ${place}` })}>
          Temas de este versículo
        </button>
      </div>
      <details className="lexicon" onToggle={(e) => setShowVocabulary(e.currentTarget.open)}>
        <summary>Vocabulario del versículo</summary>
        {vocabulary === null && <p className="panel-note">Cargando el vocabulario…</p>}
        {vocabulary?.length === 0 && <p className="panel-note">Esta versión no enlaza las palabras de este versículo con el original.</p>}
        <div className="related">
          <ul>
            {vocabulary?.map((word, i) => (
              <li key={`${word.strongNumber}-${i}`}>
                <button className="related-word" onClick={() => onSelect({ version, verse: osisId, strong: word.strongNumber, text: word.matchingForm })}>
                  <span lang={word.strongNumber.startsWith('H') ? 'he' : 'grc'}>{word.matchingForm}</span>
                  <span>{glossOf(word)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </details>
      {commentaries.length === 0 ? (
        <p className="panel-note">No hay comentarios instalados en STEPBible.</p>
      ) : (
        <>
          <label className="select panel-select">
            <span>Comentario</span>
            <select value={commentary} onChange={(e) => onCommentary(e.target.value)}>
              {commentaries.map((c) => (
                <option key={c.initials} value={c.initials}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          {error && <p className="panel-note">No se pudo cargar el comentario: {error}</p>}
          {html === null && !error && <p className="panel-note">Cargando el comentario…</p>}
          {html !== null && !hasText(html) && <p className="panel-note">Este comentario no dice nada sobre este pasaje.</p>}
          {html !== null && hasText(html) && (
            <>
              {wholeChapter && <p className="panel-note">No tiene nota propia para este versículo; se muestra la del capítulo.</p>}
              <div className="commentary" lang="en">
                {renderHtml(html, onReference)}
              </div>
            </>
          )}
        </>
      )}
    </Shell>
  )
}
