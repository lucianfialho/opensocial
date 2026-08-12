import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'
import { OpenSocialError } from './errors.js'

export const OAUTH_PORT = 8976
export const REDIRECT_URI = `http://localhost:${OAUTH_PORT}/callback`

export function randomState(): string {
  return randomBytes(16).toString('hex')
}

export function waitForCallback(expectedState: string, timeoutMs = 300_000): Promise<string> {
  return new Promise((resolve, reject) => {
    let finished = false
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', REDIRECT_URI)
      if (url.pathname !== '/callback') { res.writeHead(404).end(); return }
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end('<html><body><h2>OpenSocial: authorization received.</h2>You can close this tab.</body></html>', () => {
        finish(() => {
          const err = url.searchParams.get('error')
          if (err) return reject(new OpenSocialError(`Authorization failed: ${err}`))
          if (url.searchParams.get('state') !== expectedState) {
            return reject(new OpenSocialError('OAuth state mismatch — possible CSRF, aborting.'))
          }
          const code = url.searchParams.get('code')
          if (!code) return reject(new OpenSocialError('Callback missing "code" parameter.'))
          resolve(code)
        })
      })
    })
    const timer = setTimeout(
      () => finish(() => reject(new OpenSocialError(`Timed out after ${timeoutMs / 1000}s waiting for authorization.`))),
      timeoutMs,
    )
    function finish(outcome: () => void) {
      if (finished) return
      finished = true
      clearTimeout(timer)
      server.close()
      outcome()
    }
    server.on('error', (err) => {
      finish(() => reject(err))
    })
    server.listen(OAUTH_PORT)
  })
}
