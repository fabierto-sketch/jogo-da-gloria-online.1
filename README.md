# JOGO DA GLÓRIA ONLINE ❤️✈️

O velho Jogo da Glória, com dados e casas, transformado na viagem de um casal: **do Porto até ao Reencontro em São Gonçalo (RJ)**. São duas pessoas a jogar à distância, com:
- um tabuleiro em espiral com 63 casas;
- peças à escolha;
- cartas de perguntas, conversa, quiz Portugal × Brasil e desafios;
- videochamada, chat e reações;
- contagem decrescente até ao dia do reencontro.

- **Jogo:** `https://o-seu-servico.onrender.com`
- **Painel de administração:** `https://o-seu-servico.onrender.com/admin`

O projeto usa a mesma base e as mesmas regras de segurança do Jogo do Galo, da Batalha Naval e do Xadrez.

---

## Índice

1. [O que inclui](#o-que-inclui)
2. [Regras do jogo](#regras-do-jogo)
3. [Personalizar para vocês os dois](#personalizar-para-vocês-os-dois)
4. [Estrutura do projeto](#estrutura-do-projeto)
5. [Base de dados (importante)](#base-de-dados-importante)
6. [Executar no computador](#executar-no-computador)
7. [Publicar no GitHub](#publicar-no-github)
8. [Publicar no Render](#publicar-no-render)
9. [Configurar o ADMIN_PASSWORD](#configurar-o-admin_password)
10. [Variáveis de ambiente](#variáveis-de-ambiente)
11. [Testar com dois jogadores](#testar-com-dois-jogadores)
12. [Videochamada: STUN/TURN](#videochamada-stunturn)
13. [Segurança](#segurança)
14. [Testes automáticos](#testes-automáticos)
15. [Limitações conhecidas](#limitações-conhecidas)

---

## O que inclui

### Página inicial

- Título «JOGO DA GLÓRIA» com um tabuleiro de demonstração animado e as duas peças a passear.
- **Contagem decrescente até ao Reencontro**, por exemplo «Faltam 100 dias para o Reencontro». A data define-se no painel.
- Botões **ENTRAR NO JOGO**, **REGRAS DO JOGO**, **COMO JOGAR** e **PAINEL DE ADMINISTRAÇÃO**.
- Mensagem de boas-vindas configurável, como «Para a Bernardete, com amor ❤️».

### Salas privadas

- Só o administrador cria salas. Cada sala tem um código de 6 caracteres e um link de convite (**Copiar convite**).
- Máximo de **2 jogadores** por sala. Para entrar basta o nome.
- Mostra quem está online e avisa quando alguém entra, sai, perde a ligação ou volta.
- Quem recarregar a página volta ao mesmo lugar, com as peças nas mesmas casas.

### Tabuleiro e peças

- **Tabuleiro em espiral** desenhado em SVG: 63 casas coloridas com ícones, o Porto à partida e um coração ao centro, «O Reencontro».
- **10 peças originais** à escolha de cada um: homem, mulher, carro, avião, cão, gato, coelho, urso, coração e estrela. Os dois não podem escolher a mesma.
- **Animações:**
  - dados 3D a rolar;
  - a peça salta casa a casa;
  - os aviões levantam voo;
  - as casas más fazem a peça escorregar para trás;
  - troca de lugares;
  - cartas que se viram;
  - avisos grandes no tabuleiro;
  - confetes na chegada.
- **8 temas** (Clássico, Néon, Madeira, Cristal, Preto e dourado, Azul tecnológico, Vermelho e preto, Romântico), modo claro e escuro, e **3 estilos de tabuleiro**: ilustrado, vintage e noturno.
- **Sons próprios:** dados, saltos, cartas, avião, sininho, «boing» das casas más, vitória…
- **Diário de bordo:** regista tudo o que aconteceu, por exemplo «Fábio: 🎲 2+6: casa 0 → 8».

### Cinco baralhos de cartas

| Baralho | Quem decide | Prémio |
|---|---|---|
| 💞 **Quanto me conheces?** (40 + as vossas) | O outro diz se acertaste | Certo: +2 casas |
| 💬 **Conversa a dois** (40 + as vossas) | O outro confirma que respondeste | +1 casa |
| 🇵🇹🇧🇷 **Quiz Portugal × Brasil** (56) | O servidor corrige | Certo: +2 · Errado: −1 |
| 🎭 **Desafios** (40 + os vossos), românticos e divertidos, sempre à frente da câmara | O outro diz se cumpriste | Cumpriu: +3 · Recusou: −2 |
| 🍀 **Sorte do amor** (9 efeitos) | Automático | Avançar, recuar, jogar outra vez, trocar de lugar, escudo, voar até ao próximo avião… |

No quiz, **a resposta certa nunca é enviada ao navegador** antes de responderes, por isso não dá para fazer batota.

### Seis modos

| Modo | Como funciona |
|---|---|
| ⚔️ Partida clássica | Uma única viagem decide tudo. |
| 🥉 Melhor de três | Vence quem ganhar duas viagens. |
| 🏅 Melhor de cinco | Vence quem ganhar três viagens. |
| 🏆 Campeonato | Viagens seguidas com classificação, até quererem parar. |
| 🎁 Desafio surpresa | Cada viagem tem um desafio extra para quem perder. |
| 😌 Jogo descontraído | Sem pontuação, só pelo prazer de jogar e conversar. |

Quem começa a lançar os dados alterna de viagem para viagem.

### Placar, histórico e estatísticas

- **Placar:**
  - vitórias e percentagem;
  - «acertou sobre o outro»;
  - quiz certo;
  - desafios cumpridos;
  - conversas;
  - número de viagens;
  - sequência.
- **Histórico:** data, modo, quem chegou primeiro, número de lançamentos e onde ficou o outro.
- Tudo fica na base de dados. Apagar o histórico exige o acordo dos dois, ou pode ser feito pelo administrador.

### Videochamada, chat e interações

Funcionam como nos outros jogos:
- **videochamada** com microfone, câmara, volume, ecrã inteiro e preparação para TURN;
- **chat** com emojis, «a escrever…» e mensagens novas;
- **reações animadas**.

### Painel de administração (`/admin`)

- **Visão geral:**
  - criar salas;
  - salas criadas e ativas;
  - jogadores online;
  - viagens jogadas;
  - lançamentos;
  - perguntas acertadas, quiz, desafios e conversas;
  - gráfico dos últimos 14 dias;
  - últimas viagens.
- **Salas:** filtro e pesquisa, copiar convite, abrir, fechar, reabrir, limpar histórico e eliminar.
- **Definições:** ver a secção [Personalizar para vocês os dois](#personalizar-para-vocês-os-dois).
- **Atividade:** estado do servidor e registo de utilização.

---

## Regras do jogo

1. Cada um escolhe a sua peça. Começam os dois no **Porto (casa 0)**.
2. Na vez de cada um, lança-se **dois dados** (o resultado é sorteado no servidor) e anda-se a soma.
3. **Primeiro lançamento:** quem tirar 6+3 vai logo para a casa 26, e quem tirar 5+4 vai para a 53, como no Jogo da Glória tradicional.
4. **Aviões ✈️** (casas 5, 9, 14, 18, 23, 27, 32, 36, 41, 45, 50, 54 e 59): voa-se até ao avião seguinte e joga-se outra vez.
5. **Casas especiais:**

   | Casa | Efeito |
   |---|---|
   | 6 · Ponte D. Luís 🌉 | Atravessa até à 12 e joga outra vez |
   | 19 · Saudade 💭 | Fica 1 vez sem jogar |
   | 26 · Correio do amor 💌 | Joga outra vez |
   | 31 · Jet lag 😴 | Fica 2 vezes sem jogar |
   | 42 · Fuso horário 🕐 | Volta à 30 |
   | 52 · Alfândega 🛂 | Fica 3 vezes sem jogar |
   | 53 · Bilhete dourado 🎫 | Joga outra vez |
   | 58 · Voo cancelado ❌ | Volta à 30 |

6. **Casas de cartas** (💞 💬 🇵🇹🇧🇷 🎭 🍀): tira-se uma carta do baralho dessa casa (ver a tabela acima).
7. **Chegar ao Reencontro (63):** é preciso a conta certa. Se passar, a peça recua o que sobrar.
8. **E mais alguma coisa…** Quem chega ao Reencontro ainda não ganhou! **O outro escreve a pergunta final**, ou tira uma ao acaso.
   - Se acertar, **ganha a viagem** ❤️.
   - Se falhar, volta à casa 56 e o jogo continua.

---

## Personalizar para vocês os dois

No painel, em **Definições**, sem mexer em código:

- **Data do reencontro:** a página inicial mostra a contagem decrescente. Se não houver data, mostra uma mensagem «até Agosto».
- **Partida** (Porto) e **Chegada** (São Gonçalo · RJ): são os nomes que aparecem no tabuleiro.
- **As vossas perguntas «Quanto me conheces?»**, **de conversa** e **os vossos desafios:** escreve uma por linha. Juntam-se às cartas que já vêm no jogo. Em `{outro}` aparece o nome do outro jogador, por exemplo «Qual é o meu sabor de gelado preferido, {outro}?».
- Desafios surpresa de quem perde, mensagem de boas-vindas, modo por omissão, chat, reações e provocações.

As cartas base estão em `data/cartas.json` e podem ser editadas à vontade. Cada carta do quiz tem a resposta certa em primeiro lugar (`"a": 0`). O servidor baralha as opções.

---

## Estrutura do projeto

```
jogo-da-gloria-online/
├── server.js               # Arranque: Express + Socket.IO, rotas e cabeçalhos de segurança
├── package.json            # npm start → node server.js
├── .env.example            # Modelo das variáveis de ambiente
├── render.yaml             # Blueprint opcional do Render
├── README.md
├── .github/workflows/descompactar.yml   # Ajudante para enviar o ZIP pelo site do GitHub
├── data/
│   ├── cartas.json         # Baralhos: conheces, conversa, quiz PT×BR, desafios, sorte
│   └── fun.json            # Desafios surpresa e provocações
├── server/
│   ├── game-engine.js      # Tabuleiro de 63 casas, dados, casas especiais, cartas, final
│   ├── rooms.js            # Salas, jogadores, peças, modos, pontuação, chat e eventos Socket.IO
│   ├── database.js         # PostgreSQL (produção) ou SQLite (local) + migrações
│   ├── admin.js            # API do painel
│   ├── settings.js         # Definições (data, cidades, cartas próprias) na base de dados
│   ├── webrtc.js           # Sinalização da videochamada e STUN/TURN
│   ├── security.js         # Limites de pedidos, limpeza de texto, cabeçalhos
│   ├── logger.js           # Registo de atividade
│   └── env.js              # Leitura do ficheiro .env local
├── public/
│   ├── board.js            # Tabuleiro em espiral, peças SVG, dados 3D, animações, sons, confetes
│   ├── app.js              # Aplicação do jogador
│   ├── index.html          # Página inicial e jogo
│   ├── style.css           # Base: temas, modos claro/escuro, componentes, chat, vídeo
│   ├── gloria.css          # Tabuleiro, cartas, dados, avisos, disposição responsiva
│   ├── video.js            # Videochamada WebRTC
│   ├── admin.html / admin.css / admin-panel.js
│   ├── favicon.svg
│   └── sounds/
└── test/
    └── run-tests.js        # Testes automáticos (servidor real)
```

---

## Base de dados (importante)

O disco do Render gratuito **é temporário**. Por isso, as salas, viagens, posições, histórico, chat, estatísticas, definições e cartas próprias ficam numa base **PostgreSQL**, indicada em `DATABASE_URL`.

| Opção | Custo | Como fazer |
|---|---|---|
| **Neon** (recomendado) — <https://neon.tech> | Gratuito, sem prazo | Crie um **New Project** (região Europa, por exemplo Frankfurt) e copie a *connection string* (`postgresql://…?sslmode=require`) para `DATABASE_URL`. |
| **Render Postgres** | Plano pago | **O plano gratuito do Render expira 30 dias após a criação** e é apagado. |
| Supabase, Railway ou outro | Variável | Qualquer URL `postgresql://` funciona. |

As tabelas são criadas automaticamente no primeiro arranque.

**Pode usar o mesmo projeto Neon dos outros jogos?** Pode, mas cada jogo deve ter uma **base de dados própria**, porque as tabelas têm os mesmos nomes. No Neon, crie uma base nova no mesmo projeto em **Databases → New Database**, com o nome `gloria`, e copie a ligação dessa base.

Sem `DATABASE_URL`, o jogo usa um ficheiro SQLite local (`data/local.db`). Isso serve só para testar no computador.

---

## Executar no computador

Requisitos: **Node.js 22.13 ou superior**.

```bash
npm install
cp .env.example .env        # no Windows: copy .env.example .env
# edite .env e defina ADMIN_PASSWORD
npm start
```

- Jogo: <http://localhost:3000>
- Painel: <http://localhost:3000/admin>

---

## Publicar no GitHub

### Opção A — pelo site, com o ZIP (a mais simples)

1. Em <https://github.com/new> escreva o nome `jogo-da-gloria-online`, escolha **Private** e clique **Create repository**.
2. **Primeiro, o ajudante:**
   1. Clique **creating a new file**.
   2. No nome do ficheiro escreva exatamente `.github/workflows/descompactar.yml`, com um ponto no início.
   3. Cole o conteúdo do ficheiro com o mesmo nome que está dentro do ZIP (é igual ao dos outros jogos) e clique **Commit changes**.
3. **Só depois, o ZIP:**
   1. Clique **Add file → Upload files**.
   2. Envie `jogo-da-gloria-online.zip` **sem o descompactar** e clique **Commit changes**.
4. Abra **Actions** e espere pelo ✅ em «Descompactar zip».
   - Se o ZIP foi enviado antes do ajudante, carregue em **Descompactar zip → Run workflow**.
5. Em **Code** deve ver:
   ```
   .github/  data/  public/  server/  test/
   .env.example  .gitignore  README.md  package.json  render.yaml  server.js
   ```

Se aparecer ❌, vá a **Settings → Actions → General → Workflow permissions**, escolha **Read and write permissions**, guarde e volte a correr o ajudante.

### Opção B — pela linha de comandos

```bash
git init
git add .
git commit -m "Jogo da Glória Online"
git branch -M main
git remote add origin https://github.com/O-SEU-UTILIZADOR/jogo-da-gloria-online.git
git push -u origin main
```

---

## Publicar no Render

1. **Base de dados:** crie-a no Neon (base `gloria`) e copie a URL.
2. Em <https://dashboard.render.com>, clique **New → Web Service** e escolha o repositório `jogo-da-gloria-online`.
3. Preencha:

   | Campo | Valor |
   |---|---|
   | Language | **Node** |
   | Branch | `main` |
   | Region | **Frankfurt (EU Central)** |
   | Build Command | `npm install` |
   | Start Command | `npm start` |
   | Instance Type | **Free** |
   | Health Check Path | `/healthz` (em *Advanced*) |

4. Em **Environment Variables**, adicione:

   | Chave | Valor |
   |---|---|
   | `ADMIN_PASSWORD` | a sua palavra-passe |
   | `DATABASE_URL` | a URL do Neon (da base `gloria`) |
   | `NODE_ENV` | `production` |
   | `FORCE_HTTPS` | `true` |

   **Não** crie `PORT`: o servidor usa `process.env.PORT || 3000` e o Render define a porta sozinho.
5. Clique **Deploy Web Service**. Nos **Logs** deve aparecer:
   ```
   Base de dados: PostgreSQL ligado.
   Migração 1 aplicada (estrutura inicial).
   Jogo da Glória Online a funcionar na porta 10000 (base de dados postgres)
   ```
6. Abra `https://<o-seu-serviço>.onrender.com/admin` e entre.
   1. Em **Definições**, ponha a data do reencontro e as vossas perguntas.
   2. Crie a sala e envie o convite à Bernardete.

---

## Configurar o ADMIN_PASSWORD

A palavra-passe existe **apenas** na variável de ambiente do servidor. Não está em nenhum ficheiro do projeto e nunca é guardada no navegador.

- **No Render:** no serviço, abra **Environment → Add Environment Variable**, use a chave `ADMIN_PASSWORD` e clique **Save Changes**. O serviço reinicia sozinho.
- **No computador:** escreva `ADMIN_PASSWORD=…` no ficheiro `.env`.
- Deve ter pelo menos **6 caracteres**; recomendam-se 12 ou mais. Sem ela, o painel fica desativado e ninguém cria salas.
- Para mudar, altere a variável e depois use **Terminar todas as sessões** no painel.
- Depois de 8 tentativas falhadas, o login fica bloqueado durante 15 minutos.

---

## Variáveis de ambiente

| Variável | Obrigatória | Descrição |
|---|---|---|
| `ADMIN_PASSWORD` | **sim** | Palavra-passe do painel (mínimo 6 caracteres) |
| `DATABASE_URL` | **sim no Render** | Ligação PostgreSQL. Sem ela, usa SQLite local. |
| `NODE_ENV` | recomendada | `production` |
| `FORCE_HTTPS` | recomendada | `true` para redirecionar para HTTPS |
| `PORT` | não | Definida pelo Render (no computador: 3000) |
| `PUBLIC_URL` | não | Endereço usado nos convites (detetado automaticamente) |
| `DATABASE_SSL` | não | `true`/`false` para forçar SSL |
| `TURN_URLS`, `TURN_USERNAME`, `TURN_CREDENTIAL` | não | Servidor TURN para a videochamada |
| `STUN_URLS` | não | Substitui os servidores STUN por omissão |
| `ADMIN_SESSION_HOURS` | não | Duração da sessão de administrador (12 h) |
| `MAX_ROOMS` | não | Número máximo de salas (200) |
| `DATABASE_POOL_MAX` | não | Ligações ao PostgreSQL (8) |
| `SQLITE_FILE` | não | Ficheiro SQLite local |

`GLORIA_TEST_DICE` serve só para os testes automáticos escolherem os dados. **Nunca a defina no Render.**

---

## Testar com dois jogadores

1. No painel `/admin`, crie uma sala e copie o convite.
2. **Jogador 1:** abre o convite, escreve o nome e entra.
3. **Jogador 2:** abre o convite noutro dispositivo, ou usa **ENTRAR NO JOGO** e escreve o código.
4. Cada um escolhe a sua peça. Escolham o modo e carreguem em **Começar a viagem ✈️**.
5. Lancem os dados à vez e respondam às cartas que forem saindo. Repare que no «Quanto me conheces?» é **o outro** que decide se acertaste.
6. Recarreguem a página a meio: as peças ficam nas mesmas casas.
7. Experimentem o chat, as reações e o botão **Ligar** da videochamada.

Para testar sozinho, use uma janela normal e uma janela anónima.

---

## Videochamada: STUN/TURN

Os servidores **STUN** gratuitos já vêm configurados e funcionam na maioria das redes domésticas. Entre Portugal e o Brasil, em **dados móveis (4G/5G)** ou em redes restritivas, pode ser preciso configurar um servidor **TURN** (Metered, Twilio, Cloudflare, Xirsys…):

```
TURN_URLS=turn:SERVIDOR:80,turn:SERVIDOR:443,turns:SERVIDOR:443?transport=tcp
TURN_USERNAME=…
TURN_CREDENTIAL=…
```

A câmara só funciona em HTTPS (o Render fornece-o) ou em `localhost`.

---

## Segurança

- **Só o administrador cria salas.** A API do painel responde `401` sem sessão. As rotas públicas de salas respondem `403`. Eventos Socket.IO desconhecidos (como `room:create`) são recusados e registados.
- **Tudo decidido no servidor:**
  - os dados são sorteados com `crypto.randomInt`;
  - o servidor aplica os movimentos, as casas especiais e as cartas;
  - o servidor corrige o quiz;
  - só o outro jogador pode julgar as tuas respostas;
  - o navegador só pede «lançar», «responder» ou «julgar».
- **Palavra-passe:** existe só em `ADMIN_PASSWORD` e é comparada em tempo constante. Os testes confirmam que não aparece nos ficheiros públicos nem no navegador.
- **Sessões de administrador:** ficam na base de dados (só o hash), num cookie `HttpOnly` e `SameSite=Strict` (e `Secure` em HTTPS), com proteção anti-CSRF.
- **Jogadores:** são identificados por um token aleatório; a base guarda só o hash.
- **Proteções:**
  - ações duplicadas (cada ação tem um número);
  - ações simultâneas (bloqueio por sala);
  - jogadas fora de vez;
  - limites de pedidos e eventos;
  - texto sempre limpo, contra XSS;
  - cabeçalhos CSP, HSTS, X-Frame-Options, nosniff, Referrer-Policy e Permissions-Policy.

---

## Testes automáticos

```bash
npm install
npm test                                                  # SQLite temporário
TEST_DATABASE_URL=postgresql://…/base_de_teste npm test   # PostgreSQL (a base é limpa!)
```

São 26 testes com o servidor real. Cobrem:

- **Motor:**
  - 63 casas sem sobreposições;
  - aviões, ponte, casas de ficar sem jogar e de recuar;
  - regra do primeiro lançamento (6+3 e 5+4);
  - ressalto além da 63;
  - escudo;
  - todos os baralhos;
  - pergunta final certa e errada;
  - **300 viagens aleatórias completas**, que terminam sempre sem erros.
- **Servidor e salas:**
  - arranque e página inicial;
  - palavra-passe fora dos ficheiros públicos;
  - bloqueio de convidados;
  - login do administrador;
  - entrada por código e por convite;
  - limite de 2 jogadores.
- **Jogo:**
  - escolha da peça;
  - turnos, ações fora de vez e duplicadas;
  - quiz **sem fuga da resposta** para o navegador;
  - só o outro julga;
  - pergunta final escrita pelo outro;
  - modos melhor de três e melhor de cinco;
  - pontuação e histórico.
- **Interações:** chat e reações, e sinalização da videochamada.
- **Ligação e persistência:** desconexão e reconexão, e **persistência após reinício do servidor**.
- **Administração:**
  - sair e voltar;
  - apagar o histórico com acordo;
  - estatísticas;
  - definições da viagem e cartas próprias;
  - salas em paralelo;
  - limite de tentativas de login.

O que foi realmente testado antes da entrega:

- **Os 26 testes passaram** em SQLite e em **PostgreSQL 16**.
- **Browser real (Chromium):** dois jogadores, com câmara e microfone simulados, e 30 verificações, todas aprovadas:
  - página inicial e convidado bloqueado;
  - palavra-passe ausente do navegador;
  - data do reencontro e carta própria guardadas no painel;
  - contagem decrescente correta;
  - entrada por convite e por código, e terceiro jogador recusado;
  - escolha das peças;
  - **lançar os dados pelo botão**, com as peças animadas até à casa certa;
  - quiz respondido com cliques, só por quem tirou a carta e sem a resposta no navegador;
  - «Quanto me conheces?» julgado pelo outro (+2);
  - desafio;
  - chat e reação;
  - recarregar a meio;
  - **videochamada com imagem nos dois sentidos**;
  - chegada ao Reencontro, **pergunta final escrita pelo outro**, vitória e celebração;
  - histórico e «Jogar outra vez»;
  - **jogar com toques num telemóvel simulado (iPhone 13)**;
  - painel com sala ativa;
  - fechar a sala expulsa os jogadores.
- **Capturas de ecrã:** confirmaram visualmente:
  - o tabuleiro e as cartas;
  - a celebração;
  - os temas Romântico com estilo vintage e Néon com estilo noturno;
  - a versão de telemóvel.
- **Erros na consola:** os únicos foram os `401`/`403` provocados de propósito pelo teste de bloqueio de convidados.

---

## Limitações conhecidas

- **Não foi testado aqui um deploy real no Render nem uma ligação Neon real.** Foi testado com PostgreSQL 16 local, que usa o mesmo código.
- **Videochamada:** foi testada entre dois navegadores no mesmo computador, não entre Portugal e o Brasil. Em dados móveis pode precisar de TURN.
- **Telemóveis:** foram usados em emulação (iPhone 13 no Chromium), não num aparelho físico.
- **Cartas «Sorte do amor» e casas especiais no navegador:** os efeitos foram verificados pelos testes do motor e pelas 300 viagens aleatórias. Nem todos os efeitos apareceram no teste com o navegador.
- **Os sons** são gerados e simples. Não foram ouvidos por uma pessoa durante os testes.
- **Render gratuito:** o serviço adormece sem visitas e a primeira visita demora até um minuto. Os dados não se perdem.
- **Instâncias:** o jogo foi pensado para uma instância do servidor.
- **Fontes:** vêm do Google Fonts. Sem internet, são usadas as fontes do sistema.

---

Boa viagem — e que o Reencontro chegue depressa! ❤️✈️
