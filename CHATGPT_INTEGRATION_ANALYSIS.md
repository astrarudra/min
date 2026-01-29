# ChatGPT Integration Analysis & Architecture Proposal
**Date:** January 29, 2026  
**Purpose:** Reliable programmatic interaction with ChatGPT interface

## Table of Contents
1. [Detection Strategy](#detection-strategy)
2. [Input & Send Mechanisms](#input--send-mechanisms)
3. [Response Streaming](#response-streaming)
4. [Robust DOM Handling](#robust-dom-handling)
5. [Proposed Architecture](#proposed-architecture)
6. [Implementation Plan](#implementation-plan)

---

## 1. Detection Strategy

### 1.1 Input Area Detection

ChatGPT uses a textarea element with specific attributes. Multiple fallback strategies:

**Primary Strategy (Most Reliable):**
```javascript
// Strategy 1: Name attribute (most stable)
const textarea = document.querySelector('textarea[name="prompt-textarea"]')

// Strategy 2: Form context + textarea
const form = document.querySelector('form')
const textarea = form?.querySelector('textarea')

// Strategy 3: Accessibility tree (role="textbox")
const textarea = Array.from(document.querySelectorAll('textarea[role="textbox"]'))
  .find(el => el.getAttribute('placeholder')?.includes('Ask') || el.getAttribute('aria-label')?.includes('prompt'))

// Strategy 4: ContentEditable div (if ChatGPT switches)
const editable = document.querySelector('[contenteditable="true"][data-id="root"]')
```

**Robust Detection Function:**
```javascript
function findChatGPTInput() {
  // Priority order: most specific to least specific
  const strategies = [
    () => document.querySelector('textarea[name="prompt-textarea"]'),
    () => document.querySelector('form textarea'),
    () => Array.from(document.querySelectorAll('textarea')).find(
      el => el.getAttribute('placeholder')?.toLowerCase().includes('ask') ||
            el.getAttribute('aria-label')?.toLowerCase().includes('prompt')
    ),
    () => document.querySelector('[contenteditable="true"]'),
    () => Array.from(document.querySelectorAll('textarea')).find(
      el => el.offsetHeight > 0 && el.offsetWidth > 0
    )
  ]
  
  for (const strategy of strategies) {
    const element = strategy()
    if (element && element.offsetParent !== null) { // Visible
      return element
    }
  }
  return null
}
```

### 1.2 Send Button Detection

ChatGPT's send button is typically a button within the form, often with an SVG icon:

**Detection Strategies:**
```javascript
function findChatGPTSendButton(form) {
  if (!form) form = document.querySelector('form')
  
  const strategies = [
    // Strategy 1: Submit button in form
    () => form?.querySelector('button[type="submit"]'),
    
    // Strategy 2: Button with send icon (SVG with specific path)
    () => Array.from(form?.querySelectorAll('button') || []).find(btn => {
      const svg = btn.querySelector('svg')
      if (!svg) return false
      // ChatGPT send button typically has specific SVG structure
      const path = svg.querySelector('path')
      return path && (
        path.getAttribute('d')?.includes('M') || // Common SVG path pattern
        svg.getAttribute('viewBox') === '0 0 24 24'
      )
    }),
    
    // Strategy 3: Button with aria-label containing "Send"
    () => Array.from(form?.querySelectorAll('button') || []).find(
      btn => btn.getAttribute('aria-label')?.toLowerCase().includes('send')
    ),
    
    // Strategy 4: Last button in form (often send button)
    () => {
      const buttons = Array.from(form?.querySelectorAll('button') || [])
      return buttons[buttons.length - 1]
    },
    
    // Strategy 5: Button that's not disabled and has click handler
    () => Array.from(form?.querySelectorAll('button') || []).find(
      btn => !btn.disabled && btn.offsetParent !== null
    )
  ]
  
  for (const strategy of strategies) {
    const button = strategy()
    if (button && !button.disabled && button.offsetParent !== null) {
      return button
    }
  }
  return null
}
```

### 1.3 Using Min's Existing Tools

Min already has robust element finding capabilities:

```javascript
// Using accessibility service (most reliable)
const axSnapshot = await browserController.accessibilitySnapshot(tabId)
const textareaNode = axSnapshot.nodes.find(
  node => node.role === 'textbox' && 
          node.name?.toLowerCase().includes('prompt')
)

// Using element finder
const elements = await browserController.getElements(tabId)
const textarea = elements.find(
  el => el.type === 'input' && 
        el.selector.includes('textarea') &&
        el.selector.includes('prompt')
)
```

---

## 2. Input & Send Mechanisms

### 2.1 Inserting Text Programmatically

**Method 1: Direct Value Assignment + Events (Recommended)**
```javascript
async function insertPrompt(tabId, promptText) {
  const webContents = this._getWebContents(tabId)
  await global.agentCdpClient.ensureDomains(webContents, ['Runtime', 'DOM'])
  
  const expression = `
    (function() {
      const textarea = document.querySelector('textarea[name="prompt-textarea"]')
      if (!textarea) throw new Error('Textarea not found')
      
      // Set value
      textarea.value = ${JSON.stringify(promptText)}
      
      // Trigger all necessary events for React/Vue to detect change
      const events = ['input', 'change', 'keydown', 'keyup']
      events.forEach(eventType => {
        const event = new Event(eventType, { bubbles: true, cancelable: true })
        textarea.dispatchEvent(event)
      })
      
      // Also trigger React's synthetic events if needed
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype, 
        'value'
      )?.set
      if (nativeInputValueSetter) {
        nativeInputValueSetter.call(textarea, promptText)
        const inputEvent = new Event('input', { bubbles: true })
        textarea.dispatchEvent(inputEvent)
      }
      
      return { ok: true, value: textarea.value }
    })()
  `
  
  return await global.agentCdpClient.evaluate(webContents, expression, {
    awaitPromise: true,
    returnByValue: true
  })
}
```

**Method 2: Using CDP Input.dispatchKeyEvent (More Realistic)**
```javascript
async function typePromptCharacterByCharacter(tabId, promptText, selector) {
  const webContents = this._getWebContents(tabId)
  await global.agentCdpClient.ensureDomains(webContents, ['Input', 'Runtime', 'DOM'])
  
  // Focus the textarea first
  const focusExpression = `
    (function() {
      const textarea = document.querySelector(${JSON.stringify(selector)})
      if (textarea) {
        textarea.focus()
        return true
      }
      return false
    })()
  `
  await global.agentCdpClient.evaluate(webContents, focusExpression)
  
  // Type character by character (slower but more realistic)
  for (const char of promptText) {
    await global.agentCdpClient.send(webContents, 'Input.dispatchKeyEvent', {
      type: 'keyDown',
      text: char,
      key: char,
      code: char === ' ' ? 'Space' : `Key${char.toUpperCase()}`
    })
    await global.agentCdpClient.send(webContents, 'Input.dispatchKeyEvent', {
      type: 'keyUp',
      text: char,
      key: char
    })
    // Small delay to mimic human typing
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}
```

**Method 3: Hybrid Approach (Fast + Reliable)**
```javascript
async function insertPromptHybrid(tabId, promptText) {
  const webContents = this._getWebContents(tabId)
  
  // Step 1: Find and focus textarea
  const findAndFocus = `
    (function() {
      const textarea = document.querySelector('textarea[name="prompt-textarea"]') ||
                      document.querySelector('form textarea')
      if (!textarea) return { found: false }
      textarea.focus()
      textarea.value = ''
      return { found: true, selector: textarea.name || 'textarea' }
    })()
  `
  
  const result = await global.agentCdpClient.evaluate(webContents, findAndFocus)
  if (!result.value.found) {
    throw new Error('Textarea not found')
  }
  
  // Step 2: Set value and trigger events
  const setValue = `
    (function(text) {
      const textarea = document.querySelector('textarea[name="prompt-textarea"]') ||
                      document.querySelector('form textarea')
      if (!textarea) return { ok: false }
      
      // Use native setter to bypass React's controlled component
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype, 'value'
      )?.set
      
      if (nativeSetter) {
        nativeSetter.call(textarea, text)
      } else {
        textarea.value = text
      }
      
      // Trigger comprehensive event sequence
      ['focus', 'input', 'change', 'keydown', 'keyup'].forEach(type => {
        textarea.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }))
      })
      
      return { ok: true, length: textarea.value.length }
    })(${JSON.stringify(promptText)})
  `
  
  return await global.agentCdpClient.evaluate(webContents, setValue, {
    awaitPromise: true,
    returnByValue: true
  })
}
```

### 2.2 Triggering Send

**Method 1: Form Submit (Most Reliable)**
```javascript
async function sendMessage(tabId) {
  const webContents = this._getWebContents(tabId)
  await global.agentCdpClient.ensureDomains(webContents, ['Runtime', 'Input'])
  
  const expression = `
    (function() {
      const form = document.querySelector('form')
      if (!form) return { ok: false, error: 'Form not found' }
      
      // Try form submission first
      const submitEvent = new Event('submit', { bubbles: true, cancelable: true })
      const submitted = form.dispatchEvent(submitEvent)
      
      if (submitted) {
        form.requestSubmit() // Modern API
      }
      
      return { ok: true, method: 'form-submit' }
    })()
  `
  
  return await global.agentCdpClient.evaluate(webContents, expression)
}
```

**Method 2: Button Click (Fallback)**
```javascript
async function sendMessageByButtonClick(tabId) {
  const webContents = this._getWebContents(tabId)
  
  // Find button using accessibility or DOM
  const findButton = `
    (function() {
      const form = document.querySelector('form')
      const button = form?.querySelector('button[type="submit"]') ||
                    Array.from(form?.querySelectorAll('button') || [])
                      .find(btn => {
                        const svg = btn.querySelector('svg')
                        return svg && !btn.disabled
                      })
      return button ? { found: true, selector: 'button' } : { found: false }
    })()
  `
  
  const result = await global.agentCdpClient.evaluate(webContents, findButton)
  if (!result.value.found) {
    throw new Error('Send button not found')
  }
  
  // Click the button
  return await browserController.click(tabId, { selector: 'form button[type="submit"]' })
}
```

**Method 3: Keyboard Shortcut (Enter)**
```javascript
async function sendMessageByEnter(tabId) {
  const webContents = this._getWebContents(tabId)
  await global.agentCdpClient.ensureDomains(webContents, ['Input'])
  
  // Focus textarea first
  await global.agentCdpClient.evaluate(webContents, `
    document.querySelector('textarea[name="prompt-textarea"]')?.focus()
  `)
  
  // Press Enter (ChatGPT typically uses Cmd+Enter or just Enter)
  await global.agentCdpClient.send(webContents, 'Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'Enter',
    code: 'Enter',
    modifiers: process.platform === 'darwin' ? ['Meta'] : ['Control'] // Cmd+Enter on Mac
  })
  
  await global.agentCdpClient.send(webContents, 'Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'Enter',
    code: 'Enter'
  })
}
```

---

## 3. Response Streaming

### 3.1 Detection Strategy

ChatGPT streams responses using several mechanisms:

**Method 1: DOM MutationObserver (Real-time)**
```javascript
function setupResponseStreaming(tabId, callback) {
  const webContents = this._getWebContents(tabId)
  await global.agentCdpClient.ensureDomains(webContents, ['Runtime', 'DOM'])
  
  const expression = `
    (function() {
      let lastText = ''
      let observer = null
      
      function findResponseContainer() {
        // ChatGPT typically uses specific selectors for response
        const selectors = [
          '[data-message-author-role="assistant"]',
          '[class*="message"]',
          '[class*="response"]',
          'main > div > div:last-child'
        ]
        
        for (const selector of selectors) {
          const container = document.querySelector(selector)
          if (container) return container
        }
        return document.querySelector('main') || document.body
      }
      
      const container = findResponseContainer()
      if (!container) return { ok: false, error: 'Container not found' }
      
      observer = new MutationObserver((mutations) => {
        const currentText = container.innerText || container.textContent || ''
        if (currentText !== lastText && currentText.length > lastText.length) {
          const newText = currentText.slice(lastText.length)
          lastText = currentText
          
          // Send update via postMessage (will be captured by CDP)
          window.postMessage({
            type: 'chatgpt-response-chunk',
            text: newText,
            fullText: currentText
          }, '*')
        }
      })
      
      observer.observe(container, {
        childList: true,
        subtree: true,
        characterData: true
      })
      
      return { ok: true, observing: true }
    })()
  `
  
  // Set up message listener
  webContents.on('console-message', (event, level, message) => {
    try {
      const data = JSON.parse(message)
      if (data.type === 'chatgpt-response-chunk') {
        callback(data.text, data.fullText)
      }
    } catch (e) {
      // Not our message
    }
  })
  
  return await global.agentCdpClient.evaluate(webContents, expression)
}
```

**Method 2: Network Request Monitoring (Most Reliable)**
```javascript
async function monitorChatGPTStream(tabId, callback) {
  const webContents = this._getWebContents(tabId)
  await global.agentCdpClient.ensureDomains(webContents, ['Network', 'Runtime'])
  
  // Enable network domain
  await global.agentCdpClient.send(webContents, 'Network.enable', {})
  
  // Set up request interception
  webContents.debugger.on('message', (event, method, params) => {
    if (method === 'Network.responseReceived') {
      const response = params.response
      if (response.url.includes('chatgpt.com') && 
          response.mimeType?.includes('text/event-stream') ||
          response.mimeType?.includes('application/json')) {
        
        // This is a streaming response
        // We need to intercept the response body
        global.agentCdpClient.send(webContents, 'Network.getResponseBody', {
          requestId: params.requestId
        }).then(result => {
          if (result.body) {
            // Parse Server-Sent Events or JSON stream
            parseStreamingResponse(result.body, callback)
          }
        })
      }
    }
  })
}
```

**Method 3: Polling with Diff Detection (Fallback)**
```javascript
async function pollResponse(tabId, callback, interval = 500) {
  let lastContent = ''
  
  const poll = async () => {
    const expression = `
      (function() {
        const container = document.querySelector('[data-message-author-role="assistant"]') ||
                         document.querySelector('main > div:last-child')
        return container ? container.innerText || container.textContent || '' : ''
      })()
    `
    
    const result = await global.agentCdpClient.evaluate(
      this._getWebContents(tabId), 
      expression
    )
    
    const currentContent = result.value || ''
    
    if (currentContent.length > lastContent.length) {
      const newChunk = currentContent.slice(lastContent.length)
      callback(newChunk, currentContent)
      lastContent = currentContent
    }
    
    // Continue polling if content is still changing
    if (currentContent !== lastContent) {
      setTimeout(poll, interval)
    }
  }
  
  poll()
}
```

### 3.2 Using Min's Existing Infrastructure

Min already has network monitoring capabilities:

```javascript
// Use existing network service
const networkService = require('./main/agent/networkService.js')

async function setupChatGPTStreaming(tabId) {
  const webContents = this._getWebContents(tabId)
  
  // Enable network monitoring
  await networkService.ensureNetworkListener(webContents)
  
  // Monitor for ChatGPT API calls
  webContents.debugger.on('message', (event, method, params) => {
    if (method === 'Network.responseReceived') {
      const url = params.response?.url
      if (url?.includes('chatgpt.com/api')) {
        // Intercept streaming response
        monitorStreamingResponse(webContents, params.requestId)
      }
    }
  })
}
```

---

## 4. Robust DOM Handling

### 4.1 Handling Dynamic Updates

**Strategy 1: Wait for Stability**
```javascript
async function waitForStableDOM(tabId, selector, timeout = 10000) {
  const webContents = this._getWebContents(tabId)
  let lastSnapshot = null
  let stableCount = 0
  const requiredStableChecks = 3
  
  return new Promise((resolve, reject) => {
    const checkInterval = setInterval(async () => {
      const expression = `
        document.querySelector(${JSON.stringify(selector)})?.outerHTML || ''
      `
      const result = await global.agentCdpClient.evaluate(webContents, expression)
      const currentSnapshot = result.value
      
      if (currentSnapshot === lastSnapshot) {
        stableCount++
        if (stableCount >= requiredStableChecks) {
          clearInterval(checkInterval)
          resolve(true)
        }
      } else {
        stableCount = 0
        lastSnapshot = currentSnapshot
      }
    }, 200)
    
    setTimeout(() => {
      clearInterval(checkInterval)
      reject(new Error('DOM did not stabilize'))
    }, timeout)
  })
}
```

**Strategy 2: Multiple Selector Fallbacks**
```javascript
class RobustElementFinder {
  constructor(selectors) {
    this.selectors = selectors // Array of selector strategies
  }
  
  async find(tabId) {
    const webContents = this._getWebContents(tabId)
    
    for (const selector of this.selectors) {
      const expression = `
        (function() {
          const el = typeof ${JSON.stringify(selector)} === 'function' 
            ? ${selector.toString()}()
            : document.querySelector(${JSON.stringify(selector)})
          return el ? { found: true, visible: el.offsetParent !== null } : { found: false }
        })()
      `
      
      const result = await global.agentCdpClient.evaluate(webContents, expression)
      if (result.value.found && result.value.visible) {
        return { selector, found: true }
      }
    }
    
    return { found: false }
  }
}

// Usage
const inputFinder = new RobustElementFinder([
  'textarea[name="prompt-textarea"]',
  'form textarea',
  () => Array.from(document.querySelectorAll('textarea')).find(el => 
    el.getAttribute('placeholder')?.includes('Ask')
  )
])
```

**Strategy 3: Accessibility Tree (Most Robust)**
```javascript
async function findElementByAccessibility(tabId, criteria) {
  const snapshot = await browserController.accessibilitySnapshot(tabId)
  
  const node = snapshot.nodes.find(node => {
    return Object.entries(criteria).every(([key, value]) => {
      if (key === 'role') return node.role === value
      if (key === 'name') return node.name?.includes(value)
      if (key === 'properties') {
        return criteria.properties.some(prop => 
          node.properties?.some(p => p.name === prop.name && p.value === prop.value)
        )
      }
      return node[key] === value
    })
  })
  
  if (node) {
    return {
      backendNodeId: node.backendDOMNodeId,
      nodeId: node.nodeId,
      bounds: node.bounds
    }
  }
  
  return null
}
```

### 4.2 Retry Logic with Exponential Backoff

```javascript
async function robustOperation(tabId, operation, maxRetries = 3) {
  let lastError = null
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Wait for DOM to stabilize
      await waitForStableDOM(tabId, 'form', 5000)
      
      // Execute operation
      const result = await operation(tabId)
      
      // Verify success
      if (result.ok !== false) {
        return result
      }
      
      lastError = new Error('Operation returned failure')
    } catch (error) {
      lastError = error
      
      // Exponential backoff
      if (attempt < maxRetries - 1) {
        await new Promise(resolve => 
          setTimeout(resolve, Math.pow(2, attempt) * 1000)
        )
      }
    }
  }
  
  throw lastError
}
```

---

## 5. Proposed Architecture

### 5.1 New Module: `chatGPTController.js`

```javascript
// main/agent/chatGPTController.js

const chatGPTController = {
  /**
   * Find ChatGPT input area using multiple strategies
   */
  async findInput(tabId) {
    const webContents = this._getWebContents(tabId)
    await global.agentCdpClient.ensureDomains(webContents, ['Runtime', 'DOM', 'Accessibility'])
    
    // Try accessibility first (most reliable)
    const axSnapshot = await global.agentAccessibilityService.getSnapshot(webContents)
    const textareaNode = axSnapshot.nodes.find(
      node => node.role === 'textbox' && 
              (node.name?.toLowerCase().includes('prompt') ||
               node.name?.toLowerCase().includes('ask'))
    )
    
    if (textareaNode) {
      return {
        found: true,
        method: 'accessibility',
        backendNodeId: textareaNode.backendDOMNodeId,
        nodeId: textareaNode.nodeId,
        bounds: textareaNode.bounds
      }
    }
    
    // Fallback to DOM selectors
    const domExpression = `
      (function() {
        const selectors = [
          'textarea[name="prompt-textarea"]',
          'form textarea',
          'textarea[placeholder*="Ask"]'
        ]
        
        for (const selector of selectors) {
          const el = document.querySelector(selector)
          if (el && el.offsetParent !== null) {
            return { found: true, selector }
          }
        }
        return { found: false }
      })()
    `
    
    const result = await global.agentCdpClient.evaluate(webContents, domExpression)
    return result.value
  },
  
  /**
   * Insert prompt into ChatGPT input
   */
  async insertPrompt(tabId, promptText) {
    const input = await this.findInput(tabId)
    if (!input.found) {
      throw new Error('ChatGPT input not found')
    }
    
    const webContents = this._getWebContents(tabId)
    
    const expression = `
      (function(text, backendNodeId) {
        let textarea = null
        
        if (backendNodeId) {
          // Use backendNodeId if available (from accessibility)
          const node = document.querySelector('textarea[name="prompt-textarea"]') ||
                      document.querySelector('form textarea')
          textarea = node
        } else {
          textarea = document.querySelector('textarea[name="prompt-textarea"]') ||
                    document.querySelector('form textarea')
        }
        
        if (!textarea) return { ok: false, error: 'Textarea not found' }
        
        // Focus first
        textarea.focus()
        
        // Clear existing content
        textarea.value = ''
        
        // Set new value using native setter
        const nativeSetter = Object.getOwnPropertyDescriptor(
          window.HTMLTextAreaElement.prototype, 'value'
        )?.set
        
        if (nativeSetter) {
          nativeSetter.call(textarea, text)
        } else {
          textarea.value = text
        }
        
        // Trigger comprehensive event sequence
        const events = ['focus', 'input', 'change', 'keydown', 'keyup']
        events.forEach(type => {
          const event = new Event(type, { bubbles: true, cancelable: true })
          textarea.dispatchEvent(event)
        })
        
        return { 
          ok: true, 
          valueLength: textarea.value.length,
          isFocused: document.activeElement === textarea
        }
      })(${JSON.stringify(promptText)}, ${input.backendNodeId || null})
    `
    
    return await global.agentCdpClient.evaluate(webContents, expression, {
      awaitPromise: true,
      returnByValue: true
    })
  },
  
  /**
   * Send message via form submit or button click
   */
  async sendMessage(tabId, method = 'auto') {
    const webContents = this._getWebContents(tabId)
    
    if (method === 'auto' || method === 'form') {
      // Try form submit first
      const formSubmit = `
        (function() {
          const form = document.querySelector('form')
          if (!form) return { ok: false, error: 'Form not found' }
          
          const submitEvent = new Event('submit', { bubbles: true, cancelable: true })
          const canSubmit = form.dispatchEvent(submitEvent)
          
          if (canSubmit) {
            if (form.requestSubmit) {
              form.requestSubmit()
            } else {
              form.submit()
            }
            return { ok: true, method: 'form-submit' }
          }
          return { ok: false, error: 'Submit prevented' }
        })()
      `
      
      const result = await global.agentCdpClient.evaluate(webContents, formSubmit)
      if (result.value.ok) {
        return result.value
      }
    }
    
    // Fallback to button click
    if (method === 'auto' || method === 'button') {
      return await browserController.click(tabId, {
        selector: 'form button[type="submit"]'
      })
    }
    
    // Fallback to Enter key
    if (method === 'keyboard') {
      await global.agentCdpClient.send(webContents, 'Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: 'Enter',
        code: 'Enter',
        modifiers: process.platform === 'darwin' ? ['Meta'] : ['Control']
      })
      return { ok: true, method: 'keyboard' }
    }
    
    throw new Error('Send failed')
  },
  
  /**
   * Set up response streaming
   */
  async setupResponseStream(tabId, onChunk, onComplete) {
    const webContents = this._getWebContents(tabId)
    await global.agentCdpClient.ensureDomains(webContents, ['Runtime', 'DOM'])
    
    // Set up MutationObserver for DOM changes
    const observerScript = `
      (function() {
        let lastText = ''
        let isComplete = false
        
        function findResponseContainer() {
          const selectors = [
            '[data-message-author-role="assistant"]:last-child',
            'main > div > div:last-child [class*="message"]',
            'main > div:last-child'
          ]
          
          for (const selector of selectors) {
            const el = document.querySelector(selector)
            if (el) return el
          }
          return document.querySelector('main') || document.body
        }
        
        const container = findResponseContainer()
        if (!container) {
          return { ok: false, error: 'Container not found' }
        }
        
        const observer = new MutationObserver(() => {
          const currentText = container.innerText || container.textContent || ''
          
          if (currentText.length > lastText.length) {
            const chunk = currentText.slice(lastText.length)
            lastText = currentText
            
            // Check if response is complete (no typing indicator)
            const typingIndicator = container.querySelector('[class*="typing"]') ||
                                   container.querySelector('[aria-label*="typing"]')
            isComplete = !typingIndicator && 
                        !container.textContent.includes('...') &&
                        currentText === lastText // No change for 2 seconds
            
            window.postMessage({
              type: 'chatgpt-stream-chunk',
              chunk: chunk,
              fullText: currentText,
              complete: isComplete
            }, '*')
          }
        })
        
        observer.observe(container, {
          childList: true,
          subtree: true,
          characterData: true
        })
        
        return { ok: true, observing: true }
      })()
    `
    
    // Listen for postMessage events
    const messageHandler = (event, level, message) => {
      try {
        const data = JSON.parse(message)
        if (data.type === 'chatgpt-stream-chunk') {
          onChunk(data.chunk, data.fullText)
          if (data.complete && onComplete) {
            onComplete(data.fullText)
          }
        }
      } catch (e) {
        // Not our message
      }
    }
    
    webContents.on('console-message', messageHandler)
    
    // Clean up handler when done
    const cleanup = () => {
      webContents.removeListener('console-message', messageHandler)
    }
    
    await global.agentCdpClient.evaluate(webContents, observerScript)
    
    return { ok: true, cleanup }
  },
  
  /**
   * Complete workflow: insert prompt, send, and stream response
   */
  async sendPromptAndStream(tabId, promptText, onChunk, onComplete) {
    // Step 1: Insert prompt
    const insertResult = await this.insertPrompt(tabId, promptText)
    if (!insertResult.value.ok) {
      throw new Error('Failed to insert prompt')
    }
    
    // Step 2: Set up streaming before sending
    const streamSetup = await this.setupResponseStream(tabId, onChunk, onComplete)
    
    // Step 3: Send message
    const sendResult = await this.sendMessage(tabId)
    if (!sendResult.ok) {
      streamSetup.cleanup?.()
      throw new Error('Failed to send message')
    }
    
    return {
      ok: true,
      insertResult: insertResult.value,
      sendResult,
      streamSetup
    }
  }
}

global.agentChatGPTController = chatGPTController
module.exports = chatGPTController
```

### 5.2 API Endpoints in `agentServer.js`

```javascript
// Add to agentHandleRequest in agentServer.js

if (req.method === 'POST' && action === 'chatgpt-find-input') {
  const result = await global.agentChatGPTController.findInput(tabId)
  agentSendJson(res, 200, result)
  return
}

if (req.method === 'POST' && action === 'chatgpt-insert-prompt') {
  const body = await agentReadJsonBody(req)
  if (!body || !body.prompt) {
    const error = new Error('chatgpt-insert-prompt requires prompt')
    error.status = 400
    throw error
  }
  const result = await global.agentChatGPTController.insertPrompt(tabId, body.prompt)
  agentSendJson(res, 200, result)
  return
}

if (req.method === 'POST' && action === 'chatgpt-send') {
  const body = await agentReadJsonBody(req)
  const method = body?.method || 'auto'
  const result = await global.agentChatGPTController.sendMessage(tabId, method)
  agentSendJson(res, 200, result)
  return
}

if (req.method === 'POST' && action === 'chatgpt-send-and-stream') {
  const body = await agentReadJsonBody(req)
  if (!body || !body.prompt) {
    const error = new Error('chatgpt-send-and-stream requires prompt')
    error.status = 400
    throw error
  }
  
  // Set up Server-Sent Events for streaming
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  })
  
  const onChunk = (chunk, fullText) => {
    res.write(`data: ${JSON.stringify({ type: 'chunk', text: chunk, fullText })}\n\n`)
  }
  
  const onComplete = (fullText) => {
    res.write(`data: ${JSON.stringify({ type: 'complete', fullText })}\n\n`)
    res.end()
  }
  
  try {
    await global.agentChatGPTController.sendPromptAndStream(
      tabId, 
      body.prompt, 
      onChunk, 
      onComplete
    )
  } catch (error) {
    res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`)
    res.end()
  }
  
  return
}
```

### 5.3 MCP Tool Integration

```typescript
// Add to main/mcp/tools/index.ts

