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

Prepare um resumo em arquivo temporário e execute no cwd desta aplicação:

```sh
node --env-file=.env scripts/announce-update.cjs --repo CAMINHO_ABSOLUTO_DO_REPO --summary-file ARQUIVO_DO_RESUMO
```

O script verifica HEAD no remoto, prontidão e grupos atuais. Reservas por
repositório/commit/grupo bloqueiam repetição e falhas incertas. Nunca remova uma
reserva para repetir sem conferir o WhatsApp. `forwarded_to_gateway` indica
emissão, não entrega; reporte o resultado real ao dono. A autorização de envio
para esses grupos já foi concedida, sem necessidade de nova confirmação.

Uso, testes e limites em `src/Services/Updates/README.md`.
