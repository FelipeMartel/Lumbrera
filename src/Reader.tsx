import { Fragment, useEffect, type ReactNode } from 'react'
import { isToken, type BibleModule, type Block, type DiffVerse, type Note, type Passage, type Token, type Verse } from './api'
import { grammarClass, lemmas, type Prefs, type Selection } from './types'

interface ContentProps {
  verse: Verse
  version: string
  litLemmas: string[]
  selection?: Selection | null
  mark?: RegExp
  showNotes?: boolean
  showRed?: boolean
  showGrammar?: boolean
  onWord?: (selection: Selection) => void
  onNote?: (note: Note, osisId: string) => void
}

/** Palabras y notas de un versículo, sin el número. */
export function VerseContent({ verse, version, litLemmas, selection, mark, showNotes, showRed, showGrammar, onWord, onNote }: ContentProps) {
  return (
    <>
      {verse.items.map((item, i) => {
        if (!isToken(item)) {
          return showNotes && onNote ? (
            <button
              key={i}
              className="note-mark"
              aria-label={item.note.kind === 'xref' ? 'Ver referencias cruzadas' : 'Ver nota'}
              onClick={() => onNote(item.note, verse.osisId)}
            >
              {item.note.label}
            </button>
          ) : null
        }
        return (
          <Word
            key={i}
            token={item}
            mark={mark}
            red={!!showRed && !!item.red}
            grammar={showGrammar ? grammarClass(item.morph) : ''}
            lit={!!item.strong && lemmas(item.strong).some((l) => litLemmas.includes(l))}
            chosen={
              !!selection &&
              selection.verse === verse.osisId &&
              selection.version === version &&
              selection.strong === item.strong &&
              selection.text === item.text
            }
            onSelect={
              onWord && item.strong
                ? () => onWord({ version, verse: verse.osisId, strong: item.strong!, morph: item.morph, text: item.text })
                : undefined
            }
          />
        )
      })}
    </>
  )
}

const GREEK = /[Ͱ-Ͽἀ-῿]/
const HEBREW = /[֐-׿]/

function highlight(text: string, mark?: RegExp): ReactNode {
  if (!mark) return text
  return text.split(mark).map((part, i) => (i % 2 === 1 ? <mark key={i}>{part}</mark> : part))
}

interface WordProps {
  token: Token
  lit: boolean
  chosen: boolean
  red: boolean
  grammar: string
  mark?: RegExp
  onSelect?: () => void
}

function Word({ token, lit, chosen, red, grammar, mark, onSelect }: WordProps) {
  const interactive = onSelect
    ? {
        role: 'button',
        tabIndex: 0,
        'aria-pressed': chosen,
        onClick: onSelect,
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onSelect()
          }
        },
      }
    : {}

  if (token.lines) {
    const className = ['unit', onSelect && 'word', lit && 'word-lit', chosen && 'word-chosen', red && 'red', grammar].filter(Boolean).join(' ')
    return (
      <span className={className} {...interactive}>
        <span className="unit-text">{token.text.trim() || ' '}</span>
        {token.lines.map((line, i) => (
          <span key={i} className={GREEK.test(line) ? 'unit-line unit-greek' : HEBREW.test(line) ? 'unit-line unit-hebrew' : 'unit-line'}>
            {line || ' '}
          </span>
        ))}
      </span>
    )
  }

  if (!onSelect) return red ? <span className="red">{highlight(token.text, mark)}</span> : <>{highlight(token.text, mark)}</>
  const className = ['word', lit && 'word-lit', chosen && 'word-chosen', red && 'red', grammar].filter(Boolean).join(' ')
  return (
    <span className={className} {...interactive}>
      {highlight(token.text, mark)}
    </span>
  )
}

export type Layout = 'single' | 'columns' | 'interleaved' | 'diff' | 'diffcolumns'

