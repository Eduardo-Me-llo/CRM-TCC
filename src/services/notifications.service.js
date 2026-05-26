const { query } = require('../config/database');

const NOTIFICATION_ID_PATTERN = /^(task-overdue|task-due-soon|task-new|interaction-followup)-[0-9a-f-]{36}$/i;

async function getNotifications(tenantId, userId) {
  const preferencesResult = await query(`SELECT preferences FROM users WHERE id = $1 AND tenant_id = $2`, [userId, tenantId]);
  const preferences = preferencesResult.rows[0]?.preferences || {};

  const [overdueTasksResult, upcomingTasksResult, followUpsResult, newAssignmentsResult] = await Promise.all([
    query(
      `SELECT t.id, t.title, t.company_id, t.due_at, t.priority, c.name AS company_name
         FROM crm_tasks t
         LEFT JOIN client_companies c ON c.id = t.company_id AND c.tenant_id = t.tenant_id
        WHERE t.tenant_id = $1
          AND t.assigned_user_id = $2
          AND t.status IN ('open', 'in_progress')
          AND t.due_at < now()
          AND NOT EXISTS (
            SELECT 1 FROM notification_dismissals d
             WHERE d.tenant_id = $1 AND d.user_id = $2
               AND d.notification_key = 'task-overdue-' || t.id::text
               AND d.dismissed_at >= t.updated_at
          )
        ORDER BY t.due_at ASC
        LIMIT 10`,
      [tenantId, userId]
    ),
    preferences.notifySla === false
      ? Promise.resolve({ rows: [] })
      : query(
        `SELECT t.id, t.title, t.company_id, t.due_at, t.priority, c.name AS company_name
           FROM crm_tasks t
           LEFT JOIN client_companies c ON c.id = t.company_id AND c.tenant_id = t.tenant_id
          WHERE t.tenant_id = $1
            AND t.assigned_user_id = $2
            AND t.status IN ('open', 'in_progress')
            AND t.due_at >= now()
            AND t.due_at <= now() + interval '3 days'
            AND NOT EXISTS (
              SELECT 1 FROM notification_dismissals d
               WHERE d.tenant_id = $1 AND d.user_id = $2
                 AND d.notification_key = 'task-due-soon-' || t.id::text
                 AND d.dismissed_at >= t.updated_at
            )
          ORDER BY t.due_at ASC
          LIMIT 10`,
        [tenantId, userId]
      ),
    query(
      `SELECT i.id, i.subject, i.company_id, i.next_action_at, c.name AS company_name
         FROM client_interactions i
         JOIN client_companies c ON c.id = i.company_id AND c.tenant_id = i.tenant_id
        WHERE i.tenant_id = $1
          AND i.user_id = $2
          AND i.status = 'open'
          AND i.next_action_at < now()
          AND NOT EXISTS (
            SELECT 1 FROM notification_dismissals d
             WHERE d.tenant_id = $1 AND d.user_id = $2
               AND d.notification_key = 'interaction-followup-' || i.id::text
               AND d.dismissed_at >= i.updated_at
          )
        ORDER BY i.next_action_at ASC
        LIMIT 10`,
      [tenantId, userId]
    ),
    preferences.notifyAssigned === false
      ? Promise.resolve({ rows: [] })
      : query(
        `SELECT t.id, t.title, t.created_at, c.name AS company_name
           FROM crm_tasks t
           LEFT JOIN client_companies c ON c.id = t.company_id AND c.tenant_id = t.tenant_id
          WHERE t.tenant_id = $1
            AND t.assigned_user_id = $2
            AND t.created_at > now() - interval '24 hours'
            AND NOT EXISTS (
              SELECT 1 FROM notification_dismissals d
               WHERE d.tenant_id = $1 AND d.user_id = $2
                 AND d.notification_key = 'task-new-' || t.id::text
            )
          ORDER BY t.created_at DESC
          LIMIT 5`,
        [tenantId, userId]
      )
  ]);

  const notifications = [
    ...overdueTasksResult.rows.map(task => ({
      id: `task-overdue-${task.id}`,
      type: 'task_overdue',
      title: `Tarefa vencida: ${task.title}`,
      message: `${task.company_name || 'Sem empresa'} - prazo expirou em ${formatDate(task.due_at)}.`,
      severity: 'error',
      createdAt: task.due_at,
      entityId: task.id,
      entityType: 'task',
      route: 'tasks'
    })),
    ...upcomingTasksResult.rows.map(task => ({
      id: `task-due-soon-${task.id}`,
      type: 'task_due_soon',
      title: `Prazo próximo: ${task.title}`,
      message: `${task.company_name || 'Sem empresa'} - vence em ${formatDateTime(task.due_at)}.`,
      severity: 'warning',
      createdAt: task.due_at,
      entityId: task.id,
      entityType: 'task',
      route: 'tasks'
    })),
    ...followUpsResult.rows.map(interaction => ({
      id: `interaction-followup-${interaction.id}`,
      type: 'interaction_followup',
      title: `Retorno pendente: ${interaction.subject}`,
      message: `${interaction.company_name} - retorno previsto para ${formatDate(interaction.next_action_at)}.`,
      severity: 'warning',
      createdAt: interaction.next_action_at,
      entityId: interaction.id,
      entityType: 'interaction',
      route: 'interactions'
    })),
    ...newAssignmentsResult.rows.map(task => ({
      id: `task-new-${task.id}`,
      type: 'new_assignment',
      title: `Nova tarefa: ${task.title}`,
      message: `Atribuída a você${task.company_name ? ` para ${task.company_name}` : ''}.`,
      severity: 'info',
      createdAt: task.created_at,
      entityId: task.id,
      entityType: 'task',
      route: 'tasks'
    }))
  ];

  const severityOrder = { error: 0, warning: 1, info: 2 };
  return notifications.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]
    || new Date(b.createdAt) - new Date(a.createdAt));
}

async function dismissNotification(tenantId, userId, notificationId) {
  if (!NOTIFICATION_ID_PATTERN.test(notificationId)) {
    throw Object.assign(new Error('Notificação inválida.'), { status: 400 });
  }
  await saveDismissals(tenantId, userId, [notificationId]);
}

async function dismissAllNotifications(tenantId, userId) {
  const notifications = await getNotifications(tenantId, userId);
  await saveDismissals(tenantId, userId, notifications.map(notification => notification.id));
  return notifications.length;
}

async function saveDismissals(tenantId, userId, notificationIds) {
  if (!notificationIds.length) return;
  await query(
    `INSERT INTO notification_dismissals (tenant_id, user_id, notification_key)
     SELECT $1, $2, key FROM unnest($3::text[]) AS key
     ON CONFLICT (user_id, notification_key)
     DO UPDATE SET dismissed_at = now()`,
    [tenantId, userId, notificationIds]
  );
}

function formatDate(value) {
  return new Date(value).toLocaleDateString('pt-BR');
}

function formatDateTime(value) {
  return new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

module.exports = {
  dismissAllNotifications,
  dismissNotification,
  getNotifications
};
