const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { mkdtemp, rm } = require('node:fs/promises');
const { once } = require('node:events');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');

// Real HTTP sessions and a disposable database; never use the application's data/ directory.
test('renter API', { timeout: 60000 }, async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'parkly-renter-'));
  let server;
  t.after(async () => {
    if (server && server.exitCode === null && server.signalCode === null) {
      const exited = once(server, 'exit');
      server.kill();
      await exited;
    }
    await rm(dir, { recursive: true, force: true });
  });
  const socket = net.createServer();
  await new Promise((resolve, reject) => {
    socket.once('error', reject);
    socket.listen(0, '127.0.0.1', resolve);
  });
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  server = spawn(process.execPath, ['server/index.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, NODE_ENV: 'test', PORT: String(port), DATA_DIR: dir, SESSION_SECRET: 'renter-test-session-secret' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    let output = '', errors = '';
    const timer = setTimeout(() => reject(Error(`Startup timeout: ${errors}`)), 10000);
    server.stderr.on('data', chunk => { errors += chunk; });
    server.stdout.on('data', chunk => {
      output += chunk;
      if (output.includes('Open http://localhost:')) { clearTimeout(timer); resolve(); }
    });
    server.once('error', error => { clearTimeout(timer); reject(error); });
    server.once('exit', code => { clearTimeout(timer); reject(Error(`Server exited (${code}): ${errors}`)); });
  });
  const base = `http://127.0.0.1:${port}`;
  function client() {
    let cookie = '';
    return async (route, method = 'GET', body, expected = 200) => {
      const response = await fetch(base + route, {
        method, headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      });
      if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
      const result = response.status === 204 ? null : await response.json();
      assert.equal(response.status, expected, `${method} ${route}: ${JSON.stringify(result)}`);
      if (expected >= 400) assert.equal(typeof result.message, 'string');
      return result;
    };
  }
  let sequence = 0;
  async function account(role = 'renter') {
    const api = client(), email = `renter-test-${++sequence}@example.com`;
    const { user } = await api('/api/auth/register', 'POST', { name: 'Test user', email, password: 'test-password-123', role }, 201);
    return { api, user, email };
  }
  async function parking() {
    const { api: owner } = await account('landlord');
    const values = { name: `Renter test lot ${sequence}`, address: `Test address ${sequence}`, latitude: 13.7, longitude: 100.5, hourlyRate: 45, landmarks: 'BTS, Park', isPublished: false };
    const { id } = await owner('/api/landlord/locations', 'POST', values, 201);
    await owner(`/api/landlord/locations/${id}/spots`, 'POST', { label: 'CAR-1', type: 'car' }, 201);
    await owner(`/api/landlord/locations/${id}/spots`, 'POST', { label: 'EV-1', type: 'ev' }, 201);
    await owner(`/api/landlord/locations/${id}`, 'PATCH', { ...values, isPublished: true });
    return { id, owner, values };
  }
  const start = Date.UTC(2035, 0, 10, 3);
  const period = (offset = 0, hours = 1) => ({ startAt: new Date(start + offset * 3600000).toISOString(), endAt: new Date(start + (offset + hours) * 3600000).toISOString() });
  async function bookingFixture() {
    const { api } = await account(), lot = await parking();
    const vehicle = await api('/api/vehicles', 'POST', { plateNumber: 'TEST123', type: 'car' }, 201);
    return { api, lot, values: { locationId: lot.id, vehicleId: vehicle.id, vehicleType: 'car', ...period() } };
  }

  await t.test('serves renter pages and protects every renter endpoint without a session', async () => {
    for (const route of ['/', '/login.html', '/register.html', '/app.js', '/auth.js', '/styles.css']) {
      const response = await fetch(base + route);
      assert.equal(response.status, 200, route);
      assert.ok((await response.text()).length > 0);
    }
    const anon = client();
    assert.deepEqual(await anon('/api/auth/me'), { user: null });
    for (const [route, method] of [['/api/parking-locations','GET'], ['/api/vehicles','GET'], ['/api/vehicles','POST'], ['/api/quotes','POST'], ['/api/bookings','POST'], ['/api/bookings/1','GET'], ['/api/bookings/1/extend','PATCH']]) {
      await anon(route, method, method === 'GET' ? undefined : {}, 401);
    }
  });

  await t.test('registration validation, normalized email, duplicate rejection, login and logout', async () => {
    const api = client();
    const valid = { name: '  ผู้เช่าทดสอบ  ', email: '  RENTER-AUTH@EXAMPLE.COM  ', password: 'test-password-123' };
    for (const body of [{}, { ...valid, name: ' ' }, { ...valid, email: 'invalid' }, { ...valid, password: 'short' }]) await api('/api/auth/register', 'POST', body, 400);
    const { user } = await api('/api/auth/register', 'POST', valid, 201);
    assert.equal(user.name, 'ผู้เช่าทดสอบ');
    assert.equal(user.email, 'renter-auth@example.com');
    assert.equal(user.role, 'renter');
    assert.ok(!('password_hash' in user) && !('password' in user));
    assert.deepEqual((await api('/api/auth/me')).user, user);
    await client()('/api/auth/register', 'POST', { ...valid, email: 'renter-auth@example.com' }, 409);
    await api('/api/auth/logout', 'POST', undefined, 204);
    assert.deepEqual(await api('/api/auth/me'), { user: null });
    await api('/api/vehicles', 'GET', undefined, 401);
    await api('/api/auth/login', 'POST', { email: user.email, password: 'wrong-password' }, 401);
    await api('/api/auth/login', 'POST', { email: 'missing@example.com', password: valid.password }, 401);
    await api('/api/auth/login', 'POST', { email: user.email, password: valid.password, role: 'landlord' }, 403);
    assert.equal((await api('/api/auth/me')).user, null);
    assert.deepEqual((await api('/api/auth/login', 'POST', { email: valid.email, password: valid.password, role: 'renter' })).user, user);
    await api('/api/admin/data', 'GET', undefined, 403);
    await api('/api/landlord/locations', 'GET', undefined, 403);
  });

  await t.test('vehicles validate input, normalize plates, isolate owners and keep one favorite', async () => {
    const { api } = await account(), { api: other } = await account();
    assert.deepEqual(await api('/api/vehicles'), []);
    for (const body of [{}, { plateNumber: ' ', type: 'car' }, { plateNumber: 'A'.repeat(21), type: 'car' }, { plateNumber: 'ABC', type: 'truck' }]) await api('/api/vehicles', 'POST', body, 400);
    const first = await api('/api/vehicles', 'POST', { plateNumber: ' abc123 ', type: 'car', description: ' white ', isFavorite: true }, 201);
    assert.equal(first.plateNumber, 'ABC123'); assert.equal(first.description, 'white'); assert.equal(first.typeLabel, 'รถยนต์');
    const second = await api('/api/vehicles', 'POST', { plateNumber: 'EV123', type: 'ev', isFavorite: true }, 201);
    await api('/api/vehicles', 'POST', { plateNumber: 'M123', type: 'motorcycle' }, 201);
    const rows = await api('/api/vehicles');
    assert.equal(rows.length, 3); assert.equal(rows[0].id, second.id);
    assert.deepEqual(rows.filter(v => v.isFavorite).map(v => v.id), [second.id]);
    assert.equal(rows.find(v => v.id === first.id).isFavorite, false);
    assert.deepEqual(await other('/api/vehicles'), []);
  });

  await t.test('searches published lots by name/address and hides unpublished lots', async () => {
    const { api } = await account(), lot = await parking();
    for (const query of [lot.values.name, lot.values.address]) {
      const rows = await api('/api/parking-locations?query=' + encodeURIComponent(query));
      assert.equal(rows.length, 1); assert.equal(rows[0].id, lot.id);
      assert.equal(rows[0].hourlyRate, 45); assert.equal(rows[0].availableSpaces, 2);
      assert.deepEqual(rows[0].landmarks, ['BTS', 'Park']);
    }
    assert.deepEqual(await api('/api/parking-locations?query=definitely-no-such-parking'), []);
    await lot.owner(`/api/landlord/locations/${lot.id}`, 'PATCH', lot.values);
    assert.ok(!(await api('/api/parking-locations')).some(l => l.id === lot.id));
    await api('/api/quotes', 'POST', { locationId: lot.id, vehicleType: 'car', ...period() }, 400);
  });

  await t.test('quotes round up hours, accept 24 hours and reject invalid ranges and unavailable types', async () => {
    const { api } = await account(), lot = await parking();
    const values = { locationId: lot.id, vehicleType: 'car', ...period(0, 1.25) };
    const quote = await api('/api/quotes', 'POST', values);
    assert.equal(quote.durationHours, 2); assert.equal(quote.total, 90); assert.equal(quote.availableSpaces, 1);
    assert.equal(quote.startAt, values.startAt); assert.equal(quote.endAt, values.endAt);
    assert.equal((await api('/api/quotes', 'POST', { ...values, ...period(0, 24) })).total, 1080);
    for (const patch of [{ startAt: 'invalid' }, { endAt: values.startAt }, period(0, -1), period(0, 25), { vehicleType: 'truck' }, { vehicleType: 'motorcycle' }, { locationId: 999999 }]) await api('/api/quotes', 'POST', { ...values, ...patch }, 400);
  });

  await t.test('books with server pricing, enforces ownership/type/capacity and allows adjacent bookings', async () => {
    const { api, lot, values } = await bookingFixture(), { api: other } = await account();
    await other('/api/bookings', 'POST', values, 400);
    await api('/api/bookings', 'POST', { ...values, vehicleType: 'ev' }, 400);
    await api('/api/bookings', 'POST', { ...values, vehicleId: 999999 }, 400);
    const booking = await api('/api/bookings', 'POST', { ...values, total: 1, status: 'completed', passCode: 'FORGED' }, 201);
    assert.equal(booking.total, 45); assert.equal(booking.status, 'confirmed');
    assert.equal(booking.location.id, lot.id); assert.equal(booking.spotLabel, 'CAR-1');
    assert.match(booking.passCode, /^[0-9A-F]{8}$/);
    assert.deepEqual(await api(`/api/bookings/${booking.id}`), booking);
    await other(`/api/bookings/${booking.id}`, 'GET', undefined, 404);
    await other(`/api/bookings/${booking.id}/extend`, 'PATCH', { hours: 1 }, 400);
    await api('/api/bookings/999999', 'GET', undefined, 404);
    await api('/api/bookings', 'POST', values, 400);
    await api('/api/quotes', 'POST', values, 400);
    const ev = await api('/api/vehicles', 'POST', { plateNumber: 'EVCAR', type: 'ev' }, 201);
    assert.equal((await api('/api/bookings', 'POST', { ...values, vehicleId: ev.id, vehicleType: 'ev' }, 201)).spotLabel, 'EV-1');
    const adjacent = await api('/api/bookings', 'POST', { ...values, ...period(1) }, 201);
    assert.equal(adjacent.spotLabel, booking.spotLabel);
    assert.notEqual(adjacent.passCode, booking.passCode);
    await api(`/api/bookings/${booking.id}/extend`, 'PATCH', { hours: 1 }, 400);
    assert.deepEqual(await api(`/api/bookings/${booking.id}`), booking);
  });

  await t.test('extends owned bookings with correct time/price and rejects invalid hours or completed bookings', async () => {
    const { api, lot, values } = await bookingFixture();
    const booking = await api('/api/bookings', 'POST', values, 201);
    for (const hours of [0, -1, 1.5, 9, 'invalid', null]) await api(`/api/bookings/${booking.id}/extend`, 'PATCH', { hours }, 400);
    await api('/api/bookings/999999/extend', 'PATCH', { hours: 1 }, 400);
    assert.deepEqual(await api(`/api/bookings/${booking.id}`), booking);
    const extended = await api(`/api/bookings/${booking.id}/extend`, 'PATCH', { hours: 2 });
    assert.equal(extended.endAt, period(0, 3).endAt); assert.equal(extended.total, 135);
    assert.equal(extended.passCode, booking.passCode); assert.equal(extended.startAt, booking.startAt);
    assert.deepEqual(await api(`/api/bookings/${booking.id}`), extended);
    const now = Date.now();
    const current = await api('/api/bookings', 'POST', { ...values, startAt: new Date(now - 60000).toISOString(), endAt: new Date(now + 3600000).toISOString() }, 201);
    await lot.owner(`/api/landlord/bookings/${current.id}/status`, 'PATCH', { status: 'active' });
    await lot.owner(`/api/landlord/bookings/${current.id}/status`, 'PATCH', { status: 'completed' });
    await api(`/api/bookings/${current.id}/extend`, 'PATCH', { hours: 1 }, 400);
    assert.equal((await api(`/api/bookings/${current.id}`)).status, 'completed');
  });
});