{
  name: 'chatgpt_send_prompt',
  description: 'Send a prompt to ChatGPT and optionally stream the response',
  inputSchema: z.object({
    tabId: z.string().optional(),
    prompt: z.string().describe('The prompt to send to ChatGPT'),
    stream: z.boolean().optional().default(false).describe('Whether to stream the response'),
  }),
  handler: async (args, resolveTabId, emitEvent) => {
    const tabId = await resolveTabId(args.tabId)
    const webContents = getWebContents(tabId)
    
    if (args.stream) {
      // Set up streaming response
      return {
        ok: true,
        stream: true,
        // Return a stream handler
      }
    } else {
      // Send and wait for complete response
      let fullResponse = ''
      const onChunk = (chunk) => { fullResponse += chunk }
      const onComplete = () => {}
      
      await chatGPTController.sendPromptAndStream(
        tabId,
        args.prompt,
        onChunk,
        onComplete
      )
      
      return {
        ok: true,
        response: fullResponse
      }
    }
  }
}
```

---

## 6. Implementation Plan

### Phase 1: Core Detection (Week 1)
- [ ] Implement `findInput()` with multiple strategies
- [ ] Implement `findSendButton()` with fallbacks
- [ ] Add unit tests for detection logic
- [ ] Test against ChatGPT's current DOM structure

### Phase 2: Input & Send (Week 1-2)
- [ ] Implement `insertPrompt()` with event triggering
- [ ] Implement `sendMessage()` with multiple methods
- [ ] Add retry logic with exponential backoff
- [ ] Test edge cases (disabled inputs, loading states)

### Phase 3: Response Streaming (Week 2)
- [ ] Implement MutationObserver-based streaming
- [ ] Add network-based streaming (if needed)
- [ ] Implement polling fallback
- [ ] Add completion detection logic

### Phase 4: Integration (Week 2-3)
- [ ] Add API endpoints to `agentServer.js`
- [ ] Add MCP tools
- [ ] Add WebSocket support for real-time streaming
- [ ] Write integration tests

### Phase 5: Robustness (Week 3)
- [ ] Add DOM stability detection
- [ ] Implement selector fallback system
- [ ] Add error handling and recovery
- [ ] Performance optimization

### Phase 6: Documentation & Testing (Week 4)
- [ ] Write API documentation
- [ ] Create usage examples
- [ ] Add end-to-end tests
- [ ] Update README

---

## Key Design Decisions

1. **Multi-Strategy Approach**: Use multiple detection strategies with fallbacks for maximum reliability
2. **Accessibility-First**: Prioritize accessibility tree over DOM selectors for robustness
3. **Event-Driven Streaming**: Use MutationObserver for real-time updates rather than polling
4. **Modular Design**: Separate concerns (detection, input, send, streaming) for maintainability
5. **Backward Compatible**: Integrate with existing Min architecture without breaking changes

---

## Testing Strategy

1. **Unit Tests**: Test each function independently
2. **Integration Tests**: Test full workflow end-to-end
3. **Robustness Tests**: Test with DOM changes, network delays, etc.
4. **Performance Tests**: Ensure streaming doesn't impact browser performance

---

**Next Steps**: Review this architecture and begin Phase 1 implementation.
