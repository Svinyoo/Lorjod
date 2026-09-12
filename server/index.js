const express = require('express');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'client')));

let nextId = 3;
let tasks = [
  { id: 1, title: 'ออกแบบหน้าแรก', done: true },
  { id: 2, title: 'เชื่อมต่อ API', done: false }
];

app.get('/api/tasks', (_request, response) => response.json(tasks));

app.post('/api/tasks', (request, response) => {
  const title = request.body?.title?.trim();
  if (!title) return response.status(400).json({ message: 'กรุณาระบุชื่องาน' });
  const task = { id: nextId++, title, done: false };
  tasks.push(task);
  return response.status(201).json(task);
});

app.patch('/api/tasks/:id', (request, response) => {
  const task = tasks.find((item) => item.id === Number(request.params.id));
  if (!task) return response.status(404).json({ message: 'ไม่พบงานนี้' });
  if (typeof request.body.done === 'boolean') task.done = request.body.done;
  if (typeof request.body.title === 'string' && request.body.title.trim()) task.title = request.body.title.trim();
  return response.json(task);
});

app.delete('/api/tasks/:id', (request, response) => {
  const id = Number(request.params.id);
  const originalLength = tasks.length;
  tasks = tasks.filter((task) => task.id !== id);
  if (tasks.length === originalLength) return response.status(404).json({ message: 'ไม่พบงานนี้' });
  return response.status(204).end();
});

app.listen(port, () => console.log(`Open http://localhost:${port}`));
