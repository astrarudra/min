var chatGptInputHints = [
  'message',
  'prompt',
  'ask',
  'chat',
  'send a message'
]

var chatGptSendHints = [
  'send',
  'submit',
  'enter',
  'send message'
]

function scoreText (text, hints) {
  const lower = (text || '').toLowerCase()
  if (!lower) {
    return 0
  }
  let score = 0
  hints.forEach(function (hint) {
    if (lower === hint) {
      score += 3
    } else if (lower.includes(hint)) {
      score += 2
    }
  })
  return score
}

async function findInputFromAccessibility (webContents) {
  const snapshot = await global.agentAccessibilityService.getSnapshot(webContents)
  const nodes = snapshot.nodes || []
  let best = null
  let bestScore = 0

  nodes.forEach(function (node) {
    if (!node || !node.role) {
      return
    }
    if (node.visible === false) {
      return
    }
    const role = String(node.role)
    const roleMatch = role.includes('textbox') || role.includes('text') || role.includes('input')
    if (!roleMatch) {
      return
    }
  const nameScore = scoreText(node.name, chatGptInputHints)
  const valueScore = scoreText(node.value, chatGptInputHints)
    const score = Math.max(nameScore, valueScore)
    if (score > bestScore) {
      bestScore = score
      best = node
    }
  })

  if (!best) {
    return null
  }

  return {
    source: 'accessibility',
    backendNodeId: best.backendDOMNodeId,
    role: best.role,
    name: best.name || ''
  }
}

async function findSendButtonFromAccessibility (webContents) {
  const snapshot = await global.agentAccessibilityService.getSnapshot(webContents)
  const nodes = snapshot.nodes || []
  let best = null
  let bestScore = 0

  nodes.forEach(function (node) {
    if (!node || !node.role) {
      return
    }
    if (node.visible === false) {
      return
    }
    const role = String(node.role)
    if (!role.includes('button')) {
      return
    }
    const score = scoreText(node.name, chatGptSendHints)
    if (score > bestScore) {
      bestScore = score
      best = node
    }
  })

  if (!best) {
    return null
  }

  return {
    source: 'accessibility',
    backendNodeId: best.backendDOMNodeId,
    role: best.role,
    name: best.name || ''
  }
}

var findDomInput = function (timeoutMs) {
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

  const pickInput = function () {
    const candidates = Array.from(document.querySelectorAll('textarea, [contenteditable="true"], [role="textbox"]'))
    let best = null
    let bestScore = 0
    candidates.forEach(function (el) {
      if (!el) {
        return
      }
      // Skip hidden elements
      if (el.offsetParent === null || el.style.display === 'none' || el.style.visibility === 'hidden') {
        return
      }
      
      const tag = el.tagName.toLowerCase()
      let score = 0
      const name = (el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('name') || '').toLowerCase()
      const testId = el.getAttribute('data-testid') || ''
      
      // Prioritize textarea elements
      if (tag === 'textarea') {
        score += 3
      }
      
      // Highest priority: data-testid="prompt-textarea"
      if (testId === 'prompt-textarea') {
        score += 10
      }
      
      // High priority: name="prompt-textarea"
      if (el.getAttribute('name') === 'prompt-textarea') {
        score += 8
      }
      
      // Check for ChatGPT-specific attributes
      if (name.includes('message') || name.includes('prompt') || name.includes('ask') || name.includes('chat')) {
        score += 2
      }
      
      // Prefer visible, enabled elements
      if (!el.disabled && el.offsetWidth > 0 && el.offsetHeight > 0) {
        score += 1
      }
      
      // Prefer elements in forms
      if (el.closest && el.closest('form')) {
        score += 1
      }
      
      if (!best || score > bestScore) {
        best = el
        bestScore = score
      }
    })
    if (!best) {
      return null
    }
    return {
      selector: buildSelector(best),
      isContentEditable: !!best.isContentEditable,
      tag: best.tagName.toLowerCase(),
      name: best.getAttribute('name') || '',
      testId: best.getAttribute('data-testid') || ''
    }
  }

  return new Promise(function (resolve) {
    const result = pickInput()
    if (result) {
      resolve(result)
      return
    }

    const observer = new MutationObserver(function () {
      const updated = pickInput()
      if (updated) {
        observer.disconnect()
        resolve(updated)
      }
    })

    observer.observe(document.body, { childList: true, subtree: true, attributes: true })

    setTimeout(function () {
      observer.disconnect()
      resolve(pickInput())
    }, timeoutMs || 12000)
  })
}

