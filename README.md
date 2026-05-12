# CRM SaaS v6 — Primeira grande entrega

Esta versão substitui o MVP anterior por uma base mais profissional e vendável, com **PostgreSQL**, **login multiempresa**, **painel do desenvolvedor**, **empresas contratantes**, **usuários por empresa**, **clientes B2B separados em Empresas, Contatos e Relacionamentos** e **permissões reais no backend**.

## O que esta entrega implementa

1. Painel do desenvolvedor
2. Cadastro de empresas contratantes do CRM
3. Cadastro manual de usuários por empresa contratante
4. Login multiempresa
5. Clientes divididos em:
   - Empresas Clientes
   - Contatos
   - Relacionamentos
6. Banco PostgreSQL
7. Permissões reais no backend
8. Auditoria de ações principais
9. Isolamento de dados por `tenant_id`
10. Regra de segurança: cada empresa precisa manter pelo menos 2 administradores gerais ativos

## Tecnologias

- Node.js
- Express
- PostgreSQL
- JWT
- bcryptjs
- HTML/CSS/JavaScript sem build obrigatório
- Docker Compose para o PostgreSQL

A escolha por HTML/JS sem build neste pacote foi proposital para facilitar sua apresentação no VS Code: você não precisa compilar frontend. O backend serve a tela e a API no mesmo endereço.

## Como rodar

### 1. Suba o PostgreSQL

Com Docker instalado:

```bash
cd crm-saas-v6
docker compose up -d
```

Se você não puder usar Docker, crie um banco PostgreSQL em nuvem, por exemplo Neon, Supabase ou uma instalação existente, e ajuste o `DATABASE_URL` no `.env`. Veja também `docs/RODAR_SEM_DOCKER.md`.

### 2. Configure o `.env`

Copie o arquivo de exemplo:

```bash
copy .env.example .env
```

No PowerShell, também pode usar:

```powershell
Copy-Item .env.example .env
```

O padrão já funciona com o `docker-compose.yml` deste projeto:

```env
PORT=3000
NODE_ENV=development
JWT_SECRET=troque_esta_chave_em_producao_com_uma_chave_forte
DATABASE_URL=postgres://crm_user:crm_password@localhost:5432/crm_saas
```

### 3. Instale dependências

```bash
npm install
```

### 4. Rode o sistema

```bash
npm start
```

No Windows usando Node portátil, prefira:

```powershell
npm.cmd start
```

Acesse:

```text
http://localhost:3000
```

Na primeira execução, o sistema cria automaticamente as tabelas e popula dados de demonstração.

## Logins de teste

Senha para todos:

```text
123456
```

| Perfil | E-mail |
|---|---|
| Desenvolvedor do CRM | desenvolvedor@crm.local |
| Admin Master FGV | eduardo.de.mello@fgv.br |
| Admin FGV | marina.admin@fgv.br |
| Gerente FGV | carla.gerente@fgv.br |
| Operador FGV | diego.operador@fgv.br |

## Como testar o cenário solicitado

### Como desenvolvedor

Entre com:

```text
desenvolvedor@crm.local
```

Você verá:

- Visão geral da plataforma SaaS
- Empresas contratantes
- Usuários por empresa
- Configurações do desenvolvedor

Nessa área você pode cadastrar uma nova empresa contratante, definir domínio, plano, limite de usuários e cadastrar/remover usuários manualmente.

### Como FGV

Entre com:

```text
eduardo.de.mello@fgv.br
```

Você verá:

- Visão geral da FGV como empresa contratante
- Empresas Clientes
- Contatos
- Relacionamentos
- Usuários e Acessos
- Auditoria
- Configurações

Na aba **Empresas Clientes**, já existe o exemplo:

```text
Supermercados Guanabara
```

Dentro dessa empresa há contatos e registros de relacionamento simulando o caso do IBRE/FGV coletando preços e acompanhando interações por WhatsApp, telefone, e-mail e outras formas de contato.

## Permissões implementadas

As abas são escondidas no frontend, mas também existe validação real no backend.

Exemplos:

- Operador não acessa `/api/users`
- Operador não remove empresas clientes
- Gerente não acessa auditoria
- Usuários de um tenant não acessam dados de outro tenant
- Desenvolvedor acessa apenas APIs globais de tenant/usuário, não entra como usuário comum de uma empresa

## Estrutura principal do banco

Tabelas criadas automaticamente:

```text
tenants
users
tenant_domains
client_companies
client_contacts
client_interactions
audit_logs
```

Relacionamento principal:

```text
Empresa contratante do CRM tenant
  ├── Usuários
  ├── Empresas clientes
  │    ├── Contatos
  │    └── Relacionamentos
  └── Logs de auditoria
```

## Rodar sem Docker

Se o comando `docker` não for reconhecido ou o computador pedir senha de administrador para instalar Docker/PostgreSQL, use um PostgreSQL em nuvem e siga o arquivo:

```text
docs/RODAR_SEM_DOCKER.md
```

Resumo rápido:

```powershell
Copy-Item .env.cloud.example .env
notepad .env
npm.cmd install
npm.cmd start
```

## Resetar o banco

Se quiser apagar todas as tabelas e recriar o seed:

```bash
npm run db:reset
npm start
```

## Observações para produção

Esta versão já é muito mais profunda que o MVP, mas ainda recomendo as próximas etapas antes de vender:

- refresh token e rotação de sessão;
- recuperação de senha por e-mail;
- 2FA;
- filas Redis para e-mail, automações e notificações;
- importador Excel robusto;
- testes automatizados;
- logs de auditoria imutáveis;
- deploy em nuvem;
- backup automático;
- LGPD: exportação, anonimização e exclusão controlada de dados.
