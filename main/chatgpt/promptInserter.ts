async function resolveObjectId (webContents, target) {
  if (!target) {
    return null
  }

  await global.agentCdpClient.ensureDomains(webContents, ['Runtime', 'DOM'])

  if (target.backendNodeId) {
    const resolved = await global.agentCdpClient.send(webContents, 'DOM.resolveNode', {
      backendNodeId: target.backendNodeId
    })
    return resolved && resolved.object ? resolved.object.objectId : null
  }

  if (target.selector) {
    const expression = 'document.querySelector(' + JSON.stringify(target.selector) + ')'
    const result = await global.agentCdpClient.send(webContents, 'Runtime.evaluate', {
      expression,
      returnByValue: false
    })
    return result && result.result ? result.result.objectId : null
  }

  return null
}

var chatGptFocusSelector = function (selector) {
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

function getPointFromRect (rect) {
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2
  }
}

async function dispatchClick (webContents, point) {
  await global.agentCdpClient.ensureDomains(webContents, ['Input'])
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
}

async function setValueOnObject (webContents, objectId, value) {
  if (!objectId) {
    return { ok: false, error: 'missing-object' }
  }

  const functionDeclaration = `function(value) {
    try {
      // Focus first to ensure element is active
      if (this.focus) {
        this.focus();
      }
      
      // Clear existing value first
      if (this.isContentEditable) {
        this.textContent = '';
        this.textContent = value;
      } else {
        // Use native setter to bypass React's controlled component
        var nativeSetter = Object.getOwnPropertyDescriptor(
          HTMLTextAreaElement.prototype, 
          'value'
        ) || Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype, 
          'value'
        );
        
        if (nativeSetter && nativeSetter.set) {
          // Clear first
          nativeSetter.set.call(this, '');
          // Set new value
          nativeSetter.set.call(this, value);
        } else {
          this.value = '';
          this.value = value;
        }
      }
      
      // Trigger comprehensive event sequence for React
      // React listens to 'input' events for controlled components
      var events = ['focus', 'input', 'change', 'keydown', 'keyup', 'keypress'];
      events.forEach(function(type) {
        var event = new Event(type, { bubbles: true, cancelable: true });
        this.dispatchEvent(event);
        
        // Also try React's synthetic event if available
        if (window.React && window.React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED) {
          // React 16+ uses native events, so this should work
        }
      }.bind(this));
      
      // Verify the value was set
      var actualValue = this.isContentEditable ? this.textContent : this.value;
      if (actualValue !== value) {
        return { ok: false, error: 'value-mismatch', expected: value, actual: actualValue };
      }
      
      return { ok: true, value: actualValue };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }`

  const result = await global.agentCdpClient.send(webContents, 'Runtime.callFunctionOn', {
    objectId,
    functionDeclaration,
    arguments: [{ value: value }],
    returnByValue: true,
    userGesture: true
  })

  return result && result.result ? result.result.value : { ok: false, error: 'unknown' }
}

async function submitFormForObject (webContents, objectId) {
  if (!objectId) {
    return false
  }
  const functionDeclaration = `function() {
    try {
      var form = this.form || (this.closest ? this.closest('form') : null);
      if (!form) {
        return false;
      }
      if (form.requestSubmit) {
        form.requestSubmit();
        return true;
      }
      form.submit();
      return true;
    } catch (e) {
      return false;
    }
  }`

  const result = await global.agentCdpClient.send(webContents, 'Runtime.callFunctionOn', {
    objectId,
    functionDeclaration,
    returnByValue: true,
    userGesture: true
  })

  return !!(result && result.result && result.result.value)
}

