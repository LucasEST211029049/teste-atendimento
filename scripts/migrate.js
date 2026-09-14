// Aplica db/schema.sql e db/seed.sql usando o driver `pg` (sem depender do
// binário `psql` estar instalado no host — importante em plataformas como
// Render, onde a imagem do runtime Node pode não trazer o cliente psql).
const fs = require('fs');
const path = require('path');
const pool = require('../server/db');

async function aplicar(arquivo) {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'db', arquivo), 'utf-8');
  await pool.query(sql);
  console.log(`Aplicado: db/${arquivo}`);
}

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
