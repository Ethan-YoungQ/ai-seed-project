#!/usr/bin/env node
import process from 'node:process'
import path from 'node:path'
import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'

const require = createRequire(import.meta.url)

const EXTRA_SELECTORS = [
  'RunCommand',
  'CreateCommand',
  'InvokeCommand',
  'DeleteCommand',
  'CreateSnapshot',
]

function parseArgs(argv) {
  const result = {}
  for (let index = 2; index < argv.length; index += 1) {
    const current = argv[index]
    if (!current.startsWith('--')) {
      continue
    }
    const key = current.slice(2)
    const next = argv[index + 1]
    if (!next || next.startsWith('--')) {
      result[key] = true
      continue
    }
    result[key] = next
    index += 1
  }
  return result
}

function requirePackage(packageName) {
  const candidates = [
    packageName,
    path.join(process.env.ALIYUN_OPS_NODE_MODULES || '', packageName),
    path.join(process.env.USERPROFILE || '', 'plugins', 'aliyun-ops', 'node_modules', packageName),
  ].filter(Boolean)

  for (const candidate of candidates) {
    try {
      return require(candidate)
    } catch {}
  }

  throw new Error(`Unable to resolve package: ${packageName}`)
}

function buildExplorerHeaders(identity) {
  return {
    'x-acs-account-id': identity.accountId,
    'x-acs-caller-uid': identity.userId,
  }
}

function collectSelectors(currentApis) {
  const merged = new Set(EXTRA_SELECTORS)

  for (const api of currentApis || []) {
    if (api.product !== 'SWAS-OPEN' || api.apiVersion !== '2020-06-01') {
      continue
    }
    for (const selector of api.selectors || []) {
      merged.add(selector)
    }
  }

  return [...merged].sort()
}

async function main() {
  const args = parseArgs(process.argv)
  const accessKeyId = process.env.ALIBABA_CLOUD_ACCESS_KEY_ID
  const accessKeySecret = process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET
  const serverId = args['server-id']
  const regionId = args.region || 'cn-hangzhou'
  const endpoint = args.endpoint || 'openapi-mcp.cn-hangzhou.aliyuncs.com'

  if (!accessKeyId || !accessKeySecret) {
    throw new Error('Missing ALIBABA_CLOUD_ACCESS_KEY_ID or ALIBABA_CLOUD_ACCESS_KEY_SECRET')
  }

  if (!serverId) {
    throw new Error('Missing --server-id')
  }

  const OpenApiExplorerClient = requirePackage('@alicloud/openapiexplorer20241130').default
  const OpenApiExplorerModels = requirePackage('@alicloud/openapiexplorer20241130')
  const StsClient = requirePackage('@alicloud/sts20150401').default

  const explorerClient = new OpenApiExplorerClient({
    accessKeyId,
    accessKeySecret,
    regionId,
    endpoint,
  })

  const stsClient = new StsClient({
    accessKeyId,
    accessKeySecret,
    regionId,
  })

  const identityResponse = await stsClient.getCallerIdentity()
  const identityBody = identityResponse.body || {}
  const headers = buildExplorerHeaders({
    accountId: identityBody.accountId || identityBody.AccountId,
    userId:
      identityBody.userId ||
      identityBody.UserId ||
      identityBody.principalId ||
      identityBody.PrincipalId,
  })

  const detailResponse = await explorerClient.getApiMcpServerWithOptions(
    new OpenApiExplorerModels.GetApiMcpServerRequest({ id: serverId }),
    headers,
    {},
  )
  const current = detailResponse.body || {}
  const selectors = collectSelectors(current.apis)

  const updateRequest = new OpenApiExplorerModels.UpdateApiMcpServerRequest({
    id: serverId,
    clientToken: randomUUID(),
    apis: [
      {
        product: 'SWAS-OPEN',
        apiVersion: '2020-06-01',
        selectors,
      },
    ],
  })

  await explorerClient.updateApiMcpServerWithOptions(updateRequest, headers, {})

  const refreshedResponse = await explorerClient.getApiMcpServerWithOptions(
    new OpenApiExplorerModels.GetApiMcpServerRequest({ id: serverId }),
    headers,
    {},
  )

  const refreshed = refreshedResponse.body || {}
  const refreshedSelectors =
    refreshed.apis?.find((item) => item.product === 'SWAS-OPEN' && item.apiVersion === '2020-06-01')?.selectors || []

  console.log(
    JSON.stringify(
      {
        id: refreshed.id,
        name: refreshed.name,
        selectors: refreshedSelectors,
      },
      null,
      2,
    ),
  )
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error))
  process.exit(1)
})
