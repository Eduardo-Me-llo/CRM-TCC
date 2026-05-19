# Arquitetura — CRM SaaS v6

## Camadas

```text
Navegador
  ↓
Frontend estático servido pelo Express
  ↓
API REST Express
  ↓
PostgreSQL
```

## Organização MVC do backend

O backend agora fica em `src/` com uma divisão MVC para separar responsabilidades:

```text
src/app.js              Configura Express, middlewares, arquivos estáticos e rotas
src/config/             Ambiente e conexão PostgreSQL
src/controllers/        Recebe req/res, valida entrada básica e coordena resposta
src/models/             Consultas SQL e persistência por domínio
src/routes/             URLs REST, autenticação, permissões e controller
src/middlewares/        Auth JWT, RBAC, banco pronto e tratamento de erros
src/services/           Auditoria, CSV, inicialização do banco e regras compartilhadas
src/utils/              Helpers pequenos de HTTP e normalização
```

O `server.js` permanece como ponto de entrada fino: carrega `.env`, inicializa o banco e sobe o servidor.

## Multiempresa

O sistema usa o conceito de `tenant` para representar cada empresa contratante do CRM.

Exemplo:

```text
Tenant: Fundação Getulio Vargas
Domínio: fgv.br
Usuários: eduardo.de.mello@fgv.br, marina.admin@fgv.br, etc.
Clientes internos do tenant: Supermercados Guanabara, outras empresas, contatos e relacionamentos.
```

Todas as tabelas operacionais possuem `tenant_id`, impedindo que um usuário de uma empresa consulte dados de outra empresa.

## Papéis

```text
DEVELOPER      Administra a plataforma SaaS inteira.
ADMIN_MASTER   Controla completamente uma empresa contratante.
ADMIN          Administra usuários e dados, exceto algumas ações sensíveis.
MANAGER        Gerencia operação e relacionamento.
OPERATOR       Registra contatos e interações do dia a dia.
```

## Permissões

As permissões são checadas em duas camadas:

1. Frontend: menus e botões são escondidos.
2. Backend: cada rota exige permissão explícita.

Exemplo:

```text
GET /api/users exige users.read
POST /api/client-companies exige client_companies.create
DELETE /api/client-companies/:id exige client_companies.delete
```

## Modelo B2B de clientes

```text
client_companies
  ├── client_contacts
  └── client_interactions
```

A aba Clientes foi dividida em três telas:

- Empresas Clientes: organizações atendidas ou acompanhadas.
- Contatos: pessoas vinculadas às empresas.
- Relacionamentos: histórico de interações por e-mail, telefone, WhatsApp, reunião ou observação interna.

## Auditoria

A tabela `audit_logs` registra ações importantes, como:

- criação de tenant;
- criação de usuário;
- criação/edição/exclusão de empresa cliente;
- criação/edição/exclusão de contato;
- criação/edição/exclusão de relacionamento.
