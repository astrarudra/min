const MAX_NETWORK_REQUESTS = 500

const networkBuffers = new Map()
const networkListeners = new Map()

function getStore (webContentsId) {
  const key = webContentsId.toString()
  if (!networkBuffers.has(key)) {
    networkBuffers.set(key, {
      entries: [],
      byId: new Map()
    })
  }
  return networkBuffers.get(key)
}

function trimEntries (store) {
  if (store.entries.length <= MAX_NETWORK_REQUESTS) {
    return
  }
  const overflow = store.entries.length - MAX_NETWORK_REQUESTS
  for (let i = 0; i < overflow; i++) {
    const removed = store.entries.shift()
    if (removed && removed.requestId) {
      store.byId.delete(removed.requestId)
    }
  }
}

async function ensureNetworkListener (webContents) {
  const key = webContents.id.toString()
  if (networkListeners.has(key)) {
    return
  }

  await global.agentCdpClient.ensureDomains(webContents, ['Network'])

  const handler = function (event, method, params) {
    if (!params) {
      return
    }

    const store = getStore(webContents.id)

    if (method === 'Network.requestWillBeSent') {
      const entry = {
        requestId: params.requestId,
        url: params.request ? params.request.url : params.documentURL,
        method: params.request ? params.request.method : null,
        type: params.type || null,
        initiator: params.initiator || null,
        documentURL: params.documentURL || null,
        timestamp: Date.now()
      }
      store.entries.push(entry)
      if (params.requestId) {
        store.byId.set(params.requestId, entry)
      }
      trimEntries(store)
      return
    }

    if (method === 'Network.responseReceived') {
      const entry = store.byId.get(params.requestId)
      if (entry && params.response) {
        entry.status = params.response.status
        entry.statusText = params.response.statusText
        entry.mimeType = params.response.mimeType
        entry.fromDiskCache = !!params.response.fromDiskCache
        entry.fromServiceWorker = !!params.response.fromServiceWorker
        entry.responseHeaders = params.response.headers || null
      }
      return
    }

    if (method === 'Network.loadingFinished') {
      const entry = store.byId.get(params.requestId)
      if (entry) {
        entry.encodedDataLength = params.encodedDataLength
        entry.finished = true
      }
      return
    }

    if (method === 'Network.loadingFailed') {
      const entry = store.byId.get(params.requestId)
      if (entry) {
        entry.errorText = params.errorText || 'failed'
        entry.canceled = !!params.canceled
        entry.finished = true
      }
    }
  }

  webContents.debugger.on('message', handler)
  networkListeners.set(key, handler)

  webContents.once('destroyed', function () {
    const listener = networkListeners.get(key)
    if (listener) {
      try {
        webContents.debugger.removeListener('message', listener)
      } catch (e) {}
    }
    networkListeners.delete(key)
    networkBuffers.delete(key)
  })
}

const agentNetworkService = {
  async getRequests (webContents, options = {}) {
    await ensureNetworkListener(webContents)

    const store = getStore(webContents.id)
    const since = typeof options.since === 'number' ? options.since : null
    const limit = Math.min(options.limit || 200, MAX_NETWORK_REQUESTS)

    let entries = store.entries
    if (since !== null) {
      entries = entries.filter(entry => entry.timestamp >= since)
    }
    if (limit && entries.length > limit) {
      entries = entries.slice(entries.length - limit)
    }

    if (options.clear === true) {
      store.entries = []
      store.byId = new Map()
    }

    return {
      id: webContents.id.toString(),
      requests: entries
    }
  },
  clear (webContents) {
    const store = getStore(webContents.id)
    store.entries = []
    store.byId = new Map()
  }
}

global.agentNetworkService = agentNetworkService
