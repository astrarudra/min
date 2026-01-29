const { z: agentZod } = require('zod')

const agentToolOutputSchema = agentZod.object({
  ok: agentZod.boolean(),
  message: agentZod.string().optional(),
  error: agentZod.string().optional(),
  data: agentZod.any().optional()
})

function agentResolveTabId (args) {
  if (args && args.tabId) {
    return args.tabId
  }
  const active = global.agentBrowserController.getActiveTab()
  if (!active || !active.id) {
    const error = new Error('No active tab')
    error.status = 404
    throw error
  }
  return active.id
}

function agentSummarizeData (data) {
  if (!data) {
    return ''
  }
  if (Array.isArray(data)) {
    return 'items=' + data.length
  }
  if (typeof data === 'object') {
    const keys = Object.keys(data)
    return 'keys=' + keys.slice(0, 4).join(',') + (keys.length > 4 ? '…' : '')
  }
  if (typeof data === 'string') {
    return 'len=' + data.length
  }
  return String(data)
}

function agentSummarizeArgs (args) {
  if (!args) {
    return ''
  }
  const parts = []
  if (args.tabId) {
    parts.push('tab=' + args.tabId)
  }
  if (args.url) {
    parts.push('url=' + args.url)
  }
  if (args.text) {
    const text = String(args.text)
    parts.push('text=' + (text.length > 40 ? text.slice(0, 40) + '…' : text))
  }
  if (args.selector) {
    parts.push('selector=' + args.selector)
  }
  return parts.join(' ')
}

function agentLogToolCall (toolName, args, durationMs, result) {
  const status = result && result.ok ? 'ok' : 'error'
  const summary = result && result.data ? agentSummarizeData(result.data) : (result && result.error ? result.error : '')
  const argSummary = agentSummarizeArgs(args)
  const argPart = argSummary ? argSummary + ' ' : ''
  console.info('[MCP]', toolName, status, argPart + durationMs + 'ms', summary)
}

function agentWrapTool (toolName, handler) {
  return async function (args) {
    const start = Date.now()
    try {
      const data = await handler(args || {})
      const result = {
        ok: true,
        data,
        message: 'ok'
      }
      agentLogToolCall(toolName, args, Date.now() - start, result)
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
        structuredContent: result
      }
    } catch (e) {
      const errorMessage = e && e.message ? e.message : String(e)
      const result = {
        ok: false,
        error: errorMessage,
        message: 'error'
      }
      agentLogToolCall(toolName, args, Date.now() - start, result)
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
        structuredContent: result,
        isError: true
      }
    }
  }
}

function agentRegisterMcpTools (mcpServer, emitEvent) {
  const tools = global.agentMcpBuildToolDefinitions(agentZod, agentResolveTabId, emitEvent)

  tools.forEach(function (tool) {
    const inputSchema = tool.inputSchema || agentZod.object({})
    mcpServer.registerTool(tool.name, {
      title: tool.name,
      description: tool.description,
      inputSchema,
      outputSchema: agentToolOutputSchema
    }, agentWrapTool(tool.name, tool.handler))
  })
}

global.agentRegisterMcpTools = agentRegisterMcpTools
