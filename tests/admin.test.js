const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { mkdtemp, rm } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');

test('admin authorization, corrections, conflicts and audit trail', async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'parkly-test-'));
  const socket = net.createServer();
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const server = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: String(port), DATA_DIR: dir }, stdio: ['ignore','pipe','pipe'] });
  t.after(async () => { if (server.exitCode === null && server.signalCode === null) { const exited = new Promise(resolve => server.once('exit', resolve)); server.kill(); await exited; } await rm(dir, { recursive: true, force: true }); });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('server startup timeout')), 10000);
    server.stdout.once('data', () => { clearTimeout(timer); resolve(); });
    server.once('exit', code => { clearTimeout(timer); reject(Error('server exited: ' + code)); });
  });
  const base = `http://127.0.0.1:${port}`;
  function client() {
    let cookie = '';
    return async (route, method = 'GET', body, expected = 200) => {
      const result = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: body ? JSON.stringify(body) : undefined });
      if (result.headers.get('set-cookie')) cookie = result.headers.get('set-cookie').split(';')[0];
      const data = result.status === 204 ? null : await result.json();
      assert.equal(result.status, expected, `${method} ${route}: ${JSON.stringify(data)}`);
      return data;
    };
  }
  const { open } = require('sqlite');
  const sqlite3 = require('sqlite3');
  const db = await open({filename:path.join(dir,'app.db'),driver:sqlite3.Database});
  t.after(()=>db.close());
  const provision = () => promisify(execFile)(process.execPath, ['server/create-admin.js'], {
    env: { ...process.env, DATA_DIR: dir, ADMIN_EMAIL: 'admin@example.com', ADMIN_PASSWORD: 'admin-test-pass', ADMIN_NAME: 'Admin' },
  });
  await provision();
  await assert.rejects(provision(), error => error.code === 1 && error.stderr.includes('UNIQUE'));
  assert.equal((await db.get("SELECT count(*) count FROM users WHERE role='admin'")).count, 1);
  const admin=client(), renter=client(), owner=client(), anon=client();
  await anon('/api/admin/data','GET',null,401);
  await renter('/api/auth/register','POST',{name:'Renter',email:'r@example.com',password:'test-pass-123',role:'admin'},201);
  await renter('/api/admin/data','GET',null,403);
  const own=await owner('/api/auth/register','POST',{name:'Owner',email:'o@example.com',password:'test-pass-123',role:'landlord'},201);
  await owner('/api/admin/data','GET',null,403);
  await admin('/api/auth/login','POST',{email:'admin@example.com',password:'admin-test-pass',role:'admin'});
  await admin('/api/vehicles','GET',null,403);
  for(const route of ['/admin/','/admin/login.html','/admin/app.js']) assert.equal((await fetch(base+route)).status,200);
  for (const route of ['/admin/routes.js', '/admin/create-admin.js', '/server/admin.js', '/server/create-admin.js']) assert.equal((await fetch(base + route)).status, 404);
  const vehicle=await renter('/api/vehicles','POST',{plateNumber:'ABC123',type:'car'},201);
  const startAt=new Date(Date.now()-60000).toISOString(), endAt=new Date(Date.now()+3600000).toISOString();
  const booking=await renter('/api/bookings','POST',{locationId:1,vehicleId:vehicle.id,vehicleType:'car',startAt,endAt},201);
  let snapshot=await admin('/api/admin/data');
  assert.ok(snapshot.users.every(u=>!('password_hash' in u)));
  const patch=(entity,row,values,expected=200,reason='แก้ไขตามคำร้องของผู้ใช้งาน')=>admin(`/api/admin/${entity}/${row.id}`,'PATCH',{before:row,values,reason},expected);
  const b=snapshot.bookings.find(b=>b.id===booking.id);
  await patch('bookings',b,{...b,total:-1},400);
  await patch('bookings',b,{...b,total:50},400,'');
  const changed=await patch('bookings',b,{...b,total:50});
  await patch('bookings',b,{...b,total:60},409);
  const second=await renter('/api/bookings','POST',{locationId:1,vehicleId:vehicle.id,vehicleType:'car',startAt,endAt},201);
  snapshot=await admin('/api/admin/data');
  const b2=snapshot.bookings.find(b=>b.id===second.id);
  await patch('bookings',b2,{...b2,spot_id:changed.spot_id},409);
  const v=snapshot.vehicles.find(v=>v.id===vehicle.id);
  await patch('vehicles',v,{...v,description:'test',vehicle_type:'ev'},400);
  await patch('vehicles',v,{...v,description:'แก้ทะเบียน',plate_number:'NEW123'});
  assert.equal((await renter('/api/vehicles'))[0].plateNumber,'NEW123');
  const l=snapshot.locations.find(l=>l.id===1);
  await patch('locations',l,{...l,owner_id:own.user.id,landmarks:'BTS',name:'Corrected parking'});
  const landlordBookings=await owner('/api/landlord/bookings');
  assert.equal(landlordBookings.find(b=>b.id===booking.id).total,50);
  assert.equal(landlordBookings[0].location_name,'Corrected parking');
  await patch('bookings',changed,{...changed,status:'cancelled'});
  assert.equal((await db.get('SELECT count(*) n FROM notifications WHERE booking_id=? AND sent_at IS NULL',changed.id)).n,0);
  const final=await admin('/api/admin/data');
  assert.equal(final.audit.length,4);
  assert.equal((await renter(`/api/bookings/${booking.id}`)).status,'cancelled');
  await owner(`/api/bookings/${booking.id}`,'GET',null,403);
  await anon(`/api/bookings/${booking.id}`,'GET',null,401);
  assert.equal(JSON.parse(final.audit[0].after_json).status,'cancelled');
  assert.equal((await db.get('SELECT total FROM bookings WHERE id=?',second.id)).total,b2.total);
});
