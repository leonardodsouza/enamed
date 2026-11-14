-- Revisão espaçada: uma linha por (usuário, questão) que entrou no baralho.
CREATE TABLE revisoes (
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  questao_id TEXT NOT NULL REFERENCES questoes(id),
  intervalo_dias REAL NOT NULL DEFAULT 0,
  facilidade REAL NOT NULL DEFAULT 2.5,
  repeticoes INTEGER NOT NULL DEFAULT 0,
  proxima_em INTEGER NOT NULL,
  revisada_em INTEGER,
  PRIMARY KEY (usuario_id, questao_id)
);
CREATE INDEX idx_revisoes_proxima ON revisoes(usuario_id, proxima_em);
-- Quem já respondeu questões antes da revisão existir entra com o histórico:
-- última resposta errada vence agora; certa, em 3 dias.
INSERT OR IGNORE INTO revisoes (usuario_id, questao_id, intervalo_dias, repeticoes, proxima_em)
SELECT r.usuario_id, r.questao_id,
  CASE WHEN r.correta = 1 THEN 3 ELSE 0 END,
  CASE WHEN r.correta = 1 THEN 1 ELSE 0 END,
  CASE WHEN r.correta = 1 THEN r.criado_em + 3 * 86400000 ELSE r.criado_em END
FROM respostas r
WHERE r.id = (SELECT MAX(id) FROM respostas r2 WHERE r2.usuario_id = r.usuario_id AND r2.questao_id = r.questao_id);
