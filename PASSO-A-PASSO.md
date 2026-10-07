# Spinning Fany — como colocar no ar HOJE

Tempo estimado: **40 a 60 minutos**. Custo: **~US$ 5/mês** de hospedagem (≈ R$ 30) + domínio (~R$ 40/ano).
Você **não precisa instalar nada no computador** e **não precisa saber programar**.

> Este site tem servidor e banco de dados próprios: as reservas, os créditos e as contas das alunas ficam guardados na hospedagem (num disco que não apaga), e o **crédito cai sozinho** quando a InfinitePay avisa que o pagamento foi feito.

---

## O que você vai criar (4 contas)

| Para quê | Onde | Custo |
|---|---|---|
| Receber pagamentos | **InfinitePay** (você já tem) | Pix 0% · cartão: taxa da sua conta |
| Guardar o código | **GitHub** | grátis |
| Hospedar o site e os dados | **Railway** | US$ 5/mês |
| Endereço do site | **Registro.br** (.com.br) ou Cloudflare | ~R$ 40/ano |

---

## PASSO 1 · InfinitePay (5 min)

1. Abra o **app InfinitePay** → **Vendas** → **Checkout** → **Configurações** → **Habilitar Checkout Integrado**.
2. Anote a sua **InfiniteTag** (aparece no canto superior esquerdo do app). **Sem o $.** Exemplo: `spinning_fany`.

Pronto. Não precisa criar chave nem configurar webhook: o site envia o endereço certo em cada cobrança.

---

## PASSO 2 · GitHub (10 min)

1. Crie uma conta em **github.com** (grátis).
2. Clique em **New repository** → nome `spinning-fany` → marque **Private** → **Create repository**.
3. Descompacte o arquivo `spinning-fany-final.zip` no computador.
4. Na página do repositório, clique em **uploading an existing file** e **arraste todo o conteúdo da pasta** (as pastas `server`, `public`, `src`, `client`, `tests` e os arquivos `Dockerfile`, `package.json`, `build.js` etc.).
5. Clique em **Commit changes**.

> ⚠️ **Nunca** coloque senhas no GitHub. As senhas vão só no Railway (passo 3).

---

## PASSO 3 · Railway (15 min)

1. Crie a conta em **railway.com** (entre com o GitHub). Assine o plano **Hobby** (US$ 5/mês, pede cartão).
2. **New Project** → **Deploy from GitHub repo** → escolha `spinning-fany`. O Railway reconhece o `Dockerfile` e começa a montar sozinho.
3. **Guardar os dados (muito importante):** clique no serviço → **Settings** (ou clique direito no quadro do projeto) → **Volumes** → **Add Volume** → em *Mount path* escreva **`/data`**.
   Sem o Volume, os dados somem a cada atualização.
4. Clique em **Variables** → **New Variable** e crie estas (uma por uma):

   | Nome | Valor |
   |---|---|
   | `OWNER_EMAIL` | o e-mail com o qual a Fany vai entrar |
   | `OWNER_PASSWORD` | uma senha forte (mínimo 8 caracteres) |
   | `OWNER_NAME` | `Fany` |
   | `DATA_DIR` | `/data` |
   | `PUBLIC_URL` | por enquanto deixe em branco; você preenche no passo 4 |

   *(Opcional)* `INFINITEPAY_HANDLE` = a sua InfiniteTag. Se não colocar aqui, você cadastra pelo painel (passo 5).
5. Em **Settings → Networking → Generate Domain**: o Railway cria um endereço tipo `spinning-fany-production.up.railway.app`.
   Copie, crie a variável **`PUBLIC_URL`** = `https://` + esse endereço (sem barra no fim). O Railway reinicia sozinho.
6. Abra o endereço. O site deve aparecer. Entre com o `OWNER_EMAIL` e a `OWNER_PASSWORD`: você cai no **Painel da dona**. ✅

---

## PASSO 4 · Domínio próprio (10 min + espera)

1. Compre o domínio no **registro.br** (ex.: `spinningfany.com.br`).
2. No Railway: **Settings → Networking → Custom Domain** → digite `www.spinningfany.com.br`. O Railway mostra um **CNAME** (tipo `xxxx.up.railway.app`).
3. No Registro.br: **DNS → Editar zona** → crie um registro **CNAME** com nome `www` apontando para o endereço que o Railway mostrou. Salve.
4. Espere de 10 min a algumas horas. Quando o Railway marcar o domínio como verificado, altere a variável **`PUBLIC_URL`** para `https://www.spinningfany.com.br`.

> Dica: o Registro.br não aceita CNAME no endereço "pelado" (sem o `www`). Use sempre `www.` — ou mude o DNS do domínio para a **Cloudflare** (grátis) se quiser o endereço sem `www`.

---

## PASSO 5 · Configurar o estúdio (10 min) — dentro do painel

Entre em `…/#/entrar` com o e-mail e a senha da dona.