var findDomSend = function (timeoutMs) {
  const cssEscape = function (value) {
    if (window.CSS && window.CSS.escape) {
      return window.CSS.escape(value)
    }
    return value.replace(/[^a-zA-Z0-9_-]/g, '\\\\$&')
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

  const pickSend = function () {
    const candidates = Array.from(document.querySelectorAll('button, [role="button"], input[type="submit"], button[type="submit"]'))
    let best = null
    let bestScore = 0
    candidates.forEach(function (el) {
      if (!el) {
        return
      }
      // Skip hidden or disabled buttons
      if (el.offsetParent === null || el.disabled || el.style.display === 'none') {
        return
      }
      
      const label = (el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || '').toLowerCase()
      const testId = el.getAttribute('data-testid') || ''
      let score = 0
      
      // Highest priority: data-testid="send-button"
      if (testId === 'send-button') {
        score += 10
      }
      
      // High priority: type="submit" in form
      if (el.type === 'submit' && el.closest && el.closest('form')) {
        score += 5
      }
      
      // Check label text
      if (label.includes('send')) {
        score += 3
      }
      if (label.includes('submit')) {
        score += 1
      }
      
      // Prefer buttons with SVG icons (ChatGPT send button typically has one)
      if (el.querySelector('svg')) {
        score += 2
      }
      
      // Prefer visible, enabled buttons
      if (el.offsetWidth > 0 && el.offsetHeight > 0) {
        score += 1
      }
      
      // Prefer buttons near the input (in same form)
      if (el.closest && el.closest('form')) {
        score += 1
      }
      
      if (score > bestScore) {
        best = el
        bestScore = score
      }
    })
    if (!best) {
      return null
    }
    return {
      selector: buildSelector(best),
      testId: best.getAttribute('data-testid') || '',
      ariaLabel: best.getAttribute('aria-label') || ''
    }
  }

  return new Promise(function (resolve) {
    const result = pickSend()
    if (result) {
      resolve(result)
      return
    }

    const observer = new MutationObserver(function () {
      const updated = pickSend()
      if (updated) {
        observer.disconnect()
        resolve(updated)
      }
    })

    observer.observe(document.body, { childList: true, subtree: true, attributes: true })

    setTimeout(function () {
      observer.disconnect()
      resolve(pickSend())
    }, timeoutMs || 12000)
  })
}

async function findDomTargetWithObserver (webContents, kind, timeoutMs) {
  const fn = kind === 'send' ? findDomSend : findDomInput
  const expression = '(' + fn.toString() + ')(' + JSON.stringify(timeoutMs || 12000) + ')'
  const result = await global.agentCdpClient.evaluate(webContents, expression, { awaitPromise: true })
  return result.value || null
}

var agentChatGptElementFinder = {
  async findInput (webContents) {
    const axInput = await findInputFromAccessibility(webContents)
    if (axInput && axInput.backendNodeId) {
      return axInput
    }
    const domTarget = await findDomTargetWithObserver(webContents, 'input', 12000)
    if (domTarget && domTarget.selector) {
      return {
        source: 'dom',
        selector: domTarget.selector,
        isContentEditable: domTarget.isContentEditable === true
      }
    }
    return null
  },
  async findSendButton (webContents) {
    const axButton = await findSendButtonFromAccessibility(webContents)
    if (axButton && axButton.backendNodeId) {
      return axButton
    }
    const domTarget = await findDomTargetWithObserver(webContents, 'send', 12000)
    if (domTarget && domTarget.selector) {
      return {
        source: 'dom',
        selector: domTarget.selector
      }
    }
    return null
  }
}

global.agentChatGptElementFinder = agentChatGptElementFinder
