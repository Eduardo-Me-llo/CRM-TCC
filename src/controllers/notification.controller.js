const { dismissAllNotifications, dismissNotification, getNotifications } = require('../services/notifications.service');

async function list(req, res) {
  const notifications = await getNotifications(req.user.tenantId, req.user.id);
  res.json(notifications);
}

async function dismiss(req, res) {
  await dismissNotification(req.user.tenantId, req.user.id, req.params.notificationId);
  res.json({ ok: true });
}

async function dismissAll(req, res) {
  const dismissed = await dismissAllNotifications(req.user.tenantId, req.user.id);
  res.json({ ok: true, dismissed });
}

module.exports = {
  dismiss,
  dismissAll,
  list
};