1. **Pagamentos** → cole a **InfiniteTag** → **Salvar** → **Testar conexão**. Deve aparecer "Conexão funcionando ✔".
2. **Agenda** → **Grade da semana**: escolha dias e horário (ex.: Seg/Qua/Sex às 19h, 2 semanas) → **Gerar grade**. Repita para cada horário.
3. **Agenda → Aulas especiais**: a **Aula Temática Havai** (R$ 35, 90 min, 8 bikes) já está pronta. Use **+ Agendar data** para colocar no calendário.
4. **Pacotes**: confira nomes, preços, créditos e validade. Dá para editar tudo, criar e desativar planos.
5. **Estúdio**: confira endereço, WhatsApp, quantidade de bikes (8), prazo de cancelamento e o termo de responsabilidade.
6. **Equipe**: adicione administradoras (nome, e-mail e senha temporária). Elas entram pelo **mesmo login** e veem o painel (sem Equipe, sem conta de pagamento e sem backup).

Quem criar conta pelo site entra **sempre como aluna (cliente)**.

---

## PASSO 5B · E-mails (15 min) — confirmação de cadastro, avisos, fila de espera e promoções

Sem isso o site funciona, mas **não envia e-mail** (e a confirmação de e-mail não é exigida). Com isso ligado, a aluna precisa confirmar o e-mail antes de reservar ou comprar.

**Recomendado: Brevo** (grátis até **300 e-mails por dia**, cerca de 9.000 por mês).

1. Crie a conta em **brevo.com** (grátis).
2. Cadastre o **remetente**: no menu *Remetentes, domínios e IPs dedicados → Remetentes → Adicionar*. Coloque o nome "Spinning Fany" e um e-mail seu; o Brevo manda um código para confirmar.
   *(Os nomes dos menus podem mudar um pouco.)*
3. Pegue a chave: *SMTP e API → Chaves de API → Gerar nova chave*. Copie.
4. No Railway → Variables, crie:

   | Nome | Valor |
   |---|---|
   | `BREVO_API_KEY` | a chave copiada |
   | `EMAIL_FROM` | `Spinning Fany <o-email-que-voce-confirmou>` |

5. Depois que o site reiniciar, entre no painel → aba **E-mails**: o status deve aparecer como ligado. Mande um e-mail de teste para você.

> Dica para não cair no spam: depois que o domínio estiver no ar, no Brevo faça a **autenticação do domínio** (ele mostra 2 ou 3 registros para colar no DNS). É um passo único.
> E-mails de Gmail/Hotmail como remetente costumam cair mais no spam; o ideal é um e-mail do seu próprio domínio.

**Alternativa:** Resend (`RESEND_API_KEY`), grátis até 100 por dia e só envia de domínio verificado.

### Como os e-mails funcionam
- **Confirmação de cadastro**, **esqueci a senha**, **reserva confirmada (com o número da bike)**, **bike trocada**, **créditos**, **aula cancelada/alterada**, **vaga liberada na fila** e **vaga garantida na Aula Temática** saem automaticamente para quem tem e-mail confirmado.
- *(Não há lembrete automático antes da aula por e-mail. A Fany continua mandando o lembrete pelo WhatsApp, no painel Hoje.)*
- **Promoções**: painel → **E-mails** → escreva o assunto e a mensagem, escolha para quem (todas, com crédito, sumidas…) e envie. Só recebe quem marcou **"quero receber promoções"** no cadastro (a caixa vem desmarcada). Todo e-mail promocional tem link de **descadastro**, e promoções só saem entre **8h e 21h**.
- O sistema envia aos poucos e respeita o limite diário (`EMAIL_DAILY_LIMIT`). Se passar do limite, continua no dia seguinte.

### Fila de espera com confirmação
1. A aula lotou: a aluna toca em **Entrar na fila de espera**.
2. Alguém desiste: a **primeira da fila que tem crédito** recebe **e-mail e aviso no painel** e a vaga fica **reservada para ela**.
3. Ela toca em **Confirmar minha vaga**, escolhe a bike no mapa e pronto (o crédito é descontado nessa hora) — ou toca em **Não vou**.
4. Prazo para confirmar: de **10 a 30 minutos**, conforme o tempo que falta para a aula (termina pelo menos 5 min antes). Passou o prazo ou recusou, a vaga vai para a próxima da fila.

### Bike sempre à vista
No painel da aluna, o card **"Sua próxima aula"** mostra a sala com a **bike dela em destaque**, em qualquer aba. Em **Minhas aulas** cada reserva tem a mini sala também.

---

## PASSO 5C · Entrar com Google (opcional, 10 min)

O botão **"Entrar com Google"** só aparece se você fizer isto. Sem isso, o login por e-mail/CPF e senha continua normal.

1. Acesse **console.cloud.google.com** com uma conta Google e crie um projeto (ex.: "Spinning Fany").
2. Menu **APIs e serviços → Tela de consentimento OAuth**: tipo **Externo**, nome do app "Spinning Fany", seu e-mail. Ao final, clique em **Publicar app** (senão só você consegue entrar).
3. **Credenciais → Criar credenciais → ID do cliente OAuth → Aplicativo da Web**. Em **Origens JavaScript autorizadas** coloque o endereço do site (`https://www.seudominio.com.br`).
4. Copie o **ID do cliente** (termina em `.apps.googleusercontent.com`) e crie no Railway a variável **`GOOGLE_CLIENT_ID`**.
5. Quem entra pelo Google pela primeira vez completa o cadastro (CPF, WhatsApp e termo) antes de reservar ou comprar.

