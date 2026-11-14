// Front-end sem build: roteamento por hash e chamadas à API do Worker.
const app = document.getElementById("app");
const nav = document.getElementById("nav");
let sessao = null; // resposta de /api/eu

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
// Texto em parágrafos; linhas com tabulação viram tabela (exames laboratoriais).
const paragrafos = (t) => {
  let html = "";
  let tabela = [];
  const fechar = () => {
    if (!tabela.length) return;
    html += `<div class="tabela"><table>${tabela
      .map((l, i) => `<tr>${l.split("\t").map((c) => (i === 0 ? `<th>${esc(c)}</th>` : `<td>${esc(c)}</td>`)).join("")}</tr>`)
      .join("")}</table></div>`;
    tabela = [];
  };
  for (const l of String(t ?? "").split(/\n+/)) {
    if (!l.trim()) continue;
    if (l.includes("\t")) tabela.push(l);
    else { fechar(); html += `<p>${esc(l)}</p>`; }
  }
  fechar();
  return html;
};
const brl = (v) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const data = (ms) => new Date(ms).toLocaleDateString("pt-BR");

async function api(caminho, opcoes = {}) {
  const r = await fetch(caminho, {
    ...opcoes,
    headers: { "Content-Type": "application/json", ...(opcoes.headers || {}) },
    body: opcoes.body ? JSON.stringify(opcoes.body) : undefined,
  });
  const dados = await r.json().catch(() => ({}));
  if (r.status === 401) { sessao = null; location.hash = "#/entrar"; throw new Error(dados.erro || "Faça login."); }
  if (r.status === 402) { location.hash = "#/assinatura"; throw new Error(dados.erro || "Assinatura inativa."); }
  if (!r.ok) throw new Error(dados.erro || "Algo deu errado.");
  return dados;
}

async function carregarSessao() {
  sessao = await api("/api/eu");
}

function desenharNav(rota) {
  const u = sessao?.usuario;
  const link = (h, t) => `<a href="#/${h}" class="${rota === h ? "ativo" : ""}">${t}</a>`;
  if (!u) {
    nav.innerHTML = link("entrar", "Entrar") + link("cadastro", "Criar conta");
    return;
  }
  nav.innerHTML =
    (sessao.assinatura_ativa ? link("estudar", "Estudar") + link("revisar", "Revisar") + link("desempenho", "Desempenho") + link("erros", "Meus erros") : "") +
    link("assinatura", "Assinatura") +
    `<button id="sair">Sair</button>`;
  document.getElementById("sair").onclick = async () => {
    await api("/api/logout", { method: "POST" });
    sessao = null;
    location.hash = "#/";
    rotear();
  };
}

// ---------- telas ----------

function telaInicio() {
  const preco = sessao?.preco ? brl(sessao.preco) : "";
  app.innerHTML = `
  <section class="hero">
    <div>
      <h1>Estude para o ENAMED resolvendo questões, uma de cada vez.</h1>
      <p class="sub">As provas oficiais de 2025 e 2026, organizadas por área, com gabarito e explicação logo depois de cada resposta.</p>
      <div class="acoes"><a class="botao" href="#/cadastro">Criar conta</a><a class="botao sec" href="#/entrar">Já tenho conta</a></div>
    </div>
    <div class="cartao">
      <h2>O que você recebe</h2>
      <ul>
        <li>200 questões oficiais do ENAMED (2025 e 2026), com imagens</li>
        <li>Filtros por área: Clínica Médica, Pediatria, GO, Cirurgia, MFC, Saúde Mental e Saúde Coletiva</li>
        <li>Explicação de cada alternativa, gerada por IA</li>
        <li>Desempenho por área e caderno de erros para refazer</li>
      </ul>
      <p class="preco" style="margin:16px 0 0">${preco} <small>por ${sessao?.dias ?? 30} dias de acesso, pago por Pix ou cartão</small></p>
    </div>
  </section>`;
}

