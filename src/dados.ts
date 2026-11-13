// Carrega as questões e explicações (embutidas no código do Worker) no D1.
// Roda uma vez por instância: se a versão dos dados mudou desde o último
// deploy, atualiza a tabela `questoes`. Assim, um push no git que altere
// data/*.json chega ao banco sem nenhum comando manual.
import questoes from "../data/questoes.json";
import explicacoes from "../data/explicacoes.json";
import esquema from "../migrations/0001_init.sql";

type Questao = {
  id: string; ano: number; numero: number; area: string; enunciado: string;
  alternativas: Record<string, string>; gabarito: string | null; status: string;
  imagens: string[]; gabarito_oficial: string;
};

let pronto: Promise<void> | null = null;

export function garantirDados(db: D1Database): Promise<void> {
  if (!pronto) pronto = carregar(db).catch((e) => { pronto = null; throw e; });
  return pronto;
}

async function versaoDosDados(): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify([questoes, explicacoes]));
  const h = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(h)].slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function carregar(db: D1Database) {
  await db.prepare("CREATE TABLE IF NOT EXISTS meta (chave TEXT PRIMARY KEY, valor TEXT NOT NULL)").run();
  const versao = await versaoDosDados();
  const atual = await db.prepare("SELECT valor FROM meta WHERE chave = 'dados'").first<string>("valor");
  if (atual === versao) return;

  // Cria as tabelas que ainda não existem (mesmo SQL de migrations/).
  const comandos = esquema.split(";").map((c) => c.trim()).filter(Boolean)
    .map((c) => c.replace(/^CREATE (TABLE|INDEX) /, "CREATE $1 IF NOT EXISTS "));
  await db.batch(comandos.map((c) => db.prepare(c)));

  const exp = explicacoes as Record<string, unknown>;
  const sql = `INSERT INTO questoes (id, ano, numero, area, enunciado, alternativas, gabarito, status, imagens, gabarito_oficial, explicacao)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET ano = excluded.ano, numero = excluded.numero, area = excluded.area, enunciado = excluded.enunciado,
  alternativas = excluded.alternativas, gabarito = excluded.gabarito, status = excluded.status, imagens = excluded.imagens,
  gabarito_oficial = excluded.gabarito_oficial,
  explicacao_ativa = CASE WHEN questoes.explicacao IS excluded.explicacao THEN questoes.explicacao_ativa ELSE 1 END,
  explicacao = excluded.explicacao`;
  const stmt = db.prepare(sql);
  const lista = (questoes as Questao[]).map((q) =>
    stmt.bind(
      q.id, q.ano, q.numero, q.area, q.enunciado, JSON.stringify(q.alternativas), q.gabarito, q.status,
      JSON.stringify(q.imagens), q.gabarito_oficial, exp[q.id] ? JSON.stringify(exp[q.id]) : null,
    ),
  );
  for (let i = 0; i < lista.length; i += 50) await db.batch(lista.slice(i, i + 50));
  await db.prepare("INSERT INTO meta (chave, valor) VALUES ('dados', ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor")
    .bind(versao).run();
  console.log(`dados carregados: ${lista.length} questões, versão ${versao}`);
}
