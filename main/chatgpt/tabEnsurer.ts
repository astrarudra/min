var CHATGPT_TAB_URL = 'https://chatgpt.com/'

function isChatGptUrl (url) {
  return typeof url === 'string' && url.includes('chatgpt.com')
}

async function waitForTabWithUrl (predicate, timeoutMs) {
  const existing = global.agentTabManager.listTabs().find(tab => predicate(tab.url || ''))
  if (existing) {
    return existing
  }

  return new Promise(function (resolve) {
    let resolved = false
    const timer = setTimeout(function () {
      if (resolved) {
        return
      }
      resolved = true
      global.agentTabManager.off('tab-created', onCreated)
      global.agentTabManager.off('url-changed', onChanged)
      resolve(null)
    }, timeoutMs || 8000)

    const onCreated = function (tab) {
      if (resolved || !tab || !predicate(tab.url || '')) {
        return
      }
      resolved = true
      clearTimeout(timer)
      global.agentTabManager.off('tab-created', onCreated)
      global.agentTabManager.off('url-changed', onChanged)
      resolve(tab)
    }

    const onChanged = function (tab) {
      if (resolved || !tab || !predicate(tab.url || '')) {
        return
      }
      resolved = true
      clearTimeout(timer)
      global.agentTabManager.off('tab-created', onCreated)
      global.agentTabManager.off('url-changed', onChanged)
      resolve(tab)
    }

    global.agentTabManager.on('tab-created', onCreated)
    global.agentTabManager.on('url-changed', onChanged)
  })
}

async function waitForPageLoad (webContents, timeoutMs) {
  await global.agentCdpClient.ensureDomains(webContents, ['Page', 'Runtime'])
  try {
    const ready = await global.agentCdpClient.evaluate(webContents, 'document.readyState', { returnByValue: true })
    if (ready && (ready.value === 'complete' || ready.value === 'interactive')) {
      return
    }
  } catch (e) {}

  return new Promise(function (resolve, reject) {
    let resolved = false
    const timer = setTimeout(function () {
      if (resolved) {
        return
      }
      resolved = true
      webContents.debugger.removeListener('message', onMessage)
      reject(new Error('Timed out waiting for page load'))
    }, timeoutMs || 20000)

    const onMessage = function (event, method) {
      if (method === 'Page.loadEventFired' || method === 'Page.domContentEventFired') {
        if (resolved) {
          return
        }
        resolved = true
        clearTimeout(timer)
        webContents.debugger.removeListener('message', onMessage)
        resolve()
      }
    }

    webContents.debugger.on('message', onMessage)
  })
}

var agentChatGptTabEnsurer = {
  async ensure (options = {}) {
    const preferredId = options.tabId
    const tabs = global.agentTabManager.listTabs()

    if (preferredId) {
      const existing = tabs.find(tab => tab.id === preferredId.toString())
      if (existing) {
        if (!isChatGptUrl(existing.url)) {
          await global.agentBrowserController.navigate(existing.id, CHATGPT_TAB_URL)
        }
        return { id: existing.id, url: existing.url }
      }
    }

    const existingChat = tabs.find(tab => isChatGptUrl(tab.url))
    if (existingChat) {
      return { id: existingChat.id, url: existingChat.url }
    }

    await global.agentBrowserController.newTab({ url: CHATGPT_TAB_URL })
    const created = await waitForTabWithUrl(isChatGptUrl, 12000)

    if (!created) {
      const error = new Error('Unable to open ChatGPT tab')
      error.status = 500
      throw error
    }

    return { id: created.id, url: created.url }
  },
  async ensureReady (tabId) {
    const webContents = global.agentTabManager.getWebContents(tabId)
    if (!webContents) {
      const error = new Error('Tab not found')
      error.status = 404
      throw error
    }
    await waitForPageLoad(webContents, 20000)
    return webContents
  },
  isChatGptUrl
}

global.agentChatGptTabEnsurer = agentChatGptTabEnsurer
