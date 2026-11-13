import {
  aleatorio,
  apagarSessao,
  COOKIE,
  cookieApagar,
  cookieSessao,
  criarSessao,
  hashSenha,
  iguais,
  lerCookie,
  usuarioDaSessao,
  type Usuario,
} from "./auth";

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  PRECO_MENSAL: string;
  DIAS_POR_PAGAMENTO: string;
  URL_BASE: string;
  MP_ACCESS_TOKEN?: string; // secret: npx wrangler secret put MP_ACCESS_TOKEN
}

const AREAS: Record<string, string> = {
  CM: "Clínica Médica",
  PED: "Pediatria",
  GO: "Ginecologia e Obstetrícia",
  CIR: "Cirurgia",
  MFC: "Medicina de Família e Comunidade",
  SM: "Saúde Mental",
  SC: "Saúde Coletiva",
};
const REPORTES_PARA_SUSPENDER = 3;

class ErroHttp extends Error {
  constructor(public status: number, msg: string) {
    super(msg);
  }
}

function json(dados: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(dados), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers },
  });
}

async function corpo<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new ErroHttp(400, "Corpo da requisição inválido.");
  }
}

function assinaturaAtiva(u: Usuario) {
  return u.admin === 1 || u.assinatura_ate > Date.now();
}

async function exigirUsuario(env: Env, req: Request) {
  const u = await usuarioDaSessao(env.DB, req);
  if (!u) throw new ErroHttp(401, "Faça login para continuar.");
  return u;
}

async function exigirAssinante(env: Env, req: Request) {
  const u = await exigirUsuario(env, req);
  if (!assinaturaAtiva(u)) throw new ErroHttp(402, "Sua assinatura não está ativa.");
  return u;
}

type LinhaQuestao = {
  id: string;
  ano: number;
  numero: number;
  area: string;
  enunciado: string;
  alternativas: string;
  gabarito: string | null;
  status: string;
  imagens: string;
  gabarito_oficial: string;
  explicacao: string | null;
  explicacao_ativa: number;
};

function questaoPublica(q: LinhaQuestao) {
  return {
    id: q.id,
    ano: q.ano,
    numero: q.numero,
    area: q.area,
    area_nome: AREAS[q.area] ?? q.area,
    enunciado: q.enunciado,
    alternativas: JSON.parse(q.alternativas),
    imagens: JSON.parse(q.imagens),
    gabarito_oficial: q.gabarito_oficial,
    fonte: `ENAMED ${q.ano} · Inep · Caderno 01, questão ${q.numero}`,
  };
}

// ---------- rotas ----------

