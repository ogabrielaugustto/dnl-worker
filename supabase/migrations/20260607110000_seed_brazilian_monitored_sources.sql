begin;

insert into public.monitored_sources (
  name,
  domain,
  base_url,
  source_type,
  priority,
  crawl_frequency_hours,
  discovery_modes,
  is_active
)
values
  ('G1', 'g1.globo.com', 'https://g1.globo.com/', 'portal', 'high', 12, array['sitemap', 'rss', 'home']::text[], true),
  ('O Globo', 'oglobo.globo.com', 'https://oglobo.globo.com/', 'portal', 'high', 12, array['sitemap', 'rss', 'home']::text[], true),
  ('Valor Economico', 'valor.globo.com', 'https://valor.globo.com/', 'portal', 'high', 12, array['sitemap', 'rss', 'home']::text[], true),
  ('Epoca Negocios', 'epocanegocios.globo.com', 'https://epocanegocios.globo.com/', 'portal', 'high', 12, array['sitemap', 'rss', 'home']::text[], true),
  ('Pequenas Empresas & Grandes Negocios', 'revistapegn.globo.com', 'https://revistapegn.globo.com/', 'portal', 'medium', 24, array['sitemap', 'rss', 'home']::text[], true),
  ('Casa Vogue', 'casavogue.globo.com', 'https://casavogue.globo.com/', 'portal', 'high', 12, array['sitemap', 'rss', 'home']::text[], true),
  ('Casa e Jardim', 'revistacasaejardim.globo.com', 'https://revistacasaejardim.globo.com/', 'portal', 'high', 12, array['sitemap', 'rss', 'home']::text[], true),
  ('Vogue Brasil', 'vogue.globo.com', 'https://vogue.globo.com/', 'portal', 'high', 12, array['sitemap', 'rss', 'home']::text[], true),
  ('Marie Claire Brasil', 'revistamarieclaire.globo.com', 'https://revistamarieclaire.globo.com/', 'portal', 'medium', 24, array['sitemap', 'rss', 'home']::text[], true),
  ('Quem', 'revistaquem.globo.com', 'https://revistaquem.globo.com/', 'portal', 'medium', 24, array['sitemap', 'rss', 'home']::text[], true),
  ('Autoesporte', 'autoesporte.globo.com', 'https://autoesporte.globo.com/', 'portal', 'medium', 24, array['sitemap', 'rss', 'home']::text[], true),
  ('Gshow', 'gshow.globo.com', 'https://gshow.globo.com/', 'portal', 'medium', 24, array['sitemap', 'rss', 'home']::text[], true),
  ('GE', 'ge.globo.com', 'https://ge.globo.com/', 'portal', 'medium', 24, array['sitemap', 'rss', 'home']::text[], true),

  ('UOL', 'uol.com.br', 'https://www.uol.com.br/', 'portal', 'high', 12, array['sitemap', 'rss', 'home']::text[], true),
  ('Folha de S.Paulo', 'folha.uol.com.br', 'https://www1.folha.uol.com.br/', 'portal', 'high', 12, array['sitemap', 'rss', 'home']::text[], true),
  ('Universa', 'universa.uol.com.br', 'https://www.uol.com.br/universa/', 'portal', 'medium', 24, array['sitemap', 'rss', 'home']::text[], true),
  ('Tilt', 'tilt.uol.com.br', 'https://www.uol.com.br/tilt/', 'portal', 'medium', 24, array['sitemap', 'rss', 'home']::text[], true),
  ('Nossa UOL', 'nossa.uol.com.br', 'https://www.uol.com.br/nossa/', 'portal', 'medium', 24, array['sitemap', 'rss', 'home']::text[], true),

  ('Estadao', 'estadao.com.br', 'https://www.estadao.com.br/', 'portal', 'high', 12, array['sitemap', 'rss', 'home']::text[], true),
  ('Terra', 'terra.com.br', 'https://www.terra.com.br/', 'portal', 'high', 12, array['sitemap', 'rss', 'home']::text[], true),
  ('R7', 'r7.com', 'https://www.r7.com/', 'portal', 'high', 12, array['sitemap', 'rss', 'home']::text[], true),
  ('CNN Brasil', 'cnnbrasil.com.br', 'https://www.cnnbrasil.com.br/', 'portal', 'high', 12, array['sitemap', 'rss', 'home']::text[], true),
  ('Metropoles', 'metropoles.com', 'https://www.metropoles.com/', 'portal', 'high', 12, array['sitemap', 'rss', 'home']::text[], true),
  ('Veja', 'veja.abril.com.br', 'https://veja.abril.com.br/', 'portal', 'high', 12, array['sitemap', 'rss', 'home']::text[], true),
  ('Exame', 'exame.com', 'https://exame.com/', 'portal', 'high', 12, array['sitemap', 'rss', 'home']::text[], true),
  ('InfoMoney', 'infomoney.com.br', 'https://www.infomoney.com.br/', 'portal', 'medium', 24, array['sitemap', 'rss', 'home']::text[], true),
  ('Money Times', 'moneytimes.com.br', 'https://www.moneytimes.com.br/', 'portal', 'medium', 24, array['sitemap', 'rss', 'home']::text[], true),
  ('IstoE', 'istoe.com.br', 'https://istoe.com.br/', 'portal', 'medium', 24, array['sitemap', 'rss', 'home']::text[], true),
  ('CartaCapital', 'cartacapital.com.br', 'https://www.cartacapital.com.br/', 'portal', 'medium', 24, array['sitemap', 'rss', 'home']::text[], true),
  ('Gazeta do Povo', 'gazetadopovo.com.br', 'https://www.gazetadopovo.com.br/', 'portal', 'medium', 24, array['sitemap', 'rss', 'home']::text[], true),
  ('Poder360', 'poder360.com.br', 'https://www.poder360.com.br/', 'portal', 'medium', 24, array['sitemap', 'rss', 'home']::text[], true),
  ('JOTA', 'jota.info', 'https://www.jota.info/', 'portal', 'medium', 24, array['sitemap', 'rss', 'home']::text[], true),
  ('Agencia Brasil', 'agenciabrasil.ebc.com.br', 'https://agenciabrasil.ebc.com.br/', 'government', 'medium', 24, array['sitemap', 'rss', 'home']::text[], true),

  ('ArchDaily Brasil', 'archdaily.com.br', 'https://www.archdaily.com.br/br', 'portal', 'high', 12, array['sitemap', 'rss', 'home']::text[], true),
  ('Casa Abril', 'casa.abril.com.br', 'https://casa.abril.com.br/', 'portal', 'high', 12, array['sitemap', 'rss', 'home']::text[], true),
  ('Claudia', 'claudia.abril.com.br', 'https://claudia.abril.com.br/', 'portal', 'medium', 24, array['sitemap', 'rss', 'home']::text[], true),
  ('Boa Forma', 'boaforma.abril.com.br', 'https://boaforma.abril.com.br/', 'portal', 'medium', 24, array['sitemap', 'rss', 'home']::text[], true),
  ('Quatro Rodas', 'quatrorodas.abril.com.br', 'https://quatrorodas.abril.com.br/', 'portal', 'medium', 24, array['sitemap', 'rss', 'home']::text[], true),
  ('Glamour Brasil', 'glamour.globo.com', 'https://glamour.globo.com/', 'portal', 'medium', 24, array['sitemap', 'rss', 'home']::text[], true),
  ('GQ Brasil', 'gq.globo.com', 'https://gq.globo.com/', 'portal', 'medium', 24, array['sitemap', 'rss', 'home']::text[], true),

  ('Estado de Minas', 'em.com.br', 'https://www.em.com.br/', 'portal', 'medium', 24, array['sitemap', 'rss', 'home']::text[], true),
  ('Correio Braziliense', 'correiobraziliense.com.br', 'https://www.correiobraziliense.com.br/', 'portal', 'medium', 24, array['sitemap', 'rss', 'home']::text[], true),
  ('O Tempo', 'otempo.com.br', 'https://www.otempo.com.br/', 'portal', 'medium', 24, array['sitemap', 'rss', 'home']::text[], true),
  ('Diario do Nordeste', 'diariodonordeste.verdesmares.com.br', 'https://diariodonordeste.verdesmares.com.br/', 'portal', 'medium', 24, array['sitemap', 'rss', 'home']::text[], true),
  ('Jornal do Commercio', 'jc.ne10.uol.com.br', 'https://jc.ne10.uol.com.br/', 'portal', 'medium', 24, array['sitemap', 'rss', 'home']::text[], true),
  ('Diario de Pernambuco', 'diariodepernambuco.com.br', 'https://www.diariodepernambuco.com.br/', 'portal', 'medium', 24, array['sitemap', 'rss', 'home']::text[], true),
  ('Folha de Pernambuco', 'folhape.com.br', 'https://www.folhape.com.br/', 'portal', 'medium', 24, array['sitemap', 'rss', 'home']::text[], true),
  ('A Tarde', 'atarde.com.br', 'https://www.atarde.com.br/', 'portal', 'medium', 24, array['sitemap', 'rss', 'home']::text[], true),
  ('GZH', 'gauchazh.clicrbs.com.br', 'https://gauchazh.clicrbs.com.br/', 'portal', 'medium', 24, array['sitemap', 'rss', 'home']::text[], true),
  ('NSC Total', 'nsctotal.com.br', 'https://www.nsctotal.com.br/', 'portal', 'medium', 24, array['sitemap', 'rss', 'home']::text[], true),
  ('Bem Parana', 'bemparana.com.br', 'https://www.bemparana.com.br/', 'portal', 'low', 48, array['sitemap', 'rss', 'home']::text[], true),
  ('Tribuna PR', 'tribunapr.uol.com.br', 'https://www.tribunapr.com.br/', 'portal', 'low', 48, array['sitemap', 'rss', 'home']::text[], true),
  ('A Gazeta ES', 'agazeta.com.br', 'https://www.agazeta.com.br/', 'portal', 'medium', 24, array['sitemap', 'rss', 'home']::text[], true),
  ('Diario Catarinense', 'dc.clicrbs.com.br', 'https://dc.clicrbs.com.br/', 'portal', 'low', 48, array['sitemap', 'rss', 'home']::text[], true),

  ('Canaltech', 'canaltech.com.br', 'https://canaltech.com.br/', 'portal', 'medium', 24, array['sitemap', 'rss', 'home']::text[], true),
  ('Tecnoblog', 'tecnoblog.net', 'https://tecnoblog.net/', 'portal', 'medium', 24, array['sitemap', 'rss', 'home']::text[], true),
  ('Olhar Digital', 'olhardigital.com.br', 'https://olhardigital.com.br/', 'portal', 'medium', 24, array['sitemap', 'rss', 'home']::text[], true),
  ('Mundo Conectado', 'mundoconectado.com.br', 'https://www.mundoconectado.com.br/', 'portal', 'low', 48, array['sitemap', 'rss', 'home']::text[], true),

  ('Mercado Livre Brasil', 'mercadolivre.com.br', 'https://www.mercadolivre.com.br/', 'marketplace', 'low', 72, array['home']::text[], true),
  ('Elo7', 'elo7.com.br', 'https://www.elo7.com.br/', 'marketplace', 'low', 72, array['home']::text[], true),
  ('Enjoei', 'enjoei.com.br', 'https://www.enjoei.com.br/', 'marketplace', 'low', 72, array['home']::text[], true)
on conflict (domain) do update
set
  name = excluded.name,
  base_url = excluded.base_url,
  source_type = excluded.source_type,
  priority = excluded.priority,
  crawl_frequency_hours = excluded.crawl_frequency_hours,
  discovery_modes = excluded.discovery_modes,
  is_active = excluded.is_active,
  updated_at = timezone('utc', now());

commit;
