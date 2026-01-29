const agentElementCache = new Map()
const agentElementCacheTtlMs = 5 * 60 * 1000

function agentBuildExpression (fn, args) {
  const serialized = args.map(arg => JSON.stringify(arg)).join(', ')
  return '(' + fn.toString() + ')(' + serialized + ')'
}

const agentCollectInteractiveElements = function (options) {
  const maxItems = (options && options.maxItems) || 200
  const includeHidden = options && options.includeHidden === true

  const normalize = function (value) {
    return (value || '').replace(/\s+/g, ' ').trim()
  }

  const cssEscape = function (value) {
    if (window.CSS && window.CSS.escape) {
      return window.CSS.escape(value)
    }
    return value.replace(/[^a-zA-Z0-9_-]/g, '\\$&')
  }

  const buildSelector = function (el) {
    if (!el || el.nodeType !== 1) {
      return ''
    }

    if (el.id) {
      const idSelector = '#' + cssEscape(el.id)
      if (document.querySelectorAll(idSelector).length === 1) {
        return idSelector
      }
    }

    const testId = el.getAttribute('data-testid') || el.getAttribute('data-test')
    if (testId) {
      const testSelector = '[data-testid="' + cssEscape(testId) + '"]'
      if (document.querySelectorAll(testSelector).length === 1) {
        return testSelector
      }
    }

    const nameAttr = el.getAttribute('name')
    if (nameAttr) {
      const nameSelector = el.tagName.toLowerCase() + '[name="' + cssEscape(nameAttr) + '"]'
      if (document.querySelectorAll(nameSelector).length === 1) {
        return nameSelector
      }
    }

    let current = el
    const parts = []
    while (current && current.nodeType === 1 && current.tagName.toLowerCase() !== 'html') {
      let part = current.tagName.toLowerCase()
      const siblings = current.parentElement
        ? Array.from(current.parentElement.children).filter(function (sibling) {
          return sibling.tagName === current.tagName
        })
        : []
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1
        part += ':nth-of-type(' + index + ')'
      }
      parts.unshift(part)
      if (parts.length >= 6) {
        break
      }
      current = current.parentElement
    }

    return parts.join(' > ')
  }

  const isVisible = function (el) {
    if (!el || !el.getBoundingClientRect) {
      return false
    }
    const rect = el.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) {
      return false
    }
    const style = window.getComputedStyle(el)
    if (!style) {
      return false
    }
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false
    }
    return true
  }

  const textFor = function (el) {
    if (!el) {
      return ''
    }
    if (el.tagName && el.tagName.toLowerCase() === 'input') {
      return normalize(el.value || el.getAttribute('value') || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '')
    }
    return normalize(el.innerText || el.textContent || el.getAttribute('aria-label') || el.getAttribute('title') || '')
  }

  const elements = Array.from(document.querySelectorAll('a[href], button, input, textarea, select, [role=button], [role=link], [role=checkbox], [role=menuitem], [role=tab], [role=option], [role=switch], [role=combobox], [role=textbox]'))

  const results = []
  for (let i = 0; i < elements.length; i++) {
    if (results.length >= maxItems) {
      break
    }
    const el = elements[i]
    if (!includeHidden && !isVisible(el)) {
      continue
    }

    const tag = el.tagName.toLowerCase()
    let type = 'element'
    if (tag === 'a' || el.getAttribute('role') === 'link') {
      type = 'link'
    } else if (tag === 'button' || el.getAttribute('role') === 'button' || (tag === 'input' && ['button', 'submit', 'reset'].includes((el.getAttribute('type') || '').toLowerCase()))) {
      type = 'button'
    } else if (tag === 'input' || tag === 'textarea' || tag === 'select' || el.getAttribute('role') === 'textbox') {
      type = 'input'
    } else if (el.getAttribute('role')) {
      type = el.getAttribute('role')
    }

    const selector = buildSelector(el)
    results.push({
      tag,
      type,
      text: textFor(el),
      selector: selector || ''
    })
  }

  return results
}

