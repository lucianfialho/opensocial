import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'
import { OpenSocialError } from './errors.js'

export const OAUTH_PORT = 8976
export const REDIRECT_URI = `http://localhost:${OAUTH_PORT}/callback`

export function randomState(): string {
  return randomBytes(16).toString('hex')
}

export function waitForCallback(expectedState: string, timeoutMs = 300_000): Promise<string> {
  const promise = new Promise<string>((resolve, reject) => {
    let settled = false
    let errorCode: string | null = null
    let successCode: string | null = null

    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', REDIRECT_URI)
      if (url.pathname !== '/callback') { res.writeHead(404).end(); return }

      // Determine outcome synchronously, defer error creation
      if (!settled) {
        settled = true
        clearTimeout(timer)

        const err = url.searchParams.get('error')
        if (err) {
          errorCode = `Authorization failed: ${err}`
        } else if (url.searchParams.get('state') !== expectedState) {
          errorCode = 'OAuth state mismatch — possible CSRF, aborting.'
        } else {
          const code = url.searchParams.get('code')
          if (!code) {
            errorCode = 'Callback missing "code" parameter.'
          } else {
            successCode = code
          }
        }
      }

      // Send response
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end('<html><body><h2>OpenSocial: authorization received.</h2>You can close this tab.</body></html>', () => {
        server.close()
        // Settle promise after response is flushed
        if (errorCode) {
          reject(new OpenSocialError(errorCode))
        } else if (successCode) {
          resolve(successCode)
        }
      })
    })

    const timer = setTimeout(
      () => {
        if (!settled) {
          settled = true
          const err = new OpenSocialError(`Timed out after ${timeoutMs / 1000}s waiting for authorization.`)
          server.close()
          reject(err)
        }
      },
      timeoutMs,
    )

    server.on('error', (err) => {
      if (!settled) {
        settled = true
        reject(err)
      }
    })

    server.listen(OAUTH_PORT)
  })

  // Attach a no-op catch handler to prevent unhandled rejection warnings
  // This doesn't suppress the rejection - it just tells Node.js we're handling it
  promise.catch(() => {})

  return promise
}