> Esse botão eu só consegui testar no servidor (a conferência do token). Teste o clique de verdade logo depois de ligar.

---

## PASSO 6 · Teste de verdade com R$ 1,00 (5 min)

1. No painel → **Pacotes** → crie o plano **"Teste"**: 1 crédito, **R$ 1,00**.
2. Saia, crie uma conta de aluna com outro e-mail, vá em **Comprar → Teste** e pague com o seu Pix.
3. Em alguns segundos você volta para o site com **"Pagamento confirmado"** e **1 crédito**. 🎉
4. Reserve uma bike para testar. Depois, no painel, desmarque **Ativo** do plano "Teste".

Se não creditar: veja a seção *Problemas comuns* abaixo.

---

## Segurança — o que já está pronto

- Senhas guardadas **criptografadas** (nunca em texto).
- Cada aluna só vê **os próprios dados**; as bikes ocupadas aparecem sem nome.
- Pagamento só vale depois que o servidor **confere na InfinitePay** (um aviso falso não libera crédito) e o valor tem que bater com o pedido.
- Cada pagamento credita **uma vez só**, mesmo se a InfinitePay avisar duas vezes.
- Limite de tentativas de login, proteção contra sites falsos e cabeçalhos de segurança.
- **CPF**: obrigatório no cadastro, validado e único. Na equipe aparece mascarado (•••.123.456-••); ao tocar em **mostrar**, o sistema registra quem viu. A aluna nunca recebe o CPF de volta nem dados de outras alunas.
- **E-mail confirmado** antes de reservar e comprar (quando o serviço de e-mail está ligado).
- **Cópia de segurança automática por dia** (guarda as últimas 30) no disco do servidor, e botão **Estúdio → Baixar cópia** (só a dona).

## Rotina simples

- **Toda semana:** Estúdio → **Baixar cópia** e guarde no Drive/e-mail.
- **Mensalidade:** Pagamentos → **Enviar link do mês** (abre o WhatsApp com o link; pagou, os créditos caem sozinhos).
- **Aluna esqueceu a senha:** ela toca em **Esqueci a senha** na tela de login e recebe o link por e-mail. Se o e-mail não estiver ligado: Alunas → abrir a aluna → **Redefinir senha** → passe a senha temporária pelo WhatsApp.
- **Aluna cadastrada pelo estúdio (sem e-mail):** Alunas → abrir → **Criar acesso**.
- **Dona esqueceu a senha:** no Railway, mude `OWNER_PASSWORD`, crie `OWNER_FORCE_RESET` = `1`, aguarde reiniciar, entre, e **apague** `OWNER_FORCE_RESET`.

## Problemas comuns

| Sintoma | O que fazer |
|---|---|
| "Pagamento online está sendo ativado" | Falta a InfiniteTag (painel → Pagamentos) |
| "A InfinitePay recusou o pedido" | Confira a InfiniteTag (sem `$`) e se o **Checkout Integrado** está habilitado no app |
| Pagou e o crédito não caiu | Painel → **Pagamentos**: o pedido aparece em "aguardando". Confira no app InfinitePay e toque em **Já recebi · liberar**. Confira também se `PUBLIC_URL` está igual ao endereço real do site |
| Dados sumiram depois de atualizar | O **Volume `/data`** não foi criado/montado (passo 3.3) e `DATA_DIR` precisa ser `/data` |
| Horário das aulas errado | Já usa o horário de Brasília automaticamente |

## Restaurar uma cópia de segurança (se um dia precisar)

Pare o serviço no Railway, substitua o arquivo `/data/db.json` pela cópia (`db-AAAA-MM-DD.json` da pasta `/data/backups`, ou o arquivo baixado no painel) e reinicie.

## Custos e alternativas

- **Railway Hobby:** US$ 5/mês (já inclui US$ 5 de uso; este site usa pouquíssimo). Volume de disco: US$ 0,15 por GB/mês. *(Confirme os preços atuais em railway.com/pricing.)*
- **Mais barato ainda:** um VPS pequeno (a partir de ~US$ 4–5/mês em provedores como Hetzner ou Contabo) roda o mesmo `Dockerfile`, mas exige mexer com servidor — só vale se você tiver ajuda técnica.
- **E-mails:** Brevo grátis (300 por dia). Confira os limites atuais no site deles.
- **Pix pela InfinitePay:** sem taxa. **Cartão:** taxa conforme o seu plano na InfinitePay (confira no app).
- Não precisa de Firebase nem Supabase: os dados ficam no próprio servidor, em arquivo, com cópia diária. Para um estúdio (centenas de alunas) isso sobra.

## Para quem for mexer no código

Não precisa de `npm install` (zero dependências). `node build.js` gera `public/app.js` e `server/core.js` a partir de `src/` e `client/`. `node tests/api.test.js` roda os testes do servidor (com uma InfinitePay simulada).
