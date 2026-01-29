function agentWaitBuildExpression (fn, args) {
  const serialized = args.map(arg => JSON.stringify(arg)).join(', ')
  return '(' + fn.toString() + ')(' + serialized + ')'
}

const agentFindInDom = function (options) {
  const selector = options && options.selector
  const text = options && options.text
  const maxScan = (options && options.maxScan) || 1500

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

  if (selector) {
    const el = document.querySelector(selector)
    if (el && isVisible(el)) {
      const rect = el.getBoundingClientRect()
      return {
        found: true,
        selector,
        text: textFor(el),
        tag: el.tagName.toLowerCase(),
        rect: {
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height
        }
      }
    }
    return { found: false }
  }

  if (!text) {
    return { found: false }
  }

  const target = text.toLowerCase().trim()
  const candidates = Array.from(document.querySelectorAll('button, [role=button], a[href], [role=link], input, [role=menuitem], [role=tab], h1, h2, h3, h4, h5, h6'))
  for (let i = 0; i < candidates.length && i < maxScan; i++) {
    const el = candidates[i]
    if (!isVisible(el)) {
      continue
    }
    const value = textFor(el)
    if (!value) {
      continue
    }
    if (value.toLowerCase().includes(target)) {
      const rect = el.getBoundingClientRect()
      return {
        found: true,
        selector: buildSelector(el),
        text: value,
        tag: el.tagName.toLowerCase(),
        rect: {
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height
        }
      }
    }
  }

  const all = Array.from(document.body ? document.body.querySelectorAll('*') : [])
  for (let i = 0; i < all.length && i < maxScan; i++) {
    const el = all[i]
    if (!isVisible(el)) {
      continue
    }
    const value = textFor(el)
    if (!value) {
      continue
    }
    if (value.toLowerCase().includes(target)) {
      const rect = el.getBoundingClientRect()
      return {
        found: true,
        selector: buildSelector(el),
        text: value,
        tag: el.tagName.toLowerCase(),
        rect: {
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height
        }
      }
    }
  }

  return { found: false }
}

function agentWaitDelay (ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms)
  })
}

const agentWaitService = {
  async waitFor (webContents, options) {
    const selector = options && options.selector
    const text = options && options.text
    if (!selector && !text) {
      const error = new Error('waitFor requires selector or text')
      error.status = 400
      throw error
    }

    const timeout = typeof options.timeout === 'number' ? options.timeout : 5000
    const interval = typeof options.interval === 'number' ? options.interval : 250

    const start = Date.now()

    while (Date.now() - start < timeout) {
      const expression = agentWaitBuildExpression(agentFindInDom, [{ selector, text }])
      const result = await global.agentCdpClient.evaluate(webContents, expression)
      if (result.value && result.value.found) {
        return {
          ok: true,
          matched: result.value
        }
      }
      await agentWaitDelay(interval)
    }

    return {
      ok: false,
      timeout: true,
      matched: null
    }
  }
}

global.agentWaitService = agentWaitService
