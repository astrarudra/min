const { EventEmitter } = require('events')

const tabEvents = new EventEmitter()
const tabCache = new Map()
const viewListeners = new Map()

function getViewIds () {
  if (global.getAllViewIds) {
    return global.getAllViewIds()
  }
  return []
}

function getViewById (id) {
  if (global.getView) {
    return global.getView(id)
  }
  return null
}

function isViewActive (id) {
  const idString = id.toString()
  const windowsList = windows.getAll()
  for (const win of windowsList) {
    if (windows.getState(win).selectedView === idString) {
      return true
    }
  }
  return false
}

function buildTabInfo (id) {
  const view = getViewById(id)
  if (!view || !view.webContents || view.webContents.isDestroyed()) {
    return null
  }

  const webContents = view.webContents

  return {
    id: id.toString(),
    title: webContents.getTitle() || '',
    url: webContents.getURL() || '',
    isActive: isViewActive(id)
  }
}

function updateCache (id) {
  const info = buildTabInfo(id)
  if (info) {
    tabCache.set(id.toString(), info)
  }
  return info
}

const tabManager = {
  on (eventName, listener) {
    tabEvents.on(eventName, listener)
  },
  off (eventName, listener) {
    tabEvents.off(eventName, listener)
  },
  getTabInfo (id) {
    const info = updateCache(id)
    return info || null
  },
  listTabs () {
    const ids = getViewIds()
    return ids.map(id => tabManager.getTabInfo(id)).filter(Boolean)
  },
  getActiveTab () {
    const currentWindow = windows.getCurrent()
    if (!currentWindow) {
      return null
    }
    const activeId = windows.getState(currentWindow).selectedView
    if (!activeId) {
      return null
    }
    return tabManager.getTabInfo(activeId)
  },
  getWebContents (id) {
    const view = getViewById(id)
    if (!view || !view.webContents || view.webContents.isDestroyed()) {
      return null
    }
    return view.webContents
  },
  handleViewCreated (id, view) {
    if (!view || !view.webContents) {
      return
    }

    const webContents = view.webContents
    const update = function () {
      const info = updateCache(id)
      if (info) {
        tabEvents.emit('url-changed', info)
      }
    }

    const navigationStart = function (event, url, isInPlace, isMainFrame) {
      const info = updateCache(id)
      if (info) {
        tabEvents.emit('navigation-started', {
          id: info.id,
          title: info.title,
          url: url || info.url,
          isActive: info.isActive,
          isMainFrame: !!isMainFrame,
          isInPlace: !!isInPlace
        })
      }
    }

    const navigationComplete = function (event, url, httpResponseCode, httpStatusText) {
      const info = updateCache(id)
      if (info) {
        tabEvents.emit('navigation-completed', {
          id: info.id,
          title: info.title,
          url: url || info.url,
          isActive: info.isActive,
          httpResponseCode: httpResponseCode || null,
          httpStatusText: httpStatusText || ''
        })
      }
    }

    const titleUpdate = function () {
      const info = updateCache(id)
      if (info) {
        tabEvents.emit('url-changed', info)
      }
    }

    webContents.on('did-start-navigation', navigationStart)
    webContents.on('did-navigate', update)
    webContents.on('did-navigate-in-page', update)
    webContents.on('did-navigate', navigationComplete)
    webContents.on('did-navigate-in-page', navigationComplete)
    webContents.on('page-title-updated', titleUpdate)

    viewListeners.set(id.toString(), { webContents, update, titleUpdate, navigationStart, navigationComplete })

    const info = updateCache(id) || { id: id.toString() }
    tabEvents.emit('tab-created', info)
  },
  handleViewDestroyed (id) {
    const key = id.toString()
    const info = tabCache.get(key) || { id: key }

    const listeners = viewListeners.get(key)
    if (listeners && listeners.webContents) {
      listeners.webContents.removeListener('did-navigate', listeners.update)
      listeners.webContents.removeListener('did-navigate-in-page', listeners.update)
      listeners.webContents.removeListener('did-start-navigation', listeners.navigationStart)
      listeners.webContents.removeListener('did-navigate', listeners.navigationComplete)
      listeners.webContents.removeListener('did-navigate-in-page', listeners.navigationComplete)
      listeners.webContents.removeListener('page-title-updated', listeners.titleUpdate)
    }
    viewListeners.delete(key)
    tabCache.delete(key)

    if (global.agentElementFinder && global.agentElementFinder.clearCacheForWebContentsId && listeners && listeners.webContents) {
      global.agentElementFinder.clearCacheForWebContentsId(listeners.webContents.id)
    }

    tabEvents.emit('tab-closed', info)
  }
}

global.agentTabManager = tabManager
