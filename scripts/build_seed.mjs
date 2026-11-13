// Gera seed.sql a partir de data/questoes.json e data/explicacoes.json.
// Uso: node scripts/build_seed.mjs && npx wrangler d1 execute enamed --remote --file seed.sql
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const questoes = JSON.parse(readFileSync("data/questoes.json", "utf8"));
const explicacoes = existsSync("data/explicacoes.json") ? JSON.parse(readFileSync("data/explicacoes.json", "utf8")) : {};
const s = (v) => (v === null || v === undefined ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);

const linhas = questoes.map((q) => {
  const exp = explicacoes[q.id] ? JSON.stringify(explicacoes[q.id]) : null;
  return `INSERT INTO questoes (id, ano, numero, area, enunciado, alternativas, gabarito, status, imagens, gabarito_oficial, explicacao)
VALUES (${s(q.id)}, ${q.ano}, ${q.numero}, ${s(q.area)}, ${s(q.enunciado)}, ${s(JSON.stringify(q.alternativas))}, ${s(q.gabarito)}, ${s(q.status)}, ${s(JSON.stringify(q.imagens))}, ${s(q.gabarito_oficial)}, ${s(exp)})
ON CONFLICT(id) DO UPDATE SET ano = excluded.ano, numero = excluded.numero, area = excluded.area, enunciado = excluded.enunciado,
  alternativas = excluded.alternativas, gabarito = excluded.gabarito, status = excluded.status, imagens = excluded.imagens,
  gabarito_oficial = excluded.gabarito_oficial,
  explicacao_ativa = CASE WHEN questoes.explicacao IS excluded.explicacao THEN questoes.explicacao_ativa ELSE 1 END,
  explicacao = excluded.explicacao;`;
});
writeFileSync("seed.sql", linhas.join("\n") + "\n");
const comExp = questoes.filter((q) => explicacoes[q.id]).length;
console.log(`seed.sql: ${questoes.length} questões, ${comExp} com explicação`);
