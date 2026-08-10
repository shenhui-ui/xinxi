function toPlainText(htmlText) {
  if (typeof document !== 'undefined') {
    const div = document.createElement('div')
    div.innerHTML = htmlText
    return div.innerText || div.textContent || ''
  }
  return String(htmlText || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

export function cleanPaste(htmlText) {
  const raw = toPlainText(htmlText)
  return raw.split(/\n+/).map((t) => t.trim()).filter(Boolean)
    .map((t) => `<p data-block="body">${escapeHtml(t)}</p>`)
}

export function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function isEditorEmpty(html) {
  let text
  let hasMedia
  if (typeof document !== 'undefined') {
    const div = document.createElement('div')
    div.innerHTML = html || ''
    text = (div.textContent || '').trim()
    hasMedia = !!div.querySelector('img, a[data-attachment]')
  } else {
    text = String(html || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()
    hasMedia = /<img|<a[^>]*data-attachment/i.test(html || '')
  }
  if (text) return false
  return !hasMedia
}
