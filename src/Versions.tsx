import { useEffect, useMemo, useRef, useState } from 'react'
import { getInstallProgress, getInstallable, installModule, removeModule, type BibleModule } from './api'
import { COMPARE_LABELS, type CompareMode } from './types'

interface Props {
  /** Todo lo instalado: Biblias y comentarios. */
  modules: BibleModule[]
  versions: string[]
  compare: CompareMode
  onVersions: (versions: string[]) => void
  onCompare: (mode: CompareMode) => void
  /** Se ha instalado o quitado un módulo. */
  onChanged: () => void
  onClose: () => void
}

const MAX_SHOWN = 80

const plain = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

const languageOf = (module: BibleModule) => module.languageName ?? module.languageCode

function byLanguage(modules: BibleModule[], filter: string, first?: string): [string, BibleModule[]][] {
  const wanted = plain(filter.trim())
  const groups = new Map<string, BibleModule[]>()
  for (const module of modules) {
    const language = languageOf(module)
    if (wanted && ![module.name, module.shortInitials, module.initials, language].some((t) => plain(t).includes(wanted))) continue
    groups.set(language, [...(groups.get(language) ?? []), module])
  }
  return [...groups.entries()].sort(([a], [b]) => (a === first ? -1 : b === first ? 1 : a.localeCompare(b, 'es')))
}

const traits = (module: BibleModule) =>
  [
    module.category === 'COMMENTARY' && 'comentario',
    module.hasStrongs && 'palabras originales',
    module.hasMorphology && 'gramática',
    module.hasNotes && 'notas',
    module.hasRedLetter && 'palabras de Jesús',
  ]
    .filter(Boolean)
    .join(', ')

