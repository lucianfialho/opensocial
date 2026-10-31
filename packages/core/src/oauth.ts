import { createServer } from 'node:http'
import { createServer as createTlsServer } from 'node:https'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes, createHash } from 'node:crypto'
import { configDir } from './config.js'
import { OpenSocialError } from './errors.js'

export const OAUTH_PORT = 8976
export const REDIRECT_URI = `http://localhost:${OAUTH_PORT}/callback`
// Meta only accepts https redirect URIs; the local server uses a self-signed cert.
export const SECURE_REDIRECT_URI = `https://localhost:${OAUTH_PORT}/callback`

export interface TlsMaterial { key: string; cert: string }

/** Self-signed localhost cert, generated once via openssl into configDir()/tls. */
export function ensureLocalTlsCert(): TlsMaterial {
  const dir = join(configDir(), 'tls')
  const keyPath = join(dir, 'key.pem')
  const certPath = join(dir, 'cert.pem')
  if (!existsSync(keyPath) || !existsSync(certPath)) {
    mkdirSync(dir, { recursive: true })
    execFileSync('openssl', [
      'req', '-x509', '-newkey', 'rsa:2048', '-keyout', keyPath, '-out', certPath,
      '-days', '3650', '-nodes', '-subj', '/CN=localhost',
    ], { stdio: 'ignore' })
  }
  return { key: readFileSync(keyPath, 'utf8'), cert: readFileSync(certPath, 'utf8') }
}

export function randomState(): string {
  return randomBytes(16).toString('hex')
}

export function waitForCallback(
  expectedState: string,
  timeoutMs = 300_000,
  tls?: TlsMaterial,
): Promise<string> {
  const promise = new Promise<string>((resolve, reject) => {
    let settled = false
    let errorCode: string | null = null
    let successCode: string | null = null

    const handler = (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => {
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
    }

    const server = tls ? createTlsServer(tls, handler) : createServer(handler)

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
        clearTimeout(timer)
        server.close()
        reject(err)
      }
    })

    server.listen(OAUTH_PORT, '127.0.0.1')
  })

  // Attach a no-op catch handler to prevent unhandled rejection warnings
  // This doesn't suppress the rejection - it just tells Node.js we're handling it
  promise.catch(() => {})

  return promise
}

/** PKCE (RFC 7636): verifier = 32 random bytes as base64url (43 chars),
 *  challenge = base64url(sha256(verifier)). X requires it; the other
 *  platforms ignore it. */
export function pkceChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url')
}

export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url')
  return { verifier, challenge: pkceChallenge(verifier) }
}
