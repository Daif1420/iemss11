const express = require('express');
const webpush = require('web-push');
const db = require('../database/init');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Express 4/5 safe async wrapper
['get', 'post', 'delete'].forEach((m) => {
  const orig = router[m].bind(router);
  router[m] = (path, ...handlers) =>
    orig(
      path,
      ...handlers.map((fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next))
    );
});

let vapidKeysPromise = null;

async function getVapidConfig() {
  const envPub = String(process.env.VAPID_PUBLIC_KEY || '').trim();
  const envPriv = String(process.env.VAPID_PRIVATE_KEY || '').trim();
  const subject = String(process.env.VAPID_SUBJECT || '').trim() || 'mailto:admin@iems.local';

  if (envPub && envPriv) {
    webpush.setVapidDetails(subject, envPub, envPriv);
    return { publicKey: envPub, privateKey: envPriv, subject };
  }

  if (vapidKeysPromise) return vapidKeysPromise;

  vapidKeysPromise = (async () => {
    try {
      await db.ensureDatabase();
      const row = await db
        .prepare("SELECT value_json FROM system_settings WHERE key = 'web_push_vapid_keys'")
        .get();
      let saved = row?.value_json;
      if (typeof saved === 'string') {
        try {
          saved = JSON.parse(saved);
        } catch {
          saved = null;
        }
      }
      if (saved?.publicKey && saved?.privateKey) {
        webpush.setVapidDetails(subject, saved.publicKey, saved.privateKey);
        return { publicKey: saved.publicKey, privateKey: saved.privateKey, subject };
      }

      const generated = webpush.generateVAPIDKeys();
      const toSave = {
        publicKey: generated.publicKey,
        privateKey: generated.privateKey,
        createdAt: new Date().toISOString(),
      };
      await db
        .prepare(
          `INSERT INTO system_settings (key, value_json, updated_by)
           VALUES (?, ?::jsonb, NULL)
           ON CONFLICT (key) DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = CURRENT_TIMESTAMP`
        )
        .run('web_push_vapid_keys', JSON.stringify(toSave));
      webpush.setVapidDetails(subject, toSave.publicKey, toSave.privateKey);
      return { publicKey: toSave.publicKey, privateKey: toSave.privateKey, subject };
    } catch (err) {
      vapidKeysPromise = null;
      throw err;
    }
  })();

  return vapidKeysPromise;
}

