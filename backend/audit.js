/**
 * Audit log helper (ТЗ п. 9.6, ТР.19, ИБ.9).
 * Levels: error, warning, info, trace
 */
const { query } = require('./db');

function getClientMeta(req) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || null;
  const userAgent = req.headers['user-agent'] || null;
  return { ip, user_agent: userAgent };
}

async function audit(params) {
  const { userId, action, entityType, entityId, level = 'info', details = null, req = null } = params;
  const meta = req ? getClientMeta(req) : {};
  try {
    await query(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, level, details, ip, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        userId ?? null,
        action,
        entityType ?? null,
        entityId != null ? String(entityId) : null,
        level,
        details ? JSON.stringify(details) : null,
        meta.ip ?? null,
        meta.user_agent ?? null,
      ]
    );
  } catch (e) {
    console.error('audit log insert failed:', e.message);
  }
}

module.exports = { audit, getClientMeta };
