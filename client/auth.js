const form = document.querySelector('#auth-form');
const status = document.querySelector('#status');
const mode = document.body.dataset.mode;
async function request(url, options = {}) {
  const response = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...options });
  if (!response.ok) { const error = await response.json().catch(() => ({})); throw new Error(error.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่'); }
  return response.status === 204 ? null : response.json();
}
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  try { status.textContent = 'กำลังดำเนินการ...'; await request(`/api/auth/${mode}`, { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(form))) }); window.location.assign('/'); }
  catch (error) { status.textContent = error.message; }
});
(async () => { const { user } = await request('/api/auth/me'); if (user) window.location.replace('/'); })().catch(() => {});
