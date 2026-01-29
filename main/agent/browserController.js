function buildExpression (fn, args) {
  const serialized = args.map(arg => JSON.stringify(arg)).join(', ')
  return '(' + fn.toString() + ')(' + serialized + ')'
}

const extractContent = function (options) {
  const maxItems = (options && options.maxItems) || 200
  const maxTextLength = (options && options.maxTextLength) || 200000
  const normalize = function (value) {
    return (value || '').replace(/\s+/g, ' ').trim()
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

  let text = normalize(clone.textContent || '')
  if (text.length > maxTextLength) {
    text = text.slice(0, maxTextLength)
  }

  const textFor = function (el) {
    return normalize(el.innerText || el.textContent || el.getAttribute('aria-label') || el.getAttribute('title') || '')
  }

  const links = Array.from(root.querySelectorAll('a[href]')).slice(0, maxItems).map(function (el) {
    return {
      text: textFor(el),
      href: el.getAttribute('href') || ''
    }
  }).filter(function (item) {
    return item.href
  })

  const buttons = Array.from(root.querySelectorAll('button, [role=button], input[type=button], input[type=submit], input[type=reset]')).slice(0, maxItems).map(function (el) {
    return {
      text: textFor(el),
      type: el.getAttribute('type') || el.tagName.toLowerCase(),
      name: el.getAttribute('name') || '',
      id: el.id || ''
    }
  })

  const inputs = Array.from(root.querySelectorAll('input, textarea, select')).slice(0, maxItems).map(function (el) {
    return {
      tag: el.tagName.toLowerCase(),
      type: el.getAttribute('type') || (el.tagName.toLowerCase() === 'textarea' ? 'textarea' : ''),
      name: el.getAttribute('name') || '',
      id: el.id || '',
      value: 'value' in el ? el.value : '',
      placeholder: el.getAttribute('placeholder') || '',
      ariaLabel: el.getAttribute('aria-label') || ''
    }
  })

  const forms = Array.from(root.querySelectorAll('form')).slice(0, maxItems).map(function (form) {
    const formInputs = Array.from(form.querySelectorAll('input, textarea, select')).slice(0, maxItems).map(function (el) {
      return {
        tag: el.tagName.toLowerCase(),
        type: el.getAttribute('type') || '',
        name: el.getAttribute('name') || '',
        id: el.id || '',
        placeholder: el.getAttribute('placeholder') || ''
      }
    })

    return {
      action: form.getAttribute('action') || '',
      method: (form.getAttribute('method') || 'get').toLowerCase(),
      id: form.id || '',
      name: form.getAttribute('name') || '',
      inputs: formInputs
    }
  })

  return {
    text,
    links,
    buttons,
    inputs,
    forms
  }
}

const querySelectorAll = function (selector, limit) {
  const maxItems = limit || 50
  const normalize = function (value) {
    return (value || '').replace(/\s+/g, ' ').trim()
  }

  const nodes = Array.from(document.querySelectorAll(selector))
  const matches = nodes.slice(0, maxItems).map(function (el) {
    const rect = el.getBoundingClientRect()
    return {
      tag: el.tagName.toLowerCase(),
      text: normalize(el.innerText || el.textContent || ''),
      href: el.getAttribute('href') || '',
      value: 'value' in el ? el.value : '',
      id: el.id || '',
      classes: el.className || '',
      name: el.getAttribute('name') || '',
      type: el.getAttribute('type') || '',
      rect: {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height
      }
    }
  })

  return {
    count: nodes.length,
    matches
  }
}

const focusSelector = function (selector, clear) {
  const el = document.querySelector(selector)
  if (!el) {
    return { ok: false, error: 'not-found' }
  }

  if (el.scrollIntoView) {
    el.scrollIntoView({ block: 'center', inline: 'center' })
  }

  try {
    el.focus()
  } catch (e) {}

  if (clear && 'value' in el) {
    el.value = ''
    if (el.select) {
      el.select()
    }
  }

  const rect = el.getBoundingClientRect()
  return {
    ok: true,
    rect: {
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height
    }
  }
}

const scrollPage = function (options) {
  const opts = options || {}
  if (opts.selector) {
    const el = document.querySelector(opts.selector)
    if (el && el.scrollIntoView) {
      el.scrollIntoView({ block: opts.block || 'center', inline: opts.inline || 'center' })
      return { ok: true, x: window.scrollX, y: window.scrollY }
    }
  }

  if (typeof opts.x === 'number' || typeof opts.y === 'number') {
    window.scrollTo(typeof opts.x === 'number' ? opts.x : window.scrollX, typeof opts.y === 'number' ? opts.y : window.scrollY)
  } else {
    window.scrollBy(opts.deltaX || 0, opts.deltaY || 0)
  }

  return { ok: true, x: window.scrollX, y: window.scrollY }
}

const browserController = {
  listTabs () {
    return global.agentTabManager.listTabs()
  },
  getActiveTab () {
    return global.agentTabManager.getActiveTab()
  },
  async newTab (options) {
    const url = options && options.url
    if (!url) {
      const error = new Error('newTab requires url')
      error.status = 400
      throw error
    }
    const currentWindow = windows.getCurrent()
    sendIPCToWindow(currentWindow, 'addTab', { url })
    return {
      ok: true,
      url
    }
  },
  _resolveElementSelector (webContents, options) {
    if (!options || !options.elementId) {
      return options
    }
    const selector = global.agentElementFinder.resolveSelector(webContents, options.elementId)
    if (!selector) {
      const error = new Error('Element id not found')
      error.status = 404
      throw error
    }
    return Object.assign({}, options, { selector })
  },
  _getWebContents (tabId) {
    const webContents = global.agentTabManager.getWebContents(tabId)
    if (!webContents) {
      const error = new Error('Tab not found')
      error.status = 404
      throw error
    }
    if (webContents.isDestroyed()) {
      const error = new Error('Tab is destroyed')
      error.status = 404
      throw error
    }
    return webContents
  },
  _getClickPoint (rect) {
    return {
      x: rect.x + rect.width / 2,
      y: rect.y + rect.height / 2
    }
  },
  async getHtml (tabId) {
    const webContents = this._getWebContents(tabId)
    const html = await global.agentCdpClient.getOuterHTML(webContents)
    return {
      id: tabId.toString(),
      html
    }
  },
  async getText (tabId) {
    const webContents = this._getWebContents(tabId)
    const expression = buildExpression(extractContent, [{ maxItems: 200, maxTextLength: 200000 }])
    const result = await global.agentCdpClient.evaluate(webContents, expression)

    return Object.assign({
      id: tabId.toString(),
      title: webContents.getTitle() || '',
      url: webContents.getURL() || ''
    }, result.value || {})
  },
  async snapshot (tabId) {
    const webContents = this._getWebContents(tabId)
    const snapshot = await global.agentPageSnapshotService.getSnapshot(webContents)
    return Object.assign({
      url: webContents.getURL() || '',
      title: webContents.getTitle() || ''
    }, snapshot)
  },
  async accessibility (tabId) {
    const webContents = this._getWebContents(tabId)
    return global.agentAccessibilityService.getTree(webContents)
  },
  async elements (tabId) {
    const webContents = this._getWebContents(tabId)
    return global.agentElementFinder.listInteractiveElements(webContents, { maxItems: 200 })
  },
  async waitFor (tabId, options) {
    const webContents = this._getWebContents(tabId)
    return global.agentWaitService.waitFor(webContents, options || {})
  },
  async query (tabId, selector, limit) {
    const webContents = this._getWebContents(tabId)
    const safeLimit = Math.min(limit || 50, 500)
    const expression = buildExpression(querySelectorAll, [selector, safeLimit])
    const result = await global.agentCdpClient.evaluate(webContents, expression)

    return {
      id: tabId.toString(),
      selector,
      count: result.value.count,
      matches: result.value.matches
    }
  },
  async screenshot (tabId) {
    const webContents = this._getWebContents(tabId)
    const data = await global.agentCdpClient.captureScreenshot(webContents)
    return {
      id: tabId.toString(),
      dataUrl: 'data:image/png;base64,' + data
    }
  },
  async navigate (tabId, url) {
    const webContents = this._getWebContents(tabId)
    await global.agentCdpClient.ensureDomains(webContents, ['Page'])
    const result = await global.agentCdpClient.send(webContents, 'Page.navigate', { url })
    return {
      id: tabId.toString(),
      frameId: result.frameId,
      loaderId: result.loaderId || null,
      url
    }
  },
  async click (tabId, options) {
    const webContents = this._getWebContents(tabId)
    await global.agentCdpClient.ensureDomains(webContents, ['Input', 'Runtime'])

    const resolvedOptions = this._resolveElementSelector(webContents, options || {})

    let x = resolvedOptions && typeof resolvedOptions.x === 'number' ? resolvedOptions.x : null
    let y = resolvedOptions && typeof resolvedOptions.y === 'number' ? resolvedOptions.y : null

    if ((x === null || y === null) && resolvedOptions && resolvedOptions.selector) {
      const expression = buildExpression(focusSelector, [resolvedOptions.selector, false])
      const focusResult = await global.agentCdpClient.evaluate(webContents, expression)
      if (!focusResult.value.ok) {
        const error = new Error('Element not found')
        error.status = 404
        throw error
      }
      const rect = focusResult.value.rect
      const point = this._getClickPoint(rect)
      x = point.x
      y = point.y
    }

    if (x === null || y === null) {
      const error = new Error('Click requires selector or coordinates')
      error.status = 400
      throw error
    }

    await global.agentCdpClient.send(webContents, 'Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x,
      y,
      button: 'left'
    })
    await global.agentCdpClient.send(webContents, 'Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x,
      y,
      button: 'left',
      clickCount: 1
    })
    await global.agentCdpClient.send(webContents, 'Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x,
      y,
      button: 'left',
      clickCount: 1
    })

    return {
      id: tabId.toString(),
      ok: true
    }
  },
  async type (tabId, options) {
    const webContents = this._getWebContents(tabId)
    await global.agentCdpClient.ensureDomains(webContents, ['Input', 'Runtime'])

    const resolvedOptions = this._resolveElementSelector(webContents, options || {})

    if (!resolvedOptions || !resolvedOptions.text) {
      const error = new Error('Type requires text')
      error.status = 400
      throw error
    }

    if (resolvedOptions.selector) {
      const expression = buildExpression(focusSelector, [resolvedOptions.selector, resolvedOptions.clear === true])
      const focusResult = await global.agentCdpClient.evaluate(webContents, expression)
      if (!focusResult.value.ok) {
        const error = new Error('Element not found')
        error.status = 404
        throw error
      }
    }

    await global.agentCdpClient.send(webContents, 'Input.insertText', { text: resolvedOptions.text })

    return {
      id: tabId.toString(),
      ok: true
    }
  },
  async clickByText (tabId, options) {
    const webContents = this._getWebContents(tabId)
    await global.agentCdpClient.ensureDomains(webContents, ['Input', 'Runtime', 'DOM', 'Accessibility'])

    if (!options || !options.text) {
      const error = new Error('clickByText requires text')
      error.status = 400
      throw error
    }

    const axMatch = await global.agentAccessibilityService.findClickableByText(webContents, options.text)
    if (axMatch && axMatch.bounds) {
      const point = this._getClickPoint(axMatch.bounds)
      await global.agentCdpClient.send(webContents, 'Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: point.x,
        y: point.y,
        button: 'left'
      })
      await global.agentCdpClient.send(webContents, 'Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x: point.x,
        y: point.y,
        button: 'left',
        clickCount: 1
      })
      await global.agentCdpClient.send(webContents, 'Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x: point.x,
        y: point.y,
        button: 'left',
        clickCount: 1
      })

      return {
        id: tabId.toString(),
        ok: true,
        method: 'accessibility',
        target: {
          role: axMatch.role,
          name: axMatch.name
        }
      }
    }

    const domMatch = await global.agentElementFinder.findClickableByText(webContents, options.text)
    if (!domMatch || !domMatch.found || !domMatch.rect) {
      const error = new Error('Element not found')
      error.status = 404
      throw error
    }

    const domPoint = this._getClickPoint(domMatch.rect)
    await global.agentCdpClient.send(webContents, 'Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: domPoint.x,
      y: domPoint.y,
      button: 'left'
    })
    await global.agentCdpClient.send(webContents, 'Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: domPoint.x,
      y: domPoint.y,
      button: 'left',
      clickCount: 1
    })
    await global.agentCdpClient.send(webContents, 'Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: domPoint.x,
      y: domPoint.y,
      button: 'left',
      clickCount: 1
    })

    return {
      id: tabId.toString(),
      ok: true,
      method: 'dom',
      target: {
        text: domMatch.text || '',
        selector: domMatch.selector || ''
      }
    }
  },
  async scroll (tabId, options) {
    const webContents = this._getWebContents(tabId)
    const expression = buildExpression(scrollPage, [options || {}])
    const result = await global.agentCdpClient.evaluate(webContents, expression)
    return {
      id: tabId.toString(),
      ok: result.value.ok,
      x: result.value.x,
      y: result.value.y
    }
  },
  async exec (tabId, options) {
    const webContents = this._getWebContents(tabId)
    if (!options || !options.script) {
      const error = new Error('Exec requires script')
      error.status = 400
      throw error
    }

    const result = await global.agentCdpClient.evaluate(webContents, options.script, {
      awaitPromise: options.awaitPromise !== false,
      returnByValue: options.returnByValue !== false
    })

    return {
      id: tabId.toString(),
      result: result.value !== undefined ? result.value : result
    }
  }
}

global.agentBrowserController = browserController
