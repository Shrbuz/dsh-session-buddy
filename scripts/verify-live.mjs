/**
 * Live verification against a running dsh web instance — probes the plugin
 * row in the boot graph and the client bundle serving WITHOUT touching the
 * browser. Run AFTER the host restarts with the plugin installed:
 *
 *   node scripts/verify-live.mjs [port]
 *
 * Sends loopback-compatible headers (Host + same-origin markers) so the
 * routes' loopback fence lets it through.
 */
import { request } from 'node:http'

const port = Number(process.argv[2] ?? 3080)
const base = `http://127.0.0.1:${port}`
let failures = 0

function check(name, condition) {
  if (condition) {
    console.log('  ok  ' + name)
  } else {
    failures += 1
    console.log('FAIL  ' + name)
  }
}

function call(method, path) {
  return new Promise((resolve, reject) => {
    const req = request({
      host: '127.0.0.1',
      port,
      path,
      method,
      headers: {
        host: `localhost:${port}`,
        origin: `http://localhost:${port}`,
        'sec-fetch-site': 'same-origin',
      },
    }, (res) => {
      const chunks = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => {
        resolve({ status: res.statusCode, text: Buffer.concat(chunks).toString('utf8') })
      })
    })
    req.on('error', reject)
    req.end()
  })
}

const main = async () => {
  console.log(`verifying against ${base} …`)

  // 1. boot graph includes the plugin row
  try {
    const index = await call('GET', '/')
    check('index served', index.status === 200)
    check('boot graph has dsh-session-buddy', index.text.includes('"dsh-session-buddy"'))
  } catch (error) {
    check('index served (' + error.message + ')', false)
  }

  // 2. client bundle served
  try {
    const bundle = await call('GET', '/plugins/dsh-session-buddy/client.js')
    check('client bundle served', bundle.status === 200 && bundle.text.includes('__ModuleLoader__.load'))
  } catch (error) {
    check('client bundle served (' + error.message + ')', false)
  }

  // 3. version route: current version served, update check fails closed.
  try {
    const version = await call('GET', '/api/session-buddy/toast/version')
    check('version route 200', version.status === 200)
    check('version route has current 0.3.0', version.text.includes('"current":"0.3.0"'))
  } catch (error) {
    check('version route (' + error.message + ')', false)
  }

  // 4. update status route rejects an unknown job (404) without touching profile.
  try {
    const status = await call('GET', '/api/session-buddy/toast/update/status?id=nope')
    check('update status unknown job 404', status.status === 404)
  } catch (error) {
    check('update status (' + error.message + ')', false)
  }

  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`)
  process.exit(failures === 0 ? 0 : 1)
}

main()