async function cadastro(env: Env, req: Request, url: URL) {
  const { nome, email, senha } = await corpo<{ nome?: string; email?: string; senha?: string }>(req);
  const e = (email || "").trim().toLowerCase();
  if (!nome?.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new ErroHttp(400, "Informe nome e e-mail válidos.");
  if (!senha || senha.length < 8) throw new ErroHttp(400, "A senha precisa ter pelo menos 8 caracteres.");
  const existe = await env.DB.prepare("SELECT id FROM usuarios WHERE email = ?").bind(e).first();
  if (existe) throw new ErroHttp(409, "Já existe uma conta com esse e-mail.");
  const salt = aleatorio(16);
  const r = await env.DB.prepare(
    "INSERT INTO usuarios (nome, email, senha_hash, senha_salt, criado_em) VALUES (?, ?, ?, ?, ?) RETURNING id",
  )
    .bind(nome.trim(), e, await hashSenha(senha, salt), salt, Date.now())
    .first<{ id: number }>();
  const token = await criarSessao(env.DB, r!.id);
  return json({ ok: true }, 201, { "Set-Cookie": cookieSessao(token, url) });
}

async function login(env: Env, req: Request, url: URL) {
  const { email, senha } = await corpo<{ email?: string; senha?: string }>(req);
  const u = await env.DB.prepare("SELECT id, senha_hash, senha_salt FROM usuarios WHERE email = ?")
    .bind((email || "").trim().toLowerCase())
    .first<{ id: number; senha_hash: string; senha_salt: string }>();
  if (!u || !iguais(await hashSenha(senha || "", u.senha_salt), u.senha_hash))
    throw new ErroHttp(401, "E-mail ou senha incorretos.");
  const token = await criarSessao(env.DB, u.id);
  return json({ ok: true }, 200, { "Set-Cookie": cookieSessao(token, url) });
}

async function logout(env: Env, req: Request) {
  const token = lerCookie(req, COOKIE);
  if (token) await apagarSessao(env.DB, token);
  return json({ ok: true }, 200, { "Set-Cookie": cookieApagar() });
}

async function eu(env: Env, req: Request) {
  const u = await usuarioDaSessao(env.DB, req);
  if (!u) return json({ usuario: null, preco: env.PRECO_MENSAL, dias: Number(env.DIAS_POR_PAGAMENTO) });
  return json({
    usuario: { nome: u.nome, email: u.email, admin: u.admin === 1 },
    assinatura_ativa: assinaturaAtiva(u),
    assinatura_ate: u.assinatura_ate || null,
    preco: env.PRECO_MENSAL,
    dias: Number(env.DIAS_POR_PAGAMENTO),
  });
}

async function areas(env: Env, req: Request) {
  const u = await exigirAssinante(env, req);
  const { results } = await env.DB.prepare(
    `SELECT q.area, q.ano, COUNT(*) AS total,
            SUM(CASE WHEN EXISTS (SELECT 1 FROM respostas r WHERE r.questao_id = q.id AND r.usuario_id = ?) THEN 1 ELSE 0 END) AS feitas
     FROM questoes q WHERE q.status = 'ativa' GROUP BY q.area, q.ano`,
  )
    .bind(u.id)
    .all<{ area: string; ano: number; total: number; feitas: number }>();
  return json({ areas: AREAS, contagem: results });
}

async function proxima(env: Env, req: Request, url: URL) {
  const u = await exigirAssinante(env, req);
  const area = url.searchParams.get("area");
  const ano = url.searchParams.get("ano");
  const modo = url.searchParams.get("modo") || "ineditas"; // ineditas | todas | erradas
  const pular = url.searchParams.get("pular"); // id da questão atual, para não repetir
  const conds = ["q.status = 'ativa'"];
  const params: unknown[] = [];
  if (area && AREAS[area]) {
    conds.push("q.area = ?");
    params.push(area);
  }
  if (ano === "2025" || ano === "2026") {
    conds.push("q.ano = ?");
    params.push(Number(ano));
  }
  if (pular) {
    conds.push("q.id <> ?");
    params.push(pular);
  }
  if (modo === "ineditas") {
    conds.push("NOT EXISTS (SELECT 1 FROM respostas r WHERE r.questao_id = q.id AND r.usuario_id = ?)");
    params.push(u.id);
  } else if (modo === "erradas") {
    conds.push(
      `(SELECT r.correta FROM respostas r WHERE r.questao_id = q.id AND r.usuario_id = ?
        ORDER BY r.criado_em DESC LIMIT 1) = 0`,
    );
    params.push(u.id);
  }
  const q = await env.DB.prepare(`SELECT * FROM questoes q WHERE ${conds.join(" AND ")} ORDER BY RANDOM() LIMIT 1`)
    .bind(...params)
    .first<LinhaQuestao>();
  if (!q) return json({ questao: null });
  return json({ questao: questaoPublica(q) });
}

async function obterQuestao(env: Env, req: Request, id: string) {
  await exigirAssinante(env, req);
  const q = await env.DB.prepare("SELECT * FROM questoes WHERE id = ? AND status = 'ativa'").bind(id).first<LinhaQuestao>();
  if (!q) throw new ErroHttp(404, "Questão não encontrada.");
  return json({ questao: questaoPublica(q) });
}

async function responder(env: Env, req: Request, id: string) {
  const u = await exigirAssinante(env, req);
  const { alternativa, tempo_ms } = await corpo<{ alternativa?: string; tempo_ms?: number }>(req);
  if (!alternativa || !"ABCD".includes(alternativa) || alternativa.length !== 1)
    throw new ErroHttp(400, "Alternativa inválida.");
  const q = await env.DB.prepare("SELECT * FROM questoes WHERE id = ? AND status = 'ativa'").bind(id).first<LinhaQuestao>();
  if (!q || !q.gabarito) throw new ErroHttp(404, "Questão não encontrada.");
  const correta = alternativa === q.gabarito;
  await env.DB.prepare(
    "INSERT INTO respostas (usuario_id, questao_id, alternativa, correta, tempo_ms, criado_em) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(u.id, id, alternativa, correta ? 1 : 0, Math.max(0, Math.min(Number(tempo_ms) || 0, 3_600_000)), Date.now())
    .run();
  const dist = await env.DB.prepare(
    "SELECT alternativa, COUNT(*) AS n FROM respostas WHERE questao_id = ? GROUP BY alternativa",
  )
    .bind(id)
    .all<{ alternativa: string; n: number }>();
  return json({
    correta,
    gabarito: q.gabarito,
    gabarito_oficial: q.gabarito_oficial,
    explicacao: q.explicacao && q.explicacao_ativa ? JSON.parse(q.explicacao) : null,
    distribuicao: dist.results,
  });
}

async function reportar(env: Env, req: Request, id: string) {
  const u = await exigirAssinante(env, req);
  const { texto } = await corpo<{ texto?: string }>(req);
  if (!texto?.trim()) throw new ErroHttp(400, "Descreva o problema.");
  const q = await env.DB.prepare("SELECT id FROM questoes WHERE id = ?").bind(id).first();
  if (!q) throw new ErroHttp(404, "Questão não encontrada.");
  await env.DB.prepare("INSERT INTO reportes (usuario_id, questao_id, texto, criado_em) VALUES (?, ?, ?, ?)")
    .bind(u.id, id, texto.trim().slice(0, 2000), Date.now())
    .run();
  // Com N reportes de usuários diferentes, a explicação sai do ar até ser corrigida.
  const n = await env.DB.prepare("SELECT COUNT(DISTINCT usuario_id) AS n FROM reportes WHERE questao_id = ?")
    .bind(id)
    .first<{ n: number }>();
  if ((n?.n ?? 0) >= REPORTES_PARA_SUSPENDER)
    await env.DB.prepare("UPDATE questoes SET explicacao_ativa = 0 WHERE id = ?").bind(id).run();
  return json({ ok: true });
}

async function desempenho(env: Env, req: Request) {
  const u = await exigirAssinante(env, req);
  // Considera a última resposta de cada questão.
  const { results } = await env.DB.prepare(
    `WITH ultimas AS (
       SELECT r.questao_id, r.correta,
              ROW_NUMBER() OVER (PARTITION BY r.questao_id ORDER BY r.criado_em DESC) AS rn
       FROM respostas r WHERE r.usuario_id = ?)
     SELECT q.area, COUNT(*) AS feitas, SUM(u.correta) AS acertos
     FROM ultimas u JOIN questoes q ON q.id = u.questao_id
     WHERE u.rn = 1 GROUP BY q.area`,
  )
    .bind(u.id)
    .all<{ area: string; feitas: number; acertos: number }>();
  const totais = await env.DB.prepare(
    "SELECT area, COUNT(*) AS total FROM questoes WHERE status = 'ativa' GROUP BY area",
  ).all<{ area: string; total: number }>();
  const hoje = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM respostas WHERE usuario_id = ? AND criado_em > ?",
  )
    .bind(u.id, Date.now() - 86400_000)
    .first<{ n: number }>();
  return json({ areas: AREAS, por_area: results, totais: totais.results, ultimas_24h: hoje?.n ?? 0 });
}

async function erros(env: Env, req: Request) {
  const u = await exigirAssinante(env, req);
  const { results } = await env.DB.prepare(
    `WITH ultimas AS (
       SELECT r.questao_id, r.correta, r.alternativa, r.criado_em,
              ROW_NUMBER() OVER (PARTITION BY r.questao_id ORDER BY r.criado_em DESC) AS rn
       FROM respostas r WHERE r.usuario_id = ?)
     SELECT q.id, q.ano, q.numero, q.area, substr(q.enunciado, 1, 180) AS inicio, u.alternativa, u.criado_em
     FROM ultimas u JOIN questoes q ON q.id = u.questao_id
     WHERE u.rn = 1 AND u.correta = 0 AND q.status = 'ativa'
     ORDER BY u.criado_em DESC`,
  )
    .bind(u.id)
    .all();
  return json({ areas: AREAS, erros: results });
}

// ---------- pagamento (Mercado Pago Checkout Pro, aceita Pix) ----------

async function checkout(env: Env, req: Request) {
  const u = await exigirUsuario(env, req);
  if (!env.MP_ACCESS_TOKEN) throw new ErroHttp(503, "Pagamento ainda não configurado.");
  const base = env.URL_BASE.replace(/\/$/, "");
  const r = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.MP_ACCESS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      items: [
        {
          title: `Questões ENAMED - acesso por ${env.DIAS_POR_PAGAMENTO} dias`,
          quantity: 1,
          unit_price: Number(env.PRECO_MENSAL),
          currency_id: "BRL",
        },
      ],
      payer: { email: u.email },
      external_reference: String(u.id),
      back_urls: { success: `${base}/#/assinatura?ok=1`, pending: `${base}/#/assinatura`, failure: `${base}/#/assinatura` },
      auto_return: "approved",
      notification_url: `${base}/api/pagamento/webhook`,
    }),
  });
  if (!r.ok) throw new ErroHttp(502, "Não foi possível iniciar o pagamento.");
  const pref = (await r.json()) as { init_point: string };
  return json({ url: pref.init_point });
}