function telaForm(tipo) {
  const cad = tipo === "cadastro";
  app.innerHTML = `
  <div class="cartao" style="max-width:440px;margin:0 auto">
    <h1>${cad ? "Criar conta" : "Entrar"}</h1>
    <form class="form" id="f">
      ${cad ? `<label>Nome<input name="nome" required autocomplete="name"></label>` : ""}
      <label>E-mail<input name="email" type="email" required autocomplete="email"></label>
      <label>Senha<input name="senha" type="password" required minlength="${cad ? 8 : 1}" autocomplete="${cad ? "new-password" : "current-password"}"></label>
      <p class="erro-msg" id="msg"></p>
      <button class="botao">${cad ? "Criar conta" : "Entrar"}</button>
    </form>
    <p class="sub" style="margin:16px 0 0">${cad ? `Já tem conta? <a href="#/entrar">Entrar</a>` : `Ainda não tem conta? <a href="#/cadastro">Criar conta</a>`}</p>
  </div>`;
  const f = document.getElementById("f");
  f.onsubmit = async (e) => {
    e.preventDefault();
    const btn = f.querySelector("button");
    btn.disabled = true;
    try {
      await api(cad ? "/api/cadastro" : "/api/login", { method: "POST", body: Object.fromEntries(new FormData(f)) });
      await carregarSessao();
      location.hash = sessao.assinatura_ativa ? "#/estudar" : "#/assinatura";
    } catch (err) {
      document.getElementById("msg").textContent = err.message;
      btn.disabled = false;
    }
  };
}

function telaAssinatura() {
  if (!sessao?.usuario) return (location.hash = "#/entrar");
  const ativa = sessao.assinatura_ativa;
  const voltou = location.hash.includes("ok=1");
  app.innerHTML = `
  <div class="cartao" style="max-width:520px;margin:0 auto">
    <h1>Assinatura</h1>
    ${
      ativa
        ? `<p>Seu acesso está ativo${sessao.assinatura_ate ? ` até <b>${data(sessao.assinatura_ate)}</b>` : ""}.</p>
           <div class="acoes"><a class="botao" href="#/estudar">Ir para as questões</a><button class="botao sec" id="pagar">Renovar por mais ${sessao.dias} dias</button></div>`
        : `<p class="sub">${voltou ? "Recebemos seu retorno do pagamento. A liberação acontece assim que o Mercado Pago confirmar; com Pix costuma levar menos de um minuto." : "Para acessar as questões, ative seu acesso."}</p>
           <p class="preco">${brl(sessao.preco)} <small>por ${sessao.dias} dias</small></p>
           <div class="acoes"><button class="botao" id="pagar">Pagar com Pix ou cartão</button>${voltou ? `<button class="botao sec" id="atualizar">Já paguei, verificar</button>` : ""}</div>`
    }
    <p class="erro-msg" id="msg" style="margin-top:12px"></p>
  </div>`;
  const pagar = document.getElementById("pagar");
  if (pagar)
    pagar.onclick = async () => {
      pagar.disabled = true;
      try {
        const { url } = await api("/api/pagamento/checkout", { method: "POST" });
        location.href = url;
      } catch (err) {
        document.getElementById("msg").textContent = err.message;
        pagar.disabled = false;
      }
    };
  const atualizar = document.getElementById("atualizar");
  if (atualizar) atualizar.onclick = async () => { await carregarSessao(); rotear(); };
}

// --- estudo ---
const filtro = { area: "", tema: "", ano: "", modo: "ineditas" };
try { Object.assign(filtro, JSON.parse(localStorage.getItem("filtro") || "{}")); } catch {}

