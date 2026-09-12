const form = document.querySelector('#task-form');
const titleInput = document.querySelector('#task-title');
const list = document.querySelector('#task-list');
const status = document.querySelector('#status');

const setStatus = (message = '') => { status.textContent = message; };

async function request(url, options = {}) {
  const response = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...options });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อ');
  }
  return response.status === 204 ? null : response.json();
}

function render(tasks) {
  list.replaceChildren();
  if (!tasks.length) {
    list.innerHTML = '<li class="empty">ยังไม่มีงาน ลองเพิ่มงานแรกของคุณ</li>';
    return;
  }
  tasks.forEach((task) => {
    const item = document.createElement('li');
    item.className = task.done ? 'done' : '';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox'; checkbox.checked = task.done;
    checkbox.setAttribute('aria-label', `ทำ ${task.title} เสร็จแล้ว`);
    checkbox.addEventListener('change', () => updateTask(task.id, { done: checkbox.checked }));
    const label = document.createElement('span'); label.textContent = task.title;
    const remove = document.createElement('button');
    remove.type = 'button'; remove.className = 'delete'; remove.textContent = 'ลบ';
    remove.addEventListener('click', () => deleteTask(task.id));
    item.append(checkbox, label, remove); list.append(item);
  });
}

async function loadTasks() {
  try { setStatus('กำลังโหลด...'); render(await request('/api/tasks')); setStatus(); }
  catch (error) { setStatus(error.message); }
}
async function updateTask(id, changes) {
  try { await request(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(changes) }); await loadTasks(); }
  catch (error) { setStatus(error.message); await loadTasks(); }
}
async function deleteTask(id) {
  try { await request(`/api/tasks/${id}`, { method: 'DELETE' }); await loadTasks(); }
  catch (error) { setStatus(error.message); }
}
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const task = await request('/api/tasks', { method: 'POST', body: JSON.stringify({ title: titleInput.value }) });
    titleInput.value = ''; titleInput.focus(); setStatus(`เพิ่ม “${task.title}” แล้ว`); await loadTasks();
  } catch (error) { setStatus(error.message); }
});
loadTasks();
