const path = require('path')
const fs = require('fs')

const outFile = path.resolve(__dirname, '../main.build.js')

const modules = [
  'dist/localization.build.js',
  'main/windowManagement.js',
  'js/util/keyMap.js',
  'main/menu.js',
  'main/touchbar.js',
  'main/registryConfig.js',
  'js/util/settings/settingsMain.js',
  'main/main.js',
  'main/minInternalProtocol.js',
  'main/filtering.js',
  'main/viewManager.js',
  'main/agent/cdpClient.js',
  'main/agent/tabManager.js',
  'main/agent/elementFinder.js',
  'main/agent/pageSnapshotService.js',
  'main/agent/accessibilityService.js',
  'main/agent/consoleService.js',
  'main/agent/networkService.js',
  'main/agent/dialogService.js',
  'main/agent/waitService.js',
  'main/agent/browserController.js',
  'main/chatgpt/tabEnsurer.ts',
  'main/chatgpt/elementFinder.ts',
  'main/chatgpt/promptInserter.ts',
  'main/chatgpt/responseStreamer.ts',
  'main/chatgpt/chatgptController.ts',
  'main/streaming/websocketServer.ts',
  'main/agent/agentServer.js',
  'main/mcp/actionService.ts',
  'main/mcp/tools/index.ts',
  'main/mcp/toolRegistry.ts',
  'main/mcp/mcpServer.ts',
  'main/download.js',
  'main/UASwitcher.js',
  'main/permissionManager.js',
  'main/prompt.js',
  'main/remoteMenu.js',
  'main/remoteActions.js',
  'main/keychainService.js',
  'js/util/proxy.js',
  'main/themeMain.js'
]

function buildMain () {
  // build localization support first, since it is included in the bundle
  require('./buildLocalization.js')()

  /* concatenate modules */
  let output = ''
  modules.forEach(function (script) {
    output += fs.readFileSync(path.resolve(__dirname, '../', script)) + ';\n'
  })

  fs.writeFileSync(outFile, output, 'utf-8')
}

if (module.parent) {
  module.exports = buildMain
} else {
  buildMain()
}
