> @Error

# Erro:

Erro desconhecido: {{error}}

> ---

> @Help

# Portal de notícias

Seu noticiário no bot do zap!

`|==================================================|`
`|   today    |   Gratis!!    |     !news today     |`
`|   search   | 10 CalvoCoins |   !news {{busca}}   |`
`|==================================================|`

_*today:*_ Busca as manchetes do ultimo dia. Noticias são disponíveis até 24h depois da sua publicação oficial
_*search*_: Busca notícias segundo os termos que inserir.
<br>

Os comandos são paginados. Você pode usar o parâmetro _*page*_ para obter mais resultados.
Exemplo: _*!news Taxação shein --page 2*_

> ---

> @Article

{{headline}}
Fonte: {{source_name}}
{{date}}
{{article_link}}
<br>

> ---

> @NotFound

# Erro:

Não encontrei nenhuma notícia.

> ---

> @EmptyQuery

# Erro:

Por favor insira termos para eu pesquisar notícias relacionadas.

> ---
