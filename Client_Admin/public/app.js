const $ = s => document.querySelector(s);
const names = { bookings:'รายการจอง', users:'ผู้ใช้งาน', locations:'ลานจอด', spots:'ช่องจอด', vehicles:'รถของผู้เช่า', audit:'ประวัติการแก้ไข' };
const statuses = {confirmed:'ยืนยันแล้ว',active:'เข้าจอด',completed:'ออกแล้ว',cancelled:'ยกเลิก'};
const types = {car:'รถยนต์',ev:'EV',motorcycle:'จักรยานยนต์'};
let data = {}, page = 'bookings', editing;
const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function api(url, options = {}) {
  const res = await fetch(url,{...options,headers:{'Content-Type':'application/json'}});
  if (res.status === 401) { location.replace('/admin/login.html'); throw Error('กรุณาเข้าสู่ระบบ'); }
  if (!res.ok) throw Error((await res.json()).message || 'ไม่สามารถดำเนินการได้');
  return res.status === 204 ? null : res.json();
}
const userName = id => data.users.find(u=>u.id===id)?.name || 'ยังไม่ระบุ';
const locationName = id => data.locations.find(l=>l.id===id)?.name || 'ไม่พบลาน';
const spotName = id => data.spots.find(s=>s.id===id)?.spot_label || '-';
const vehicleName = id => data.vehicles.find(v=>v.id===id)?.plate_number || '-';
function describe(row) {
  if(page==='bookings') return {title:`การจอง #${row.id} · ${userName(row.user_id)}`,text:`${locationName(row.location_id)} · ช่อง ${spotName(row.spot_id)} · ${vehicleName(row.vehicle_id)}\n${new Date(row.start_at).toLocaleString('th-TH')} → ${new Date(row.end_at).toLocaleString('th-TH')}\n${row.total.toLocaleString()} บาท · ${statuses[row.status] || row.status} · Pass ${row.pass_code}`};
  if(page==='users') return {title:row.name,text:`${row.email} · ${row.role}`};
  if(page==='locations') return {title:row.name,text:`${row.address}\nเจ้าของ: ${userName(row.owner_id)} · ${row.hourly_rate} บาท/ชม. · ${row.is_published?'เปิดรับจอง':'ปิดรับจอง'}`};
  if(page==='spots') return {title:row.spot_label,text:`${locationName(row.location_id)} · ${types[row.vehicle_type]}`};
  if(page==='vehicles') return {title:row.plate_number,text:`${userName(row.user_id)} · ${types[row.vehicle_type]}\n${row.description || ''}`};
  return {title:`${names[row.entity]} #${row.record_id}`,text:`${row.admin_name || row.admin_id} · ${row.created_at} UTC\nเหตุผล: ${row.reason}`};
}
function render() {
  $('#title').textContent = names[page];
  $('#nav').innerHTML = Object.entries(names).map(([k,v])=>`<button class="nav-item ${k===page?'active':''}" data-page="${k}" ${k===page?'aria-current="page"':''}>${v}</button>`).join('');
  const term = $('#search').value.trim().toLowerCase();
  const rows = (data[page] || []).filter(r => page!=='users' || r.role!=='admin').filter(r=>JSON.stringify({...r,...describe(r)}).toLowerCase().includes(term));
  $('#list').innerHTML = rows.map(r=>{const d=describe(r);return `<article class="booking-card"><header><h3>${esc(d.title)}</h3><span class="badge">#${r.id}</span></header><p class="record-meta">${esc(d.text)}</p>${page==='audit'?`<details><summary>ข้อมูลก่อนและหลังแก้ไข</summary><pre class="audit-diff">${esc(JSON.stringify({ก่อน:JSON.parse(r.before_json),หลัง:JSON.parse(r.after_json)},null,2))}</pre></details>`:`<button class="secondary" data-edit="${r.id}">แก้ไขข้อมูล</button>`}</article>`;}).join('') || '<div class="empty">ไม่พบข้อมูลที่ตรงกับการค้นหา</div>';
  $('#metrics').innerHTML = [['การจองทั้งหมด',data.bookings?.length || 0],['กำลังเข้าจอด',data.bookings?.filter(b=>b.status==='active').length || 0],['ลานจอด',data.locations?.length || 0],['ผู้เช่าและผู้ให้เช่า',data.users?.filter(u=>u.role!=='admin').length || 0]].map(([label,n])=>`<div class="metric"><small>${label}</small><strong>${n}</strong></div>`).join('');
}
async function refresh() { data = await api('/api/admin/data'); render(); }
const fields = {
  users:[['name','ชื่อ'],['email','อีเมล','email']],
  locations:[['name','ชื่อลาน'],['address','ที่อยู่'],['owner_id','เจ้าของลาน','owner'],['latitude','ละติจูด','number'],['longitude','ลองจิจูด','number'],['hourly_rate','บาทต่อชั่วโมง','number'],['landmarks','จุดสังเกต (คั่นด้วย ,)'],['is_published','เปิดรับจอง','published']],
  spots:[['spot_label','ชื่อช่องจอด'],['vehicle_type','ประเภทรถ','type']],
  vehicles:[['plate_number','ทะเบียนรถ'],['vehicle_type','ประเภทรถ','type'],['description','รายละเอียด']],
  bookings:[['spot_id','ลาน / ช่องจอด','spot'],['vehicle_id','รถของผู้เช่า','vehicle'],['start_at','เวลาเริ่ม','datetime-local'],['end_at','เวลาสิ้นสุด','datetime-local'],['total','ยอดจอง (บาท)','number'],['status','สถานะ','status']]
};
function edit(id) {
  const row = data[page].find(r=>r.id===id); editing = {entity:page,before:structuredClone(row)};
  $('#edit-form').reset(); $('#edit-status').textContent=''; $('#edit-title').textContent=`แก้ไข${names[page]} #${id}`;
  $('#fields').innerHTML = fields[page].map(([key,label,type='text'])=>{
    let value = row[key] ?? '', options;
    if(key==='landmarks') value=JSON.parse(value).join(', ');
    if(type==='type') options=Object.entries(types);
    if(type==='status') options=Object.entries(statuses);
    if(type==='published') options=[[0,'ปิดรับจอง'],[1,'เปิดรับจอง']];
    if(type==='owner') options=[['','เลือก Landlord'],...data.users.filter(u=>u.role==='landlord').map(u=>[u.id,`${u.name} · ${u.email}`])];
    if(type==='spot') options=data.spots.map(s=>[s.id,`${locationName(s.location_id)} / ${s.spot_label} (${types[s.vehicle_type]})`]);
    if(type==='vehicle') options=data.vehicles.filter(v=>v.user_id===row.user_id).map(v=>[v.id,`${v.plate_number} (${types[v.vehicle_type]})`]);
    if(type==='datetime-local') {const d=new Date(value);value=new Date(+d-d.getTimezoneOffset()*60000).toISOString().slice(0,23);}
    return `<label>${label}${options?`<select name="${key}" required>${options.map(([v,t])=>`<option value="${esc(v)}" ${String(v)===String(value)?'selected':''}>${esc(t)}</option>`).join('')}</select>`:`<input name="${key}" type="${type}" ${type==='number' || type==='datetime-local'?'step="any"':''} value="${esc(value)}" ${['landmarks','description'].includes(key)?'':'required'}>`}</label>`;
  }).join('');
  $('#editor').showModal();
}
$('#nav').onclick = e=>{const button=e.target.closest('[data-page]');if(button){page=button.dataset.page;$('#search').value='';render();}};
$('#list').onclick=e=>{const button=e.target.closest('[data-edit]');if(button)edit(Number(button.dataset.edit));};
$('#search').oninput=render;
$('#cancel').onclick=()=>$('#editor').close();
$('#refresh').onclick=async()=>{try{await refresh();$('#status').textContent='อัปเดตข้อมูลแล้ว';}catch(e){$('#status').textContent=e.message;}};
$('#logout').onclick=async()=>{try{await api('/api/auth/logout',{method:'POST'});location.assign('/admin/login.html');}catch(e){$('#status').textContent=e.message;}};
$('#edit-form').onsubmit=async e=>{
  e.preventDefault(); const button=e.target.querySelector('[type=submit]');button.disabled=true;
  try {
    const values=Object.fromEntries(new FormData(e.target)),reason=values.reason;delete values.reason;
    for(const [key,,type] of fields[editing.entity]) {if(['number','owner','published','spot','vehicle'].includes(type))values[key]=Number(values[key]);if(type==='datetime-local')values[key]=new Date(values[key]).toISOString();}
    await api(`/api/admin/${editing.entity}/${editing.before.id}`,{method:'PATCH',body:JSON.stringify({values,reason,before:editing.before})});
    $('#editor').close();$('#status').textContent='บันทึกข้อมูลและประวัติการแก้ไขแล้ว';
    try{await refresh();}catch(error){$('#status').textContent='บันทึกสำเร็จ แต่โหลดข้อมูลใหม่ไม่สำเร็จ กรุณากดอัปเดตข้อมูล';}
  } catch(error){$('#edit-status').textContent=error.message;}finally{button.disabled=false;}
};
(async()=>{const {user}=await api('/api/auth/me');if(user?.role!=='admin'){location.replace('/admin/login.html');return;}$('#welcome').textContent=user.name;await refresh();})().catch(e=>$('#status').textContent=e.message);
