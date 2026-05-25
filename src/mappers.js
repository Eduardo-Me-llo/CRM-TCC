function mapCompany(row) {
  return {
    id: row.id,
    name: row.name,
    tradeName: row.trade_name,
    cnpj: row.cnpj,
    industry: row.industry,
    status: row.status,
    pipelineStage: row.pipeline_stage || 'new',
    expectedValue: row.expected_value == null ? null : Number(row.expected_value),
    expectedCloseDate: row.expected_close_date,
    lostReason: row.lost_reason,
    source: row.source,
    city: row.city,
    state: row.state,
    address: row.address,
    notes: row.notes,
    tags: row.tags || [],
    customFields: row.custom_fields || {},
    ownerUserId: row.owner_user_id,
    ownerName: row.owner_name,
    contactsCount: Number(row.contacts_count || 0),
    interactionsCount: Number(row.interactions_count || 0),
    lastInteractionAt: row.last_interaction_at,
    nextActionAt: row.next_action_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapContact(row) {
  return {
    id: row.id,
    companyId: row.company_id,
    companyName: row.company_name,
    name: row.name,
    position: row.position,
    email: row.email,
    phone: row.phone,
    whatsapp: row.whatsapp,
    preferredChannel: row.preferred_channel,
    status: row.status,
    notes: row.notes,
    customFields: row.custom_fields || {},
    lastInteractionAt: row.last_interaction_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapInteraction(row) {
  return {
    id: row.id,
    companyId: row.company_id,
    companyName: row.company_name,
    contactId: row.contact_id,
    contactName: row.contact_name,
    userId: row.user_id,
    userName: row.user_name,
    updatedByUserId: row.updated_by_user_id,
    updatedByUserName: row.updated_by_user_name,
    channel: row.channel,
    direction: row.direction,
    subject: row.subject,
    description: row.description,
    outcome: row.outcome,
    nextActionAt: row.next_action_at,
    status: row.status,
    customFields: row.custom_fields || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapTask(row) {
  return {
    id: row.id,
    companyId: row.company_id,
    companyName: row.company_name,
    contactId: row.contact_id,
    contactName: row.contact_name,
    interactionId: row.interaction_id,
    assignedUserId: row.assigned_user_id,
    assignedUserName: row.assigned_user_name,
    createdByUserId: row.created_by_user_id,
    createdByUserName: row.created_by_user_name,
    title: row.title,
    description: row.description,
    dueAt: row.due_at,
    priority: row.priority,
    status: row.status,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

module.exports = {
  mapCompany,
  mapContact,
  mapInteraction,
  mapTask
};
