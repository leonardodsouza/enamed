# Questões ENAMED

Plataforma web para estudar para o ENAMED resolvendo as questões oficiais (2025 e 2026), uma de cada vez, por área, com gabarito e explicação de cada alternativa.

- 200 questões: 100 de 2025 (gabarito definitivo) e 100 de 2026 (gabarito preliminar).
- 190 questões válidas com explicação (as anuladas e excluídas aparecem só com o aviso).
- Acesso pago (R$ 49,90 por 30 dias) via Mercado Pago (Pix ou cartão).

## Stack

- **Cloudflare Workers** com arquivos estáticos (`public/`) e API em `src/worker.ts`.
- **Cloudflare D1** (SQLite) para usuários, sessões, questões, respostas, reportes e pagamentos.
- Front-end em JavaScript puro, sem build.

## Como os dados chegam ao banco

As questões e explicações (`data/*.json`) vão embutidas no código do Worker. Na primeira requisição depois de um deploy, o Worker cria as tabelas que faltarem e, se os dados mudaram, atualiza a tabela `questoes`. Não é preciso rodar nenhum comando de banco: basta dar push.

## Rodar localmente

```bash
npm install
npm run dev           # http://localhost:8787
```

Para liberar o acesso de um usuário de teste sem pagar:

```bash
npx wrangler d1 execute enamed --local --command \
  "UPDATE usuarios SET assinatura_ate = (strftime('%s','now') + 30*86400) * 1000 WHERE email = 'voce@exemplo.com'"
```

## Publicar na Cloudflare

O Worker `enamed` está conectado a este repositório (Workers Builds): cada push na `main` publica sozinho. O banco D1 `enamed` já existe e está no `wrangler.jsonc`.

Falta só o pagamento: no painel da Cloudflare, em Workers & Pages → `enamed` → Settings → Variables and Secrets, adicione o secret `MP_ACCESS_TOKEN` com o Access Token de produção do Mercado Pago. Sem ele, o botão de pagar mostra "Pagamento ainda não configurado".

`URL_BASE` pode ficar vazio: o site usa o endereço de onde foi acessado. Preencha só se quiser forçar um domínio.

### Tornar alguém administrador (acesso sem pagamento)

```bash
npx wrangler d1 execute enamed --remote --command "UPDATE usuarios SET admin = 1 WHERE email = 'voce@exemplo.com'"
```

## Dados

- `data/questoes.json`: as 200 questões (enunciado, alternativas, gabarito, status, imagens).
- `data/explicacoes/lote*.json`: explicações geradas por IA, por lote. `data/explicacoes.json` é a junção de todos.
- `public/img/`: imagens das questões.
- `scripts/build_seed.mjs`: gera o `seed.sql` a partir dos JSON. Se uma explicação mudar, ela volta a ficar ativa.

Ao atualizar uma questão ou explicação, edite os JSON e dê push. Os dados são atualizados sem apagar as respostas dos usuários.

### Controle de qualidade

Não há revisão médica. Cada explicação mostra o aviso de que foi gerada por IA. Quando 3 usuários diferentes reportam erro na mesma questão, a explicação é escondida automaticamente até ser corrigida. Para ver os reportes:

```bash
npx wrangler d1 execute enamed --remote --command "SELECT questao_id, COUNT(DISTINCT usuario_id) n, GROUP_CONCAT(texto, ' | ') FROM reportes GROUP BY questao_id ORDER BY n DESC"
```

### Gabarito de 2026

O gabarito de 2026 ainda é preliminar. Quando o Inep publicar o definitivo (previsto para 04/12/2026), atualize `gabarito`, `status` e `gabarito_oficial` em `data/questoes.json`, revise as explicações das questões que mudarem e dê push.

### Extração dos PDFs

`scripts/extrair/` tem os scripts em Python (pymupdf) usados para extrair texto, imagens e gabaritos dos cadernos do Inep. Os PDFs de 2025 usam uma fonte com mapa de caracteres quebrado, que o `extract3.py` decodifica pelo id do glifo. Coloque os PDFs numa pasta e aponte `PDFS=/caminho/da/pasta`.

---

Questões oficiais do ENAMED, publicadas pelo Inep e reproduzidas com a fonte indicada. Plataforma independente, sem vínculo com o Inep ou o MEC.