async function telaEstudar(idFixo) {
  if (!sessao?.assinatura_ativa) return (location.hash = sessao?.usuario ? "#/assinatura" : "#/entrar");
  const { areas, contagem } = await api("/api/areas");
  const total = (a) => contagem.filter((c) => !a || c.area === a).reduce((s, c) => s + c.total, 0);
  app.innerHTML = `
  <div class="filtros">
    <select id="fArea" aria-label="Área"><option value="">Todas as áreas (${total("")})</option>
      ${Object.entries(areas).map(([k, v]) => `<option value="${k}">${v} (${total(k)})</option>`).join("")}</select>
    <select id="fTema" aria-label="Tema"></select>
    <select id="fAno" aria-label="Ano"><option value="">2025 e 2026</option><option>2025</option><option>2026</option></select>
    <select id="fModo" aria-label="Quais questões">
      <option value="ineditas">Só as que não fiz</option><option value="todas">Todas</option><option value="erradas">Só as que errei</option></select>
  </div>
  <div id="questao"></div>`;
  const fTema = document.getElementById("fTema");
  const montarTemas = () => {
    const ts = {};
    contagem.filter((c) => c.area === filtro.area && c.tema).forEach((c) => (ts[c.tema] = (ts[c.tema] || 0) + c.total));
    fTema.innerHTML = `<option value="">Todos os temas</option>` +
      Object.entries(ts).sort((a, b) => a[0].localeCompare(b[0], "pt")).map(([t, n]) => `<option value="${esc(t)}">${esc(t)} (${n})</option>`).join("");
    fTema.hidden = !filtro.area;
    if (!ts[filtro.tema]) filtro.tema = "";
  };
  montarTemas();
  for (const [id, k] of [["fArea", "area"], ["fTema", "tema"], ["fAno", "ano"], ["fModo", "modo"]]) {
    const el = document.getElementById(id);
    el.value = filtro[k];
    el.onchange = () => {
      filtro[k] = el.value;
      if (k === "area") { filtro.tema = ""; montarTemas(); }
      try { localStorage.setItem("filtro", JSON.stringify(filtro)); } catch {}
      proximaQuestao();
    };
  }
  if (idFixo) {
    const { questao } = await api(`/api/questoes/${encodeURIComponent(idFixo)}`);
    mostrarQuestao(questao);
  } else proximaQuestao();
}

let atual = null;
async function proximaQuestao() {
  const p = new URLSearchParams({ modo: filtro.modo });
  if (filtro.area) p.set("area", filtro.area);
  if (filtro.tema) p.set("tema", filtro.tema);
  if (filtro.ano) p.set("ano", filtro.ano);
  if (atual) p.set("pular", atual.id);
  const { questao } = await api(`/api/questoes/proxima?${p}`);
  if (!questao) {
    document.getElementById("questao").innerHTML = `<div class="cartao vazio">
      ${filtro.modo === "ineditas" ? "Você já fez todas as questões deste filtro. Troque para “Todas” ou “Só as que errei”." : filtro.modo === "erradas" ? "Nenhuma questão errada neste filtro. Muito bem!" : "Nenhuma questão encontrada."}</div>`;
    return;
  }
  mostrarQuestao(questao);
}

