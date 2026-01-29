const MAX_CONSOLE_MESSAGES = 500

const consoleBuffers = new Map()
const consoleListeners = new Map()

function getBuffer (webContentsId) {
  const key = webContentsId.toString()
  if (!consoleBuffers.has(key)) {
    consoleBuffers.set(key, [])
  }
  return consoleBuffers.get(key)
}

function recordMessage (webContentsId, entry) {
  const buffer = getBuffer(webContentsId)
  buffer.push(entry)
  if (buffer.length > MAX_CONSOLE_MESSAGES) {
    buffer.shift()
  }
}

function formatRemoteObject (obj) {
  if (!obj) {
    return ''
  }
  if (typeof obj.value !== 'undefined') {
    try {
      return typeof obj.value === 'string' ? obj.value : JSON.stringify(obj.value)
    } catch (e) {
      return String(obj.value)
    }
  }
  if (obj.unserializableValue) {
    return String(obj.unserializableValue)
  }
  if (obj.description) {
    return String(obj.description)
  }
  return ''
}

async function ensureConsoleListener (webContents) {
  const key = webContents.id.toString()
  if (consoleListeners.has(key)) {
    return
  }

  await global.agentCdpClient.ensureDomains(webContents, ['Runtime', 'Log'])

  const handler = function (event, method, params) {
    if (!params) {
      return
    }

    if (method === 'Runtime.consoleAPICalled') {
      const args = (params.args || []).map(formatRemoteObject).filter(Boolean)
      recordMessage(webContents.id, {
        source: 'console',
        type: params.type || 'log',
        text: args.join(' '),
        args,
        stackTrace: params.stackTrace || null,
        timestamp: Date.now()
      })
      return
    }

    if (method === 'Log.entryAdded' && params.entry) {
      const entry = params.entry
      recordMessage(webContents.id, {
        source: entry.source || 'log',
        type: entry.level || 'log',
        text: entry.text || '',
        url: entry.url || '',
        lineNumber: typeof entry.lineNumber === 'number' ? entry.lineNumber : null,
        timestamp: Date.now()
      })
    }
  }

  webContents.debugger.on('message', handler)
  consoleListeners.set(key, handler)

  webContents.once('destroyed', function () {
    const listener = consoleListeners.get(key)
    if (listener) {
      try {
        webContents.debugger.removeListener('message', listener)
      } catch (e) {}
    }
    consoleListeners.delete(key)
    consoleBuffers.delete(key)
  })
}

const agentConsoleService = {
  async getMessages (webContents, options = {}) {
    await ensureConsoleListener(webContents)

    const buffer = getBuffer(webContents.id)
    const since = typeof options.since === 'number' ? options.since : null
    const limit = Math.min(options.limit || 200, MAX_CONSOLE_MESSAGES)

    let messages = buffer
    if (since !== null) {
      messages = messages.filter(entry => entry.timestamp >= since)
    }
    if (limit && messages.length > limit) {
      messages = messages.slice(messages.length - limit)
    }

    if (options.clear === true) {
      consoleBuffers.set(webContents.id.toString(), [])
    }

    return {
      id: webContents.id.toString(),
      messages
    }
  },
  clear (webContents) {
    consoleBuffers.set(webContents.id.toString(), [])
  }
}

global.agentConsoleService = agentConsoleService
