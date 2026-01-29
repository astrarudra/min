const mcpHttp = require('http')

const DEFAULT_MCP_PORT = 9344
const DEFAULT_MCP_HOST = '127.0.0.1'

let agentMcpHttpServer = null
let agentMcpTransport = null
let agentMcpServer = null

function agentPatchMcpZodLiterals () {
  try {
    const types = require('@modelcontextprotocol/sdk/types.js')
    const zodCompat = require('@modelcontextprotocol/sdk/server/zod-compat.js')
    Object.keys(types).forEach(function (key) {
      const schema = types[key]
      if (!schema || typeof schema !== 'object') {
        return
      }
      const shape = zodCompat.getObjectShape(schema)
      if (!shape || !shape.method) {
        return
      }
      const methodSchema = shape.method
      const def = (methodSchema._zod && methodSchema._zod.def) || methodSchema._def
      if (def && def.values && typeof def.value === 'undefined') {
        if (Array.isArray(def.values)) {
          def.value = def.values[0]
        } else if (def.values instanceof Set) {
          def.value = Array.from(def.values)[0]
        }
      }
      if (typeof methodSchema.value === 'undefined' && def && typeof def.value === 'string') {
        methodSchema.value = def.value
      }
    })
  } catch (e) {
    console.warn('[MCP] zod patch skipped', e)
  }
}

function agentGetMcpPort () {
  const envPort = parseInt(process.env.MIN_MCP_PORT || '', 10)
  const settingsPort = parseInt(settings.get('mcpPort') || '', 10)

  if (!Number.isNaN(envPort) && envPort > 0) {
    return envPort
  }
  if (!Number.isNaN(settingsPort) && settingsPort > 0) {
    return settingsPort
  }
  return DEFAULT_MCP_PORT
}

function agentMcpEmitEvent (type, payload) {
  if (!agentMcpServer || !agentMcpServer.isConnected || !agentMcpServer.isConnected()) {
    return
  }

  agentMcpServer.server.notification({
    method: 'notifications/page-event',
    params: {
      type,
      payload,
      timestamp: Date.now()
    }
  }).catch(function (error) {
    console.warn('[MCP] notification error', error)
  })
}

function agentAttachMcpEvents () {
  if (!global.agentTabManager || !global.agentTabManager.on) {
    return
  }

  global.agentTabManager.on('navigation-started', function (payload) {
    agentMcpEmitEvent('navigation-started', payload)
  })
  global.agentTabManager.on('navigation-completed', function (payload) {
    agentMcpEmitEvent('navigation-completed', payload)
  })
  global.agentTabManager.on('url-changed', function (payload) {
    agentMcpEmitEvent('page-changed', payload)
  })
}

async function agentStartMcpServer () {
  if (agentMcpHttpServer) {
    return
  }

  const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js')
  const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js')
  agentPatchMcpZodLiterals()

  const port = agentGetMcpPort()
  const host = DEFAULT_MCP_HOST

  agentMcpServer = new McpServer({
    name: 'Min MCP',
    version: app.getVersion()
  }, {
    capabilities: {
      tools: {
        listChanged: true
      }
    }
  })

  if (global.agentRegisterMcpTools) {
    global.agentRegisterMcpTools(agentMcpServer, agentMcpEmitEvent)
  } else {
    console.warn('[MCP] tool registry missing')
  }

  agentMcpTransport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined
  })

  await agentMcpServer.connect(agentMcpTransport)

  agentMcpHttpServer = mcpHttp.createServer(function (req, res) {
    const url = new URL(req.url, 'http://localhost')
    if (url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ status: 'ok', port }))
      return
    }

    if (url.pathname !== '/mcp') {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Not found' }))
      return
    }

    agentMcpTransport.handleRequest(req, res).catch(function (error) {
      console.warn('[MCP] transport error', error)
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'MCP transport error' }))
      }
    })
  })

  agentMcpHttpServer.on('error', function (err) {
    console.warn('[MCP] server error', err)
  })

  agentMcpHttpServer.listen(port, host, function () {
    console.log('[MCP] listening on http://' + host + ':' + port + '/mcp')
  })

  agentAttachMcpEvents()

  app.on('will-quit', function () {
    if (agentMcpHttpServer) {
      try {
        agentMcpHttpServer.close()
      } catch (e) {}
    }
    if (agentMcpServer) {
      agentMcpServer.close().catch(function () {})
    }
  })
}

app.on('ready', function () {
  agentStartMcpServer().catch(function (err) {
    console.warn('[MCP] failed to start', err)
  })
})
