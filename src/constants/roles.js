const ROLES = {
  DEVELOPER: 'DEVELOPER',
  ADMIN_MASTER: 'ADMIN_MASTER',
  ADMIN: 'ADMIN',
  MANAGER: 'MANAGER',
  OPERATOR: 'OPERATOR'
};

const ROLE_LABELS = {
  DEVELOPER: 'Desenvolvedor do CRM',
  ADMIN_MASTER: 'Administrador Master',
  ADMIN: 'Administrador',
  MANAGER: 'Gerente',
  OPERATOR: 'Operador'
};

const ROLE_PERMISSIONS = {
  DEVELOPER: [
    'developer.panel.read',
    'developer.tenants.manage',
    'developer.users.manage',
    'developer.settings.manage'
  ],
  ADMIN_MASTER: [
    'dashboard.read',
    'client_companies.read',
    'client_companies.create',
    'client_companies.update',
    'client_companies.delete',
    'client_contacts.read',
    'client_contacts.create',
    'client_contacts.update',
    'client_contacts.delete',
    'client_interactions.read',
    'client_interactions.create',
    'client_interactions.update',
    'client_interactions.delete',
    'tasks.read',
    'tasks.create',
    'tasks.update',
    'tasks.delete',
    'imports.create',
    'exports.read',
    'users.read',
    'users.create',
    'users.update',
    'users.delete',
    'custom_fields.manage',
    'settings.read',
    'settings.update',
    'audit_logs.read'
  ],
  ADMIN: [
    'dashboard.read',
    'client_companies.read',
    'client_companies.create',
    'client_companies.update',
    'client_contacts.read',
    'client_contacts.create',
    'client_contacts.update',
    'client_contacts.delete',
    'client_interactions.read',
    'client_interactions.create',
    'client_interactions.update',
    'client_interactions.delete',
    'tasks.read',
    'tasks.create',
    'tasks.update',
    'tasks.delete',
    'imports.create',
    'exports.read',
    'settings.read',
    'audit_logs.read'
  ],
  MANAGER: [
    'dashboard.read',
    'client_companies.read',
    'client_companies.create',
    'client_companies.update',
    'client_contacts.read',
    'client_contacts.create',
    'client_contacts.update',
    'client_interactions.read',
    'client_interactions.create',
    'client_interactions.update',
    'tasks.read',
    'tasks.create',
    'tasks.update',
    'imports.create',
    'exports.read',
    'settings.read'
  ],
  OPERATOR: [
    'dashboard.read',
    'client_companies.read',
    'client_contacts.read',
    'client_contacts.create',
    'client_interactions.read',
    'client_interactions.create',
    'tasks.read',
    'tasks.create',
    'tasks.update',
    'settings.read'
  ]
};

const GENERAL_ADMIN_ROLES = [ROLES.ADMIN_MASTER, ROLES.ADMIN];
const PIPELINE_STAGES = ['new', 'contacted', 'negotiation', 'proposal', 'won', 'lost'];
const TASK_STATUSES = ['open', 'in_progress', 'done', 'canceled'];
const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'];

function rolePermissions(role) {
  return ROLE_PERMISSIONS[role] || [];
}

module.exports = {
  GENERAL_ADMIN_ROLES,
  PIPELINE_STAGES,
  ROLE_LABELS,
  ROLE_PERMISSIONS,
  ROLES,
  TASK_PRIORITIES,
  TASK_STATUSES,
  rolePermissions
};
