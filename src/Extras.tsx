import { useEffect, useMemo, useRef, useState } from 'react'
import { getGlosses, getSubjectStats, isToken, type Passage, type VocabInfo } from './api'
import { Shell } from './Panels'
import { glossOf, lemma, type Query, type Selection } from './types'

const TOP_WORDS = 30
const TOP_TOPICS = 25

interface StatsProps {
  version: string
  reference: string
  place: string
  passage?: Passage
  onSelect: (selection: Selection) => void
  onSearch: (query: Query) => void
  onClose: () => void
}

/** Palabras originales más repetidas del pasaje y temas que toca. */
export function StatsPanel({ version, reference, place, passage, onSelect, onSearch, onClose }: StatsProps) {
  const [glosses, setGlosses] = useState<Record<string, VocabInfo>>({})
  const [topics, setTopics] = useState<[string, number][] | null>(null)

  // El recuento se hace aquí con las palabras ya cargadas: el del motor falla en algunas instalaciones.
  const words = useMemo(() => {
    const counts = new Map<string, { count: number; verse: string }>()
    for (const verse of passage?.verses ?? []) {
      for (const item of verse.items) {
        if (!isToken(item) || !item.strong) continue
        for (const strong of item.strong.split(/\s+/).map(lemma)) {
          const entry = counts.get(strong) ?? { count: 0, verse: verse.osisId }
          entry.count += 1
          counts.set(strong, entry)
        }
      }
    }
    return [...counts.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, TOP_WORDS)
  }, [passage])
  const strongs = words.map(([strong]) => strong).join(' ')

  useEffect(() => {
    if (!strongs) return
    const controller = new AbortController()
    getGlosses(version, reference, strongs.split(' '), controller.signal)
      .then((infos) => setGlosses(Object.fromEntries(infos.map((info) => [lemma(info.strongNumber), info]))))
      .catch(() => {})
    return () => controller.abort()
  }, [version, reference, strongs])

  useEffect(() => {
    const controller = new AbortController()
    setTopics(null)
    getSubjectStats(version, reference, controller.signal)
      .then((all) => setTopics(all.slice(0, TOP_TOPICS)))
      .catch(() => !controller.signal.aborted && setTopics([]))
    return () => controller.abort()
  }, [version, reference])

  return (
    <Shell label="Estadísticas" title={`Vocabulario de ${place}`} onClose={onClose}>
      <section className="stats">
        <h3>Palabras originales más repetidas</h3>
        {words.length === 0 && <p className="panel-note">Esta versión no enlaza sus palabras con el original.</p>}
        <ol>
          {words.map(([strong, entry]) => {
            const info = glosses[strong]
            return (
              <li key={strong}>
                <button
                  className="related-word"
                  onClick={() => onSelect({ version, verse: entry.verse, strong, text: info?.accentedUnicode ?? strong })}
                >
                  <span lang={strong.startsWith('H') ? 'he' : 'grc'}>{info?.accentedUnicode ?? strong}</span>
                  <span>{info ? glossOf(info) : ''}</span>
                  <span className="stat-count">{entry.count}</span>
                </button>
              </li>
            )
          })}
        </ol>
      </section>

      <section className="stats">
        <h3>Temas que toca</h3>
        {topics === null && <p className="panel-note">Cargando los temas…</p>}
        {topics?.length === 0 && <p className="panel-note">El índice temático no tiene entradas para este pasaje.</p>}
        <ol>
          {topics?.map(([topic, count]) => (
            <li key={topic}>
              <button className="related-word" onClick={() => onSearch({ kind: 'nave', text: topic })}>
                <span className="stat-topic">{topic}</span>
                <span className="stat-count">{count}</span>
              </button>
            </li>
          ))}
        </ol>
      </section>
    </Shell>
  )
}

// --- Ayuda

const EXAMPLES: [string, string][] = [
  ['Juan 3:16', 'Escribe un pasaje para ir a él. El versículo queda marcado un instante.'],
  ['Sal 23', 'Valen las abreviaturas y los nombres sin tildes.'],
  ['Juan 3:16-18; Romanos 8:28', 'Varios tramos a la vez, separados por punto y coma.'],
  ['misericordia', 'Cualquier otra cosa se busca en el texto de la versión abierta.'],
  ['gracia de Dios', 'Con varias palabras puedes pedir todas, cualquiera o la frase exacta.'],
]

const TIPS: [string, string][] = [
  ['Pulsa una palabra', 'Se abre la palabra griega o hebrea que traduce, con su significado, y se ilumina cada lugar del capítulo donde aparece.'],
  ['Pulsa un número de versículo', 'Puedes copiarlo, guardarlo como marcador, leer los comentarios y ver su vocabulario, sus temas y los versículos relacionados.'],
  ['Pulsa una letra pequeña del texto', 'Son las notas y las referencias cruzadas de la versión.'],
  ['Elige las versiones', 'El botón con el nombre de la versión abre todas las instaladas. Puedes comparar varias y decidir cómo se muestran.'],
  ['Menú Vista', 'Interlineal, colores por gramática, tamaño del texto, letra para dislexia y opciones del griego y el hebreo.'],
  ['Comparte lo que ves', 'La dirección del navegador lleva siempre al mismo pasaje o búsqueda con las mismas versiones.'],
]

export function Help({ onRun, onClose }: { onRun: (input: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    ref.current?.showModal()
  }, [])

  return (
    <dialog ref={ref} className="picker help" onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}>
      <div className="versions-head">
        <h2>Cómo usar Lumbrera</h2>
        <button className="ghost" onClick={onClose}>
          Cerrar
        </button>
      </div>
      <div className="help-body">
        <section>
          <h3>Prueba a escribir en el buscador</h3>
          <ul className="help-list">
            {EXAMPLES.map(([input, description]) => (
              <li key={input}>
                <button
                  className="chip help-example"
                  onClick={() => {
                    onRun(input)
                    onClose()
                  }}
                >
                  {input}
                </button>
                <span>{description}</span>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h3>Qué puedes hacer</h3>
          <dl className="help-tips">
            {TIPS.map(([title, body]) => (
              <div key={title}>
                <dt>{title}</dt>
                <dd>{body}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section>
          <h3>De dónde sale todo</h3>
          <p>
            Lumbrera es una interfaz para el motor de STEPBible: los textos, los léxicos y las búsquedas son los suyos. Si encuentras un error en una
            definición o en un texto, el equipo de STEPBible agradece que se lo cuentes en{' '}
            <a href="https://www.stepbible.org" target="_blank" rel="noreferrer">
              stepbible.org
            </a>
            .
          </p>
        </section>
      </div>
    </dialog>
  )
}
