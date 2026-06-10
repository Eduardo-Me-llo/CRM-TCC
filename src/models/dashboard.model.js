const { query } = require('../config/database');
const { mapTask } = require('../mappers');

async function summary(tenantId) {
  const companies = await query(`SELECT COUNT(*)::int AS total FROM client_companies WHERE tenant_id = $1`, [tenantId]);
  const contacts = await query(`SELECT COUNT(*)::int AS total FROM client_contacts WHERE tenant_id = $1`, [tenantId]);
  const interactions = await query(`SELECT COUNT(*)::int AS total FROM client_interactions WHERE tenant_id = $1`, [tenantId]);
  const nextActions = await query(`SELECT COUNT(*)::int AS total FROM client_interactions WHERE tenant_id = $1 AND status = 'open' AND next_action_at IS NOT NULL`, [tenantId]);
  const openTasks = await query(`SELECT COUNT(*)::int AS total FROM crm_tasks WHERE tenant_id = $1 AND status IN ('open', 'in_progress')`, [tenantId]);
  const overdueTasks = await query(`SELECT COUNT(*)::int AS total FROM crm_tasks WHERE tenant_id = $1 AND status IN ('open', 'in_progress') AND due_at < now()`, [tenantId]);
  const staleCompanies = await query(
    `SELECT COUNT(*)::int AS total
       FROM client_companies c
      WHERE c.tenant_id = $1
        AND NOT EXISTS (
          SELECT 1 FROM client_interactions i
           WHERE i.company_id = c.id
             AND i.tenant_id = c.tenant_id
             AND i.created_at >= now() - interval '30 days'
        )`,
    [tenantId]
  );
  const byStatus = await query(`SELECT status, COUNT(*)::int AS total FROM client_companies WHERE tenant_id = $1 GROUP BY status ORDER BY total DESC`, [tenantId]);
  const byPipeline = await query(`SELECT pipeline_stage AS stage, COUNT(*)::int AS total, COALESCE(SUM(expected_value), 0)::float AS value FROM client_companies WHERE tenant_id = $1 GROUP BY pipeline_stage ORDER BY total DESC`, [tenantId]);
  const byChannel = await query(`SELECT channel, COUNT(*)::int AS total FROM client_interactions WHERE tenant_id = $1 GROUP BY channel ORDER BY total DESC`, [tenantId]);
  const recentTasks = await query(
    `SELECT t.*, c.name AS company_name, ct.name AS contact_name, au.name AS assigned_user_name, cu.name AS created_by_user_name
       FROM crm_tasks t
       LEFT JOIN client_companies c ON c.id = t.company_id AND c.tenant_id = t.tenant_id
       LEFT JOIN client_contacts ct ON ct.id = t.contact_id AND ct.tenant_id = t.tenant_id
       LEFT JOIN users au ON au.id = t.assigned_user_id
       LEFT JOIN users cu ON cu.id = t.created_by_user_id
      WHERE t.tenant_id = $1 AND t.status IN ('open', 'in_progress')
      ORDER BY t.due_at NULLS LAST, t.created_at DESC
      LIMIT 6`,
    [tenantId]
  );

  return {
    companies: companies.rows[0].total,
    contacts: contacts.rows[0].total,
    interactions: interactions.rows[0].total,
    nextActions: nextActions.rows[0].total,
    openTasks: openTasks.rows[0].total,
    overdueTasks: overdueTasks.rows[0].total,
    staleCompanies: staleCompanies.rows[0].total,
    companiesByStatus: byStatus.rows,
    pipelineByStage: byPipeline.rows,
    interactionsByChannel: byChannel.rows,
    recentTasks: recentTasks.rows.map(mapTask)
  };
}

module.exports = { summary };
