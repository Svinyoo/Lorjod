const $ = (selector) => document.querySelector(selector);
const state = { locations: [], bookings: [], loading: false };
const money = (value) => new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', maximumFractionDigits: 0 }).format(value);
const date = (value) => new Date(value).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
const types = { car: 'รถยนต์', ev: 'EV', motorcycle: 'จักรยานยนต์' };
const statuses = { confirmed: 'ยืนยันแล้ว', active: 'เข้าจอดแล้ว', completed: 'ออกแล้ว' };
const titles = { overview: ['ภาพรวมลานจอด', 'จัดการพื้นที่และดูแลทุกการจองในที่เดียว'], locations: ['ลานและช่องจอด', 'ตั้งค่าพื้นที่ ราคา และเปิดรับจองจากผู้เช่า'], bookings: ['รายการจอง', 'ดูข้อมูลผู้เช่าและบันทึกการเข้า–ออก'], revenue: ['ยอดการจอง', 'ติดตามมูลค่าการจองของพื้นที่คุณ'] };
function esc(value) { const node = document.createElement('span'); node.textContent = value ?? ''; return node.innerHTML; }
function message(text = '', error = false) { $('#status').textContent = text; $('#status').classList.toggle('error', error); }
async function request(url, options = {}) {
  const response = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...options });
  if (response.status === 401) { location.replace('/landlord/login.html'); throw Error('กรุณาเข้าสู่ระบบใหม่'); }
  if (response.status === 403) { location.replace('/'); throw Error('บัญชีนี้ไม่มีสิทธิ์ผู้ให้เช่า'); }
  const data = response.status === 204 ? null : await response.json();
  if (!response.ok) throw Error(data?.message || 'ไม่สามารถเชื่อมต่อระบบได้');
  return data;
}
function page(name) {
  document.querySelectorAll('[data-panel]').forEach(node => { node.hidden = node.dataset.panel !== name; });
  document.querySelectorAll('[data-page]').forEach(node => {
    node.classList.toggle('active', node.dataset.page === name);
    if (node.dataset.page === name) node.setAttribute('aria-current', 'page'); else node.removeAttribute('aria-current');
  });
  $('#page-title').textContent = titles[name][0]; $('#page-description').textContent = titles[name][1];
}
document.querySelectorAll('[data-page],[data-go]').forEach(button => button.onclick = () => page(button.dataset.page || button.dataset.go));
function empty(text) { return `<div class="empty">${text}</div>`; }
function bookingCard(b) {
  const action = b.status === 'confirmed' ? 'active' : b.status === 'active' ? 'completed' : null;
  return `<article class="booking-card"><header><div><h3>${esc(b.location_name)} · ${esc(b.spot_label)}</h3><small>การจอง #${b.id}</small></div><span class="badge ${esc(b.status)}">${esc(statuses[b.status] || b.status)}</span></header><div class="booking-detail"><div><small>ผู้เช่า / ทะเบียนรถ</small><b>${esc(b.renter_name)} · ${esc(b.plate_number)}</b></div><div><small>เวลาเข้า → ออก</small><b>${date(b.start_at)} → ${date(b.end_at)}</b></div><div><small>มูลค่าการจอง / รหัส Pass</small><b>${money(b.total)} · ${esc(b.pass_code)}</b></div></div>${action ? `<div class="actions"><button data-booking="${b.id}" data-status="${action}">${action === 'active' ? 'บันทึกเข้าจอด' : 'บันทึกออกจากลาน'}</button></div>` : ''}</article>`;
}
function renderBookings() {
  const search = $('#booking-search').value.trim().toLowerCase(), filter = $('#booking-filter').value;
  const rows = state.bookings.filter(b => (!filter || b.status === filter) && `${b.renter_name} ${b.plate_number} ${b.pass_code} ${b.location_name}`.toLowerCase().includes(search));
  $('#booking-list').innerHTML = rows.map(bookingCard).join('') || empty('ยังไม่มีรายการจองที่ตรงกับเงื่อนไข');
  const upcoming = state.bookings.filter(b => ['confirmed','active'].includes(b.status)).sort((a,b) => a.start_at.localeCompare(b.start_at));
  $('#upcoming').innerHTML = upcoming.slice(0, 5).map(bookingCard).join('') || empty('ยังไม่มีการจองที่รอดำเนินการ เมื่อผู้เช่าจองลานของคุณ รายการจะแสดงที่นี่');
}
function render() {
  const values = [ ['ลานที่เปิดรับจอง', state.locations.filter(l => l.is_published).length], ['ช่องจอดทั้งหมด', state.locations.reduce((sum,l) => sum + l.spots.length, 0)], ['รถที่เข้าจอดอยู่', state.bookings.filter(b => b.status === 'active').length], ['มูลค่าการจองทั้งหมด', money(state.bookings.filter(b => ['confirmed','active','completed'].includes(b.status)).reduce((sum,b) => sum + b.total, 0))] ];
  $('#metrics').innerHTML = values.map(([label,value]) => `<div class="metric"><small>${label}</small><strong>${value}</strong></div>`).join('');
  $('#location-list').innerHTML = state.locations.map(l => `<article class="location-card"><header><h3>${esc(l.name)}</h3><span class="badge ${l.is_published ? '' : 'draft'}">${l.is_published ? 'เปิดรับจอง' : 'ปิดรับจอง / ฉบับร่าง'}</span></header><p>${esc(l.address)}<br>${money(l.hourly_rate)} / ชั่วโมง · ${l.spots.length} ช่องจอด</p><button class="secondary" data-edit="${l.id}">แก้ไขลาน / เปิด–ปิดรับจอง</button><div class="spots">${l.spots.map(s => `<span class="spot">${esc(s.spot_label)} · ${types[s.vehicle_type]}</span>`).join('') || '<small>เพิ่มช่องจอดแรกเพื่อเตรียมเปิดรับจอง</small>'}</div><form class="spot-form" data-location="${l.id}"><label>ชื่อช่องจอด<input name="label" placeholder="เช่น A01" maxlength="20" required></label><label>ประเภทรถ<select name="type"><option value="car">รถยนต์</option><option value="ev">EV</option><option value="motorcycle">จักรยานยนต์</option></select></label><button type="submit">+ เพิ่มช่อง</button></form></article>`).join('') || empty('ยังไม่มีลานจอด เริ่มจาก “เพิ่มลานจอด” แล้วเพิ่มช่องจอดเพื่อเปิดรับจอง');
  renderBookings();
  $('#revenue-list').innerHTML = state.locations.map(l => {
    const bookings = state.bookings.filter(b => b.location_id === l.id && ['confirmed','active','completed'].includes(b.status));
    return `<div class="revenue-row"><div><b>${esc(l.name)}</b><small>${bookings.length} รายการจอง</small></div><strong>${money(bookings.reduce((sum,b) => sum + b.total, 0))}</strong></div>`;
  }).join('') || empty('ยังไม่มียอดการจอง');
}
async function refresh() {
  const [locations, bookings] = await Promise.all([request('/api/landlord/locations'), request('/api/landlord/bookings')]);
  state.locations = locations; state.bookings = bookings; render();
}
async function run(button, action) {
  if (state.loading) return;
  state.loading = true; if (button) button.disabled = true;
  message('กำลังดำเนินการ…');
  try { await action(); } catch (error) { message(error.message, true); }
  finally { state.loading = false; if (button) button.disabled = false; }
}
function editLocation(id) {
  const form = $('#location-form'), l = state.locations.find(l => l.id === id);
  form.reset(); form.hidden = false;
  $('#form-title').textContent = l ? 'แก้ไขลานจอด' : 'เพิ่มลานจอดใหม่';
  for (const [name,value] of Object.entries(l ? { id: l.id, name: l.name, address: l.address, latitude: l.latitude, longitude: l.longitude, hourlyRate: l.hourly_rate, landmarks: l.landmarks.join(', ') } : { id: '', hourlyRate: 30 })) form.elements.namedItem(name).value = value;
  form.elements.isPublished.checked = !!l?.is_published;
  form.elements.isPublished.disabled = !l?.spots.length;
  $('#publish-hint').textContent = !l?.spots.length ? 'บันทึกลานและเพิ่มช่องจอดอย่างน้อย 1 ช่องก่อนเปิดรับจอง' : 'การปิดรับจองจะซ่อนลานจากผู้เช่า แต่รายการจองเดิมยังอยู่และจัดการเข้า–ออกได้';
  form.elements.name.focus(); form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
$('#new-location').onclick = () => editLocation();
$('#cancel-location').onclick = () => { $('#location-form').hidden = true; };
$('#location-form').onsubmit = event => {
  event.preventDefault(); const form = event.currentTarget, data = Object.fromEntries(new FormData(form));
  data.isPublished = form.elements.isPublished.checked; const id = data.id; delete data.id;
  run(form.querySelector('[type=submit]'), async () => {
    await request(`/api/landlord/locations${id ? '/' + id : ''}`, { method: id ? 'PATCH' : 'POST', body: JSON.stringify(data) });
    form.hidden = true; await refresh(); message(id ? 'บันทึกลานจอดแล้ว' : 'สร้างลานแล้ว เพิ่มช่องจอด จากนั้นแก้ไขลานเพื่อเปิดรับจอง');
  });
};
$('#location-list').addEventListener('click', event => { const button = event.target.closest('[data-edit]'); if (button) editLocation(Number(button.dataset.edit)); });
$('#location-list').addEventListener('submit', event => {
  if (!event.target.matches('.spot-form')) return;
  event.preventDefault(); const form = event.target;
  run(form.querySelector('button'), async () => {
    await request(`/api/landlord/locations/${form.dataset.location}/spots`, { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(form))) });
    await refresh(); message('เพิ่มช่องจอดแล้ว');
  });
});
document.addEventListener('click', event => {
  const button = event.target.closest('[data-booking]'); if (!button) return;
  run(button, async () => {
    await request(`/api/landlord/bookings/${button.dataset.booking}/status`, { method: 'PATCH', body: JSON.stringify({ status: button.dataset.status }) });
    await refresh(); message('อัปเดตสถานะการจองแล้ว');
  });
});
$('#booking-search').oninput = renderBookings; $('#booking-filter').onchange = renderBookings;
$('#refresh').onclick = () => run($('#refresh'), async () => { await refresh(); message(`อัปเดตล่าสุด ${new Date().toLocaleTimeString('th-TH')}`); });
$('#logout').onclick = () => run($('#logout'), async () => { await request('/api/auth/logout', { method: 'POST' }); location.assign('/landlord/login.html'); });
(async () => {
  try {
    const { user } = await request('/api/auth/me');
    if (!user) return location.replace('/landlord/login.html');
    if (user.role !== 'landlord') return location.replace('/');
    $('#welcome').textContent = user.name;
    await refresh();
  } catch (error) { message(error.message, true); }
})();
