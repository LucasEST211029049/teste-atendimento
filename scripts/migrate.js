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

// Idempotente: só roda schema+seed se as tabelas ainda não existirem, para
// nunca resetar dados de uma instância já em uso (ex.: a cada restart do
// free tier do Render após período de inatividade).
async function ensureMigrado() {
  if (await jaExisteSchema()) return false;
  await aplicar('schema.sql');
  await aplicar('seed.sql');
  return true;
}

if (require.main === module) {
  (async () => {
    try {
      await aplicar('schema.sql');
      await aplicar('seed.sql');
    } catch (err) {
      console.error(err);
      process.exitCode = 1;
    } finally {
      await pool.end();
    }
  })();
}

module.exports = { ensureMigrado };
