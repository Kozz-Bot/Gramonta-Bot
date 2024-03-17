> @Help

# CalvoCoins

CalvoCoins são as moedas utilizadas nos comandos premium do bot do Tramonta. Cada CalvoCoin equivale a 1 centavo e os comandos pagos irão automaticamente cobrar as moedas do seu saldo
<br>

_*Como criar conta?*_
Para criar uma conta no CalvoBank basta digitar `!coins create`. Você terá uma conta com saldo de 0 CalvoCoins
<br>

_*Como comprar CalvoCoins?*_
Basta fazer um pix para o numero 11947952409 e avisar o Tramonta. Ele irá adicionar as moedas ao seu saldo e você poderá utiliza-las imediatamente.
<br>

_*Premium?*_
Você pode também comprar o acesso premium ilimitado por R$19,90. Ao comprar o premium, você pode utilizar quantos comandos pagos quiser sem gastar uma única CalvoCoin. O premium é valido por 30 dias a partir do momento da compra.
<br>

Os comandos pagos são mostrados nas seções de ajuda com o respectivo preço nesse formato: `💲10 !ai image prompt`. Você pode consultar o seu saldo utilizando o comando !coins.

> ---

> @Info

# Dados de usuário

_*Nome*_: {{name}}
_*CalvoCoins*_: {{coins}}
_*Premium?*_ {{premium}}
<br>

Para consultar seu extrato digite `!coins history`
Para puxar as 10 ultimas transações digite `!coins history --count 10`
<br>

_*ID*_: {{id}}
_*UserId*_: {{userId}}

> ---

> @AddCoinsResponse

_*Feito!*_
<br>

Adicionado {{amount}} CalvoCoins ao seu saldo. Seu novo saldo é de {{userBalance}}

> ---

> @MakePremiumResponse

_*Feito!*_
<br>

@{{quotedUser}} agora é premium. Você pode consultar seu status usando o comando `!coins`

> ---

> @CreateAccountResponse

_*Feito!*_
<br>

@{{userId}} agora possui uma conta no CalvoBank. Seu saldo inicial é de 0 CalvoCoins. Você pode consultar seu saldo usando o comando `!coins`

> ---

> @TransactionListItem

_*ID da Transação*_: {{id}}
_*Tipo*_: {{type}}
_*Data/Hora*_: {{timestamp}}
<br>

_*Direção*_: {{direction}}
_*Contraparte*_: {{counterpart}}
_*Valor*_: C$ {{amount}}
_*Mensagem*_: {{messageBody}}
_*Grupo*_:{{groupName}}
_*Mídia da mensagem*_: {{mediaUrl}}

> ---

> @Error

_*Erro*_: {{error}}

> ---
