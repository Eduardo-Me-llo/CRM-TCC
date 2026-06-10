require('dotenv').config();

const app = require('./src/app');
const { PORT } = require('./src/config/env');
const { DATABASE_URL, maskDatabaseUrl } = require('./src/config/database');
const { ensureDatabaseReady } = require('./src/services/database-init.service');

function printDatabaseHelp(error) {
  console.error('Falha ao iniciar banco de dados:', error.message);
  console.error('');
  console.error('O sistema precisa de um PostgreSQL ativo.');
  console.error('Caminhos possiveis:');
  console.error('1) Docker instalado: docker compose up -d');
  console.error('2) Sem permissao para Docker: use PostgreSQL em nuvem, como Neon ou Supabase, e cole a connection string no arquivo .env.');
  console.error('');
  console.error('Exemplo de .env sem Docker:');
  console.error('DATABASE_URL=postgresql://usuario:senha@host-do-banco/neondb?sslmode=require');
  console.error('');
  console.error('No Windows/PowerShell, prefira executar: npm.cmd start');
  console.error('');
  console.error('DATABASE_URL atual:', maskDatabaseUrl(DATABASE_URL));
}

if (require.main === module) {
  ensureDatabaseReady()
    .then(() => {
      app.listen(PORT, () => {
        console.log(`CRM rodando em http://localhost:${PORT}`);
        console.log(`Banco: ${maskDatabaseUrl(DATABASE_URL)}`);
      });
    })
    .catch(error => {
      printDatabaseHelp(error);
      process.exit(1);
    });
}

module.exports = app;
