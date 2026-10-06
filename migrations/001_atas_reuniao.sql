-- Tabela de atas de reunião geradas pelo bot
CREATE TABLE IF NOT EXISTS atas_reuniao (
  id SERIAL PRIMARY KEY,
  guild_id VARCHAR(32) NOT NULL,
  canal_voz_id VARCHAR(32) NOT NULL,
  canal_voz_nome VARCHAR(100),
  titulo VARCHAR(255) NOT NULL,
  transcricao TEXT NOT NULL,
  ata_markdown TEXT NOT NULL,
  participantes JSONB, -- lista de {user_id, nome}
  iniciado_em TIMESTAMPTZ NOT NULL,
  finalizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  pdf_path VARCHAR(500)
);

CREATE INDEX IF NOT EXISTS idx_atas_reuniao_guild ON atas_reuniao (guild_id);
CREATE INDEX IF NOT EXISTS idx_atas_reuniao_data ON atas_reuniao (finalizado_em);
