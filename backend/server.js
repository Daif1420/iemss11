const path = require('path');
const fs = require('fs');
require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const employeeRoutes = require('./routes/employee');
const adminRoutes = require('./routes/admin');
const attendanceRoutes = require('./routes/attendance');
const notificationRoutes = require('./routes/notifications');
const requestRoutes = require('./routes/requests');

const app = express();
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json({ limit: '15mb' }));

const db = require('./database/init');

app.get('/api/health', (req, res) => res.json({
  ok: true,
  database: db.isMock() ? 'in-memory-mock' : 'postgresql',
  databaseConfigured: !!process.env.DATABASE_URL,
  jwtConfigured: !!process.env.JWT_SECRET,
}));

app.use('/api', async (req, res, next) => {
  try { await db.ensureDatabase(); next(); }
  catch (err) { console.error('[IEMS API] database bootstrap failed', err); next(err); }
});

app.use('/api/auth', authRoutes);
app.use('/api/employee', employeeRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/requests', requestRoutes);

app.use('/api', (req, res) => {
  res.status(404).json({ error: `المسار غير موجود: ${req.method} ${req.originalUrl}` });
});

const distDir = path.join(__dirname, '../frontend/dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get(/^(?!\/api(?:\/|$)).*/, (req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

app.use((err, req, res, next) => {
  console.error('[IEMS API]', err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'حدث خطأ في الخادم. راجع سجلات الخادم لمزيد من التفاصيل.' });
});

module.exports = app;

const { maybeRunAutoPurge } = require('./utils/systemSettings');

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  if (db.isMock()) {
    console.warn('[IEMS API] DATABASE_URL not set — using an empty in-memory mock database (development only)');
  }
  app.listen(port, '0.0.0.0', () => {
    console.log(`[IEMS API] listening on http://0.0.0.0:${port}`);
    setTimeout(() => {
      maybeRunAutoPurge(false).catch((e) =>
        console.warn('[IEMS Auto-Purge] startup check warning:', e.message)
      );
    }, 10000).unref();
    setInterval(() => {
      maybeRunAutoPurge(false).catch((e) =>
        console.warn('[IEMS Auto-Purge] interval check warning:', e.message)
      );
    }, 6 * 3600 * 1000).unref();
  });
}
