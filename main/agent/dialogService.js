const dialogState = new Map()
const dialogListeners = new Map()

async function ensureDialogListener (webContents) {
  const key = webContents.id.toString()
  if (dialogListeners.has(key)) {
    return
  }

  await global.agentCdpClient.ensureDomains(webContents, ['Page'])

  const handler = function (event, method, params) {
    if (method === 'Page.javascriptDialogOpening' && params) {
      dialogState.set(key, {
        type: params.type || 'alert',
        message: params.message || '',
        defaultPrompt: params.defaultPrompt || '',
        url: params.url || ''
      })
      return
    }

    if (method === 'Page.javascriptDialogClosed') {
      dialogState.delete(key)
    }
  }

  webContents.debugger.on('message', handler)
  dialogListeners.set(key, handler)

  webContents.once('destroyed', function () {
    const listener = dialogListeners.get(key)
    if (listener) {
      try {
        webContents.debugger.removeListener('message', listener)
      } catch (e) {}
    }
    dialogListeners.delete(key)
    dialogState.delete(key)
  })
}

const agentDialogService = {
  async getDialog (webContents) {
    await ensureDialogListener(webContents)
    return dialogState.get(webContents.id.toString()) || null
  },
  async handleDialog (webContents, options = {}) {
    await ensureDialogListener(webContents)
    const key = webContents.id.toString()
    const current = dialogState.get(key)
    if (!current) {
      const error = new Error('No dialog to handle')
      error.status = 404
      throw error
    }

    const accept = options.accept !== false
    const promptText = typeof options.promptText === 'string' ? options.promptText : undefined

    await global.agentCdpClient.send(webContents, 'Page.handleJavaScriptDialog', {
      accept,
      promptText
    })

    dialogState.delete(key)

    return {
      ok: true,
      type: current.type,
      message: current.message,
      accepted: accept
    }
  }
}

global.agentDialogService = agentDialogService
