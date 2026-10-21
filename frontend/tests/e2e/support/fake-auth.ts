/**
 * Local stand-in for Supabase Auth used only by the e2e suite: publishes a JWKS so the backend
 * verifies tokens exactly as in production (research R2), and signs tokens for test users.
 */
import { createServer } from 'node:http';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';

const PORT = Number(process.env['FAKE_AUTH_PORT'] ?? 54329);
const ISSUER = `http://localhost:${String(PORT)}/auth/v1`;

const { publicKey, privateKey } = await generateKeyPair('ES256');
const jwks = { keys: [{ ...(await exportJWK(publicKey)), kid: 'e2e', alg: 'ES256', use: 'sig' }] };

createServer((req, res) => {
  const url = new URL(req.url ?? '/', ISSUER);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return;
  }
  if (url.pathname === '/auth/v1/.well-known/jwks.json') {
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(jwks));
    return;
  }
  if (url.pathname === '/test/token') {
    const sub = url.searchParams.get('sub') ?? '';
    void new SignJWT({ role: 'authenticated', email: `${sub}@e2e.test` })
      .setProtectedHeader({ alg: 'ES256', kid: 'e2e' })
      .setSubject(sub)
      .setIssuer(ISSUER)
      .setAudience('authenticated')
      .setIssuedAt()
      .setExpirationTime('2h')
      .sign(privateKey)
      .then((token) => {
        res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ token }));
      });
    return;
  }
  if (url.pathname === '/auth/v1/logout') {
    res.writeHead(204).end();
    return;
  }
  if (url.pathname === '/health') {
    res.writeHead(200).end('ok');
    return;
  }
  res.writeHead(404).end();
}).listen(PORT);
