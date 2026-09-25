const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { mkdtemp, rm } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');

test('production mobile sessions require HTTPS and an explicitly trusted local proxy', async (t) => {
  for (const trust of ['0', '1']) {
    await t.test(`TRUST_LOCAL_PROXY=${trust}`, async (t) => {
      const dir = await mkdtemp(path.join(os.tmpdir(), 'parkly-proxy-test-'));
      const socket = net.createServer();
      await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
      const port = socket.address().port;
      await new Promise(resolve => socket.close(resolve));
      const server = spawn(process.execPath, ['server/index.js'], {
        env: { ...process.env, NODE_ENV: 'production', SESSION_SECRET: 'test-only-secret-never-use-in-production', HOST: '127.0.0.1', PORT: String(port), DATA_DIR: dir, TRUST_LOCAL_PROXY: trust },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      t.after(async () => {
        if (server.exitCode === null && server.signalCode === null) {
          const exited = new Promise(resolve => server.once('exit', resolve));
          server.kill();
          await exited;
        }
        await rm(dir, { recursive: true, force: true });
      });
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(Error('server startup timeout')), 10000);
        server.stdout.once('data', () => { clearTimeout(timeout); resolve(); });
        server.once('exit', code => { clearTimeout(timeout); reject(Error(`server exited ${code}`)); });
      });
      const base = `http://127.0.0.1:${port}`;
      const response = await fetch(base + '/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Forwarded-Proto': 'https' },
        body: JSON.stringify({ name: 'Mobile test', email: 'mobile@example.com', password: 'temporary-test-password', role: 'renter' }),
      });
      assert.equal(response.status, 201);
      const cookie = response.headers.get('set-cookie');
      if (trust === '0') {
        assert.equal(cookie, null, 'untrusted forwarded HTTPS cannot set a secure session cookie');
      } else {
        assert.match(cookie, /; Secure/);
        assert.match(cookie, /; HttpOnly/);
        assert.match(cookie, /; SameSite=Lax/);
        const me = await fetch(base + '/api/auth/me', { headers: { Cookie: cookie.split(';')[0], 'X-Forwarded-Proto': 'https' } });
        assert.equal((await me.json()).user.role, 'renter');
        const wrongRole = await fetch(base + '/api/admin/data', { headers: { Cookie: cookie.split(';')[0], 'X-Forwarded-Proto': 'https' } });
        assert.equal(wrongRole.status, 403);
        const plainHTTP = await fetch(base + '/api/auth/login', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'mobile@example.com', password: 'temporary-test-password', role: 'renter' }),
        });
        assert.equal(plainHTTP.status, 200);
        assert.equal(plainHTTP.headers.get('set-cookie'), null, 'plain HTTP still cannot set secure cookies');
      }
    });
  }
});
