import { useEffect, useRef, useState } from 'react'
import { load, save } from './types'

const MAX_PANES = 4

interface Pane {
  id: number
  /** Dirección con la que se abrió el panel; después cada panel navega por su cuenta. */
  hash: string
}

/**
 * Varios paneles de lectura independientes, uno al lado de otro. Cada panel es la aplicación completa
 * en su propio marco, con su pasaje, sus versiones y su búsqueda.
 */
export function Workspace({ initial }: { initial: string[] }) {
  const [panes, setPanes] = useState<Pane[]>(() => initial.map((hash, id) => ({ id, hash })))
  const current = useRef<Record<number, string>>(Object.fromEntries(initial.map((hash, id) => [id, hash])))
  const nextId = useRef(initial.length)

  useEffect(() => {
    document.documentElement.dataset.theme = load('dark', window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light'
  }, [])

  const persist = (list: Pane[]) => save('panes', list.map((p) => current.current[p.id] ?? p.hash))

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || typeof e.data?.lumbreraPane !== 'number') return
      current.current[e.data.lumbreraPane] = String(e.data.hash)
      persist(panes)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [panes])

  const add = () => {
    const last = panes[panes.length - 1]
    const pane = { id: nextId.current++, hash: current.current[last.id] ?? last.hash }
    current.current[pane.id] = pane.hash
    const list = [...panes, pane]
    setPanes(list)
    persist(list)
  }

  const close = (id: number) => {
    const list = panes.filter((p) => p.id !== id)
    if (list.length > 1) {
      setPanes(list)
      persist(list)
      return
    }
    // con un solo panel se vuelve a la aplicación normal, en el lugar donde estaba ese panel
    save('panes', [])
    window.location.hash = current.current[list[0].id] ?? list[0].hash
    window.location.reload()
  }

  return (
    <div className="workspace">
      <header className="bar">
        <span className="wordmark">Lumbrera</span>
        <span className="workspace-count">{panes.length} paneles de lectura</span>
        <div className="bar-controls">
          <button className="ghost" onClick={add} disabled={panes.length >= MAX_PANES}>
            Añadir panel
          </button>
        </div>
      </header>
      <div className="panes" style={{ '--columns': panes.length } as React.CSSProperties}>
        {panes.map((pane, index) => (
          <section className="pane" key={pane.id} aria-label={`Panel ${index + 1}`}>
            <button className="ghost pane-close" onClick={() => close(pane.id)}>
              Cerrar panel {index + 1}
            </button>
            <iframe title={`Panel de lectura ${index + 1}`} src={`${window.location.pathname}?panel=${pane.id}${pane.hash}`} />
          </section>
        ))}
      </div>
    </div>
  )
}
