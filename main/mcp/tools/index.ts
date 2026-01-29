function agentMcpBuildToolDefinitions (z, resolveTabId, emitEvent) {
  return [
    {
      name: 'list_tabs',
      description: 'List all open tabs',
      inputSchema: z.object({}),
      handler: async () => ({ tabs: global.agentTabManager.listTabs() })
    },
    {
      name: 'get_active_tab',
      description: 'Get active tab',
      inputSchema: z.object({}),
      handler: async () => ({ tab: global.agentBrowserController.getActiveTab() })
    },
    {
      name: 'page_snapshot',
      description: 'Get structured snapshot of the page',
      inputSchema: z.object({ tabId: z.string().optional() }),
      handler: async (args) => {
        const tabId = resolveTabId(args)
        return global.agentBrowserController.snapshot(tabId)
      }
    },
    {
      name: 'page_accessibility',
      description: 'Get accessibility tree entries',
      inputSchema: z.object({ tabId: z.string().optional() }),
      handler: async (args) => {
        const tabId = resolveTabId(args)
        return global.agentBrowserController.accessibility(tabId)
      }
    },
    {
      name: 'page_elements',
      description: 'List interactive elements on the page',
      inputSchema: z.object({ tabId: z.string().optional() }),
      handler: async (args) => {
        const tabId = resolveTabId(args)
        return global.agentBrowserController.elements(tabId)
      }
    },
    {
      name: 'page_text',
      description: 'Get readable page text',
      inputSchema: z.object({ tabId: z.string().optional() }),
      handler: async (args) => {
        const tabId = resolveTabId(args)
        return global.agentBrowserController.getText(tabId)
      }
    },
    {
      name: 'page_html',
      description: 'Get page HTML',
      inputSchema: z.object({ tabId: z.string().optional() }),
      handler: async (args) => {
        const tabId = resolveTabId(args)
        return global.agentBrowserController.getHtml(tabId)
      }
    },
    {
      name: 'navigate',
      description: 'Navigate a tab to a URL',
      inputSchema: z.object({
        tabId: z.string().optional(),
        url: z.string()
      }),
      handler: async (args) => {
        const tabId = resolveTabId(args)
        if (emitEvent) {
          emitEvent('navigate-requested', { tabId, url: args.url })
        }
        return global.agentActionService.navigate(tabId, args.url)
      }
    },
    {
      name: 'click_by_text',
      description: 'Click a visible element by text',
      inputSchema: z.object({
        tabId: z.string().optional(),
        text: z.string()
      }),
      handler: async (args) => {
        const tabId = resolveTabId(args)
        return global.agentActionService.clickByText(tabId, args.text)
      }
    },
    {
      name: 'execute_script',
      description: 'Execute a script in the page',
      inputSchema: z.object({
        tabId: z.string().optional(),
        script: z.string(),
        awaitPromise: z.boolean().optional(),
        returnByValue: z.boolean().optional()
      }),
      handler: async (args) => {
        const tabId = resolveTabId(args)
        return global.agentActionService.executeScript(tabId, {
          script: args.script,
          awaitPromise: args.awaitPromise,
          returnByValue: args.returnByValue
        })
      }
    },
    {
      name: 'wait_for',
      description: 'Wait for selector or text to appear',
      inputSchema: z.object({
        tabId: z.string().optional(),
        selector: z.string().optional(),
        text: z.string().optional(),
        timeout: z.number().optional(),
        interval: z.number().optional()
      }),
      handler: async (args) => {
        const tabId = resolveTabId(args)
        const result = await global.agentActionService.waitFor(tabId, {
          selector: args.selector,
          text: args.text,
          timeout: args.timeout,
          interval: args.interval
        })
        if (emitEvent && result && result.ok) {
          emitEvent('waitFor-resolved', { tabId, matched: result.matched || null })
        }
        return result
      }
    },
    {
      name: 'scroll',
      description: 'Scroll the page or an element',
      inputSchema: z.object({
        tabId: z.string().optional(),
        deltaX: z.number().optional(),
        deltaY: z.number().optional(),
        x: z.number().optional(),
        y: z.number().optional(),
        selector: z.string().optional(),
        block: z.string().optional(),
        inline: z.string().optional()
      }),
      handler: async (args) => {
        const tabId = resolveTabId(args)
        return global.agentActionService.scroll(tabId, {
          deltaX: args.deltaX,
          deltaY: args.deltaY,
          x: args.x,
          y: args.y,
          selector: args.selector,
          block: args.block,
          inline: args.inline
        })
      }
    },
    {
      name: 'screenshot',
      description: 'Capture a screenshot',
      inputSchema: z.object({ tabId: z.string().optional() }),
      handler: async (args) => {
        const tabId = resolveTabId(args)
        return global.agentActionService.screenshot(tabId)
      }
    },
    {
      name: 'browser_new_tab',
      description: 'Open a new tab (optionally with a URL)',
      inputSchema: z.object({
        url: z.string().optional()
      }),
      handler: async (args) => {
        return global.agentActionService.newTab({ url: args && args.url })
      }
    },
    {
      name: 'browser_tabs',
      description: 'List, create, close, or select tabs',
      inputSchema: z.object({
        action: z.enum(['list', 'create', 'close', 'select']).optional(),
        tabId: z.string().optional(),
        url: z.string().optional()
      }).optional(),
      handler: async (args) => {
        const action = (args && args.action) || (args && args.url ? 'create' : (args && args.tabId ? 'select' : 'list'))
        if (action === 'list') {
          return { tabs: global.agentTabManager.listTabs() }
        }
        if (action === 'create') {
          return global.agentBrowserController.newTab({ url: args && args.url })
        }
        if (action === 'close') {
          if (!args || !args.tabId) {
            throw new Error('tabId required for close')
          }
          return global.agentBrowserController.closeTab(args.tabId)
        }
        if (action === 'select') {
          if (!args || !args.tabId) {
            throw new Error('tabId required for select')
          }
          return global.agentBrowserController.selectTab(args.tabId)
        }
        throw new Error('Unknown action')
      }
    },
    {
      name: 'browser_navigate',
      description: 'Navigate a tab to a URL',
      inputSchema: z.object({
        tabId: z.string().optional(),
        url: z.string()
      }),
      handler: async (args) => {
        const tabId = resolveTabId(args)
        if (emitEvent) {
          emitEvent('navigate-requested', { tabId, url: args.url })
        }
        return global.agentActionService.navigate(tabId, args.url)
      }
    },
    {
      name: 'browser_navigate_back',
      description: 'Navigate back in history',
      inputSchema: z.object({ tabId: z.string().optional() }),
      handler: async (args) => {
        const tabId = resolveTabId(args)
        return global.agentActionService.navigateBack(tabId)
      }
    },
    {
      name: 'browser_snapshot',
      description: 'Capture accessibility snapshot with element refs',
      inputSchema: z.object({ tabId: z.string().optional() }),
      handler: async (args) => {
        const tabId = resolveTabId(args)
        return global.agentBrowserController.accessibilitySnapshot(tabId)
      }
    },
    {
      name: 'browser_take_screenshot',
      description: 'Capture a visual screenshot',
      inputSchema: z.object({ tabId: z.string().optional() }),
      handler: async (args) => {
        const tabId = resolveTabId(args)
        return global.agentActionService.screenshot(tabId)
      }
    },
    {
      name: 'browser_console_messages',
      description: 'Get recent console messages',
      inputSchema: z.object({
        tabId: z.string().optional(),
        limit: z.number().optional(),
        since: z.number().optional(),
        clear: z.boolean().optional()
      }).optional(),
      handler: async (args) => {
        const tabId = resolveTabId(args)
        return global.agentActionService.consoleMessages(tabId, args || {})
      }
    },
    {
      name: 'browser_network_requests',
      description: 'Get recent network requests',
      inputSchema: z.object({
        tabId: z.string().optional(),
        limit: z.number().optional(),
        since: z.number().optional(),
        clear: z.boolean().optional()
      }).optional(),
      handler: async (args) => {
        const tabId = resolveTabId(args)
        return global.agentActionService.networkRequests(tabId, args || {})
      }
    },
    {
      name: 'browser_evaluate',
      description: 'Execute JavaScript on the page',
      inputSchema: z.object({
        tabId: z.string().optional(),
        script: z.string(),
        awaitPromise: z.boolean().optional(),
        returnByValue: z.boolean().optional()
      }),
      handler: async (args) => {
        const tabId = resolveTabId(args)
        return global.agentActionService.evaluate(tabId, {
          script: args.script,
          awaitPromise: args.awaitPromise,
          returnByValue: args.returnByValue
        })
      }
    },
    {
      name: 'browser_click',
      description: 'Click an element or coordinates',
      inputSchema: z.object({
        tabId: z.string().optional(),
        selector: z.string().optional(),
        elementId: z.string().optional(),
        backendNodeId: z.union([z.number(), z.string()]).optional(),
        x: z.number().optional(),
        y: z.number().optional(),
        button: z.string().optional(),
        clickCount: z.number().optional(),
        double: z.boolean().optional(),
        modifiers: z.array(z.string()).optional()
      }),
      handler: async (args) => {
        const tabId = resolveTabId(args)
        return global.agentActionService.click(tabId, args || {})
      }
    },
    {
      name: 'browser_type',
      description: 'Type text into the page',
      inputSchema: z.object({
        tabId: z.string().optional(),
        selector: z.string().optional(),
        elementId: z.string().optional(),
        text: z.string(),
        clear: z.boolean().optional()
      }),
      handler: async (args) => {
        const tabId = resolveTabId(args)
        return global.agentActionService.type(tabId, args || {})
      }
    },
    {
      name: 'browser_press_key',
      description: 'Press a keyboard key',
      inputSchema: z.object({
        tabId: z.string().optional(),
        key: z.string(),
        code: z.string().optional(),
        modifiers: z.array(z.string()).optional()
      }),
      handler: async (args) => {
        const tabId = resolveTabId(args)
        return global.agentActionService.pressKey(tabId, args || {})
      }
    },
    {
      name: 'browser_hover',
      description: 'Hover over an element',
      inputSchema: z.object({
        tabId: z.string().optional(),
        selector: z.string().optional(),
        elementId: z.string().optional(),
        backendNodeId: z.union([z.number(), z.string()]).optional(),
        x: z.number().optional(),
        y: z.number().optional(),
        modifiers: z.array(z.string()).optional()
      }),
      handler: async (args) => {
        const tabId = resolveTabId(args)
        return global.agentActionService.hover(tabId, args || {})
      }
    },
    {
      name: 'browser_drag',
      description: 'Drag from a source to a target',
      inputSchema: z.object({
        tabId: z.string().optional(),
        from: z.object({
          selector: z.string().optional(),
          elementId: z.string().optional(),
          backendNodeId: z.union([z.number(), z.string()]).optional(),
          x: z.number().optional(),
          y: z.number().optional()
        }).optional(),
        to: z.object({
          selector: z.string().optional(),
          elementId: z.string().optional(),
          backendNodeId: z.union([z.number(), z.string()]).optional(),
          x: z.number().optional(),
          y: z.number().optional()
        }).optional(),
        fromSelector: z.string().optional(),
        toSelector: z.string().optional(),
        fromX: z.number().optional(),
        fromY: z.number().optional(),
        toX: z.number().optional(),
        toY: z.number().optional(),
        button: z.string().optional(),
        modifiers: z.array(z.string()).optional()
      }),
      handler: async (args) => {
        const tabId = resolveTabId(args)
        return global.agentActionService.drag(tabId, args || {})
      }
    },
    {
      name: 'browser_fill_form',
      description: 'Fill multiple form fields',
      inputSchema: z.object({
        tabId: z.string().optional(),
        fields: z.array(z.object({
          selector: z.string().optional(),
          name: z.string().optional(),
          value: z.any().optional()
        }))
      }),
      handler: async (args) => {
        const tabId = resolveTabId(args)
        return global.agentActionService.fillForm(tabId, args || {})
      }
    },
    {
      name: 'browser_select_option',
      description: 'Select an option in a dropdown',
      inputSchema: z.object({
        tabId: z.string().optional(),
        selector: z.string().optional(),
        elementId: z.string().optional(),
        value: z.string().optional(),
        label: z.string().optional(),
        index: z.number().optional()
      }),
      handler: async (args) => {
        const tabId = resolveTabId(args)
        return global.agentActionService.selectOption(tabId, args || {})
      }
    },
    {
      name: 'browser_handle_dialog',
      description: 'Accept or dismiss a JavaScript dialog',
      inputSchema: z.object({
        tabId: z.string().optional(),
        accept: z.boolean().optional(),
        promptText: z.string().optional()
      }),
      handler: async (args) => {
        const tabId = resolveTabId(args)
        return global.agentActionService.handleDialog(tabId, args || {})
      }
    },
    {
      name: 'browser_wait_for',
      description: 'Wait for selector or text to appear',
      inputSchema: z.object({
        tabId: z.string().optional(),
        selector: z.string().optional(),
        text: z.string().optional(),
        timeout: z.number().optional(),
        interval: z.number().optional()
      }),
      handler: async (args) => {
        const tabId = resolveTabId(args)
        const result = await global.agentActionService.waitFor(tabId, args || {})
        if (emitEvent && result && result.ok) {
          emitEvent('waitFor-resolved', { tabId, matched: result.matched || null })
        }
        return result
      }
    },
    {
      name: 'browser_resize',
      description: 'Resize the active browser window',
      inputSchema: z.object({
        tabId: z.string().optional(),
        width: z.number().optional(),
        height: z.number().optional()
      }),
      handler: async (args) => {
        const tabId = resolveTabId(args)
        return global.agentActionService.resize(tabId, args || {})
      }
    }
  ]
}

global.agentMcpBuildToolDefinitions = agentMcpBuildToolDefinitions