function validatePushEndpoint(raw) {
  const endpoint = String(raw || '').trim();
  if (!endpoint || endpoint.length > 2000) return null;
  try {
    const parsed = new URL(endpoint);
    if (parsed.protocol !== 'https:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

async function sendPushToUsers(userIds, { type = 'general', title, body = '', link = '/home.html' }) {
  const ids = [...new Set((userIds || []).map(Number).filter(Number.isInteger))];
  if (!ids.length) return { sent: 0, failed: 0 };

  let vapid;
  try {
    vapid = await getVapidConfig();
  } catch (err) {
    console.warn('[IEMS Push] VAPID config unavailable:', err.message);
    return { sent: 0, failed: 0 };
  }
  if (!vapid?.publicKey || !vapid?.privateKey) return { sent: 0, failed: 0 };

  const subs = await db
    .prepare('SELECT id, user_id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ANY(?::int[])')
    .all(ids);
  if (!subs.length) return { sent: 0, failed: 0 };

  const unreadRows = await db
    .prepare(
      'SELECT user_id, COUNT(*)::int AS c FROM notifications WHERE user_id = ANY(?::int[]) AND is_read = FALSE GROUP BY user_id'
    )
    .all(ids);
  const unreadMap = new Map(unreadRows.map((r) => [Number(r.user_id), Number(r.c || 0)]));

  const staleEndpoints = [];
  let sent = 0;
  let failed = 0;

  await Promise.allSettled(
    subs.map(async (sub) => {
      const payload = JSON.stringify({
        type,
        title: String(title || 'إشعار جديد من IEMS'),
        body: String(body || ''),
        link: link || '/requests.html',
        unreadCount: Math.max(1, unreadMap.get(Number(sub.user_id)) || 1),
        tag: `iems-${type}-${Date.now()}`,
        timestamp: Date.now(),
      });
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payload,
          { TTL: 86400 }
        );
        sent += 1;
      } catch (err) {
        failed += 1;
        const status = err?.statusCode || err?.status;
        if (status === 404 || status === 410) {
          staleEndpoints.push(sub.endpoint);
        } else {
          console.warn('[IEMS Push] delivery failed:', status || err?.message);
        }
      }
    })
  );

  if (staleEndpoints.length) {
    try {
      await db
        .prepare('DELETE FROM push_subscriptions WHERE endpoint = ANY(?::text[])')
        .run(staleEndpoints);
    } catch {
      // ignore stale cleanup error
    }
  }

  return { sent, failed };
}

// Create notifications for a list of users and dispatch PWA Web Push alerts.
// Never throws: a failed notification must not break the action that triggered it.
async function notifyUsers(userIds, { type, title, body = null, link = null }) {
  try {
    const ids = [...new Set((userIds || []).map(Number).filter(Number.isInteger))];
    if (!ids.length) return 0;
    await db.query(
      `INSERT INTO notifications (user_id, type, title, body, link)
       SELECT uid, $2, $3, $4, $5 FROM unnest($1::int[]) AS uid`,
      [ids, type, title, body, link]
    );
    // Dispatch background Web Push alerts asynchronously without delaying the API response
    sendPushToUsers(ids, { type, title, body, link }).catch((err) => {
      console.warn('[IEMS Push] background dispatch warning:', err?.message);
    });
    return ids.length;
  } catch (e) {
    console.error('notifyUsers failed:', e);
    return 0;
  }
}

router.get('/', requireAuth, async (req, res) => {
  const uid = Number(req.user.id);
  const items = await db
    .prepare(
      `SELECT id, type, title, body, link, is_read, created_at
       FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 30`
    )
    .all(uid);
  const row = await db
    .prepare('SELECT COUNT(*)::int AS c FROM notifications WHERE user_id = ? AND is_read = FALSE')
    .get(uid);
  res.json({ items, unread: row ? row.c : 0 });
});

router.get('/push/config', requireAuth, async (req, res) => {
  const uid = Number(req.user.id);
  const vapid = await getVapidConfig();
  const endpoint = String(req.query.endpoint || '').trim();
  let subscribed = false;
  if (endpoint) {
    const existing = await db
      .prepare('SELECT id FROM push_subscriptions WHERE user_id = ? AND endpoint = ?')
      .get(uid, endpoint);
    subscribed = Boolean(existing);
  } else {
    const rows = await db
      .prepare('SELECT id FROM push_subscriptions WHERE user_id = ?')
      .all(uid);
    subscribed = rows.length > 0;
  }
  res.json({
    supported: Boolean(vapid?.publicKey),
    publicKey: vapid?.publicKey || null,
    subscribed,
  });
});

router.post('/push/subscribe', requireAuth, async (req, res) => {
  const uid = Number(req.user.id);
  const { subscription } = req.body || {};
  const sub = subscription && typeof subscription === 'object' ? subscription : req.body || {};
  const endpoint = validatePushEndpoint(sub.endpoint);
  const p256dh = String(sub.keys?.p256dh || '').trim();
  const auth = String(sub.keys?.auth || '').trim();
  if (!endpoint || !p256dh || !auth) {
    return res.status(400).json({ error: 'بيانات الاشتراك في الإشعارات غير صالحة.' });
  }
  const userAgent = String(req.headers['user-agent'] || '').slice(0, 300) || null;
  await db
    .prepare(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (endpoint) DO UPDATE SET
         user_id = EXCLUDED.user_id,
         p256dh = EXCLUDED.p256dh,
         auth = EXCLUDED.auth,
         user_agent = EXCLUDED.user_agent,
         updated_at = CURRENT_TIMESTAMP`
    )
    .run(uid, endpoint, p256dh, auth, userAgent);
  res.json({ ok: true });
});

router.post('/push/unsubscribe', requireAuth, async (req, res) => {
  const uid = Number(req.user.id);
  const endpoint = validatePushEndpoint(req.body?.endpoint);
  if (endpoint) {
    await db
      .prepare('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?')
      .run(uid, endpoint);
  }
  res.json({ ok: true });
});

router.post('/push/test', requireAuth, async (req, res) => {
  const uid = Number(req.user.id);
  const result = await sendPushToUsers([uid], {
    type: 'test',
    title: 'تم تفعيل إشعارات IEMS بنجاح',
    body: 'ستصلك إشعارات الطلبات والتنبيهات فورياً حتى عند إغلاق التطبيق.',
    link: '/requests.html',
  });
  res.json({ ok: true, ...result });
});

router.post('/read-all', requireAuth, async (req, res) => {
  await db
    .prepare('UPDATE notifications SET is_read = TRUE WHERE user_id = ? AND is_read = FALSE')
    .run(Number(req.user.id));
  res.json({ ok: true });
});

router.post('/:id/read', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'إشعار غير صالح.' });
  await db
    .prepare('UPDATE notifications SET is_read = TRUE WHERE id = ? AND user_id = ?')
    .run(id, Number(req.user.id));
  res.json({ ok: true });
});

module.exports = router;
module.exports.notifyUsers = notifyUsers;
module.exports.sendPushToUsers = sendPushToUsers;
