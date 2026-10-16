import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { sendFeedback } from './api'
import { load, save, type Prefs } from './types'

function Dialog({ title, className, onClose, children }: { title: string; className: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    ref.current?.showModal()
  }, [])

  return (
    <dialog ref={ref} className={`picker ${className}`} onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}>
      <div className="versions-head">
        <h2>{title}</h2>
        <button className="ghost" onClick={onClose}>
          Cerrar
        </button>
      </div>
      <div className="help-body">{children}</div>
    </dialog>
  )
}

// --- Colores por gramática

/** Cada color que se puede elegir: nombre de su variable CSS y etiqueta. */
const GROUPS: [string, [string, string][]][] = [
  [
    'Tiempo de los verbos',
    [
      ['present', 'presente'],
      ['imperfect', 'imperfecto'],
      ['future', 'futuro'],
      ['aorist', 'aoristo'],
      ['perfect', 'perfecto'],
      ['pluperfect', 'pluscuamperfecto'],
    ],
  ],
  [
    'Género de los nombres',
    [
      ['masc', 'masculino'],
      ['fem', 'femenino'],
      ['neut', 'neutro o común'],
    ],
  ],
  [
    'Caso de los nombres',
    [
      ['nom', 'nominativo'],
      ['gen', 'genitivo'],
      ['dat', 'dativo'],
      ['acc', 'acusativo'],
      ['voc', 'vocativo'],
    ],
  ],
]

/** El navegador devuelve los colores como rgb(); el selector de color los quiere en hexadecimal. */
function toHex(color: string): string {
  const value = color.trim()
  if (/^#[0-9a-f]{6}$/i.test(value)) return value
  const rgb = /rgba?\((\d+)[, ]+(\d+)[, ]+(\d+)/.exec(value)
  return rgb ? `#${rgb.slice(1, 4).map((n) => Number(n).toString(16).padStart(2, '0')).join('')}` : '#000000'
}

export function Colors({ prefs, onChange, onClose }: { prefs: Prefs; onChange: (prefs: Prefs) => void; onClose: () => void }) {
  // los colores de fábrica dependen del tema: se leen de la página
  const current = (name: string) =>
    prefs.grammarPalette[name] ?? toHex(getComputedStyle(document.querySelector('.shell') ?? document.documentElement).getPropertyValue(`--g-${name}`))

  return (
    <Dialog title="Colores por gramática" className="colors" onClose={onClose}>
      <label className="check">
        <input type="checkbox" checked={prefs.grammarVerbs} onChange={(e) => onChange({ ...prefs, grammarVerbs: e.target.checked })} />
        Colorear los verbos
      </label>
      <label className="check">
        <input type="checkbox" checked={prefs.grammarNounsOn} onChange={(e) => onChange({ ...prefs, grammarNounsOn: e.target.checked })} />
        Subrayar los nombres
      </label>
      {GROUPS.map(([group, colors]) => (
        <section key={group}>
          <h3>{group}</h3>
          <div className="swatches">
            {colors.map(([name, label]) => (
              <label key={name} className="swatch">
                <input
                  type="color"
                  value={current(name)}
                  onChange={(e) => onChange({ ...prefs, grammarPalette: { ...prefs.grammarPalette, [name]: e.target.value } })}
                />
                {label}
              </label>
            ))}
          </div>
        </section>
      ))}
      <p>Los colores que elijas se usan igual en modo claro y en modo oscuro.</p>
      <button className="ghost outlined" disabled={Object.keys(prefs.grammarPalette).length === 0} onClick={() => onChange({ ...prefs, grammarPalette: {} })}>
        Restablecer los colores
      </button>
    </Dialog>
  )
}

// --- Mensaje al equipo de STEPBible

// Los mismos tipos que admite el formulario de la interfaz original.
const TYPES: [string, string][] = [
  ['Error found', 'Un error en un texto o una definición'],
  ['Bug', 'Un fallo del programa'],
  ['Improvement', 'Una mejora'],
  ['New Feature', 'Una función nueva'],
  ['Need help', 'Necesito ayuda'],
  ['Like to volunteer', 'Quiero colaborar'],
  ['Just saying Hi', 'Solo saludar'],
]

/** Imagen que acompaña al mensaje: el original manda una captura; aquí va una ficha con lo que se estaba viendo. */
function contextImage(lines: string[]): string {
  const canvas = document.createElement('canvas')
  canvas.width = 900
  canvas.height = 60 + lines.length * 34
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#152231'
  ctx.font = '20px sans-serif'
  lines.forEach((line, i) => ctx.fillText(line.slice(0, 90), 30, 50 + i * 34))
  return canvas.toDataURL('image/png').replace('data:image/png;base64,', '')
}

export function Feedback({ place, onClose }: { place: string; onClose: () => void }) {
  const [type, setType] = useState(TYPES[0][0])
  const [email, setEmail] = useState(() => load('feedbackEmail', ''))
  const [summary, setSummary] = useState('')
  const [description, setDescription] = useState('')
  const [state, setState] = useState<'idle' | 'invalid' | 'sending' | 'sent' | 'failed'>('idle')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!/^\S+@\S+\.\S+$/.test(email) || !summary.trim() || !description.trim()) return setState('invalid')
    setState('sending')
    save('feedbackEmail', email)
    const url = window.location.href
    const ok = await sendFeedback(
      { type, email, summary: `[Lumbrera] ${summary.trim()}`, description: description.trim(), url },
      contextImage(['Lumbrera', place, url]),
    )
    setState(ok ? 'sent' : 'failed')
  }

  return (
    <Dialog title="Escribir al equipo de STEPBible" className="feedback" onClose={onClose}>
      <p>
        Tu mensaje llega al equipo de STEPBible, que mantiene los textos, los léxicos y el motor. Se envía con tu correo y con la dirección de lo que
        estás viendo.
      </p>
      {state === 'sent' ? (
        <p className="notice">Enviado. Gracias por escribir.</p>
      ) : (
        <form className="feedback-form" onSubmit={submit} noValidate>
          <label>
            <span>Qué quieres contarles</span>
            <select value={type} onChange={(e) => setType(e.target.value)}>
              {TYPES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Tu correo</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </label>
          <label>
            <span>Asunto</span>
            <input value={summary} onChange={(e) => setSummary(e.target.value)} />
          </label>
          <label>
            <span>Mensaje</span>
            <textarea rows={6} value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          {state === 'invalid' && <p className="panel-note">Escribe un correo válido, un asunto y un mensaje.</p>}
          {state === 'failed' && <p className="panel-note">No se pudo enviar. Inténtalo más tarde o escribe desde stepbible.org.</p>}
          <button className="solid" disabled={state === 'sending'}>
            {state === 'sending' ? 'Enviando…' : 'Enviar el mensaje'}
          </button>
        </form>
      )}
    </Dialog>
  )
}
