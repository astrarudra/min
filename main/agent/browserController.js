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

const rectForSelector = function (selector) {
  const el = document.querySelector(selector)
  if (!el) {
    return { ok: false, error: 'not-found' }
  }

  if (el.scrollIntoView) {
    el.scrollIntoView({ block: 'center', inline: 'center' })
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

const fillFormFields = function (fields) {
  const cssEscape = function (value) {
    if (window.CSS && window.CSS.escape) {
      return window.CSS.escape(value)
    }
    return value.replace(/[^a-zA-Z0-9_-]/g, '\\\\$&')
  }

  const results = []
  const list = Array.isArray(fields) ? fields : []

  list.forEach(function (field) {
    if (!field) {
      return
    }
    let el = null
    if (field.selector) {
      el = document.querySelector(field.selector)
    } else if (field.name) {
      const selector = '[name=\"' + cssEscape(field.name) + '\"]'
      el = document.querySelector(selector)
    }

    if (!el) {
      results.push({
        name: field.name || '',
        selector: field.selector || '',
        ok: false,
        error: 'not-found'
      })
      return
    }

    if ('value' in el) {
      el.value = field.value == null ? '' : String(field.value)
    }
    if (el.dispatchEvent) {
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
    }

    results.push({
      name: field.name || '',
      selector: field.selector || '',
      ok: true
    })
  })

  return { ok: true, results }
}

const selectOptionForSelector = function (selector, options) {
  const el = document.querySelector(selector)
  if (!el) {
    return { ok: false, error: 'not-found' }
  }
  if (!el.options) {
    return { ok: false, error: 'not-select' }
  }

  let option = null
  if (typeof options.index === 'number') {
    option = el.options[options.index]
  } else if (typeof options.value === 'string') {
    option = Array.from(el.options).find(function (opt) { return opt.value === options.value })
  } else if (typeof options.label === 'string') {
    option = Array.from(el.options).find(function (opt) { return (opt.label || opt.textContent || '').trim() === options.label })
  }

  if (!option) {
    return { ok: false, error: 'option-not-found' }
  }

  option.selected = true
  el.value = option.value
  if (el.dispatchEvent) {
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }

  return { ok: true, value: el.value }
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
    const currentWindow = windows.getCurrent()
    const existing = new Set(this.listTabs().map(tab => tab.id))

    if (url) {
      sendIPCToWindow(currentWindow, 'addTab', { url })
    } else {
      sendIPCToWindow(currentWindow, 'addTab')
    }

    const tabId = await new Promise(function (resolve) {
      let resolved = false
      const timer = setTimeout(function () {
        if (!resolved) {
          resolved = true
          if (global.agentTabManager && global.agentTabManager.off) {
            global.agentTabManager.off('tab-created', onCreated)
          }
          resolve(null)
        }
      }, 2000)

      const onCreated = function (info) {
        if (!info || !info.id || existing.has(info.id)) {
          return
        }
        if (resolved) {
          return
        }
        resolved = true
        clearTimeout(timer)
        if (global.agentTabManager && global.agentTabManager.off) {
          global.agentTabManager.off('tab-created', onCreated)
        }
        resolve(info.id)
      }

      if (global.agentTabManager && global.agentTabManager.on) {
        global.agentTabManager.on('tab-created', onCreated)
      } else {
        clearTimeout(timer)
        resolve(null)
      }
    })

    return {
      ok: true,
      id: tabId,
      url: url || null
    }
  },
  async closeTab (tabId) {
    const windowsList = windows.getAll()
    if (!windowsList || windowsList.length === 0) {
      const error = new Error('No windows available')
      error.status = 404
      throw error
    }
    windowsList.forEach(function (win) {
      sendIPCToWindow(win, 'closeTab', { id: tabId.toString() })
    })
    return { ok: true, id: tabId.toString() }
  },
  async selectTab (tabId) {
    const windowsList = windows.getAll()
    if (!windowsList || windowsList.length === 0) {
      const error = new Error('No windows available')
      error.status = 404
      throw error
    }
    windowsList.forEach(function (win) {
      sendIPCToWindow(win, 'selectTab', { id: tabId.toString() })
    })
    return { ok: true, id: tabId.toString() }
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
  _normalizeModifiers (modifiers) {
    if (typeof modifiers === 'number') {
      return modifiers
    }
    if (!modifiers) {
      return 0
    }
    const map = {
      alt: 1,
      option: 1,
      ctrl: 2,
      control: 2,
      meta: 4,
      command: 4,
      cmd: 4,
      shift: 8
    }
    if (typeof modifiers === 'string') {
      return map[modifiers.toLowerCase()] || 0
    }
    if (Array.isArray(modifiers)) {
      return modifiers.reduce(function (mask, key) {
        const value = map[String(key).toLowerCase()] || 0
        return mask | value
      }, 0)
    }
    if (typeof modifiers === 'object') {
      let mask = 0
      if (modifiers.altKey) mask |= 1
      if (modifiers.ctrlKey) mask |= 2
      if (modifiers.metaKey) mask |= 4
      if (modifiers.shiftKey) mask |= 8
      return mask
    }
    return 0
  },
  async _getRectForBackendNode (webContents, backendNodeId) {
    if (!backendNodeId) {
      return null
    }
    await global.agentCdpClient.ensureDomains(webContents, ['DOM'])
    const quads = await global.agentCdpClient.send(webContents, 'DOM.getContentQuads', { backendNodeId })
    if (!quads || !quads.quads || !quads.quads.length) {
      return null
    }
    const quad = quads.quads[0]
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (let i = 0; i < quad.length; i += 2) {
      const x = quad[i]
      const y = quad[i + 1]
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    }
  },
  async _resolvePoint (webContents, options) {
    const resolvedOptions = this._resolveElementSelector(webContents, options || {})
    if (resolvedOptions && typeof resolvedOptions.backendNodeId !== 'undefined') {
      const backendNodeId = typeof resolvedOptions.backendNodeId === 'string' ? parseInt(resolvedOptions.backendNodeId, 10) : resolvedOptions.backendNodeId
      const rect = await this._getRectForBackendNode(webContents, backendNodeId)
      if (!rect) {
        return null
      }
      return this._getClickPoint(rect)
    }

    let x = resolvedOptions && typeof resolvedOptions.x === 'number' ? resolvedOptions.x : null
    let y = resolvedOptions && typeof resolvedOptions.y === 'number' ? resolvedOptions.y : null

    if ((x === null || y === null) && resolvedOptions && resolvedOptions.selector) {
      const expression = buildExpression(rectForSelector, [resolvedOptions.selector])
      const rectResult = await global.agentCdpClient.evaluate(webContents, expression)
      if (!rectResult.value.ok) {
        return null
      }
      const point = this._getClickPoint(rectResult.value.rect)
      x = point.x
      y = point.y
    }

    if (x === null || y === null) {
      return null
    }

    return { x, y }
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
  async navigateBack (tabId) {
    const webContents = this._getWebContents(tabId)
    if (webContents.canGoBack && webContents.canGoBack()) {
      webContents.goBack()
      return { id: tabId.toString(), ok: true }
    }
    return { id: tabId.toString(), ok: false, error: 'no-back-entry' }
  },
  async click (tabId, options) {
    const webContents = this._getWebContents(tabId)
    await global.agentCdpClient.ensureDomains(webContents, ['Input', 'Runtime'])

    const resolvedOptions = this._resolveElementSelector(webContents, options || {})
    const point = await this._resolvePoint(webContents, resolvedOptions)
    if (!point) {
      const error = new Error('Click requires selector, backendNodeId, or coordinates')
      error.status = 400
      throw error
    }

    const modifiers = this._normalizeModifiers(resolvedOptions.modifiers)
    const clickCount = resolvedOptions.double ? 2 : (resolvedOptions.clickCount || 1)
    const button = resolvedOptions.button || 'left'

    await global.agentCdpClient.send(webContents, 'Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: point.x,
      y: point.y,
      button,
      modifiers
    })
    await global.agentCdpClient.send(webContents, 'Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: point.x,
      y: point.y,
      button,
      modifiers,
      clickCount
    })
    await global.agentCdpClient.send(webContents, 'Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: point.x,
      y: point.y,
      button,
      modifiers,
      clickCount
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
  async hover (tabId, options) {
    const webContents = this._getWebContents(tabId)
    await global.agentCdpClient.ensureDomains(webContents, ['Input', 'Runtime'])

    const resolvedOptions = this._resolveElementSelector(webContents, options || {})
    const point = await this._resolvePoint(webContents, resolvedOptions)
    if (!point) {
      const error = new Error('Hover requires selector, backendNodeId, or coordinates')
      error.status = 400
      throw error
    }

    const modifiers = this._normalizeModifiers(resolvedOptions.modifiers)

    await global.agentCdpClient.send(webContents, 'Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: point.x,
      y: point.y,
      modifiers
    })

    return { id: tabId.toString(), ok: true }
  },
  async drag (tabId, options) {
    const webContents = this._getWebContents(tabId)
    await global.agentCdpClient.ensureDomains(webContents, ['Input', 'Runtime'])

    if (!options) {
      const error = new Error('Drag requires from/to coordinates or selectors')
      error.status = 400
      throw error
    }

    const fromOptions = options.from || { selector: options.fromSelector, x: options.fromX, y: options.fromY, elementId: options.fromElementId, backendNodeId: options.fromBackendNodeId }
    const toOptions = options.to || { selector: options.toSelector, x: options.toX, y: options.toY, elementId: options.toElementId, backendNodeId: options.toBackendNodeId }

    const fromPoint = await this._resolvePoint(webContents, fromOptions)
    const toPoint = await this._resolvePoint(webContents, toOptions)

    if (!fromPoint || !toPoint) {
      const error = new Error('Drag requires both from and to points')
      error.status = 400
      throw error
    }

    const modifiers = this._normalizeModifiers(options.modifiers)
    const button = options.button || 'left'

    await global.agentCdpClient.send(webContents, 'Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: fromPoint.x,
      y: fromPoint.y,
      modifiers
    })
    await global.agentCdpClient.send(webContents, 'Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: fromPoint.x,
      y: fromPoint.y,
      button,
      modifiers,
      clickCount: 1
    })
    await global.agentCdpClient.send(webContents, 'Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: toPoint.x,
      y: toPoint.y,
      button,
      modifiers,
      buttons: 1
    })
    await global.agentCdpClient.send(webContents, 'Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: toPoint.x,
      y: toPoint.y,
      button,
      modifiers,
      clickCount: 1
    })

    return { id: tabId.toString(), ok: true }
  },
  async pressKey (tabId, options) {
    const webContents = this._getWebContents(tabId)
    await global.agentCdpClient.ensureDomains(webContents, ['Input'])

    if (!options || !options.key) {
      const error = new Error('pressKey requires key')
      error.status = 400
      throw error
    }

    const key = String(options.key)
    const code = options.code || key
    const text = key.length === 1 ? key : ''
    const modifiers = this._normalizeModifiers(options.modifiers)

    await global.agentCdpClient.send(webContents, 'Input.dispatchKeyEvent', {
      type: 'keyDown',
      key,
      code,
      text,
      modifiers
    })
    await global.agentCdpClient.send(webContents, 'Input.dispatchKeyEvent', {
      type: 'keyUp',
      key,
      code,
      modifiers
    })

    return { id: tabId.toString(), ok: true }
  },
  async fillForm (tabId, options) {
    const webContents = this._getWebContents(tabId)
    const fields = options && options.fields
    if (!fields || !Array.isArray(fields)) {
      const error = new Error('fillForm requires fields array')
      error.status = 400
      throw error
    }
    const expression = buildExpression(fillFormFields, [fields])
    const result = await global.agentCdpClient.evaluate(webContents, expression)
    return {
      id: tabId.toString(),
      ok: result.value.ok,
      results: result.value.results || []
    }
  },
  async selectOption (tabId, options) {
    const webContents = this._getWebContents(tabId)
    const resolvedOptions = this._resolveElementSelector(webContents, options || {})
    if (!resolvedOptions.selector) {
      const error = new Error('selectOption requires selector or elementId')
      error.status = 400
      throw error
    }
    const payload = {
      value: resolvedOptions.value,
      label: resolvedOptions.label,
      index: resolvedOptions.index
    }
    const expression = buildExpression(selectOptionForSelector, [resolvedOptions.selector, payload])
    const result = await global.agentCdpClient.evaluate(webContents, expression)
    if (!result.value.ok) {
      const error = new Error(result.value.error || 'selectOption failed')
      error.status = 400
      throw error
    }
    return {
      id: tabId.toString(),
      ok: true,
      value: result.value.value
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
  async resize (tabId, options) {
    const win = windows.getCurrent()
    if (!win) {
      const error = new Error('No active window')
      error.status = 404
      throw error
    }
    const bounds = win.getBounds()
    const opts = options || {}
    const width = typeof opts.width === 'number' ? opts.width : bounds.width
    const height = typeof opts.height === 'number' ? opts.height : bounds.height
    win.setSize(Math.max(100, Math.floor(width)), Math.max(100, Math.floor(height)))
    return { id: tabId.toString(), ok: true, width, height }
  },
  async getConsoleMessages (tabId, options) {
    const webContents = this._getWebContents(tabId)
    return global.agentConsoleService.getMessages(webContents, options || {})
  },
  async getNetworkRequests (tabId, options) {
    const webContents = this._getWebContents(tabId)
    return global.agentNetworkService.getRequests(webContents, options || {})
  },
  async accessibilitySnapshot (tabId) {
    const webContents = this._getWebContents(tabId)
    const snapshot = await global.agentAccessibilityService.getSnapshot(webContents)
    return Object.assign({
      url: webContents.getURL() || '',
      title: webContents.getTitle() || ''
    }, snapshot)
  },
  async handleDialog (tabId, options) {
    const webContents = this._getWebContents(tabId)
    return global.agentDialogService.handleDialog(webContents, options || {})
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
  },
  async evaluate (tabId, options) {
    return this.exec(tabId, options)
  }
}

global.agentBrowserController = browserController
