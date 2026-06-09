const allowedUrlPattern = /^(https?:|mailto:|tel:|\/|#)/i

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function sanitizeUrl(value) {
  const url = String(value || '').trim().replace(/&amp;/g, '&')
  return allowedUrlPattern.test(url) ? escapeHtml(url) : '#'
}

function renderInline(value) {
  const codeTokens = []
  let text = String(value ?? '').replace(/`([^`\n]+)`/g, (_, code) => {
    const index = codeTokens.push(`<code>${escapeHtml(code)}</code>`) - 1
    return `\u0000code-${index}\u0000`
  })

  text = escapeHtml(text)
  text = text.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (_, alt, url) => {
    return `<img src="${sanitizeUrl(url)}" alt="${alt}" loading="lazy" />`
  })
  text = text.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (_, label, url) => {
    return `<a href="${sanitizeUrl(url)}" target="_blank" rel="noreferrer">${label}</a>`
  })
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  text = text.replace(/__([^_]+)__/g, '<strong>$1</strong>')
  text = text.replace(/(^|[^\*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
  text = text.replace(/(^|[^_])_([^_\n]+)_/g, '$1<em>$2</em>')
  text = text.replace(/~~([^~]+)~~/g, '<del>$1</del>')

  return text.replace(/\u0000code-(\d+)\u0000/g, (_, index) => codeTokens[Number(index)] || '')
}

function listMatch(line) {
  const match = String(line || '').match(/^(\s*)((?:[-*+])|(?:\d+\.))\s+(.*)$/)
  if (!match) return null
  return {
    indent: match[1].replace(/\t/g, '  ').length,
    ordered: /\d+\./.test(match[2]),
    content: match[3],
  }
}

function isFence(line) {
  return /^```/.test(line.trim())
}

function isHeading(line) {
  return /^(#{1,4})\s+\S/.test(line)
}

function isUnorderedList(line) {
  return /^\s*[-*+]\s+\S/.test(line)
}

function isOrderedList(line) {
  return /^\s*\d+\.\s+\S/.test(line)
}

function isBlockquote(line) {
  return /^\s*>\s?/.test(line)
}

function isDivider(line) {
  return /^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)
}

function splitTableRow(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())
}

function isTableDividerCell(cell) {
  return /^:?-{1,}:?$/.test(String(cell || '').trim())
}

function isTableDividerRow(line) {
  const cells = splitTableRow(line)
  return cells.length > 0 && cells.every(isTableDividerCell)
}

function isTableStart(lines, index) {
  if (!lines[index]?.includes('|') || !lines[index + 1]?.includes('|')) return false
  const headers = splitTableRow(lines[index])
  const cells = splitTableRow(lines[index + 1])
  return headers.length > 1 && cells.length >= headers.length && cells.every(isTableDividerCell)
}

function renderList(lines, index, ordered) {
  const first = listMatch(lines[index])
  if (!first) return { html: '', cursor: index + 1 }
  return renderListAtIndent(lines, index, first.indent, ordered)
}

function renderListAtIndent(lines, index, indent, ordered) {
  const tag = ordered ? 'ol' : 'ul'
  const items = []
  let cursor = index
  while (cursor < lines.length) {
    const current = listMatch(lines[cursor])
    if (!current || current.indent < indent) break
    if (current.indent > indent) {
      if (!items.length) break
      const nested = renderListAtIndent(lines, cursor, current.indent, current.ordered)
      items[items.length - 1] += nested.html
      cursor = nested.cursor
      continue
    }
    if (current.ordered !== ordered) break
    let itemHtml = renderInline(current.content)
    cursor += 1
    while (cursor < lines.length) {
      const next = listMatch(lines[cursor])
      if (!next || next.indent <= indent) break
      const nested = renderListAtIndent(lines, cursor, next.indent, next.ordered)
      itemHtml += nested.html
      cursor = nested.cursor
    }
    items.push(itemHtml)
  }
  return {
    html: `<${tag}>${items.map((item) => `<li>${item}</li>`).join('')}</${tag}>`,
    cursor,
  }
}

function renderTable(lines, index) {
  const headers = splitTableRow(lines[index])
  const rows = []
  let cursor = index + 2
  while (cursor < lines.length && lines[cursor].includes('|') && lines[cursor].trim() && !isTableDividerRow(lines[cursor])) {
    rows.push(splitTableRow(lines[cursor]))
    cursor += 1
  }
  const headHtml = headers.map((cell) => `<th>${renderInline(cell)}</th>`).join('')
  const bodyHtml = rows.map((row) => (
    `<tr>${headers.map((_, cellIndex) => `<td>${renderInline(row[cellIndex] || '')}</td>`).join('')}</tr>`
  )).join('')
  return {
    html: `<div class="markdown-table-wrap"><table><thead><tr>${headHtml}</tr></thead><tbody>${bodyHtml}</tbody></table></div>`,
    cursor,
  }
}

export function renderMarkdown(value, options = {}) {
  const lines = String(value ?? '').replace(/\r\n?/g, '\n').split('\n')
  const blocks = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]
    if (!line.trim()) {
      index += 1
      continue
    }

    if (isFence(line)) {
      const codeLines = []
      index += 1
      while (index < lines.length && !isFence(lines[index])) {
        codeLines.push(lines[index])
        index += 1
      }
      if (index < lines.length) index += 1
      const codeHtml = `<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`
      blocks.push(options.copyCode
        ? `<div class="markdown-code-wrap"><button class="markdown-code-copy" type="button" data-copy-code="1"><i class="ti ti-copy"></i><span>复制</span></button>${codeHtml}</div>`
        : codeHtml)
      continue
    }

    if (isTableStart(lines, index)) {
      const table = renderTable(lines, index)
      blocks.push(table.html)
      index = table.cursor
      continue
    }

    if (isDivider(line)) {
      blocks.push('<hr />')
      index += 1
      continue
    }

    const headingMatch = line.match(/^(#{1,4})\s+(.+)$/)
    if (headingMatch) {
      const level = Math.min(headingMatch[1].length + 2, 6)
      blocks.push(`<h${level}>${renderInline(headingMatch[2])}</h${level}>`)
      index += 1
      continue
    }

    if (isBlockquote(line)) {
      const quoteLines = []
      while (index < lines.length && isBlockquote(lines[index])) {
        quoteLines.push(lines[index].replace(/^\s*>\s?/, ''))
        index += 1
      }
      blocks.push(`<blockquote>${quoteLines.map(renderInline).join('<br />')}</blockquote>`)
      continue
    }

    if (isUnorderedList(line) || isOrderedList(line)) {
      const list = renderList(lines, index, isOrderedList(line))
      blocks.push(list.html)
      index = list.cursor
      continue
    }

    const paragraph = []
    while (
      index < lines.length &&
      lines[index].trim() &&
      !isFence(lines[index]) &&
      !isHeading(lines[index]) &&
      !isDivider(lines[index]) &&
      !isBlockquote(lines[index]) &&
      !isUnorderedList(lines[index]) &&
      !isOrderedList(lines[index]) &&
      !isTableStart(lines, index)
    ) {
      paragraph.push(lines[index])
      index += 1
    }
    blocks.push(`<p>${paragraph.map(renderInline).join('<br />')}</p>`)
  }

  return blocks.join('')
}
