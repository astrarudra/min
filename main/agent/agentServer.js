const http = require('http')
const crypto = require('crypto')
const { URL } = require('url')

const DEFAULT_AGENT_PORT = 9333
const DEFAULT_AGENT_HOST = '127.0.0.1'
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

let agentServer = null
const wsClients = new Set()

function getConfiguredPort () {
  const envPort = parseInt(process.env.MIN_AGENT_PORT || '', 10)
  const settingsPort = parseInt(settings.get('agentApiPort') || '', 10)

  if (!Number.isNaN(envPort) && envPort > 0) {
    return envPort
  }
  if (!Number.isNaN(settingsPort) && settingsPort > 0) {
    return settingsPort
  }
  return DEFAULT_AGENT_PORT
}

function agentSendJson (res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(payload))
}

function agentReadJsonBody (req) {
  return new Promise(function (resolve, reject) {
    let body = ''
    req.on('data', function (chunk) {
      body += chunk
      if (body.length > 1024 * 1024) {
        const error = new Error('Request body too large')
        error.status = 413
        reject(error)
        req.destroy()
      }
    })
    req.on('end', function () {
      if (!body) {
        resolve(null)
        return
      }
      try {
        resolve(JSON.parse(body))
      } catch (e) {
        const error = new Error('Invalid JSON body')
        error.status = 400
        reject(error)
      }
    })
    req.on('error', reject)
  })
}

function agentGetOpenApiSpec (port) {
  return {
    openapi: '3.0.0',
    info: {
      title: 'Min Agent Control API',
      version: app.getVersion()
    },
    servers: [
      { url: 'http://127.0.0.1:' + port }
    ],
    paths: {
      '/health': {
        get: {
          summary: 'Health check',
          responses: {
            200: { description: 'OK' }
          }
        }
      },
      '/tabs': {
        get: {
          summary: 'List tabs',
          responses: {
            200: { description: 'Tabs' }
          }
        }
      },
      '/tabs/active': {
        get: {
          summary: 'Get active tab',
          responses: {
            200: { description: 'Active tab' }
          }
        }
      },
      '/tabs/new': {
        post: {
          summary: 'Open a new tab',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    url: { type: 'string' }
                  },
                  required: ['url']
                }
              }
            }
          },
          responses: { 200: { description: 'Tab created' } }
        }
      },
      '/tabs/{id}/html': {
        get: {
          summary: 'Get HTML',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'HTML content' } }
        }
      },
      '/tabs/{id}/text': {
        get: {
          summary: 'Get structured text',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Structured content' } }
        }
      },
      '/tabs/{id}/screenshot': {
        get: {
          summary: 'Get screenshot',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Screenshot data URL' } }
        }
      },
      '/tabs/{id}/snapshot': {
        get: {
          summary: 'Get page snapshot',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Snapshot' } }
        }
      },
      '/tabs/{id}/accessibility': {
        get: {
          summary: 'Get accessibility tree',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Accessibility nodes' } }
        }
      },
      '/tabs/{id}/elements': {
        get: {
          summary: 'Get interactive elements',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Interactive elements' } }
        }
      },
      '/tabs/{id}/query': {
        post: {
          summary: 'Query selector',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    selector: { type: 'string' },
                    limit: { type: 'number' }
                  },
                  required: ['selector']
                }
              }
            }
          },
          responses: { 200: { description: 'Selector matches' } }
        }
      },
      '/tabs/{id}/waitFor': {
        post: {
          summary: 'Wait for selector or text',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    selector: { type: 'string' },
                    text: { type: 'string' },
                    timeout: { type: 'number' },
                    interval: { type: 'number' }
                  }
                }
              }
            }
          },
          responses: { 200: { description: 'Wait result' } }
        }
      },
      '/tabs/{id}/navigate': {
        post: {
          summary: 'Navigate tab',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { url: { type: 'string' } },
                  required: ['url']
                }
              }
            }
          },
          responses: { 200: { description: 'Navigation initiated' } }
        }
      },
      '/tabs/{id}/click': {
        post: {
          summary: 'Click in tab',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    selector: { type: 'string' },
                    elementId: { type: 'string' },
                    x: { type: 'number' },
                    y: { type: 'number' }
                  }
                }
              }
            }
          },
          responses: { 200: { description: 'Click dispatched' } }
        }
      },
      '/tabs/{id}/clickByText': {
        post: {
          summary: 'Click by visible text',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    text: { type: 'string' }
                  },
                  required: ['text']
                }
              }
            }
          },
          responses: { 200: { description: 'Click result' } }
        }
      },
      '/tabs/{id}/type': {
        post: {
          summary: 'Type text',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    selector: { type: 'string' },
                    elementId: { type: 'string' },
                    text: { type: 'string' },
                    clear: { type: 'boolean' }
                  },
                  required: ['text']
                }
              }
            }
          },
          responses: { 200: { description: 'Text inserted' } }
        }
      },
      '/tabs/{id}/scroll': {
        post: {
          summary: 'Scroll',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    selector: { type: 'string' },
                    deltaX: { type: 'number' },
                    deltaY: { type: 'number' },
                    x: { type: 'number' },
                    y: { type: 'number' }
                  }
                }
              }
            }
          },
          responses: { 200: { description: 'Scroll performed' } }
        }
      },
      '/tabs/{id}/exec': {
        post: {
          summary: 'Execute script',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    script: { type: 'string' },
                    awaitPromise: { type: 'boolean' },
                    returnByValue: { type: 'boolean' }
                  },
                  required: ['script']
                }
              }
            }
          },
          responses: { 200: { description: 'Script result' } }
        }
      }
    }
  }
}

