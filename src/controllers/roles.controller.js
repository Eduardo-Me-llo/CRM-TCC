const { ROLE_LABELS, rolePermissions } = require('../constants/roles');

function list(_req, res) {
  res.json(Object.keys(ROLE_LABELS).map(key => ({ key, label: ROLE_LABELS[key], permissions: rolePermissions(key) })));
}

module.exports = { list };
