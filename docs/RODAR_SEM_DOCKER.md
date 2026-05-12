# Rodar o CRM sem Docker e sem instalar PostgreSQL no Windows

Use este caminho quando o computador não permite instalar Docker ou PostgreSQL por falta de senha de administrador.

## Opção recomendada: PostgreSQL em nuvem

Você pode criar um banco PostgreSQL gratuito/em nuvem em provedores como Neon ou Supabase e usar a connection string no arquivo `.env`.

## Passo a passo

### 1. Criar o banco PostgreSQL

Crie um projeto em um provedor PostgreSQL em nuvem e copie a connection string do banco.

A string geralmente tem este formato:

```env
postgresql://usuario:senha@host/banco?sslmode=require
```

> Observação: muitos provedores em nuvem exigem SSL. Esta versão do projeto já detecta conexão não local e ativa SSL automaticamente no driver `pg`.

### 2. Criar o arquivo .env

Na pasta do projeto, rode no PowerShell:

```powershell
Copy-Item .env.cloud.example .env
notepad .env
```

Troque a linha `DATABASE_URL` pela connection string real do seu banco.

### 3. Instalar dependências

Como você está usando Node portátil no Windows, prefira `npm.cmd`:

```powershell
npm.cmd install
```

### 4. Iniciar o sistema

```powershell
npm.cmd start
```

Acesse:

```text
http://localhost:3000
```

Na primeira execução, o sistema cria as tabelas automaticamente e insere os usuários de teste.

## Logins de teste

Senha para todos:

```text
123456
```

- desenvolvedor@crm.local
- eduardo.de.mello@fgv.br
- marina.admin@fgv.br
- carla.gerente@fgv.br
- diego.operador@fgv.br

## Resetar o banco

Cuidado: apaga as tabelas do CRM no banco configurado.

```powershell
npm.cmd run db:reset
npm.cmd start
```

## Erro comum

Se aparecer:

```text
Falha ao iniciar banco de dados
```

confirme se:

1. o arquivo `.env` existe na pasta do projeto;
2. a `DATABASE_URL` está correta;
3. a senha da URL não contém caracteres especiais sem codificação;
4. a URL contém `sslmode=require`, quando o provedor exigir SSL.