function mostrarQuestao(q) {
  atual = q;
  window.scrollTo({ top: 0 });
  const inicio = Date.now();
  let escolhida = null;
  let respondida = false;
  const box = document.getElementById("questao");
  box.innerHTML = `
  <article class="cartao">
    <div class="meta"><span class="tag">${esc(q.area_nome)}</span><span>${esc(q.fonte)}</span>
      ${q.gabarito_oficial === "preliminar" ? `<span class="tag aviso" title="O gabarito definitivo de 2026 sai em 04/12/2026">gabarito preliminar</span>` : ""}</div>
    <div class="enunciado">${paragrafos(q.enunciado)}${q.imagens.map((i) => `<img src="/img/${esc(i)}" alt="Imagem da questão" loading="lazy">`).join("")}</div>
    <div class="alts" role="radiogroup">
      ${Object.entries(q.alternativas).map(([l, t]) => `<button class="alt" data-l="${l}" role="radio" aria-checked="false"><span class="letra">${l}</span><span>${esc(t)}</span><span class="pct"></span></button>`).join("")}
    </div>
    <div id="res"></div>
    <div class="acoes" id="acoes"><button class="botao" id="responder" disabled>Responder</button><button class="botao sec" id="pular">Pular</button></div>
    <div id="exp"></div>
  </article>`;
  const botoes = [...box.querySelectorAll(".alt")];
  const escolher = (l) => {
    if (respondida) return;
    escolhida = l;
    botoes.forEach((b) => { const s = b.dataset.l === l; b.classList.toggle("sel", s); b.setAttribute("aria-checked", s); });
    document.getElementById("responder").disabled = false;
  };
  botoes.forEach((b) => (b.onclick = () => escolher(b.dataset.l)));
  document.getElementById("pular").onclick = proximaQuestao;
  const responder = async () => {
    if (!escolhida || respondida) return;
    respondida = true;
    document.getElementById("responder").disabled = true;
    try {
      const r = await api(`/api/questoes/${q.id}/responder`, { method: "POST", body: { alternativa: escolhida, tempo_ms: Date.now() - inicio } });
      mostrarResultado(q, escolhida, r, botoes);
    } catch (err) {
      respondida = false;
      document.getElementById("res").innerHTML = `<p class="erro-msg">${esc(err.message)}</p>`;
      document.getElementById("responder").disabled = false;
    }
  };
  document.getElementById("responder").onclick = responder;
  document.onkeydown = (e) => {
    if (e.target.closest?.("input, textarea, select, dialog")) return;
    const k = e.key.toUpperCase();
    if ("ABCD".includes(k) && k.length === 1) escolher(k);
    else if (e.key === "Enter") respondida ? proximaQuestao() : responder();
  };
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function mostrarResultado(q, escolhida, r, botoes) {
  const totalResp = r.distribuicao.reduce((s, d) => s + d.n, 0) || 1;
  botoes.forEach((b) => {
    const l = b.dataset.l;
    b.disabled = true;
    b.classList.remove("sel");
    if (l === r.gabarito) b.classList.add("certa");
    else if (l === escolhida) b.classList.add("errada");
    const n = r.distribuicao.find((d) => d.alternativa === l)?.n || 0;
    b.querySelector(".pct").textContent = `${Math.round((n / totalResp) * 100)}%`;
    b.querySelector(".pct").title = "Quantos alunos marcaram esta alternativa";
  });
  document.getElementById("res").innerHTML = `<p class="resultado ${r.correta ? "ok" : "nok"}">${r.correta ? "Você acertou!" : `Resposta certa: ${r.gabarito}`}</p>`;
  document.getElementById("acoes").innerHTML = `<button class="botao" id="prox">Próxima questão →</button><button class="botao sec peq" id="rep">Reportar erro</button>`;
  document.getElementById("prox").onclick = proximaQuestao;
  document.getElementById("rep").onclick = () => reportar(q);
  const e = r.explicacao;
  document.getElementById("exp").innerHTML = e
    ? `<section class="explicacao">
        <p class="aviso-ia">Explicação gerada por IA, pode conter erros. O gabarito é o oficial do Inep${r.gabarito_oficial === "preliminar" ? " (preliminar)" : ""}.</p>
        <h3>Raciocínio</h3>${paragrafos(e.resumo)}
        <h3>Alternativas</h3>
        <div class="por-alt">${Object.entries(e.alternativas || {}).map(([l, t]) => `<div><b>${l})</b> ${esc(t)}</div>`).join("")}</div>
        ${e.ponto_chave ? `<h3>Ponto-chave</h3><p class="chave">${esc(e.ponto_chave)}</p>` : ""}
        ${e.referencia ? `<p class="num" style="margin-top:12px">Referência: ${esc(e.referencia)}</p>` : ""}
      </section>`
    : `<section class="explicacao"><p class="sub">A explicação desta questão está em revisão. O gabarito oficial acima vale normalmente.</p></section>`;
  // segundo botão no fim da explicação, para não precisar voltar ao topo
  document.getElementById("exp").insertAdjacentHTML("beforeend", `<div class="acoes" style="margin-top:20px"><button class="botao" id="prox2">Próxima questão →</button></div>`);
  document.getElementById("prox2").onclick = proximaQuestao;
}

function reportar(q) {
  const d = document.createElement("dialog");
  d.innerHTML = `<form method="dialog" class="form" style="max-width:none">
    <h2>Reportar erro</h2><p class="sub" style="margin:0">O que está errado no enunciado, no gabarito ou na explicação?</p>
    <textarea required maxlength="2000"></textarea><p class="erro-msg"></p>
    <div class="acoes"><button class="botao" value="ok">Enviar</button><button class="botao sec" value="cancel" formnovalidate>Cancelar</button></div></form>`;
  document.body.append(d);
  d.showModal();
  d.querySelector("form").onsubmit = async (ev) => {
    if (ev.submitter?.value !== "ok") return d.remove();
    ev.preventDefault();
    try {
      await api(`/api/questoes/${q.id}/reportar`, { method: "POST", body: { texto: d.querySelector("textarea").value } });
      d.querySelector(".form").innerHTML = `<h2>Obrigado!</h2><p>Vamos corrigir essa questão.</p><button class="botao" value="ok">Fechar</button>`;
      d.querySelector(".form").onsubmit = () => d.remove();
    } catch (err) {
      d.querySelector(".erro-msg").textContent = err.message;
    }
  };
  d.addEventListener("close", () => d.remove());
}

