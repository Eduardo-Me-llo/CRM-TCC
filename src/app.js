const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const databaseReadyMiddleware = require('./middlewares/database-ready.middleware');
const errorMiddleware = require('./middlewares/error.middleware');

const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(databaseReadyMiddleware);

app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/me', require('./routes/me.routes'));
app.use('/api/developer', require('./routes/developer.routes'));
app.use('/api/dashboard', require('./routes/dashboard.routes'));
app.use('/api/users', require('./routes/user.routes'));
app.use('/api/client-companies', require('./routes/company.routes'));
app.use('/api/client-contacts', require('./routes/contact.routes'));
app.use('/api/client-interactions', require('./routes/interaction.routes'));
app.use('/api/custom-fields', require('./routes/custom-field.routes'));
app.use('/api/tasks', require('./routes/task.routes'));
app.use('/api/audit-logs', require('./routes/audit.routes'));
app.use('/api/roles', require('./routes/role.routes'));

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.use(errorMiddleware);

module.exports = app;