/** Todas las versiones instaladas, por idioma: cuál se lee, cuáles se comparan, y cuáles se pueden añadir o quitar. */
export function Versions({ modules, versions, compare, onVersions, onCompare, onChanged, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const [filter, setFilter] = useState('')
  const [adding, setAdding] = useState(false)
  const [available, setAvailable] = useState<BibleModule[] | null>(null)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState<Record<string, number>>({})
  const [removing, setRemoving] = useState('')
  const [main, ...others] = versions

  useEffect(() => {
    ref.current?.showModal()
  }, [])

  useEffect(() => {
    if (!adding || available) return
    const controller = new AbortController()
    getInstallable(controller.signal)
      .then(setAvailable)
      .catch((e: Error) => !controller.signal.aborted && setError(e.message))
    return () => controller.abort()
  }, [adding, available])

  const reading = modules.find((m) => m.initials === main)
  const installed = useMemo(
    () => byLanguage(modules.filter((m) => m.category === 'BIBLE'), filter, reading && languageOf(reading)),
    [modules, filter, reading],
  )
  const installable = useMemo(() => {
    const have = new Set(modules.map((m) => m.initials))
    return byLanguage((available ?? []).filter((m) => !have.has(m.initials)), filter, reading && languageOf(reading))
  }, [available, modules, filter, reading])
  const installableCount = installable.reduce((n, [, group]) => n + group.length, 0)

  const install = async (initials: string) => {
    setProgress((p) => ({ ...p, [initials]: 0.01 }))
    await installModule(initials)
    const poll = async () => {
      const value = await getInstallProgress(initials)
      setProgress((p) => ({ ...p, [initials]: Math.max(value, 0.01) }))
      if (value >= 1) onChanged()
      else window.setTimeout(poll, 1500)
    }
    poll()
  }

  const remove = async (initials: string) => {
    await removeModule(initials)
    setRemoving('')
    onVersions(versions.filter((v) => v !== initials))
    onChanged()
  }

  return (
    <dialog ref={ref} className="picker versions" onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}>
      <div className="versions-head">
        <h2>Versiones</h2>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filtra por nombre o por idioma"
          aria-label="Filtrar las versiones por nombre o por idioma"
        />
        <button className="ghost" onClick={onClose}>
          Cerrar
        </button>
      </div>
      <div className="tabs versions-tabs" role="tablist">
        <button role="tab" aria-selected={!adding} className={adding ? 'tab' : 'tab tab-on'} onClick={() => setAdding(false)}>
          Instaladas
        </button>
        <button role="tab" aria-selected={adding} className={adding ? 'tab tab-on' : 'tab'} onClick={() => setAdding(true)}>
          Añadir más
        </button>
      </div>

      {adding ? (
        <div className="versions-list">
          {error && <p className="panel-note">No se pudo consultar el catálogo: {error}</p>}
          {!available && !error && <p className="panel-note">Consultando el catálogo de STEPBible…</p>}
          {available && (
            <p className="panel-note">
              {installableCount.toLocaleString('es')} versiones y comentarios disponibles. Hace falta conexión a internet para descargarlos.
              {installableCount > MAX_SHOWN && ' Filtra por idioma o por nombre para acotar la lista.'}
            </p>
          )}
          {available &&
            (installableCount > MAX_SHOWN ? installable.slice(0, 1) : installable).map(([language, group]) => (
              <section key={language}>
                <h3>{language}</h3>
                {group.slice(0, MAX_SHOWN).map((module) => {
                  const value = progress[module.initials]
                  return (
                    <div className="version version-add" key={module.initials}>
                      <div className="version-name">
                        <span className="version-short">{module.shortInitials}</span>
                        <span>{module.name}</span>
                        <span className="version-traits">{traits(module)}</span>
                      </div>
                      <button className="ghost outlined" disabled={value !== undefined} onClick={() => install(module.initials)}>
                        {value === undefined ? 'Instalar' : value >= 1 ? 'Instalada' : `Instalando… ${Math.round(value * 100)} %`}
                      </button>
                    </div>
                  )
                })}
              </section>
            ))}
        </div>
      ) : (
        <div className="versions-list">
          {installed.length === 0 && <p className="panel-note">Ninguna versión instalada coincide con «{filter}».</p>}
          {installed.map(([language, group]) => (
            <section key={language}>
              <h3>{language}</h3>
              {group.map((bible) => {
                const isMain = bible.initials === main
                return (
                  <div className={isMain ? 'version version-on' : 'version'} key={bible.initials}>
                    <div className="version-name">
                      <span className="version-short">{bible.shortInitials}</span>
                      <span>{bible.name}</span>
                      <span className="version-traits">
                        {traits(bible)}
                        {!isMain &&
                          (removing === bible.initials ? (
                            <>
                              {' '}
                              <button className="reference" onClick={() => remove(bible.initials)}>
                                Sí, quitar {bible.shortInitials} de este equipo
                              </button>{' '}
                              <button className="reference" onClick={() => setRemoving('')}>
                                No quitar
                              </button>
                            </>
                          ) : (
                            <>
                              {' '}
                              <button className="reference" onClick={() => setRemoving(bible.initials)}>
                                Quitar
                              </button>
                            </>
                          ))}
                      </span>
                    </div>
                    <button
                      className={isMain ? 'solid' : 'ghost outlined'}
                      aria-pressed={isMain}
                      onClick={() => onVersions([bible.initials, ...others.filter((v) => v !== bible.initials)])}
                    >
                      {isMain ? 'Leyendo' : 'Leer'}
                    </button>
                    <label className={isMain ? 'check check-off' : 'check'}>
                      <input
                        type="checkbox"
                        disabled={isMain}
                        checked={others.includes(bible.initials)}
                        onChange={(e) => onVersions(e.target.checked ? [...versions, bible.initials] : versions.filter((v) => v !== bible.initials))}
                      />
                      Comparar
                    </label>
                  </div>
                )
              })}
            </section>
          ))}
        </div>
      )}

      {others.length > 0 && !adding && (
        <fieldset className="versions-mode">
          <legend>Cómo mostrar las {versions.length} versiones</legend>
          {COMPARE_LABELS.map(([mode, label]) => (
            <label key={mode} className="check">
              <input type="radio" name="compare" checked={compare === mode} onChange={() => onCompare(mode)} />
              {label}
            </label>
          ))}
        </fieldset>
      )}
    </dialog>
  )
}
