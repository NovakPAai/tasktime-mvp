require('dotenv').config();
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');

const config = require('./config');
const { authMiddleware, COOKIE_NAME } = require('./shared/auth');

const authApi = require('./modules/auth/api');
const usersApi = require('./modules/users/api');
const projectsApi = require('./modules/projects/api');
const issuesApi = require('./modules/issues/api');
const timeApi = require('./modules/time/api');
const adminApi = require('./modules/admin/api');

const app = express();
const { PORT } = config;

app.use(express.json());
app.use(cookieParser());

app.use('/api/auth', authApi);
app.use('/api/users', usersApi);
app.use('/api/projects', projectsApi);
app.use('/api', timeApi);
app.use('/api', issuesApi);
app.use('/api', adminApi);

app.get('/health', (req, res) => res.json({ ok: true }));

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'admin.html'));
});

app.get('/', (req, res) => {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  if (token) {
    try {
      jwt.verify(token, config.JWT_SECRET);
      return res.redirect('/app');
    } catch (_) {
      res.clearCookie(COOKIE_NAME, { path: '/' });
    }
  }
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

app.get('/app', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'app.html'));
});

app.get('/okak.png', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'okak.png'));
});

app.use(express.static(path.join(__dirname, '..', 'frontend')));

app.listen(PORT, () => {
  console.log(`TaskTime API listening on http://localhost:${PORT}`);
});
