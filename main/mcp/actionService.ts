const agentActionService = {
  async navigate (tabId, url) {
    return global.agentBrowserController.navigate(tabId, url)
  },
  async newTab (options) {
    return global.agentBrowserController.newTab(options || {})
  },
  async navigateBack (tabId) {
    return global.agentBrowserController.navigateBack(tabId)
  },
  async click (tabId, options) {
    return global.agentBrowserController.click(tabId, options)
  },
  async clickByText (tabId, text) {
    return global.agentBrowserController.clickByText(tabId, { text })
  },
  async type (tabId, options) {
    return global.agentBrowserController.type(tabId, options)
  },
  async pressKey (tabId, options) {
    return global.agentBrowserController.pressKey(tabId, options)
  },
  async hover (tabId, options) {
    return global.agentBrowserController.hover(tabId, options)
  },
  async drag (tabId, options) {
    return global.agentBrowserController.drag(tabId, options)
  },
  async fillForm (tabId, options) {
    return global.agentBrowserController.fillForm(tabId, options)
  },
  async selectOption (tabId, options) {
    return global.agentBrowserController.selectOption(tabId, options)
  },
  async handleDialog (tabId, options) {
    return global.agentBrowserController.handleDialog(tabId, options)
  },
  async executeScript (tabId, options) {
    return global.agentBrowserController.exec(tabId, options)
  },
  async evaluate (tabId, options) {
    return global.agentBrowserController.evaluate(tabId, options)
  },
  async waitFor (tabId, options) {
    return global.agentBrowserController.waitFor(tabId, options)
  },
  async scroll (tabId, options) {
    return global.agentBrowserController.scroll(tabId, options)
  },
  async resize (tabId, options) {
    return global.agentBrowserController.resize(tabId, options)
  },
  async screenshot (tabId) {
    return global.agentBrowserController.screenshot(tabId)
  },
  async consoleMessages (tabId, options) {
    return global.agentBrowserController.getConsoleMessages(tabId, options)
  },
  async networkRequests (tabId, options) {
    return global.agentBrowserController.getNetworkRequests(tabId, options)
  }
}

global.agentActionService = agentActionService
