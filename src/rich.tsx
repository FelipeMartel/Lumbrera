import type { ReactNode } from 'react'

// El léxico y los comentarios llegan como HTML del motor. Se reconstruye con una lista
// cerrada de etiquetas, sin insertar nunca el HTML tal cual.
const TAGS: Record<string, keyof JSX.IntrinsicElements> = {
  B: 'strong', STRONG: 'strong', I: 'em', EM: 'em', P: 'p', UL: 'ul', OL: 'ol', LI: 'li',
  SUP: 'sup', BLOCKQUOTE: 'blockquote', H1: 'h4', H2: 'h4', H3: 'h4', H4: 'h4', H5: 'h4', H6: 'h4',
}

export function renderHtml(html: string, onReference?: (reference: string) => void): ReactNode {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  let key = 0
  const walk = (node: Node): ReactNode => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent
    if (!(node instanceof Element) || node.matches('.xgen, a.verseLink, .verseNumber, .notesPane, script, style')) return null
    const children = Array.from(node.childNodes).map(walk)
    key += 1
    if (node.tagName === 'BR') return <br key={key} />
    if (node.tagName === 'A') {
      const reference = /reference=([^&|]+)/.exec(node.getAttribute('href') ?? '')?.[1]
      if (reference && onReference) {
        return (
          <button key={key} className="reference" onClick={() => onReference(decodeURIComponent(reference))}>
            {children}
          </button>
        )
      }
      const title = node.getAttribute('title')?.trim()
      return title ? (
        <abbr key={key} title={title}>
          {children}
        </abbr>
      ) : (
        <span key={key}>{children}</span>
      )
    }
    const Tag = TAGS[node.tagName] ?? 'span'
    return <Tag key={key}>{children}</Tag>
  }
  return Array.from(doc.body.childNodes).map(walk)
}

/** Indica si el HTML trae algo más que el título y los números de versículo. */
export function hasText(html: string): boolean {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('.xgen, .verseNumber').forEach((el) => el.remove())
  return (doc.body.textContent ?? '').trim().length > 0
}