async function webhook(env: Env, req: Request, url: URL) {
  if (!env.MP_ACCESS_TOKEN) return json({ ok: false }, 503);
  let id = url.searchParams.get("data.id") || url.searchParams.get("id");
  let tipo = url.searchParams.get("type") || url.searchParams.get("topic");
  try {
    const b = (await req.json()) as { type?: string; data?: { id?: string } };
    id = b?.data?.id ?? id;
    tipo = b?.type ?? tipo;
  } catch {
    /* notificação sem corpo */
  }
  if (tipo !== "payment" || !id) return json({ ok: true });
  // Nunca confia no corpo da notificação: consulta o pagamento direto no Mercado Pago.
  const r = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${env.MP_ACCESS_TOKEN}` },
  });
  if (!r.ok) return json({ ok: false }, 502);
  const p = (await r.json()) as { id: number; status: string; external_reference: string; transaction_amount: number };
  const usuarioId = Number(p.external_reference);
  if (!usuarioId) return json({ ok: true });
  await env.DB.prepare(
    `INSERT INTO pagamentos (id, usuario_id, status, valor, criado_em) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET status = excluded.status`,
  )
    .bind(String(p.id), usuarioId, p.status, p.transaction_amount, Date.now())
    .run();
  if (p.status === "approved" && p.transaction_amount >= Number(env.PRECO_MENSAL)) {
    // processado = 0 -> 1 garante que o mesmo pagamento só estende a assinatura uma vez.
    const marcou = await env.DB.prepare("UPDATE pagamentos SET processado = 1 WHERE id = ? AND processado = 0")
      .bind(String(p.id))
      .run();
    if (marcou.meta.changes === 1) {
      const dias = Number(env.DIAS_POR_PAGAMENTO) * 86400_000;
      await env.DB.prepare(
        "UPDATE usuarios SET assinatura_ate = MAX(assinatura_ate, ?) + ? WHERE id = ?",
      )
        .bind(Date.now(), dias, usuarioId)
        .run();
    }
  }
  return json({ ok: true });
}

// ---------- roteador ----------

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const p = url.pathname;
    if (!p.startsWith("/api/")) return env.ASSETS.fetch(req);
    try {
      const m = req.method;
      if (m === "POST" && p === "/api/cadastro") return await cadastro(env, req, url);
      if (m === "POST" && p === "/api/login") return await login(env, req, url);
      if (m === "POST" && p === "/api/logout") return await logout(env, req);
      if (m === "GET" && p === "/api/eu") return await eu(env, req);
      if (m === "GET" && p === "/api/areas") return await areas(env, req);
      if (m === "GET" && p === "/api/questoes/proxima") return await proxima(env, req, url);
      if (m === "GET" && p === "/api/desempenho") return await desempenho(env, req);
      if (m === "GET" && p === "/api/erros") return await erros(env, req);
      if (m === "POST" && p === "/api/pagamento/checkout") return await checkout(env, req);
      if (m === "POST" && p === "/api/pagamento/webhook") return await webhook(env, req, url);
      const qm = p.match(/^\/api\/questoes\/([\w-]+)(\/responder|\/reportar)?$/);
      if (qm) {
        if (m === "GET" && !qm[2]) return await obterQuestao(env, req, qm[1]);
        if (m === "POST" && qm[2] === "/responder") return await responder(env, req, qm[1]);
        if (m === "POST" && qm[2] === "/reportar") return await reportar(env, req, qm[1]);
      }
      return json({ erro: "Rota não encontrada." }, 404);
    } catch (e) {
      if (e instanceof ErroHttp) return json({ erro: e.message }, e.status);
      console.error(e);
      return json({ erro: "Erro interno." }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
