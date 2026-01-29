const agentAccessibleRoles = [
  'button',
  'link',
  'textbox',
  'heading',
  'checkbox',
  'radio',
  'tab',
  'menuitem',
  'option',
  'switch',
  'combobox'
]

function agentGetAxValue (valueObj) {
  if (valueObj && typeof valueObj.value !== 'undefined') {
    return valueObj.value
  }
  return ''
}

function agentHasTruthyProperty (node, propName) {
  if (!node || !node.properties) {
    return false
  }
  return node.properties.some(function (prop) {
    if (prop.name !== propName) {
      return false
    }
    if (!prop.value) {
      return false
    }
    if (typeof prop.value.value === 'boolean') {
      return prop.value.value
    }
    return prop.value.value === 'true'
  })
}

function agentIsVisibleAxNode (node) {
  if (!node || node.ignored) {
    return false
  }
  if (agentHasTruthyProperty(node, 'hidden') || agentHasTruthyProperty(node, 'invisible') || agentHasTruthyProperty(node, 'offscreen')) {
    return false
  }
  return true
}

async function agentGetBoundsForBackendNode (webContents, backendNodeId) {
  try {
    const quads = await global.agentCdpClient.send(webContents, 'DOM.getContentQuads', { backendNodeId })
    if (!quads || !quads.quads || !quads.quads.length) {
      return null
    }
    const quad = quads.quads[0]
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (let i = 0; i < quad.length; i += 2) {
      const x = quad[i]
      const y = quad[i + 1]
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    }
  } catch (e) {
    return null
  }
}

const agentAccessibilityService = {
  async getTree (webContents) {
    await global.agentCdpClient.ensureDomains(webContents, ['Accessibility', 'DOM'])
    const axTree = await global.agentCdpClient.send(webContents, 'Accessibility.getFullAXTree')
    const nodes = axTree.nodes || []

    const results = []
    let boundsCount = 0
    const maxBounds = 500

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i]
      if (!node || node.ignored) {
        continue
      }
      const role = agentGetAxValue(node.role)
      if (!role) {
        continue
      }
      const name = agentGetAxValue(node.name)
      const visible = agentIsVisibleAxNode(node)
      let bounds = null
      if (node.backendDOMNodeId && boundsCount < maxBounds) {
        bounds = await agentGetBoundsForBackendNode(webContents, node.backendDOMNodeId)
        boundsCount++
      }
      results.push({
        role,
        name: name || '',
        bounds,
        visible
      })
    }

    return results
  },
  async findClickableByText (webContents, text) {
    await global.agentCdpClient.ensureDomains(webContents, ['Accessibility', 'DOM'])
    const axTree = await global.agentCdpClient.send(webContents, 'Accessibility.getFullAXTree')
    const nodes = axTree.nodes || []
    const target = (text || '').toLowerCase().trim()
    if (!target) {
      return null
    }

    let best = null
    let bestScore = 0

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i]
      if (!node || node.ignored || !node.role) {
        continue
      }
      const role = agentGetAxValue(node.role)
      if (!agentAccessibleRoles.includes(role)) {
        continue
      }
      const name = agentGetAxValue(node.name)
      if (!name) {
        continue
      }
      const lower = name.toLowerCase()
      let score = 0
      if (lower === target) {
        score = 3
      } else if (lower.startsWith(target)) {
        score = 2
      } else if (lower.includes(target)) {
        score = 1
      }
      if (score > 0 && score >= bestScore) {
        bestScore = score
        best = {
          role,
          name,
          backendDOMNodeId: node.backendDOMNodeId || null
        }
        if (score === 3) {
          break
        }
      }
    }

    if (!best || !best.backendDOMNodeId) {
      return null
    }

    const bounds = await agentGetBoundsForBackendNode(webContents, best.backendDOMNodeId)
    if (!bounds) {
      return null
    }

    return {
      role: best.role,
      name: best.name,
      bounds
    }
  }
}

global.agentAccessibilityService = agentAccessibilityService
