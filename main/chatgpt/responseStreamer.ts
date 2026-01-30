var ChatGptEventEmitter = require('events').EventEmitter

function buildStreamScript (bindingName, options) {
  return `
(function(bindingName, options) {
  if (!bindingName || !window[bindingName]) {
    return;
  }

  if (window.__minChatGPTStreamStop) {
    try { window.__minChatGPTStreamStop(); } catch (e) {}
  }

  var send = window[bindingName];
  var baselineCount = options.baselineCount || 0;
  var state = {
    lastText: '',
    idleTimer: null,
    hasText: false
  };

  var overallTimer = null;
  if (options.maxWaitMs) {
    overallTimer = setTimeout(function () {
      emit('error', { message: 'Timed out waiting for response' });
      stop();
    }, options.maxWaitMs);
  }

  function emit(type, payload) {
    try {
      send(JSON.stringify(Object.assign({ type: type }, payload || {})));
    } catch (e) {}
  }

  function getAssistantNodes() {
    return Array.from(document.querySelectorAll('[data-message-author-role="assistant"]'));
  }

  function pickAssistantText() {
    var nodes = getAssistantNodes();
    if (!nodes.length || nodes.length <= baselineCount) {
      return null;
    }
    var node = nodes[nodes.length - 1];
    var target = node.querySelector('[data-message-content], .markdown, article, .prose') || node;
    var text = target.innerText || target.textContent || '';
    return text.trim();
  }

  function hasStopIndicator() {
    return !!document.querySelector('button[aria-label*="Stop" i], button[data-testid="stop-generating"], button[aria-label*="Regenerate" i]');
  }

  function scheduleComplete() {
    if (!state.hasText) {
      return;
    }
    if (state.idleTimer) {
      clearTimeout(state.idleTimer);
    }
    state.idleTimer = setTimeout(function () {
      if (hasStopIndicator()) {
        scheduleComplete();
        return;
      }
      emit('complete', { fullText: state.lastText });
      stop();
    }, options.completeDelay || 1200);
  }

  function checkForUpdates() {
    var text = pickAssistantText();
    if (text === null) {
      return;
    }
    if (text.startsWith(state.lastText)) {
      var delta = text.slice(state.lastText.length);
      if (delta) {
        state.lastText = text;
        state.hasText = true;
        emit('chunk', { text: delta });
      }
    } else if (text !== state.lastText) {
      state.lastText = text;
      state.hasText = true;
      emit('chunk', { text: text });
    }
    scheduleComplete();
  }

  var observer = new MutationObserver(checkForUpdates);
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });

  function stop() {
    try { observer.disconnect(); } catch (e) {}
    if (state.idleTimer) {
      clearTimeout(state.idleTimer);
    }
    if (overallTimer) {
      clearTimeout(overallTimer);
    }
    window.__minChatGPTStreamStop = null;
  }

  window.__minChatGPTStreamStop = stop;
  emit('started');
  checkForUpdates();
})("${bindingName}", ${JSON.stringify(options || {})});
`
}

async function getAssistantCount (webContents) {
  const expression = 'document.querySelectorAll("[data-message-author-role=\\"assistant\\"]").length'
  const result = await global.agentCdpClient.evaluate(webContents, expression, { returnByValue: true })
  return typeof result.value === 'number' ? result.value : 0
}

async function startStream (webContents, options, handlers) {
  await global.agentCdpClient.ensureDomains(webContents, ['Runtime'])

  const bindingName = '__minChatGPTStream_' + Date.now() + '_' + Math.random().toString(16).slice(2)
  const emitter = new ChatGptEventEmitter()

  const listener = function (event, method, params) {
    if (method !== 'Runtime.bindingCalled' || !params || params.name !== bindingName) {
      return
    }
    let payload = null
    try {
      payload = JSON.parse(params.payload || '{}')
    } catch (e) {
      payload = { type: 'error', message: 'Malformed stream payload' }
    }
    if (payload.type === 'chunk') {
      emitter.emit('chunk', payload.text || '')
    } else if (payload.type === 'complete') {
      emitter.emit('complete', payload.fullText || '')
    } else if (payload.type === 'started') {
      emitter.emit('started')
    } else if (payload.type === 'error') {
      emitter.emit('error', payload.message || 'Stream error')
    }
  }

  webContents.debugger.on('message', listener)

  await global.agentCdpClient.send(webContents, 'Runtime.addBinding', { name: bindingName })

  try {
    const script = buildStreamScript(bindingName, options)
    await global.agentCdpClient.evaluate(webContents, script, { awaitPromise: false })
  } catch (error) {
    try {
      await global.agentCdpClient.send(webContents, 'Runtime.removeBinding', { name: bindingName })
    } catch (e) {}
    webContents.debugger.removeListener('message', listener)
    console.warn('[ChatGPT] stream inject failed', error && error.details ? error.details : error)
    throw error
  }

  if (handlers) {
    emitter.on('chunk', handlers.onChunk || function () {})
    emitter.on('complete', handlers.onComplete || function () {})
    emitter.on('started', handlers.onStarted || function () {})
    emitter.on('error', handlers.onError || function () {})
  }

  const stop = async function () {
    try {
      await global.agentCdpClient.evaluate(webContents, 'window.__minChatGPTStreamStop && window.__minChatGPTStreamStop()', { awaitPromise: false })
    } catch (e) {}
    try {
      await global.agentCdpClient.send(webContents, 'Runtime.removeBinding', { name: bindingName })
    } catch (e) {}
    webContents.debugger.removeListener('message', listener)
  }

  return {
    bindingName,
    stop,
    emitter
  }
}

var agentChatGptResponseStreamer = {
  getAssistantCount,
  startStream
}

global.agentChatGptResponseStreamer = agentChatGptResponseStreamer
