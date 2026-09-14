const { Pool } = require('pg');

// String de conexão padrão aponta para o Postgres local usado neste
// ambiente de demonstração (veja db/schema.sql e db/seed.sql). Em outro
// ambiente, defina DATABASE_URL (ex.: a mesma instância que o OutSystems
// ODC vai usar como External Database).
const connectionString =
  process.env.DATABASE_URL || 'postgres://comunicador:comunicador@localhost:5432/comunicador';

const pool = new Pool({ connectionString });

module.exports = pool;
