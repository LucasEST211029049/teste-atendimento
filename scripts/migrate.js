// Aplica db/schema.sql e db/seed.sql usando o driver `pg` (sem depender do
// binário `psql` estar instalado no host). Também é chamado automaticamente
// pelo server/index.js na subida do app — necessário porque planos free do
// Render não executam `preDeployCommand` do render.yaml.
const fs = require('fs');
const path = require('path');
const pool = require('../server/db');

async function aplicar(arquivo) {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'db', arquivo), 'utf-8');
  await pool.query(sql);
  console.log(`Aplicado: db/${arquivo}`);
}

async function jaExisteSchema() {
  const { rows } = await pool.query("SELECT to_regclass('public.areas') AS existe");
  return rows[0].existe !== null;
}

// Idempotente: schema+seed só rodam se as tabelas ainda não existirem
// (nunca reseta dados de uma instância já em uso — ex.: a cada restart do
// free tier do Render após período de inatividade). Já functions.sql
// SEMPRE roda, mesmo com o schema já existente: são só CREATE OR REPLACE
// FUNCTION, não apagam dado nenhum, e é assim que correções de função
// (ex.: aceitar CPF sem pontuação) chegam a um banco que já tinha dados
// antes da correção existir.
async function ensureMigrado() {
  const jaExiste = await jaExisteSchema();
  if (!jaExiste) {
    await aplicar('schema.sql');
    await aplicar('seed.sql');
  }
  await aplicar('functions.sql');
  return !jaExiste;
}

if (require.main === module) {
  (async () => {
    try {
      await aplicar('schema.sql');
      await aplicar('seed.sql');
      await aplicar('functions.sql');
    } catch (err) {
      console.error(err);
      process.exitCode = 1;
    } finally {
      await pool.end();
    }
  })();
}

// Reaplica só o seed (schema e funções continuam como estão) — usado pelo
// endpoint de reset, para voltar a base de demonstração ao estado inicial
// sob demanda, sem precisar de acesso direto ao Postgres.
async function resetarSeed() {
  await aplicar('seed.sql');
}

module.exports = { ensureMigrado, resetarSeed };
