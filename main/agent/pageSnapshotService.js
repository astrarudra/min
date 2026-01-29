function agentSnapshotBuildExpression (fn, args) {
  const serialized = args.map(arg => JSON.stringify(arg)).join(', ')
  return '(' + fn.toString() + ')(' + serialized + ')'
}

const agentBuildSnapshot = function (options) {
  const maxItems = (options && options.maxItems) || 200
  const maxHeadings = (options && options.maxHeadings) || 50
  const maxTextLength = (options && options.maxTextLength) || 200000

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
    return normalize(el.innerText || el.textContent || el.getAttribute('aria-label') || el.getAttribute('title') || '')
  }

  const root = document.querySelector('main') || document.querySelector('[role=main]') || document.querySelector('article') || document.body
  const clone = root ? root.cloneNode(true) : document.body.cloneNode(true)
  const removeSelectors = [
    'nav',
    'header',
    'footer',
    'aside',
    '[role=navigation]',
    '[role=search]',
    '[aria-label*="nav" i]',
    '.nav',
    '.navbar',
    '.footer',
    '.header',
    '.sidebar',
    '.advertisement',
    '.ads',
    '.ad',
    '.cookie',
    '.banner',
    '.subscribe',
    '.signup',
    '.modal'
  ]

  clone.querySelectorAll(removeSelectors.join(',')).forEach(function (el) {
    el.remove()
  })
  clone.querySelectorAll('script, style, noscript').forEach(function (el) {
    el.remove()
  })

  let mainText = normalize(clone.textContent || '')
  if (mainText.length > maxTextLength) {
    mainText = mainText.slice(0, maxTextLength)
  }

  const headings = Array.from(root.querySelectorAll('h1, h2, h3, h4, h5, h6')).map(function (el) {
    return textFor(el)
  }).filter(Boolean).slice(0, maxHeadings)

  const links = Array.from(root.querySelectorAll('a[href]')).map(function (el) {
    return {
      text: textFor(el),
      href: el.getAttribute('href') || ''
    }
  }).filter(function (item) {
    return item.href
  }).slice(0, maxItems)

  const buttons = Array.from(root.querySelectorAll('button, [role=button], input[type=button], input[type=submit], input[type=reset]')).filter(isVisible).map(function (el) {
    return {
      text: textFor(el),
      selector: buildSelector(el)
    }
  }).slice(0, maxItems)

  const inputs = Array.from(root.querySelectorAll('input, textarea, select')).filter(isVisible).map(function (el) {
    const tag = el.tagName.toLowerCase()
    const type = el.getAttribute('type') || (tag === 'textarea' ? 'textarea' : tag === 'select' ? 'select' : '')
    return {
      name: el.getAttribute('name') || el.getAttribute('aria-label') || el.id || '',
      type,
      selector: buildSelector(el)
    }
  }).slice(0, maxItems)

  return {
    mainText,
    headings,
    links,
    buttons,
    inputs
  }
}

const agentPageSnapshotService = {
  async getSnapshot (webContents) {
    const expression = agentSnapshotBuildExpression(agentBuildSnapshot, [{ maxItems: 200, maxHeadings: 50, maxTextLength: 200000 }])
    const result = await global.agentCdpClient.evaluate(webContents, expression)
    return result.value || {}
  }
}

global.agentPageSnapshotService = agentPageSnapshotService
