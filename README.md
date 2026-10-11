# POP BRILHO — Loja virtual

Site da POP BRILHO em um único arquivo (`index.html`), com a loja online integrada: catálogo, busca, sacola com cálculo de frete e pedido finalizado pelo WhatsApp.

## Como editar

Abra `index.html` e procure no `<script>` (final do arquivo):

- `WHATSAPP` — número da loja, só dígitos, com DDI e DDD (ex.: `5581988887777`)
- `FRETE` — valor da entrega
- `FRETE_GRATIS` — valor mínimo do pedido para frete grátis
- `P` — lista de produtos. Cada item tem:
  - `n` nome, `c` categoria, `v` volume/quantidade, `p` preço
  - `old` preço antigo (opcional, mostra riscado)
  - `b` selo (opcional, ex.: "Oferta")
  - `shape` desenho: `bottle`, `spray`, `jug`, `galao`, `bar`, `sponge`, `cloth`, `glove`, `kit`
  - `col` cor do frasco, `pop` ordem em "Mais vendidos" (maior = primeiro)

Se ainda existir um `loja.html` antigo no repositório, pode apagá-lo.

## Publicar com GitHub Pages

Settings → Pages → Source: *Deploy from a branch* → branch `main`, pasta `/ (root)`.
No plano gratuito do GitHub, o Pages só funciona com repositório **público**.
