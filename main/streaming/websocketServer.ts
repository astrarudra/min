var chatGptStreamCrypto = require('crypto')
var ChatGptStreamURL = require('url').URL

var CHATGPT_STREAM_WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

var chatGptStreamClients = new Map()

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

function parseWebSocketFrame (buffer) {
  if (!buffer || buffer.length < 2) {
    return null
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

  return { opcode, payload }
}

function sendEvent (socket, payload) {
  try {
    sendWebSocketMessage(socket, JSON.stringify(payload))
  } catch (e) {}
}

async function handleChatGptRun (socket, data) {
  if (!data || !data.prompt) {
    sendEvent(socket, { event: 'error', message: 'prompt is required' })
    return
  }

  if (chatGptStreamClients.get(socket)?.runId) {
    await global.agentChatGptController.cancel(chatGptStreamClients.get(socket).runId)
  }

  const run = await global.agentChatGptController.runPrompt({
    prompt: data.prompt,
    tabId: data.tabId,
    focusTab: data.focusTab !== false,
    completeDelay: data.completeDelay
  })

  chatGptStreamClients.set(socket, { runId: run.runId })

  run.events.on('started', function (payload) {
    sendEvent(socket, { event: 'started', runId: payload.runId, tabId: payload.tabId })
  })
  run.events.on('chunk', function (payload) {
    sendEvent(socket, { event: 'chunk', text: payload.text, runId: payload.runId })
  })
  run.events.on('complete', function (payload) {
    sendEvent(socket, { event: 'complete', fullText: payload.fullText, runId: payload.runId })
    chatGptStreamClients.set(socket, { runId: null })
  })
  run.events.on('error', function (payload) {
    sendEvent(socket, { event: 'error', message: payload.message || 'Stream error', runId: payload.runId })
    chatGptStreamClients.set(socket, { runId: null })
  })
}

async function handleClientMessage (socket, message) {
  let data = null
  try {
    data = JSON.parse(message)
  } catch (e) {
    sendEvent(socket, { event: 'error', message: 'Invalid JSON message' })
    return
  }

  if (data.action === 'chatgpt.run') {
    try {
      await handleChatGptRun(socket, data)
    } catch (e) {
      const detail = e && e.details ? JSON.stringify(e.details) : ''
      sendEvent(socket, { event: 'error', message: (e.message || 'chatgpt.run failed') + (detail ? ' | ' + detail : '') })
    }
    return
  }

  if (data.action === 'cancel') {
    const state = chatGptStreamClients.get(socket)
    if (state && state.runId) {
      await global.agentChatGptController.cancel(state.runId)
      chatGptStreamClients.set(socket, { runId: null })
      sendEvent(socket, { event: 'cancelled', runId: state.runId })
    }
    return
  }

  sendEvent(socket, { event: 'error', message: 'Unknown action' })
}

function handleSocketData (socket, data) {
  const frame = parseWebSocketFrame(data)
  if (!frame) {
    return
  }

  if (frame.opcode === 0x8) {
    socket.end()
    chatGptStreamClients.delete(socket)
    return
  }

  if (frame.opcode === 0x9) {
    const pong = buildWebSocketFrame(frame.payload, 0xA)
    socket.write(pong)
    return
  }

  if (frame.opcode === 0x1) {
    const text = frame.payload.toString()
    handleClientMessage(socket, text).catch(function (err) {
      sendEvent(socket, { event: 'error', message: err.message || 'Unhandled error' })
    })
  }
}

function handleUpgrade (req, socket) {
  const key = req.headers['sec-websocket-key']
  if (!key) {
    socket.write('HTTP/1.1 400 Bad Request\r\n\r\n')
    socket.destroy()
    return
  }

  const accept = chatGptStreamCrypto
    .createHash('sha1')
    .update(key + CHATGPT_STREAM_WS_GUID)
    .digest('base64')

  const responseHeaders = [
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    'Sec-WebSocket-Accept: ' + accept
  ]

  socket.write(responseHeaders.join('\r\n') + '\r\n\r\n')
  chatGptStreamClients.set(socket, { runId: null })

  socket.on('data', function (data) {
    handleSocketData(socket, data)
  })
  socket.on('close', function () {
    chatGptStreamClients.delete(socket)
  })
  socket.on('end', function () {
    chatGptStreamClients.delete(socket)
  })
  socket.on('error', function () {
    chatGptStreamClients.delete(socket)
  })
}

var agentStreamingServer = {
  attach (server) {
    if (!server) {
      return
    }
    server.on('upgrade', function (req, socket) {
      const url = new ChatGptStreamURL(req.url, 'http://localhost')
      if (url.pathname === '/stream') {
        handleUpgrade(req, socket)
        return
      }
    })
  },
  handleUpgrade
}

global.agentStreamingServer = agentStreamingServer
