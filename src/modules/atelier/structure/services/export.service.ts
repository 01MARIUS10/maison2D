import type { Plan } from '../../types'

/** Nom de fichier sûr dérivé du nom de l'atelier : sans accents ni caractères spéciaux. */
export function exportFileBase(plan: Plan): string {
  const slug = plan.nom
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'plan'
}

/** Données complètes du plan, sans identifiant d'utilisateur, avec une version de format pour de futurs imports. */
export function planToExportJson(plan: Plan): string {
  const { userId: _userId, ...data } = plan
  return JSON.stringify({ format: 'maison2d-plan', version: 1, exportedAt: new Date().toISOString(), plan: data }, null, 2)
}

/** Déclenche le téléchargement d'une URL (data: ou blob:) sous le nom donné. */
export function downloadUrl(url: string, filename: string) {
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
}

export function downloadBlob(data: BlobPart, filename: string, mimeType: string) {
  const url = URL.createObjectURL(new Blob([data], { type: mimeType }))
  downloadUrl(url, filename)
  // Laisse le temps au navigateur de démarrer le téléchargement avant de libérer l'URL.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Octets d'une image `data:` (PNG/JPEG en base64). */
export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const binary = atob(dataUrl.slice(dataUrl.indexOf(',') + 1))
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

// A4 paysage en points PDF (1 pt = 1/72 pouce).
const A4_LANDSCAPE = { width: 841.89, height: 595.28 }
const PDF_MARGIN = 24

/**
 * PDF d'une page A4 paysage contenant une image JPEG, centrée et mise à l'échelle sans déformation.
 * Généré à la main (une image = quelques objets PDF) pour ne pas embarquer de bibliothèque.
 */
export function jpegToPdf(jpeg: Uint8Array, imageWidth: number, imageHeight: number): Uint8Array<ArrayBuffer> {
  const { width: pageWidth, height: pageHeight } = A4_LANDSCAPE
  const fit = Math.min((pageWidth - 2 * PDF_MARGIN) / imageWidth, (pageHeight - 2 * PDF_MARGIN) / imageHeight)
  const drawWidth = imageWidth * fit
  const drawHeight = imageHeight * fit
  const x = (pageWidth - drawWidth) / 2
  const y = (pageHeight - drawHeight) / 2
  const num = (value: number) => value.toFixed(2)

  const encoder = new TextEncoder()
  const chunks: Uint8Array[] = []
  const offsets: number[] = []
  let length = 0
  const push = (chunk: Uint8Array | string) => {
    const bytes = typeof chunk === 'string' ? encoder.encode(chunk) : chunk
    chunks.push(bytes)
    length += bytes.length
  }
  const startObject = (id: number) => {
    offsets[id] = length
    push(`${id} 0 obj\n`)
  }

  push('%PDF-1.4\n')
  startObject(1)
  push('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n')
  startObject(2)
  push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n')
  startObject(3)
  push(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(pageWidth)} ${num(pageHeight)}] ` +
      '/Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n',
  )
  startObject(4)
  push(
    `<< /Type /XObject /Subtype /Image /Width ${imageWidth} /Height ${imageHeight} ` +
      `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
  )
  push(jpeg)
  push('\nendstream\nendobj\n')

  const content = `q ${num(drawWidth)} 0 0 ${num(drawHeight)} ${num(x)} ${num(y)} cm /Im0 Do Q`
  startObject(5)
  push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`)

  const xrefStart = length
  push('xref\n0 6\n0000000000 65535 f \n')
  for (let id = 1; id <= 5; id++) push(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`)
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`)

  const pdf = new Uint8Array(length)
  let position = 0
  for (const chunk of chunks) {
    pdf.set(chunk, position)
    position += chunk.length
  }
  return pdf
}
