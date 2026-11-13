CREATE TABLE usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  senha_hash TEXT NOT NULL,
  senha_salt TEXT NOT NULL,
  assinatura_ate INTEGER NOT NULL DEFAULT 0,
  admin INTEGER NOT NULL DEFAULT 0,
  criado_em INTEGER NOT NULL
);
CREATE TABLE sessoes (
  token_hash TEXT PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  expira_em INTEGER NOT NULL
);
CREATE TABLE questoes (
  id TEXT PRIMARY KEY,
  ano INTEGER NOT NULL,
  numero INTEGER NOT NULL,
  area TEXT NOT NULL,
  enunciado TEXT NOT NULL,
  alternativas TEXT NOT NULL,
  gabarito TEXT,
  status TEXT NOT NULL,
  imagens TEXT NOT NULL DEFAULT '[]',
  gabarito_oficial TEXT NOT NULL,
  explicacao TEXT,
  explicacao_ativa INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX idx_questoes_area ON questoes(area, ano, status);
CREATE TABLE respostas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  questao_id TEXT NOT NULL REFERENCES questoes(id),
  alternativa TEXT NOT NULL,
  correta INTEGER NOT NULL,
  tempo_ms INTEGER,
  criado_em INTEGER NOT NULL
);
CREATE INDEX idx_respostas_usuario ON respostas(usuario_id, questao_id, criado_em);
CREATE TABLE reportes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  questao_id TEXT NOT NULL REFERENCES questoes(id),
  texto TEXT NOT NULL,
  criado_em INTEGER NOT NULL
);
CREATE INDEX idx_reportes_questao ON reportes(questao_id);
CREATE TABLE pagamentos (
  id TEXT PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  status TEXT NOT NULL,
  valor REAL,
  processado INTEGER NOT NULL DEFAULT 0,
  criado_em INTEGER NOT NULL
);
