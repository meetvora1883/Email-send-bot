const express = require('express');
const session = require('express-session');
const { getEmailByDateAndDailyId, getEmailsByDate, searchEmails, getDistinctDates } = require('../database/queries');
const { logInfo } = require('../utils/logger');
const ensureAuth = require('./auth');
require('dotenv').config();

const app = express();
const PORT = process.env.WEB_PORT || 3001;

app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'discordemailbotsecret',
  resave: false,
  saveUninitialized: true
}));

app.get('/login', (req, res) => {
  res.send(`
<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Login</title>
<style>
  body { background:#1e1e2f; color:#fff; display:flex; justify-content:center; align-items:center; height:100vh; margin:0; font-family:'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
  .card { background:#2a2a40; padding:40px; border-radius:12px; box-shadow:0 8px 20px rgba(0,0,0,0.4); text-align:center; }
  input { width:100%; padding:10px; margin:10px 0; border:none; border-radius:6px; background:#3a3a5a; color:#fff; }
  button { background:#6c8cff; border:none; padding:12px 30px; border-radius:6px; color:#fff; cursor:pointer; }
</style></head><body>
<div class="card"><h2>Discord Email Bot</h2>
<form method="POST" action="/login">
  <input type="text" name="username" placeholder="Username" required><br>
  <input type="password" name="password" placeholder="Password" required><br>
  <button type="submit">Login</button>
</form></div>
</body></html>`);
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (username === 'patel' && password === 'patel') {
    req.session.user = 'patel';
    res.redirect('/');
  } else {
    res.send('<script>alert("Invalid credentials"); window.location="/login";</script>');
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

app.use(ensureAuth);

app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Dashboard</title>
<style>
  body { background:#1e1e2f; color:#e0e0e0; font-family:'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin:0; display:flex; }
  .sidebar { width:220px; background:#2a2a40; padding:20px; height:100vh; position:fixed; }
  .sidebar a { color:#e0e0e0; text-decoration:none; display:block; padding:10px; border-radius:8px; margin:5px 0; }
  .sidebar a:hover { background:#3a3a5a; }
  .main { margin-left:240px; padding:30px; flex:1; }
  .card { background:#2a2a40; border-radius:12px; padding:20px; margin-bottom:20px; box-shadow:0 4px 10px rgba(0,0,0,0.3); }
  h1, h2 { color:#fff; }
  .btn { background:#6c8cff; color:#fff; padding:8px 16px; border-radius:6px; text-decoration:none; display:inline-block; }
</style></head><body>
<div class="sidebar">
  <h2>🔧 Email Bot</h2>
  <a href="/">🏠 Dashboard</a>
  <a href="/emails">📧 All Emails</a>
  <a href="/logout">🚪 Logout</a>
</div>
<div class="main">
  <h1>Dashboard</h1>
  <div class="card">
    <h2>Quick Links</h2>
    <p><a href="/emails" class="btn">View Emails</a></p>
  </div>
</div>
</body></html>`);
});

app.get('/emails', (req, res) => {
  const search = req.query.search || '';
  const date = req.query.date || '';
  const emails = searchEmails(search, date);
  const distinctDates = getDistinctDates();

  let rows = emails.map(e => `
    <tr>
      <td>${escapeHtml(e.date)}/${e.dailyId}</td>
      <td>${escapeHtml(e.recipient)}</td>
      <td>${escapeHtml(e.subject)}</td>
      <td><a href="/email/${e.date}/${e.dailyId}">View</a></td>
    </tr>`).join('');

  res.send(`
<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Emails</title>
<style>
  body { background:#1e1e2f; color:#e0e0e0; font-family:'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin:0; display:flex; }
  .sidebar { width:220px; background:#2a2a40; padding:20px; height:100vh; position:fixed; }
  .sidebar a { color:#e0e0e0; text-decoration:none; display:block; padding:10px; border-radius:8px; margin:5px 0; }
  .sidebar a:hover { background:#3a3a5a; }
  .main { margin-left:240px; padding:30px; flex:1; }
  .card { background:#2a2a40; border-radius:12px; padding:20px; margin-bottom:20px; box-shadow:0 4px 10px rgba(0,0,0,0.3); }
  table { width:100%; border-collapse:collapse; }
  th, td { padding:12px; text-align:left; border-bottom:1px solid #3a3a5a; }
  th { color:#9e9eb0; }
  a { color:#6c8cff; text-decoration:none; }
  a:hover { text-decoration:underline; }
  input, select { padding:8px; border-radius:6px; border:none; background:#3a3a5a; color:#fff; margin-right:10px; }
  .btn { background:#6c8cff; color:#fff; padding:8px 16px; border-radius:6px; cursor:pointer; border:none; }
</style></head><body>
<div class="sidebar">
  <h2>📬 Email Bot</h2>
  <a href="/">🏠 Dashboard</a>
  <a href="/emails">📧 All Emails</a>
  <a href="/logout">🚪 Logout</a>
</div>
<div class="main">
  <h1>Emails</h1>
  <div class="card">
    <form method="GET" action="/emails">
      <input type="text" name="search" placeholder="Search recipient or subject" value="${escapeHtml(search)}">
      <select name="date">
        <option value="">All dates</option>
        ${distinctDates.map(d => `<option value="${d}" ${d===date?'selected':''}>${d}</option>`).join('')}
      </select>
      <button type="submit" class="btn">Search</button>
    </form>
  </div>
  <div class="card">
    <table>
      <thead><tr><th>ID</th><th>Recipient</th><th>Subject</th><th>Action</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="4">No emails found.</td></tr>'}</tbody>
    </table>
  </div>
</div>
</body></html>`);
});

app.get('/emails/:date', (req, res) => {
  const date = req.params.date;
  const emails = getEmailsByDate(date);
  let rows = emails.map(e => `
    <tr>
      <td>${e.dailyId}</td>
      <td>${escapeHtml(e.recipient)}</td>
      <td>${escapeHtml(e.subject)}</td>
      <td><a href="/email/${e.date}/${e.dailyId}">View</a></td>
    </tr>`).join('');

  res.send(`
<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Emails for ${date}</title>
<style>
  body { background:#1e1e2f; color:#e0e0e0; font-family:'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin:0; display:flex; }
  .sidebar { width:220px; background:#2a2a40; padding:20px; height:100vh; position:fixed; }
  .sidebar a { color:#e0e0e0; text-decoration:none; display:block; padding:10px; border-radius:8px; margin:5px 0; }
  .sidebar a:hover { background:#3a3a5a; }
  .main { margin-left:240px; padding:30px; flex:1; }
  .card { background:#2a2a40; border-radius:12px; padding:20px; margin-bottom:20px; box-shadow:0 4px 10px rgba(0,0,0,0.3); }
  table { width:100%; border-collapse:collapse; }
  th, td { padding:12px; text-align:left; border-bottom:1px solid #3a3a5a; }
  th { color:#9e9eb0; }
  a { color:#6c8cff; text-decoration:none; }
  .btn { background:#6c8cff; color:#fff; padding:8px 16px; border-radius:6px; text-decoration:none; display:inline-block; margin-top:10px; }
</style></head><body>
<div class="sidebar">
  <h2>📬 Email Bot</h2>
  <a href="/">🏠 Dashboard</a>
  <a href="/emails">📧 All Emails</a>
  <a href="/logout">🚪 Logout</a>
</div>
<div class="main">
  <h1>Emails for ${date}</h1>
  <div class="card">
    <table>
      <thead><tr><th>Daily ID</th><th>Recipient</th><th>Subject</th><th>Action</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="4">No emails for this date.</td></tr>'}</tbody>
    </table>
    <a href="/emails" class="btn">← Back to all emails</a>
  </div>
</div>
</body></html>`);
});

app.get('/email/:date/:dailyId', (req, res) => {
  const { date, dailyId } = req.params;
  const email = getEmailByDateAndDailyId(date, parseInt(dailyId));
  if (!email) {
    return res.status(404).send('<h1 style="color:white; background:#1e1e2f; text-align:center; padding:50px;">Email not found</h1>');
  }
  res.send(`
<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(email.subject)}</title>
<style>
  body { background:#1e1e2f; color:#e0e0e0; font-family:'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin:0; padding:40px 20px; display:flex; justify-content:center; }
  .card { background:#2a2a40; border-radius:12px; box-shadow:0 8px 20px rgba(0,0,0,0.4); max-width:720px; width:100%; padding:30px; }
  .header { border-bottom:1px solid #3a3a5a; padding-bottom:20px; margin-bottom:25px; }
  .recipient, .timestamp { color:#9e9eb0; font-size:0.9em; margin-top:5px; }
  .subject { font-size:1.6em; font-weight:600; color:#fff; margin:0 0 10px 0; }
  .message-body { line-height:1.6; word-wrap:break-word; }
  .footer { margin-top:30px; font-size:0.8em; color:#7a7a8a; border-top:1px solid #3a3a5a; padding-top:15px; }
  a { color:#6c8cff; text-decoration:none; }
</style></head><body>
<div class="card">
  <div class="header">
    <h1 class="subject">${escapeHtml(email.subject)}</h1>
    <div class="recipient">📧 To: ${escapeHtml(email.recipient)}</div>
    <div class="timestamp">🕒 Sent: ${email.timestamp ? new Date(email.timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'Unknown'}</div>
  </div>
  <div class="message-body">${email.message || '<p><i>No content</i></p>'}</div>
  <div class="footer">Sent via Discord Email Bot</div>
</div>
</body></html>`);
});

function escapeHtml(unsafe) {
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function startWebServer() {
  app.listen(PORT, () => {
    logInfo('WEB', `Email preview server running on port ${PORT}`);
  });
}

module.exports = { startWebServer };