const agentFindClickableByText = function (text) {
  const target = (text || '').toLowerCase().trim()
  if (!target) {
    return { found: false }
  }

  const normalize = function (value) {
    return (value || '').replace(/\s+/g, ' ').trim()
  }

  const cssEscape = function (value) {
    if (window.CSS && window.CSS.escape) {
      return window.CSS.escape(value)
    }
    return value.replace(/[^a-zA-Z0-9_-]/g, '\\$&')
  }

  const buildSelector = function (el) {
    if (!el || el.nodeType !== 1) {
      return ''
    }

    if (el.id) {
      const idSelector = '#' + cssEscape(el.id)
      if (document.querySelectorAll(idSelector).length === 1) {
        return idSelector
      }
    }

    const testId = el.getAttribute('data-testid') || el.getAttribute('data-test')
    if (testId) {
      const testSelector = '[data-testid="' + cssEscape(testId) + '"]'
      if (document.querySelectorAll(testSelector).length === 1) {
        return testSelector
      }
    }

    let current = el
    const parts = []
    while (current && current.nodeType === 1 && current.tagName.toLowerCase() !== 'html') {
      let part = current.tagName.toLowerCase()
      const siblings = current.parentElement
        ? Array.from(current.parentElement.children).filter(function (sibling) {
          return sibling.tagName === current.tagName
        })
        : []
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1
        part += ':nth-of-type(' + index + ')'
      }
      parts.unshift(part)
      if (parts.length >= 6) {
        break
      }
      current = current.parentElement
    }

    return parts.join(' > ')
  }

  const isVisible = function (el) {
    if (!el || !el.getBoundingClientRect) {
      return false
    }
    const rect = el.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) {
      return false
    }
    const style = window.getComputedStyle(el)
    if (!style) {
      return false
    }
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false
    }
    return true
  }

  const textFor = function (el) {
    if (!el) {
      return ''
    }
    if (el.tagName && el.tagName.toLowerCase() === 'input') {
      return normalize(el.value || el.getAttribute('value') || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '')
    }
    return normalize(el.innerText || el.textContent || el.getAttribute('aria-label') || el.getAttribute('title') || '')
  }

  const candidates = Array.from(document.querySelectorAll('button, [role=button], a[href], [role=link], input, [role=menuitem], [role=tab]'))
  let best = null
  let bestScore = 0

  for (let i = 0; i < candidates.length; i++) {
    const el = candidates[i]
    if (!isVisible(el)) {
      continue
    }
    const textValue = textFor(el)
    if (!textValue) {
      continue
    }
    const lower = textValue.toLowerCase()
    let score = 0
    if (lower === target) {
      score = 3
    } else if (lower.startsWith(target)) {
      score = 2
    } else if (lower.includes(target)) {
      score = 1
    }
    if (score > 0 && score >= bestScore) {
      bestScore = score
      best = el
      if (score === 3) {
        break
      }
    }
  }

  if (!best) {
    return { found: false }
  }

  const rect = best.getBoundingClientRect()
  return {
    found: true,
    selector: buildSelector(best),
    text: textFor(best),
    rect: {
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height
    }
  }
}

const agentElementFinder = {
  async listInteractiveElements (webContents, options = {}) {
    const expression = agentBuildExpression(agentCollectInteractiveElements, [options])
    const result = await global.agentCdpClient.evaluate(webContents, expression)
    const rawElements = result.value || []

    const elements = rawElements.map(function (item, index) {
      const id = 'e' + (index + 1)
      return {
        id,
        type: item.type || 'element',
        text: item.text || '',
        selector: item.selector || ''
      }
    })

    const byId = {}
    elements.forEach(function (item) {
      if (item.selector) {
        byId[item.id] = item.selector
      }
    })

    agentElementCache.set(webContents.id.toString(), {
      timestamp: Date.now(),
      elements,
      byId
    })

    return elements
  },
  resolveSelector (webContents, elementId) {
    const key = webContents.id.toString()
    const entry = agentElementCache.get(key)
    if (!entry) {
      return null
    }
    if (Date.now() - entry.timestamp > agentElementCacheTtlMs) {
      agentElementCache.delete(key)
      return null
    }
    return entry.byId[elementId] || null
  },
  clearCacheForWebContentsId (webContentsId) {
    if (!webContentsId) {
      return
    }
    agentElementCache.delete(webContentsId.toString())
  },
  async findClickableByText (webContents, text) {
    const expression = agentBuildExpression(agentFindClickableByText, [text])
    const result = await global.agentCdpClient.evaluate(webContents, expression)
    return result.value || { found: false }
  }
}

global.agentElementFinder = agentElementFinder
