var ChatGptEventEmitter = require('events').EventEmitter

function buildRunId () {
  return 'run_' + Date.now() + '_' + Math.random().toString(16).slice(2)
}

var chatGptActiveRuns = new Map()

async function focusTab (tabId) {
  try {
    await global.agentBrowserController.selectTab(tabId)
  } catch (e) {}
}

var agentChatGptController = {
  async runPrompt (options = {}) {
    const prompt = options.prompt
    if (!prompt) {
      const error = new Error('Prompt is required')
      error.status = 400
      throw error
    }

    const runId = buildRunId()
    const emitter = new ChatGptEventEmitter()

    const sendEvent = function (type, payload) {
      emitter.emit(type, payload || {})
    }

    console.log('[ChatGPT] run start', runId, 'promptLen=' + String(prompt).length)
    const tabInfo = await global.agentChatGptTabEnsurer.ensure({ tabId: options.tabId })
    const webContents = await global.agentChatGptTabEnsurer.ensureReady(tabInfo.id)

    if (options.focusTab !== false) {
      await focusTab(tabInfo.id)
    }

    const inputTarget = await global.agentChatGptElementFinder.findInput(webContents)
    if (!inputTarget) {
      const error = new Error('ChatGPT input not found')
      error.status = 404
      throw error
    }
    console.log('[ChatGPT] input found', inputTarget.source || 'unknown')

    const sendTarget = await global.agentChatGptElementFinder.findSendButton(webContents)
    console.log('[ChatGPT] send target', sendTarget ? (sendTarget.source || 'unknown') : 'none')
    const baselineCount = await global.agentChatGptResponseStreamer.getAssistantCount(webContents)

    const insertResult = await global.agentChatGptPromptInserter.insertPrompt(webContents, inputTarget, prompt)
    if (!insertResult.ok) {
      const error = new Error(insertResult.error || 'Failed to insert prompt')
      error.status = 500
      throw error
    }
    console.log('[ChatGPT] prompt inserted', insertResult.method)

    const sendResult = await global.agentChatGptPromptInserter.sendPrompt(webContents, inputTarget, sendTarget)
    if (!sendResult.ok) {
      const error = new Error(sendResult.error || 'Failed to send prompt')
      error.status = 500
      throw error
    }
    console.log('[ChatGPT] prompt sent', sendResult.method)

    const streamState = {
      runId,
      tabId: tabInfo.id,
      webContents,
      fullText: ''
    }

    let cleanup = function () {}

    let stream = null
    try {
      stream = await global.agentChatGptResponseStreamer.startStream(webContents, {
        baselineCount,
        completeDelay: options.completeDelay || 1200,
        maxWaitMs: options.maxWaitMs || 120000
      }, {
      onStarted: function () {
        sendEvent('started', { runId, tabId: tabInfo.id })
      },
      onChunk: function (text) {
        streamState.fullText += text
        sendEvent('chunk', { runId, text })
      },
      onComplete: function (fullText) {
        streamState.fullText = fullText || streamState.fullText
        sendEvent('complete', { runId, fullText: streamState.fullText })
        cleanup()
      },
      onError: function (message) {
        sendEvent('error', { runId, message })
        cleanup()
      }
      })
    } catch (error) {
      const message = error && error.details ? JSON.stringify(error.details) : (error.message || 'Stream init failed')
      sendEvent('error', { runId, message })
      throw error
    }

    streamState.stream = stream
    chatGptActiveRuns.set(runId, streamState)

    cleanup = async function () {
      if (!chatGptActiveRuns.has(runId)) {
        return
      }
      chatGptActiveRuns.delete(runId)
      if (stream && stream.stop) {
        await stream.stop()
      }
    }

    streamState.cleanup = cleanup

    return {
      runId,
      tabId: tabInfo.id,
      events: emitter
    }
  },
  async cancel (runId) {
    const run = chatGptActiveRuns.get(runId)
    if (!run) {
      return { ok: false, error: 'Run not found' }
    }
    if (run.stream && run.stream.stop) {
      await run.stream.stop()
    }
    chatGptActiveRuns.delete(runId)
    return { ok: true, runId }
  }
}

global.agentChatGptController = agentChatGptController