async function telaDesempenho() {
  if (!sessao?.assinatura_ativa) return (location.hash = "#/assinatura");
  const { areas, temas, semanas, geral } = await api("/api/desempenho");
  const pct = (a, n) => (n ? Math.round((a / n) * 100) : null);
  const soma = (l, k) => l.reduce((s, x) => s + (x[k] || 0), 0);
  const feitas = soma(temas, "feitas"), acertos = soma(temas, "acertos"), total = soma(temas, "total");
  const media = (l) => {
    const n = soma(l, "n_alunos");
    return n ? Math.round(l.reduce((s, x) => s + (x.media_alunos || 0) * x.n_alunos, 0) / n) : null;
  };
  const seg = (ms) => (ms ? `${Math.round(ms / 1000)} s` : "–");

  // linha com barra do aluno e marca da média dos alunos
  const linha = (nome, a, f, t, m, extra = "") => {
    const p = pct(a, f);
    const dica = `${nome}: ${p === null ? "não iniciado" : `${p}% de acerto em ${f} questões`}${m !== null ? ` · média dos alunos ${m}%` : ""}`;
    return `<div class="linha-area" title="${esc(dica)}"><span>${esc(nome)}${extra}</span>
      <div class="barra">${p !== null ? `<span style="width:${p}%"></span>` : ""}${m !== null ? `<i class="media" style="left:${m}%"></i>` : ""}</div>
      <span class="num">${p === null ? `0/${t} feitas` : `${p}% · ${f}/${t}`}</span></div>`;
  };

  // evolução semanal (8 semanas, mais antiga à esquerda)
  const sem = Array.from({ length: 8 }, (_, i) => semanas.find((s) => s.semana === 7 - i) || { semana: 7 - i, respostas: 0, acertos: 0 });
  const rotSem = (n) => (n === 0 ? "esta" : n === 1 ? "passada" : `há ${n}`);
  const evolucao = sem.some((s) => s.respostas)
    ? `<div class="colunas">${sem.map((s) => {
        const p = pct(s.acertos, s.respostas);
        return `<div class="coluna" title="${esc(`Semana ${rotSem(s.semana)}: ${s.respostas} respostas${p !== null ? `, ${p}% de acerto` : ""}`)}">
          <span class="v">${p === null ? "" : p + "%"}</span>
          <div class="trilho"><span style="height:${p ?? 0}%"></span></div>
          <span class="r">${rotSem(s.semana)}</span><span class="r">${s.respostas || ""}</span></div>`;
      }).join("")}</div>
      <p class="nota">Altura = % de acerto na semana. Embaixo, quantas questões você respondeu.</p>`
    : `<p class="sub" style="margin:0">Responda algumas questões para ver sua evolução semana a semana.</p>`;

  // onde focar: temas com pelo menos 3 feitas e menor acerto; depois temas não iniciados
  const fracos = temas.filter((t) => t.feitas >= 3).map((t) => ({ ...t, p: pct(t.acertos, t.feitas) }))
    .filter((t) => t.p < 70).sort((a, b) => a.p - b.p).slice(0, 4);
  const naoIniciados = temas.filter((t) => !t.feitas).sort((a, b) => b.total - a.total).slice(0, 4 - fracos.length);
  const foco = [...fracos.map((t) => ({ ...t, motivo: `${t.p}% de acerto` })), ...naoIniciados.map((t) => ({ ...t, motivo: "ainda não começou" }))];

  const porArea = Object.entries(areas).map(([k, nome]) => {
    const l = temas.filter((t) => t.area === k);
    return { k, nome, l, f: soma(l, "feitas"), a: soma(l, "acertos"), t: soma(l, "total"), m: media(l) };
  });

  app.innerHTML = `
  <h1>Desempenho</h1>
  <div class="kpis">
    <div class="kpi"><b>${feitas ? pct(acertos, feitas) + "%" : "–"}</b><span>de acerto geral${media(temas) !== null ? ` · média dos alunos ${media(temas)}%` : ""}</span></div>
    <div class="kpi"><b>${feitas} / ${total}</b><span>questões feitas</span></div>
    <div class="kpi"><b>${geral?.dias_estudo || 0}</b><span>dias com estudo · ${geral?.ultimas_24h || 0} respostas nas últimas 24 h</span></div>
    <div class="kpi"><b>${seg(geral?.tempo_medio)}</b><span>tempo médio por questão (na prova: 3 min)</span></div>
  </div>

  ${foco.length ? `<div class="cartao" style="margin-bottom:16px"><h2>Onde focar agora</h2>
    <div class="lista-erros">${foco.map((t) => `<div class="item-erro" style="grid-template-columns:1fr auto;align-items:center">
      <div><b>${esc(t.tema)}</b><p>${esc(areas[t.area])} · ${esc(t.motivo)} · ${t.total} questões no banco</p></div>
      <a class="botao peq" href="#/estudar" data-area="${t.area}" data-tema="${esc(t.tema)}" data-modo="${t.feitas < t.total ? "ineditas" : "erradas"}">Estudar</a></div>`).join("")}</div></div>` : ""}

  <div class="cartao" style="margin-bottom:16px"><h2>Evolução</h2>${evolucao}</div>

  <div class="cartao">
    <h2>Acerto por área e tema</h2>
    <p class="sub">Conta a última resposta de cada questão. <span class="legenda"><i class="media"></i> média dos alunos</span></p>
    ${porArea.map((ar) => `<details class="bloco-area"${ar.f ? " open" : ""}>
      <summary>${linha(ar.nome, ar.a, ar.f, ar.t, ar.m)}</summary>
      <div class="grade temas">${ar.l.sort((x, y) => y.total - x.total).map((t) => linha(t.tema, t.acertos, t.feitas, t.total,
        t.n_alunos ? Math.round(t.media_alunos) : null,
        ` <a href="#/estudar" class="mini" data-area="${t.area}" data-tema="${esc(t.tema)}" data-modo="todas" title="Estudar este tema">estudar</a>`)).join("")}</div>
    </details>`).join("")}
  </div>`;
  app.querySelectorAll("[data-tema]").forEach((a) => (a.onclick = (e) => {
    e.stopPropagation();
    Object.assign(filtro, { area: a.dataset.area, tema: a.dataset.tema, modo: a.dataset.modo, ano: "" });
    try { localStorage.setItem("filtro", JSON.stringify(filtro)); } catch {}
  }));
}