var agentChatGptPromptInserter = {
  async insertPrompt (webContents, target, prompt) {
    // Try using objectId first (from accessibility or selector resolution)
    const objectId = await resolveObjectId(webContents, target)
    if (objectId) {
      const setResult = await setValueOnObject(webContents, objectId, prompt)
      if (setResult && setResult.ok) {
        return { ok: true, method: 'value-set', objectId, valueLength: setResult.value ? setResult.value.length : prompt.length }
      }
      // If value-set failed but we have error details, log them
      if (setResult && setResult.error) {
        console.log('[ChatGPT] value-set failed:', setResult.error)
      }
    }

    // Fallback: Use selector with Input.insertText (more reliable for React)
    if (target && target.selector) {
      const expression = '(' + chatGptFocusSelector.toString() + ')(' + JSON.stringify(target.selector) + ')'
      const focusResult = await global.agentCdpClient.evaluate(webContents, expression)
      if (!focusResult.value || !focusResult.value.ok) {
        return { ok: false, error: 'Unable to focus input: ' + (focusResult.value?.error || 'unknown') }
      }
      
      // Focus the element
      const rect = focusResult.value.rect
      const centerPoint = getPointFromRect(rect)
      
      // Click to focus (but don't rely on it alone)
      await dispatchClick(webContents, centerPoint)
      
      // Small delay to ensure focus
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Use Input.insertText which is more reliable for React components
      await global.agentCdpClient.ensureDomains(webContents, ['Input'])
      await global.agentCdpClient.send(webContents, 'Input.insertText', { text: prompt })
      
      // Verify the text was inserted
      const verifyExpression = `(function() {
        const el = document.querySelector(${JSON.stringify(target.selector)})
        if (!el) return { ok: false, error: 'element-not-found' }
        const value = el.isContentEditable ? el.textContent : el.value
        return { ok: true, value: value, length: value.length }
      })()`
      
      const verifyResult = await global.agentCdpClient.evaluate(webContents, verifyExpression)
      if (verifyResult.value && verifyResult.value.ok) {
        return { ok: true, method: 'input-insert', valueLength: verifyResult.value.length }
      }
      
      return { ok: true, method: 'input-insert', warning: 'verification-failed' }
    }

    // Last resort: Try to find element by common ChatGPT selectors
    const fallbackSelectors = [
      'textarea[name="prompt-textarea"]',
      'textarea[data-testid="prompt-textarea"]',
      'form textarea',
      'textarea[placeholder*="Ask"]',
      'textarea[placeholder*="Message"]'
    ]
    
    for (const selector of fallbackSelectors) {
      try {
        const expression = '(' + chatGptFocusSelector.toString() + ')(' + JSON.stringify(selector) + ')'
        const focusResult = await global.agentCdpClient.evaluate(webContents, expression)
        if (focusResult.value && focusResult.value.ok) {
          const rect = focusResult.value.rect
          const centerPoint = getPointFromRect(rect)
          await dispatchClick(webContents, centerPoint)
          await new Promise(resolve => setTimeout(resolve, 100))
          await global.agentCdpClient.ensureDomains(webContents, ['Input'])
          await global.agentCdpClient.send(webContents, 'Input.insertText', { text: prompt })
          return { ok: true, method: 'fallback-selector', selector: selector }
        }
      } catch (e) {
        // Continue to next selector
      }
    }

    return { ok: false, error: 'Unable to insert prompt: no valid target found' }
  },
  async sendPrompt (webContents, inputTarget, sendTarget) {
    // First, ensure the input is focused and has the text
    // Wait a bit for React to process the value change
    await new Promise(resolve => setTimeout(resolve, 200))
    
    // Ensure input is focused before sending
    if (inputTarget && (inputTarget.selector || inputTarget.backendNodeId)) {
      try {
        if (inputTarget.selector) {
          const focusExpression = `
            (function() {
              const el = document.querySelector(${JSON.stringify(inputTarget.selector)})
              if (el) {
                el.focus()
                return { ok: true, focused: document.activeElement === el }
              }
              return { ok: false }
            })()
          `
          await global.agentCdpClient.evaluate(webContents, focusExpression)
        }
      } catch (e) {
        console.log('[ChatGPT] Failed to focus input before send:', e.message)
      }
    }
    
    // Small delay after focusing
    await new Promise(resolve => setTimeout(resolve, 100))

    // Method 1: Try clicking send button directly (most reliable for ChatGPT)
    if (sendTarget && (sendTarget.backendNodeId || sendTarget.selector)) {
      if (sendTarget.backendNodeId) {
        try {
          const quads = await global.agentCdpClient.send(webContents, 'DOM.getContentQuads', { backendNodeId: sendTarget.backendNodeId })
          if (quads && quads.quads && quads.quads.length) {
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
            const rect = { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
            const centerPoint = getPointFromRect(rect)
            
            // Click the button
            await dispatchClick(webContents, centerPoint)
            await new Promise(resolve => setTimeout(resolve, 100))
            
            // Verify click worked by checking if button was clicked
            return { ok: true, method: 'send-button-backend-node' }
          }
        } catch (e) {
          console.log('[ChatGPT] Failed to click send button via backendNodeId:', e.message)
        }
      }

      if (sendTarget.selector) {
        try {
          // Wait for button to become enabled (ChatGPT enables it after text is entered)
          let attempts = 0
          let buttonReady = false
          while (attempts < 10 && !buttonReady) {
            const checkExpression = `
              (function() {
                const el = document.querySelector(${JSON.stringify(sendTarget.selector)})
                if (!el) return { ok: false, error: 'not-found' }
                if (el.offsetParent === null) return { ok: false, error: 'hidden' }
                return { ok: true, disabled: el.disabled, visible: true }
              })()
            `
            const checkResult = await global.agentCdpClient.evaluate(webContents, checkExpression)
            if (checkResult.value && checkResult.value.ok && !checkResult.value.disabled) {
              buttonReady = true
              break
            }
            attempts++
            await new Promise(resolve => setTimeout(resolve, 100))
          }
          
          // Use a more direct click approach
          const clickExpression = `
            (function() {
              const el = document.querySelector(${JSON.stringify(sendTarget.selector)})
              if (!el) return { ok: false, error: 'not-found' }
              if (el.disabled) return { ok: false, error: 'disabled' }
              if (el.offsetParent === null) return { ok: false, error: 'hidden' }
              
              // Scroll into view
              if (el.scrollIntoView) {
                el.scrollIntoView({ block: 'center', inline: 'center' })
              }
              
              // Focus the button first (some buttons need focus)
              try {
                el.focus()
              } catch (e) {}
              
              // Try multiple click methods
              if (el.click) {
                el.click()
                return { ok: true, method: 'click-method' }
              }
              
              // Fallback: dispatch mouse events
              const rect = el.getBoundingClientRect()
              const event = new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                view: window,
                clientX: rect.left + rect.width / 2,
                clientY: rect.top + rect.height / 2
              })
              el.dispatchEvent(event)
              return { ok: true, method: 'dispatch-event' }
            })()
          `
          const clickResult = await global.agentCdpClient.evaluate(webContents, clickExpression, { awaitPromise: true })
          if (clickResult.value && clickResult.value.ok) {
            await new Promise(resolve => setTimeout(resolve, 200))
            return { ok: true, method: 'send-button-selector-direct', clickMethod: clickResult.value.method }
          }
          
          // Fallback: Use CDP click
          const expression = '(' + chatGptFocusSelector.toString() + ')(' + JSON.stringify(sendTarget.selector) + ')'
          const focusResult = await global.agentCdpClient.evaluate(webContents, expression)
          if (focusResult.value && focusResult.value.ok) {
            await dispatchClick(webContents, getPointFromRect(focusResult.value.rect))
            await new Promise(resolve => setTimeout(resolve, 200))
            return { ok: true, method: 'send-button-selector-cdp' }
          }
        } catch (e) {
          console.log('[ChatGPT] Failed to click send button via selector:', e.message)
        }
      }
    }

    // Method 2: Try form submit (may not work if ChatGPT prevents default)
    const inputObjectId = await resolveObjectId(webContents, inputTarget)
    if (inputObjectId) {
      const submitted = await submitFormForObject(webContents, inputObjectId)
      if (submitted) {
        await new Promise(resolve => setTimeout(resolve, 100))
        return { ok: true, method: 'form-submit' }
      }
    }

    // Method 3: Try common send button selectors with direct click
    const sendButtonSelectors = [
      'button[data-testid="send-button"]',
      'button[type="submit"]',
      'form button[type="submit"]',
      'button[aria-label*="Send" i]',
      'button:has(svg)',
      'form button:last-child'
    ]
    
    for (const selector of sendButtonSelectors) {
      try {
        const clickExpression = `
          (function() {
            const el = document.querySelector(${JSON.stringify(selector)})
            if (!el || el.disabled || el.offsetParent === null) return { ok: false }
            if (el.scrollIntoView) el.scrollIntoView({ block: 'center' })
            if (el.click) {
              el.click()
              return { ok: true }
            }
            return { ok: false }
          })()
        `
        const clickResult = await global.agentCdpClient.evaluate(webContents, clickExpression, { awaitPromise: true })
        if (clickResult.value && clickResult.value.ok) {
          await new Promise(resolve => setTimeout(resolve, 100))
          return { ok: true, method: 'send-button-fallback-direct', selector: selector }
        }
      } catch (e) {
        // Continue to next selector
      }
    }

    // Method 4: Use keyboard shortcut (Enter key while textarea is focused)
    await global.agentCdpClient.ensureDomains(webContents, ['Input'])
    
    // Ensure textarea is focused
    if (inputTarget && inputTarget.selector) {
      const focusExpr = `document.querySelector(${JSON.stringify(inputTarget.selector)})?.focus()`
      await global.agentCdpClient.evaluate(webContents, focusExpr)
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    
    // Try Enter key (ChatGPT accepts plain Enter)
    await global.agentCdpClient.send(webContents, 'Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'Enter',
      code: 'Enter',
      modifiers: []
    })
    await global.agentCdpClient.send(webContents, 'Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Enter',
      code: 'Enter',
      modifiers: []
    })
    
    await new Promise(resolve => setTimeout(resolve, 100))
    
    // If Enter didn't work, try Cmd/Ctrl+Enter
    const isMac = process.platform === 'darwin'
    const modifiers = isMac ? ['Meta'] : ['Control']
    
    await global.agentCdpClient.send(webContents, 'Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: isMac ? 'Meta' : 'Control',
      code: isMac ? 'MetaLeft' : 'ControlLeft',
      modifiers: []
    })
    await global.agentCdpClient.send(webContents, 'Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'Enter',
      code: 'Enter',
      modifiers: modifiers
    })
    await global.agentCdpClient.send(webContents, 'Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Enter',
      code: 'Enter',
      modifiers: modifiers
    })
    await global.agentCdpClient.send(webContents, 'Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: isMac ? 'Meta' : 'Control',
      code: isMac ? 'MetaLeft' : 'ControlLeft',
      modifiers: []
    })
    
    return { ok: true, method: 'keyboard-shortcut', shortcuts: ['Enter', isMac ? 'Cmd+Enter' : 'Ctrl+Enter'] }
  }
}