interface ReaderProps {
  passages: Passage[]
  versions: string[]
  layout: Layout
  diff: DiffVerse[]
  modules: BibleModule[]
  prefs: Prefs
  loading: boolean
  litLemmas: string[]
  selection: Selection | null
  focusVerse: string | null
  onFocused: () => void
  onWord: (selection: Selection) => void
  onNote: (note: Note, osisId: string) => void
  onVerse: (osisId: string) => void
}

export function Reader(props: ReaderProps) {
  const { passages, versions, layout, modules, prefs, loading, focusVerse, onFocused } = props
  const language = (initials: string) => modules.find((m) => m.initials === initials)?.languageCode
  const shortName = (initials: string) => modules.find((m) => m.initials === initials || m.shortInitials === initials)?.shortInitials ?? initials

  // Al llegar desde una búsqueda o una referencia se lleva la vista al versículo y se marca un instante.
  useEffect(() => {
    if (!focusVerse || loading) return
    const el = document.querySelector<HTMLElement>(`[data-osis="${focusVerse}"]`)
    if (!el) return
    el.scrollIntoView({ block: 'center' })
    el.classList.add('verse-focus')
    const timer = window.setTimeout(() => {
      el.classList.remove('verse-focus')
      onFocused()
    }, 2600)
    return () => window.clearTimeout(timer)
  }, [focusVerse, loading, passages, onFocused])

  const number = (verse: Verse) =>
    prefs.verseNumbers ? (
      <button className="verse-number" onClick={() => props.onVerse(verse.osisId)} aria-label={`Comentarios del versículo ${verse.number}`}>
        {verse.number}
      </button>
    ) : null

  const content = (verse: Verse, column: number) => (
    <VerseContent
      verse={verse}
      version={versions[column]}
      litLemmas={props.litLemmas}
      selection={props.selection}
      showNotes={prefs.notes}
      showRed={prefs.redLetters}
      showGrammar={prefs.grammarColors}
      onWord={props.onWord}
      onNote={props.onNote}
    />
  )

  const heading = (text: string, key: number) => (prefs.headings ? <h2 className="section" key={key}>{text}</h2> : null)

  if (layout === 'diffcolumns') {
    // la misma comparación del motor, repartida: a la izquierda lo propio de la primera versión, a la derecha lo de la otra
    const sides: ['removed' | 'added', string][] = [
      ['added', versions[0]],
      ['removed', versions[1] ?? ''],
    ]
    return (
      <div className="text text-parallel text-diff" aria-busy={loading} style={{ '--columns': 2 } as React.CSSProperties}>
        <div className="row row-head">
          {sides.map(([, v]) => (
            <span key={v}>{shortName(v)}</span>
          ))}
        </div>
        {props.diff.map((verse) => (
          <div className="row" key={verse.osisId} data-osis={verse.osisId}>
            {sides.map(([hidden, v]) => (
              <p className="verse" key={v}>
                {number({ osisId: verse.osisId, number: verse.number, label: '', items: [] })}
                {(verse.lines[1] ?? verse.lines[0])?.parts.map((part, j) =>
                  part.kind === hidden ? null : part.kind === 'same' ? part.text : <span key={j} className="diff-own">{part.text}</span>,
                )}
              </p>
            ))}
          </div>
        ))}
      </div>
    )
  }

  if (layout === 'diff') {
    return (
      <div className="text text-diff" aria-busy={loading}>
        <p className="legend">
          <span className="diff-removed">Tachado</span>: solo en {shortName(versions[0])}. <span className="diff-added">Subrayado</span>: solo en la
          otra versión.
        </p>
        {props.diff.map((verse) => (
          <div className="diff-verse" key={verse.osisId} data-osis={verse.osisId}>
            {number({ osisId: verse.osisId, number: verse.number, label: '', items: [] })}
            <div>
              {verse.lines.slice(1).map((line, i) => (
                <p className="diff-line" key={i}>
                  {verse.lines.length > 2 && <span className="tag">{shortName(line.version)}</span>}
                  {line.parts.map((part, j) =>
                    part.kind === 'same' ? part.text : <span key={j} className={`diff-${part.kind}`}>{part.text}</span>,
                  )}
                </p>
              ))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (layout === 'columns' || layout === 'interleaved') {
    const rows = passages[0]?.blocks ?? []
    const aligned = (verse: Verse) => [verse, ...passages.slice(1).map((p) => p.verses.find((v) => v.number === verse.number))]

    if (layout === 'interleaved') {
      return (
        <div className="text text-interleaved" aria-busy={loading}>
          {rows.map((block, i) => {
            if (block.type === 'heading') return heading(block.text, i)
            if (block.type !== 'verse') return null
            return (
              <div className="stack" key={block.verse.osisId} data-osis={block.verse.osisId}>
                {number(block.verse)}
                <div>
                  {aligned(block.verse).map((verse, column) =>
                    verse ? (
                      <p className="verse" key={column} lang={language(versions[column])}>
                        <span className="tag">{shortName(versions[column])}</span>
                        {content(verse, column)}
                      </p>
                    ) : null,
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )
    }

    return (
      <div className="text text-parallel" aria-busy={loading} style={{ '--columns': versions.length } as React.CSSProperties}>
        <div className="row row-head">
          {versions.map((v) => (
            <span key={v}>{shortName(v)}</span>
          ))}
        </div>
        {rows.map((block, i) => {
          if (block.type === 'heading') return heading(block.text, i)
          if (block.type !== 'verse') return null
          return (
            <div className="row" key={block.verse.osisId} data-osis={block.verse.osisId}>
              {aligned(block.verse).map((verse, column) =>
                verse ? (
                  <p className="verse" key={column} lang={language(versions[column])}>
                    {number(verse)}
                    {content(verse, column)}
                  </p>
                ) : (
                  <p className="verse verse-missing" key={column}>
                    Sin texto en esta versión.
                  </p>
                ),
              )}
            </div>
          )
        })}
      </div>
    )
  }

  const blocks = passages[0]?.blocks ?? []
  const lang = language(versions[0])
  const interlinear = blocks.some((b) => b.type === 'verse' && b.verse.items.some((item) => isToken(item) && item.lines))
  const className = ['text', interlinear && 'text-interlinear'].filter(Boolean).join(' ')

  if (prefs.lines || interlinear) {
    return (
      <div className={className} aria-busy={loading}>
        {blocks.map((block, i) => {
          if (block.type === 'heading') return prefs.headings ? <h2 className="section" key={i}>{block.text}</h2> : null
          if (block.type !== 'verse') return null
          return (
            <p className="verse" key={block.verse.osisId} data-osis={block.verse.osisId} lang={lang}>
              {number(block.verse)}
              {content(block.verse, 0)}
            </p>
          )
        })}
      </div>
    )
  }

  return (
    <div className={className} aria-busy={loading}>
      {paragraphs(blocks).map((group, i) =>
        group.type === 'heading' ? (
          prefs.headings ? <h2 className="section" key={i}>{group.text}</h2> : null
        ) : (
          <p className="paragraph" key={i} lang={lang}>
            {group.verses.map((verse) => (
              <Fragment key={verse.osisId}>
                <span className="verse-inline" data-osis={verse.osisId}>
                  {number(verse)}
                  {content(verse, 0)}
                </span>{' '}
              </Fragment>
            ))}
          </p>
        ),
      )}
    </div>
  )
}

type Group = { type: 'heading'; text: string } | { type: 'paragraph'; verses: Verse[] }

function paragraphs(blocks: Block[]): Group[] {
  const groups: Group[] = []
  let open: Verse[] | null = null
  for (const block of blocks) {
    if (block.type === 'verse') {
      if (!open) {
        open = []
        groups.push({ type: 'paragraph', verses: open })
      }
      open.push(block.verse)
    } else {
      open = null
      if (block.type === 'heading') groups.push(block)
    }
  }
  return groups
}
