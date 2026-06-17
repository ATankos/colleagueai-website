import { createServer } from 'node:http'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { mkdir, readFile, rm } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import path from 'node:path'

const root = process.cwd()
const distDir = path.join(root, 'dist')
const outDir = path.join(root, '.lighthouseci')
const port = 4173
const host = '127.0.0.1'

const thresholds = {
  performance: 0.90,
  accessibility: 1.00,
  'best-practices': 0.95,
  seo: 0.90,
}

const urls = [`http://${host}:${port}/`]

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
}

function resolveDistFile(requestUrl) {
  const parsed = new URL(requestUrl || '/', `http://${host}:${port}`)
  let pathname = decodeURIComponent(parsed.pathname)

  if (pathname === '/' || pathname === '') {
    pathname = '/index.html'
  } else if (!path.extname(pathname)) {
    const extensionlessHtml = path.join(distDir, `${pathname}.html`)
    if (existsSync(extensionlessHtml)) {
      pathname = `${pathname}.html`
    } else {
      pathname = '/index.html'
    }
  }

  const filePath = path.normalize(path.join(distDir, pathname))
  if (!filePath.startsWith(distDir)) return null
  return filePath
}

function startServer() {
  const server = createServer((req, res) => {
    const filePath = resolveDistFile(req.url)

    if (!filePath || !existsSync(filePath) || !statSync(filePath).isFile()) {
      res.statusCode = 404
      res.end('Not found')
      return
    }

    res.setHeader('Content-Type', mime[path.extname(filePath)] || 'application/octet-stream')
    createReadStream(filePath).pipe(res)
  })

  return new Promise((resolve, reject) => {
    server.on('error', reject)
    server.listen(port, host, () => {
      console.log(`[lighthouse] Serving dist at http://${host}:${port}/`)
      resolve(server)
    })
  })
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
      windowsVerbatimArguments: false,
    })

    child.on('error', reject)
    child.on('close', code => {
      if (code === 0) resolve()
      else reject(new Error(`${command} exited with code ${code}`))
    })
  })
}

function lighthouseBin() {
  return path.join(
    root,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'lighthouse.cmd' : 'lighthouse',
  )
}

function safeName(url) {
  const parsed = new URL(url)
  return parsed.pathname === '/' ? 'root' : parsed.pathname.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')
}

async function runAudit(url) {
  const name = safeName(url)
  const jsonPath = path.join(outDir, `${name}-report.json`)
  const htmlPath = path.join(outDir, `${name}-report.html`)
  const chromeFlags = [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--headless=new',
    '--user-data-dir=./node_modules/.chrome-lighthouse-profile',
  ].join(' ')

  const baseArgs = [
    url,
    '--quiet',
    '--preset=desktop',
    '--throttling-method=provided',
    `--chrome-flags=${chromeFlags}`,
  ]

  await run(lighthouseBin(), [...baseArgs, '--output=json', `--output-path=${jsonPath}`])
  await run(lighthouseBin(), [...baseArgs, '--output=html', `--output-path=${htmlPath}`])

  const report = JSON.parse(await readFile(jsonPath, 'utf8'))
  const failures = []

  for (const [category, minScore] of Object.entries(thresholds)) {
    const actual = report.categories?.[category]?.score
    if (typeof actual !== 'number' || actual < minScore) {
      failures.push({ category, minScore, actual })
    }
  }

  const summary = Object.fromEntries(
    Object.keys(thresholds).map(category => [category, report.categories?.[category]?.score]),
  )

  console.log(`[lighthouse] ${url}`)
  console.log(summary)

  return failures
}

await rm(outDir, { recursive: true, force: true })
await mkdir(outDir, { recursive: true })

let server
try {
  server = await startServer()
  const failures = []

  for (const url of urls) {
    failures.push(...await runAudit(url))
  }

  if (failures.length > 0) {
    console.error('\n[lighthouse] Threshold failures:')
    for (const f of failures) {
      console.error(`  - ${f.category}: expected >= ${f.minScore}, got ${f.actual}`)
    }
    process.exitCode = 1
  } else {
    console.log('\n[lighthouse] All thresholds passed.')
  }
} finally {
  if (server) {
    server.close()
  }
}