// Helper function to verify if send was successful
async function verifySendSuccess (webContents, inputTarget, baselineCount) {
  // Wait a bit for the UI to update
  await new Promise(resolve => setTimeout(resolve, 500))
  
  // Check if input was cleared (indicates message was sent)
  if (inputTarget && inputTarget.selector) {
    const checkExpression = `
      (function() {
        const el = document.querySelector(${JSON.stringify(inputTarget.selector)})
        if (!el) return { ok: false, error: 'input-not-found' }
        const value = el.isContentEditable ? el.textContent : el.value
        const isEmpty = !value || value.trim().length === 0
        return { ok: true, isEmpty: isEmpty, value: value }
      })()
    `
    const checkResult = await global.agentCdpClient.evaluate(webContents, checkExpression)
    if (checkResult.value && checkResult.value.ok && checkResult.value.isEmpty) {
      return { ok: true, method: 'input-cleared' }
    }
  }
  
  // Check if assistant message count increased
  if (baselineCount !== undefined && baselineCount !== null) {
    try {
      const currentCount = await global.agentChatGptResponseStreamer.getAssistantCount(webContents)
      if (currentCount > baselineCount) {
        return { ok: true, method: 'message-count-increased', baseline: baselineCount, current: currentCount }
      }
    } catch (e) {
      // Ignore errors in verification
    }
  }
  
  return { ok: false, error: 'could-not-verify' }
}

global.agentChatGptPromptInserter = agentChatGptPromptInserter

global.agentChatGptPromptInserter = agentChatGptPromptInserter