function agentSendDocs (res, port) {
  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Min Agent Control API</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
    <style>
      body { margin: 0; background: #f7f7f7; }
      #swagger-ui { max-width: 1200px; margin: 0 auto; }
    </style>
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
      window.onload = function () {
        var specUrl = 'http://127.0.0.1:${port}/openapi.json'
        SwaggerUIBundle({
          url: specUrl,
          dom_id: '#swagger-ui'
        })
      }
    </script>
  </body>
</html>`
  res.writeHead(200, { 'Content-Type': 'text/html' })
  res.end(html)
}

function buildWebSocketFrame (payload, opcode = 0x1) {
  const payloadLength = payload.length
  let headerLength = 2

  if (payloadLength >= 126 && payloadLength < 65536) {
    headerLength = 4
  } else if (payloadLength >= 65536) {
    headerLength = 10
  }

  const frame = Buffer.alloc(headerLength + payloadLength)
  frame[0] = 0x80 | opcode

  if (payloadLength < 126) {
    frame[1] = payloadLength
    payload.copy(frame, 2)
  } else if (payloadLength < 65536) {
    frame[1] = 126
    frame.writeUInt16BE(payloadLength, 2)
    payload.copy(frame, 4)
  } else {
    frame[1] = 127
    frame.writeBigUInt64BE(BigInt(payloadLength), 2)
    payload.copy(frame, 10)
  }

  return frame
}

function sendWebSocketMessage (socket, data) {
  const payload = Buffer.from(data)
  const frame = buildWebSocketFrame(payload)
  socket.write(frame)
}

function broadcastEvent (eventName, payload) {
  if (!wsClients.size) {
    return
  }

  const message = JSON.stringify({
    event: eventName,
    payload
  })

  wsClients.forEach(function (socket) {
    try {
      sendWebSocketMessage(socket, message)
    } catch (e) {
      wsClients.delete(socket)
    }
  })
}

function handleWebSocketData (socket, buffer) {
  if (!buffer || buffer.length < 2) {
    return
  }

  const opcode = buffer[0] & 0x0f
  let payloadLength = buffer[1] & 0x7f
  let offset = 2

  if (payloadLength === 126) {
    payloadLength = buffer.readUInt16BE(offset)
    offset += 2
  } else if (payloadLength === 127) {
    payloadLength = Number(buffer.readBigUInt64BE(offset))
    offset += 8
  }

  const isMasked = (buffer[1] & 0x80) === 0x80
  let maskingKey = null
  if (isMasked) {
    maskingKey = buffer.slice(offset, offset + 4)
    offset += 4
  }

  let payload = buffer.slice(offset, offset + payloadLength)
  if (isMasked && maskingKey) {
    const unmasked = Buffer.alloc(payload.length)
    for (let i = 0; i < payload.length; i++) {
      unmasked[i] = payload[i] ^ maskingKey[i % 4]
    }
    payload = unmasked
  }

  if (opcode === 0x8) {
    socket.end()
    wsClients.delete(socket)
    return
  }

  if (opcode === 0x9) {
    const pong = buildWebSocketFrame(payload, 0xA)
    socket.write(pong)
  }
}

function agentHandleUpgrade (req, socket) {
  const key = req.headers['sec-websocket-key']
  if (!key) {
    socket.write('HTTP/1.1 400 Bad Request\r\n\r\n')
    socket.destroy()
    return
  }

  const accept = crypto
    .createHash('sha1')
    .update(key + WS_GUID)
    .digest('base64')

  const responseHeaders = [
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    'Sec-WebSocket-Accept: ' + accept
  ]

  socket.write(responseHeaders.join('\r\n') + '\r\n\r\n')
  wsClients.add(socket)

  socket.on('data', function (data) {
    handleWebSocketData(socket, data)
  })
  socket.on('close', function () {
    wsClients.delete(socket)
  })
  socket.on('end', function () {
    wsClients.delete(socket)
  })
  socket.on('error', function () {
    wsClients.delete(socket)
  })
}

async function agentHandleRequest (req, res) {
  const url = new URL(req.url, 'http://localhost')
  const pathname = url.pathname
  const parts = pathname.split('/').filter(Boolean)

  if (req.method === 'GET' && pathname === '/health') {
    agentSendJson(res, 200, {
      status: 'ok',
      port: getConfiguredPort(),
      version: app.getVersion()
    })
    return
  }

  if (req.method === 'GET' && pathname === '/openapi.json') {
    agentSendJson(res, 200, agentGetOpenApiSpec(getConfiguredPort()))
    return
  }

  if (req.method === 'GET' && pathname === '/docs') {
    agentSendDocs(res, getConfiguredPort())
    return
  }

  if (req.method === 'GET' && pathname === '/tabs') {
    agentSendJson(res, 200, { tabs: global.agentBrowserController.listTabs() })
    return
  }

  if (req.method === 'GET' && pathname === '/tabs/active') {
    agentSendJson(res, 200, { tab: global.agentBrowserController.getActiveTab() })
    return
  }

  if (req.method === 'POST' && pathname === '/tabs/new') {
    const body = await agentReadJsonBody(req)
    const result = await global.agentBrowserController.newTab(body || {})
    agentSendJson(res, 200, result)
    return
  }

  if (parts[0] === 'tabs' && parts.length >= 2) {
    const tabId = parts[1]
    const action = parts[2]

    if (req.method === 'GET' && action === 'html') {
      const result = await global.agentBrowserController.getHtml(tabId)
      agentSendJson(res, 200, result)
      return
    }

    if (req.method === 'GET' && action === 'text') {
      const result = await global.agentBrowserController.getText(tabId)
      agentSendJson(res, 200, result)
      return
    }

    if (req.method === 'GET' && action === 'screenshot') {
      const result = await global.agentBrowserController.screenshot(tabId)
      agentSendJson(res, 200, result)
      return
    }

    if (req.method === 'GET' && action === 'snapshot') {
      const result = await global.agentBrowserController.snapshot(tabId)
      agentSendJson(res, 200, result)
      return
    }

    if (req.method === 'GET' && action === 'accessibility') {
      const result = await global.agentBrowserController.accessibility(tabId)
      agentSendJson(res, 200, result)
      return
    }

    if (req.method === 'GET' && action === 'elements') {
      const result = await global.agentBrowserController.elements(tabId)
      agentSendJson(res, 200, result)
      return
    }

    if (req.method === 'POST' && action === 'query') {
      const body = await agentReadJsonBody(req)
      if (!body || !body.selector) {
        const error = new Error('Query requires selector')
        error.status = 400
        throw error
      }
      const result = await global.agentBrowserController.query(tabId, body.selector, body.limit)
      agentSendJson(res, 200, result)
      return
    }

    if (req.method === 'POST' && action === 'waitFor') {
      const body = await agentReadJsonBody(req)
      const result = await global.agentBrowserController.waitFor(tabId, body || {})
      agentSendJson(res, 200, result)
      return
    }

    if (req.method === 'POST' && action === 'navigate') {
      const body = await agentReadJsonBody(req)
      if (!body || !body.url) {
        const error = new Error('Navigate requires url')
        error.status = 400
        throw error
      }
      const result = await global.agentBrowserController.navigate(tabId, body.url)
      agentSendJson(res, 200, result)
      return
    }

    if (req.method === 'POST' && action === 'click') {
      const body = await agentReadJsonBody(req)
      const result = await global.agentBrowserController.click(tabId, body || {})
      agentSendJson(res, 200, result)
      return
    }

    if (req.method === 'POST' && action === 'clickByText') {
      const body = await agentReadJsonBody(req)
      const result = await global.agentBrowserController.clickByText(tabId, body || {})
      agentSendJson(res, 200, result)
      return
    }

    if (req.method === 'POST' && action === 'type') {
      const body = await agentReadJsonBody(req)
      const result = await global.agentBrowserController.type(tabId, body || {})
      agentSendJson(res, 200, result)
      return
    }

    if (req.method === 'POST' && action === 'scroll') {
      const body = await agentReadJsonBody(req)
      const result = await global.agentBrowserController.scroll(tabId, body || {})
      agentSendJson(res, 200, result)
      return
    }

    if (req.method === 'POST' && action === 'exec') {
      const body = await agentReadJsonBody(req)
      const result = await global.agentBrowserController.exec(tabId, body || {})
      agentSendJson(res, 200, result)
      return
    }
  }

  agentSendJson(res, 404, { error: 'Not found' })
}

function startAgentServer () {
  if (agentServer) {
    return
  }

  const port = getConfiguredPort()
  const host = DEFAULT_AGENT_HOST

  agentServer = http.createServer(function (req, res) {
    agentHandleRequest(req, res).catch(function (err) {
      const status = err.status || 500
      agentSendJson(res, status, {
        error: err.message || 'Internal error',
        details: err.details || undefined
      })
    })
  })
  agentServer.on('error', function (err) {
    console.warn('Agent control server error:', err)
  })

  agentServer.on('upgrade', function (req, socket) {
    const url = new URL(req.url, 'http://localhost')
    if (url.pathname === '/events') {
      agentHandleUpgrade(req, socket)
      return
    }
    socket.destroy()
  })

  agentServer.listen(port, host, function () {
    console.log('Agent control server listening on http://' + host + ':' + port)
  })

  if (global.agentTabManager && global.agentTabManager.on) {
    global.agentTabManager.on('tab-created', function (payload) {
      broadcastEvent('tab-created', payload)
    })
    global.agentTabManager.on('tab-closed', function (payload) {
      broadcastEvent('tab-closed', payload)
    })
    global.agentTabManager.on('url-changed', function (payload) {
      broadcastEvent('url-changed', payload)
    })
  }

  app.on('will-quit', function () {
    try {
      agentServer.close()
    } catch (e) {}
    wsClients.forEach(function (socket) {
      try {
        socket.destroy()
      } catch (e) {}
    })
    wsClients.clear()
  })
}

app.on('ready', function () {
  startAgentServer()
})
