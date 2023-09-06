> @Help

# Copypastas do bot do tramonta

_*Comandos*_
`|===================================================|`
`|   !copypasta list   |  Lista todas as copypastas  |`
`| !copypasta {{name}} |  Obtém copypasta pelo nome  |`
`| !copypasta {{numb}} | Obtém copypasta pelo indice |`
`|  !copypasta search  |     Pesquisa copypasta¹     |`
`|===================================================|`
<br>
¹Passe a flag --deep para pesquisar dentro da copypasta, não apenas o titulo
<br>

_*Comandos respondendo mensagens:*_
`|======================================================|`
`| !copypasta add {{name}}     |   Salva copypasta      |`
`| !copypasta delete {{name}}  |  Deleta a copypasta²   |`
`|======================================================|`
<br>

²Você só pode deletar uma copypasta que você mesmo adicionou

> ---

> @CopypastaSearchResult

{{number}} - {{name}}

> ---

> @CopypastaSearchResultDeep

{{number}} - {{name}}
<br>
{{part}}
<br>

> ---

> @CopypastaListItem

{{number}} - {{name}}

> ---

> @NeedsQuote

Erro: Responda com esse comando uma mensagem de texto para torna-la copypasta

> ---

> @NeedsQuery

Erro: Digite algo para eu pesquisar nas copypastas.

> ---

> @NeedsBody

Erro: Responda com esse comando uma mensagem DE TEXTO para torna-la copypasta

> ---

> @NeedsName

Erro: Dê um nome para a copypasta

> ---

> @NeedsName

Erro: Dê um nome ou numer para a copypasta que deseja obter

> ---

> @NeedsNameOrNumber

Erro: Essa copypasta não existe. Consulte a lista de copypastas com !copypasta list

> ---

> @NotCopypastaOwner

Erro: Você só pode deletar uma copypasta que você mesmo adicionou

> ---

> @CopypastaAdded

Sucesso! Copypasta adiciona. Para fazer o bot envia-la basta digitar !copypasta {{name}}

> ---

> @CopypastaDeleted

A copypasta foi deletada.

> ---

> @Copypasta

{{id}}
<br>
{{text}}

> ---

> @InvalidCopypasta

Erro: Não consegui encontrar essa copypasta

> ---s
