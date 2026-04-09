#!/usr/bin/env node
import { spawn } from 'node:child_process'

const proxyPath = process.env.MCP_REMOTE_PROXY_PATH
const serverUrl = process.env.MCP_REMOTE_URL
const callbackPort = process.env.MCP_REMOTE_PORT || '57685'
const transport = process.env.MCP_REMOTE_TRANSPORT || 'sse-only'
const configDir = process.env.MCP_REMOTE_CONFIG_DIR
const timeoutMs = Number(process.env.MCP_PROBE_TIMEOUT_MS || 60000)

if (!proxyPath || !serverUrl || !configDir) {
  console.error('Required env vars: MCP_REMOTE_PROXY_PATH, MCP_REMOTE_URL, MCP_REMOTE_CONFIG_DIR')
  process.exit(2)
}

const args = [proxyPath, serverUrl, callbackPort, '--transport', transport]
const child = spawn(process.execPath, args, {
  env: { ...process.env, MCP_REMOTE_CONFIG_DIR: configDir },
  stdio: ['pipe', 'pipe', 'pipe'],
})

let nextId = 1
const pending = new Map()
let stderr = ''
let stdoutBuffer = ''

function send(method, params) {
  const id = nextId++
  const message = { jsonrpc: '2.0', id, method, params }
  child.stdin.write(`${JSON.stringify(message)}\n`)
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
  })
}

function notify(method, params = {}) {
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`)
}

child.stdout.on('data', (chunk) => {
  stdoutBuffer += chunk.toString('utf8')
  for (;;) {
    const index = stdoutBuffer.indexOf('\n')
    if (index === -1) break
    const line = stdoutBuffer.slice(0, index).trim()
    stdoutBuffer = stdoutBuffer.slice(index + 1)
    if (!line) continue
    let message
    try {
      message = JSON.parse(line)
    } catch {
      continue
    }
    if (typeof message.id !== 'undefined' && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id)
      pending.delete(message.id)
      if (message.error) reject(new Error(JSON.stringify(message.error)))
      else resolve(message.result)
    }
  }
})

child.stderr.on('data', (chunk) => {
  stderr += chunk.toString('utf8')
})

const timer = setTimeout(() => {
  child.kill()
  console.error(`Timed out after ${timeoutMs}ms`)
  process.exit(124)
}, timeoutMs)

try {
  await send('initialize', {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: { name: 'ai-seed-local-mcp-probe', version: '0.1.0' },
  })
  notify('notifications/initialized')

  const callIndex = process.argv.indexOf('--call')
  if (callIndex !== -1) {
    const name = process.argv[callIndex + 1]
    const argsIndex = process.argv.indexOf('--args')
    const argsBase64Index = process.argv.indexOf('--args-b64')
    let toolArgs = {}
    if (argsBase64Index !== -1) {
      toolArgs = JSON.parse(Buffer.from(process.argv[argsBase64Index + 1], 'base64').toString('utf8'))
    } else if (argsIndex !== -1) {
      toolArgs = JSON.parse(process.argv[argsIndex + 1])
    }
    const result = await send('tools/call', { name, arguments: toolArgs })
    console.log(JSON.stringify(result, null, 2))
  } else {
    const result = await send('tools/list', {})
    if (process.argv.includes('--json')) {
      console.log(JSON.stringify(result, null, 2))
    } else {
      for (const tool of result.tools || []) {
        console.log(tool.name)
      }
    }
  }
} catch (error) {
  console.error(error.message)
  if (stderr) {
    const sanitized = stderr
      .split(/\r?\n/)
      .filter((line) => !/access[_-]?token|refresh[_-]?token|secret/i.test(line))
      .slice(-20)
      .join('\n')
    if (sanitized) console.error(sanitized)
  }
  process.exitCode = 1
} finally {
  clearTimeout(timer)
  child.kill()
}