async function telaErros() {
  if (!sessao?.assinatura_ativa) return (location.hash = "#/assinatura");
  const { areas, erros } = await api("/api/erros");
  app.innerHTML = `
  <h1>Meus erros</h1>
  <p class="sub">Questões cuja última resposta foi errada. Ao acertar de novo, elas saem desta lista.</p>
  ${erros.length ? `<div class="lista-erros">${erros.map((e) => `
    <a class="item-erro" href="#/estudar/${e.id}" style="text-decoration:none;color:inherit">
      <div class="meta" style="margin:0"><span class="tag">${esc(areas[e.area])}</span><span>ENAMED ${e.ano} · questão ${e.numero}</span><span>você marcou ${e.alternativa}</span></div>
      <p>${esc(e.inicio)}…</p></a>`).join("")}</div>` : `<div class="cartao vazio">Nenhum erro por aqui ainda.</div>`}`;
}

// ---------- revisar (active recall + repetição espaçada) ----------
async function telaRevisar() {
  if (!sessao?.assinatura_ativa) return (location.hash = "#/assinatura");
  const d = await api("/api/revisao/proxima");
  const topo = `<h1>Revisar</h1>
    <p class="sub">Leia o caso, responda de cabeça e só depois revele. Você decide quando cada questão volta.</p>
    <div class="kpis"><div class="kpi"><b>${d.pendentes}</b><span>para revisar agora</span></div>
    <div class="kpi"><b>${d.total}</b><span>questões no seu baralho</span></div></div>`;
  if (!d.cartao) {
    const quando = d.proxima_em ? new Date(d.proxima_em).toLocaleString("pt-BR", { weekday: "long", hour: "2-digit", minute: "2-digit" }) : null;
    app.innerHTML = topo + `<div class="cartao vazio">${
      d.total === 0
        ? `Seu baralho está vazio. Toda questão que você responder em <a href="#/estudar">Estudar</a> entra aqui: as que errar voltam logo; as que acertar, em 3 dias.`
        : `Nada para revisar agora. ${quando ? `A próxima volta ${esc(quando)}.` : ""}<br><br><a class="botao sec" href="#/estudar">Fazer questões novas</a>`
    }</div>`;
    return;
  }
  const c = d.cartao, q = c.questao;
  app.innerHTML = topo + `<article class="cartao">
    <div class="meta"><span class="tag">${esc(q.area_nome)}</span><span>${esc(q.fonte)}</span></div>
    <div class="enunciado">${paragrafos(q.enunciado)}${q.imagens.map((i) => `<img src="/img/${esc(i)}" alt="Imagem da questão" loading="lazy">`).join("")}</div>
    <div id="verso"><div class="acoes"><button class="botao" id="revelar">Mostrar resposta</button></div>
      <p class="num" style="margin-top:10px">Pense na resposta antes de revelar. Atalho: barra de espaço.</p></div>
  </article>`;
  const revelar = () => {
    const nomes = { errei: "Errei", dificil: "Difícil", facil: "Fácil" };
    document.getElementById("verso").innerHTML = `
      <div class="explicacao">
        <h3 style="margin-top:0">Como responder</h3>
        ${c.resumo ? paragrafos(c.resumo) : `<p class="sub">A explicação desta questão está em revisão.</p>`}
        ${c.ponto_chave ? `<p class="chave">${esc(c.ponto_chave)}</p>` : ""}
        <p class="aviso-ia" style="margin-top:16px">Explicação gerada por IA, pode conter erros. O gabarito é o oficial do Inep${c.gabarito_oficial === "preliminar" ? " (preliminar)" : ""}.</p>
        <h3>Como foi?</h3>
        <div class="acoes">${c.opcoes.map((o, i) => `<button class="botao ${o.nota === "facil" ? "" : "sec"}" data-nota="${o.nota}">${nomes[o.nota]} <small style="font-weight:400;opacity:.8">· ${esc(o.espera)}</small></button>`).join("")}</div>
        <p class="num" style="margin-top:10px">Atalhos: 1 Errei · 2 Difícil · 3 Fácil</p>
      </div>`;
    document.querySelectorAll("[data-nota]").forEach((b) => (b.onclick = () => avaliar(b.dataset.nota)));
    revelado = true;
  };
  let revelado = false, enviando = false;
  const avaliar = async (nota) => {
    if (enviando) return;
    enviando = true;
    await api(`/api/revisao/${encodeURIComponent(q.id)}`, { method: "POST", body: { nota } });
    window.scrollTo({ top: 0 });
    telaRevisar();
  };
  document.getElementById("revelar").onclick = revelar;
  document.onkeydown = (e) => {
    if (e.target.closest?.("input, textarea, select")) return;
    if (!revelado && (e.key === " " || e.key === "Enter")) { e.preventDefault(); revelar(); }
    else if (revelado && ["1", "2", "3"].includes(e.key)) avaliar(["errei", "dificil", "facil"][Number(e.key) - 1]);
  };
}

// ---------- roteador ----------
async function rotear() {
  const [rota, param] = location.hash.replace(/^#\/?/, "").split("?")[0].split("/");
  document.onkeydown = null;
  if (sessao === null) await carregarSessao().catch(() => {});
  desenharNav(rota || "");
  try {
    if (rota === "entrar") return telaForm("entrar");
    if (rota === "cadastro") return telaForm("cadastro");
    if (rota === "assinatura") return telaAssinatura();
    if (rota === "estudar") return await telaEstudar(param);
    if (rota === "revisar") return await telaRevisar();
    if (rota === "desempenho") return await telaDesempenho();
    if (rota === "erros") return await telaErros();
    if (sessao?.usuario) return (location.hash = sessao.assinatura_ativa ? "#/estudar" : "#/assinatura");
    telaInicio();
  } catch (err) {
    app.innerHTML = `<div class="cartao vazio">${esc(err.message)}</div>`;
  }
}
window.addEventListener("hashchange", rotear);
rotear();
