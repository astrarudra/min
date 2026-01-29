const cdpClient = {
  _domainState: new Map(),
  _attached: new Set(),
  _attach (webContents) {
    if (webContents.debugger.isAttached()) {
      return
    }

    try {
      webContents.debugger.attach('1.3')
      cdpClient._attached.add(webContents.id)
      webContents.once('destroyed', function () {
        cdpClient._domainState.delete(webContents.id)
        cdpClient._attached.delete(webContents.id)
      })
    } catch (e) {
      e.code = e.code || 'CDP_ATTACH_FAILED'
      e.status = e.status || 409
      throw e
    }
  },
  _getDomainState (webContents) {
    if (!cdpClient._domainState.has(webContents.id)) {
      cdpClient._domainState.set(webContents.id, {})
    }
    return cdpClient._domainState.get(webContents.id)
  },
  async ensureDomains (webContents, domains) {
    cdpClient._attach(webContents)

    const state = cdpClient._getDomainState(webContents)
    for (const domain of domains) {
      if (!state[domain]) {
        if (domain !== 'Input') {
          await webContents.debugger.sendCommand(domain + '.enable')
        }
        state[domain] = true
      }
    }
  },
  async send (webContents, method, params) {
    cdpClient._attach(webContents)
    return webContents.debugger.sendCommand(method, params)
  },
  async evaluate (webContents, expression, options = {}) {
    await cdpClient.ensureDomains(webContents, ['Runtime'])

    const result = await cdpClient.send(webContents, 'Runtime.evaluate', {
      expression,
      awaitPromise: options.awaitPromise !== false,
      returnByValue: options.returnByValue !== false,
      userGesture: options.userGesture === true
    })

    if (result.exceptionDetails) {
      const error = new Error('Script evaluation failed')
      error.details = result.exceptionDetails
      throw error
    }

    return result.result
  },
  async getOuterHTML (webContents) {
    await cdpClient.ensureDomains(webContents, ['DOM'])
    const document = await cdpClient.send(webContents, 'DOM.getDocument', { depth: 1 })
    const htmlResult = await cdpClient.send(webContents, 'DOM.getOuterHTML', { nodeId: document.root.nodeId })
    return htmlResult.outerHTML || ''
  },
  async captureScreenshot (webContents) {
    await cdpClient.ensureDomains(webContents, ['Page'])
    const result = await cdpClient.send(webContents, 'Page.captureScreenshot', { format: 'png' })
    return result.data
  }
}

global.agentCdpClient = cdpClient
