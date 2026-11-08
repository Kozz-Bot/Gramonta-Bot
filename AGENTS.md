# Gramonta

Leia também `../../AGENTS.md`, o mapa do servidor e a documentação do serviço
alterado. Preserve a sessão WhatsApp e os dados privados em `.runtime/`.

## Avisos após push

O proprietário autorizou enviar novidades aos grupos configurados em
`.runtime/updates/groups.json` depois dos pushes feitos pelos agentes neste
workspace, após validar a ativação. Consulte a lista atual, nunca destinos fixos.
Lista vazia significa não enviar. Não é um webhook para pushes feitos fora daqui.

O aviso deve tratar do que é relevante para os participantes: novidades que eles
podem usar, exemplos curtos e melhorias perceptíveis. Omita comandos exclusivos
do host sem interação com os membros; resuma melhorias técnicas. Não divulgue
dados privados, logs ou credenciais. Use julgamento editorial e não use tagAll.
Uma entrega conjunta com o framework recebe um único resumo, sem duplicação.
Mudanças que afetem apenas um grupo devem ser anunciadas somente ao grupo
afetado, desde que cadastrado. Para uma entrega mista, separe o resumo geral dos
trechos específicos: cada grupo recebe só o geral e seu próprio trecho.

Prepare um resumo em arquivo temporário e execute no cwd desta aplicação:

```sh
node --env-file=.env scripts/announce-update.cjs --repo CAMINHO_ABSOLUTO_DO_REPO --summary-file ARQUIVO_DO_RESUMO
```

O script verifica HEAD no remoto, prontidão e grupos atuais. Reservas por
repositório/commit/grupo bloqueiam repetição e falhas incertas. Nunca remova uma
reserva para repetir sem conferir o WhatsApp. `forwarded_to_gateway` indica
emissão, não entrega; reporte o resultado real ao dono. A autorização de envio
para esses grupos já foi concedida, sem necessidade de nova confirmação.

Para mudanças locais, passe `--group-summaries-file ARQUIVO_JSON`, com mapa de
IDs de grupos para seus resumos. Omita `--summary-file` quando não houver
novidade geral. O mapa não cadastra grupos e não permite enviar a destinos fora
da seleção do dono. Consulte o README para o formato.

Uso, testes e limites em `src/Services/Updates/README.md`.

## Links nos comandos

O gateway normaliza `rawCommand.query` e `immediateArg` para minúsculas. URLs,
IDs e assinaturas não podem ser extraídos desses campos quando o texto original
está disponível. Use `originalCommandQuery` de `src/Utils/commandText.ts`, com o
nome do comando e, quando houver, o subcomando. O helper confere a origem antes
de recuperar o texto e preserva o fallback estruturado de chamadas sintéticas.
Não altere o parser geral para resolver um consumidor específico. URLs vindas
de metadados de mídia/citações já preservam sua grafia; não as normalize.
