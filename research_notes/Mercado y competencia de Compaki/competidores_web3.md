# Competidores Web3/cripto y proyectos adyacentes de Compaki (enfoque Stellar)

Fecha de corte: 2026-10-25. Nota metodológica: muchas cifras vienen de comunicados propios (SDF, MoonPay, Decaf) o de agregadores/comparadores (eco.com, rfp.wiki); se marca cuando la fuente es secundaria o hay conflicto. No se encontró ningún proyecto que combine las cuatro piezas de Compaki (marketplace multi-vendedor creado por cualquiera + split atómico on-chain + fondo comunitario con recompensas pro-rata o meta de recaudación + login sin cripto).

## 1. Pagos y comercio cripto (Shopify USDC, Stripe/Bridge, Coinbase Commerce, BitPay, Request, Solana Pay)

### Takeaway
Los grandes (Shopify+Coinbase+Stripe, Stripe/Bridge, BitPay, MoonPay Commerce) resuelven "aceptar stablecoins y liquidar a un comerciante" con fees de ~1–2%, pero ninguno documenta splits multi-parte on-chain a organizador/fondo comunitario; son rieles para una tienda individual, no para un mercado comunitario. Coinbase Commerce standalone habría cerrado el 31-mar-2026 (fuentes secundarias).

### Cited Findings
- Shopify + Coinbase + Stripe lanzaron en junio 2025 pagos USDC sobre Base dentro de Shopify Payments; comerciantes en 34 países, early access con despliegue amplio previsto para el resto de 2025 — [BetaKit](https://betakit.com/shopify-collaborates-with-coinbase-and-stripe-to-support-usdc-stablecoin-payments/); [PaymentExpert](https://paymentexpert.com/2025/06/16/stripe-and-shopify-launch-stablecoin-payments-for-global-commerce/)
- Por defecto el comerciante recibe moneda local (Stripe convierte); puede optar por recibir USDC. Shopify y Coinbase construyeron un contrato de "autorizar y capturar después" (imita tarjetas). Rebate de hasta 0,5% al comerciante en ciertos países y 1% cashback a consumidores en EE. UU. — [BetaKit](https://betakit.com/shopify-collaborates-with-coinbase-and-stripe-to-support-usdc-stablecoin-payments/); [Benzinga](https://benzinga.com/crypto/cryptocurrency/25/06/45921146/shopify-teams-up-with-coinbase-stripe-to-roll-out-usdc-stablecoin-payments-for-merchants)
- Fee de Stripe para pagos con stablecoin: 1,5% plano (vs ~2,9% + 30¢ tarjeta) — solo fuentes secundarias, sin página primaria verificada — [eco.com](https://eco.com/support/en/articles/15083174-stripe-stablecoin-payments-2026); [Allium](https://allium.so/blog/tempo-the-stripe-backed-stablecoin-blockchain/) advierte verificar
- Stripe cerró la compra de Bridge (~US$1,1B) en febrero 2025; lanzó Stablecoin Financial Accounts en 101 países (mayo 2025); impulsa Tempo, L1 de pagos con Paradigm (estado de mainnet inconsistente entre fuentes) — [BlockEden](https://blockeden.xyz/blog/2026/05/07/stripe-aws-for-money-stablecoin-bridge-tempo-cpn/); [Decrypt](https://decrypt.co/resources/what-tempo-payments-stablecoin-blockchain-stripe?rand=52368)
- Coinbase Commerce: fee 1% plano; el cliente paga gas — [eco.com](https://eco.com/support/en/articles/14895614-stablecoin-payment-processor-fees-compared-2026)
- Coinbase Commerce standalone cerrado el 31-mar-2026; herramientas migradas a Coinbase Business, solo disponible para entidades de EE. UU. y Singapur; comerciantes de otros países sin ruta de migración (fuentes secundarias; no se encontró el aviso oficial) — [learnwithhasan](https://learnwithhasan.com/payment-gateways/coinbase-commerce/); [rfp.wiki](https://www.rfp.wiki/crypto/payments-commerce/crypto-payment-processors/coinbase-commerce/bvnk); contradicho parcialmente por páginas 2026 que aún lo describen activo — [eco.com](https://eco.com/support/en/articles/14895621-coinbase-commerce-vs-bitpay-vs-crossmint-stablecoin-checkout-compared)
- BitPay: 2% + $0,25 (<$500k/mes), 1,5% + $0,25 ($500k–$1M), 1% + $0,25 (>$1M); liquidación fiat por defecto, con opción stablecoin o "split" de liquidación (entre monedas, no entre partes) — [eco.com](https://eco.com/support/en/articles/14895614-stablecoin-payment-processor-fees-compared-2026)
- Solana Pay para Shopify: Helio (procesador de Solana, 6.000+ comerciantes, $1,5B+ procesados) fue adquirido por MoonPay en enero 2025; desde el 15-oct-2025 MoonPay Commerce mantiene el plugin de Solana Pay para Shopify — [MoonPay](https://www.moonpay.com/newsroom/moonpay-commerce); [CB Insights](https://www.cbinsights.com/company/helio)
- Request Network / Request Finance: invoicing cripto, 2.300+ empresas (Aave, The Graph); precios inconsistentes entre agregadores (gratis vs desde $500/mes) — [GetApp](https://www.getapp.com/industries-software/a/request-finance); [Fitgap](https://us.fitgap.com/products/051946/request)

### Inferences
- El mercado de "checkout stablecoin" se está comoditizando y consolidando en manos de gigantes (Stripe, Coinbase, MoonPay, Shopify). Compaki no debe competir como pasarela; su valor es la lógica de reparto comunitario encima del pago.
- Fee de referencia del mercado: 1%–2% (Coinbase 1%, Stripe ~1,5%, BitPay 1–2% + $0,25). El 2% de Compaki está en rango, pero incluye además split + fondo comunitario + marketplace, algo que ninguno de estos ofrece.
- El cierre (reportado) de Coinbase Commerce fuera de EE. UU./Singapur deja a comerciantes de LatAm sin esa opción, un argumento a favor de soluciones nativas en Stellar con anclas locales.
- Los splits multi-parte en el mundo fiat existen vía Stripe Connect (marketplaces), pero no son atómicos on-chain ni transparentes para la comunidad (conocimiento general, no verificado en esta ronda).

### Gaps
- No se encontró la página oficial de precios de Stripe para stablecoins ni el aviso oficial de Coinbase sobre el cierre de Commerce.
- No se verificó si Stripe Connect soporta "destination charges"/split con stablecoins.
- "Sling" (mencionado en la consigna) no fue investigado; no se encontró información.

## 2. Marketplaces Web3, social commerce y recompensas (OpenBazaar, Origin/Dshop, Lens/Farcaster, buy-to-earn)

### Takeaway
Los marketplaces descentralizados puros fracasaron por adopción y sostenibilidad (OpenBazaar cerró en 2021; Origin abandonó el e-commerce por DeFi/OUSD). El social commerce on-chain (Farcaster Frames, Lens) sigue en etapa de hackathon. Los esquemas "buy-to-earn" que funcionan (Fold) son centralizados y premian en BTC, no reparten un fondo comunitario por marketplace.

### Cited Findings
- OpenBazaar: en septiembre 2020 anunció que cerraría servicios (seed nodes, API wallet) por falta de fondos y por no lograr el crecimiento de usuarios necesario para un negocio sostenible; un donante anónimo cubrió costos hasta fin de 2020; servidores cerrados el 15-ene-2021 — [Decrypt](https://decrypt.co/43028/decentralized-marketplace-openbazaar-to-close-unless-community-donates); [Cointelegraph](https://cointelegraph.com/news/anonymous-donor-saves-openbazaar-for-now); [Wikipedia](https://en.wikipedia.org/wiki/OpenBazaar)
- En 2023 el ex-líder Brian Hoffman insinuó una nueva versión en desarrollo (sin evidencia de relanzamiento) — [Cointelegraph](https://regional-front.cointelegraph.com/news/openbazaar-marketplace-says-it-s-set-to-grow-again-from-the-ashes)
- Origin Protocol: lanzó e-commerce descentralizado (Dshop) en 2017, pivotó en 2019 a infraestructura de marketplaces P2P; en 2020 lanzó OUSD (stablecoin con rendimiento) pensado para que comerciantes Dshop "ganen" en vez de pagar 2,9%; OUSD sufrió un hack de ~$7M en nov-2020 — [Origin blog](https://blog.originprotocol.com/november-2020-origin-token-ogn-holder-update-ac27dcbdb9c9); [CoinDesk](https://www.coindesk.com/origin-ousd-stablecoin-defi-savings-account); [Origin](https://originprotocol.com/meet-ousd-the-first-stablecoin-that-earns-a-yield-in-your-wallet)
- Farcaster Frames / Lens Open Actions permiten tipping, mint y transacciones dentro del feed; proyectos de comercio (Framify, Flames, Far-Reach) son de hackathon; Framify chocó con permisos de la API de órdenes de Shopify — [Dune](https://dune.com/blog/farcaster-and-lens); [Devfolio Far-Reach](https://devfolio.co/projects/farreach-1d98); [ETHGlobal Flames](https://ethglobal.com/showcase/flames-dfzrr)
- Unlock Protocol permite checkouts de membresías/suscripciones embebidos en Frames — [Unlock](https://unlock-protocol.com/blog/unlock-labs-feature-announcement--mint-memberships-and-subscriptions-directly-within-farcaster-frames)
- Fold (NASDAQ: FLD), "gana bitcoin al comprar": ingresos 2025 de $31,8M (+34%), pérdida neta de $69,6M; tarjeta de crédito con hasta 3,5–4% en BTC lanzada a inicios de 2026; >$70M en recompensas BTC distribuidas; crecimiento desacelerado en Q4 2025 — [The Block](https://www.theblock.co/post/394214/fold-reports-69-6-million-net-loss-for-2025-as-it-looks-to-expand-customer-base-with-bitcoin-credit-card); [MarketBeat](https://www.marketbeat.com/instant-alerts/fold-q4-earnings-call-highlights-2026-03-18/?.tsrc=rss)
- Fold + Steak 'n Shake: $5 en bitcoin por subir recibo (oct-2025) — [The Block](https://www.theblock.co/news/business/2025-10-31-fold-bitcoin-burger-rewards-377071)

### Inferences
- Lección de OpenBazaar/Origin: descentralizar todo (P2P, sin custodia, wallets propias) mata la UX y la adopción. Compaki evita eso con login email/Google (Cavos) y stablecoin, manteniendo solo el split y el fondo on-chain.
- Lección de Fold: las recompensas por comprar atraen usuarios pero son caras si las financia la empresa (pérdidas grandes). En Compaki el fondo de recompensas sale de un porcentaje de cada venta definido por el organizador (autofinanciado, no subsidio de plataforma), lo que es un diferenciador defendible.
- El social commerce Web3 no tiene un ganador; es un canal de distribución potencial (compartir tienda/marketplace como enlace), no un competidor directo.

### Gaps
- No se encontró anuncio formal de cierre de Dshop ni fecha.
- Sweat Economy ("move-to-earn"), Brave/BAT y programas de cashback/lealtad on-chain no fueron verificados en esta ronda; no se citan cifras.

## 3. Recaudación y bienes públicos (Gitcoin, Giveth, Endaoment, The Giving Block, Celo/ImpactMarket, Grassroots Economics)

### Takeaway
Las plataformas de donación cripto cobran ~1,5% (Endaoment) y financian proyectos vía donaciones/QF, pero desacopladas del comercio: nadie convierte cada compra de un marketplace en aporte automático a una meta. Lo más parecido en espíritu (fondos comunitarios locales) es Grassroots Economics/Sarafu en Celo, basado en vouchers comunitarios, no en ventas con split.

### Cited Findings
- Gitcoin cerró su unidad Grants Lab y Grants Stack y se refocalizó en su programa de grants (Gitcoin 3.0) — [Gitcoin governance](https://gov.gitcoin.co/t/proposal-gitcoin-grants-2025-and-beyond-funding-what-matters-most-in-the-ethereum-ecosystem/20356)
- GG24 (oct–nov 2025) distribuyó >$1,8M en seis dominios; Giveth operó las rondas QF OSS: $300k de matching, $36.657 en donaciones, 1.286 donantes únicos (volumen QF menor a GG23: $95.278); cifras de proyectos inconsistentes entre páginas (55/64/78) — [Gitcoin GG24](https://gitcoin.co/case-studies/gg24-first-funding-round-of-gitcoin-3-0); [Retrospectiva Giveth](https://gov.gitcoin.co/t/gg24-oss-qf-on-giveth-retrospective/24890)
- Giveth: operativo desde 2017, >$4M en donaciones y 6.300+ proyectos (listado de terceros) — [Gitcoin checker](https://checker.gitcoin.co/public/application/xv2GdQG01N/show)
- Endaoment: 1,5% en donaciones directas (0,5% entrada + 1% salida), no cobra a ONG; wire en EE. UU. $15; transferencias a wallets cripto gratis; promedio de otras plataformas ~5% según inversor — [Endaoment blog](https://blog.endaoment.org/blog/direct-donations-every-nonprofit-now); [Higher Ground Labs](https://highergroundlabs.com/announcing-higher-ground-labs-investment-in-endaoment/)
- The Giving Block: adquirida por Shift4 en marzo 2022; añadió donaciones con tarjeta/acciones — [BusinessWire](https://www.businesswire.com/news/home/20220315005249/en); [BusinessWire](https://www.businesswire.com/news/home/20220817005245/en/the-giving-block-expands-fundraising-capabilities-for-nonprofits-with-addition-of-stock-and-card-donation-solutions)
- Grassroots Economics / Sarafu: migró a Celo en julio 2023; a sept-2024: 33 commitment pools, 239 Community Asset Vouchers, 3.149 usuarios activos mensuales; estudio académico concluye que lo digital mejoró la actividad económica vs. lo analógico — [Grassroots Economics (git)](https://git.grassecon.net/grassrootseconomics/pelican-website-ge/blame/commit/44fb07076b42f520c815f7b4298255e8ecc77990/output/pages/sarafu-network.html); [arXiv 2512.04030](https://arxiv.org/abs/2512.04030v1)
- ImpactMarket (Celo, renta básica en cUSD): ~25.000 beneficiarios en 140 comunidades (~2021); token listado como "impactMarket [OLD] PACT" con capitalización ~$5k, sin actualización 2025 encontrada — [Celo blog](https://blog.celo.org/impactmarket-joins-celos-defi-for-the-people-initiative-f172b690ea24); [Mobula](https://mobula.io/asset/impactmarket-%5Bold%5D)

### Inferences
- La recaudación cripto depende de donaciones explícitas (fatiga del donante; volumen QF de Gitcoin cayendo entre GG23 y GG24). Compaki propone "recaudar comprando": cada venta aporta automáticamente a la meta, sin pedir donaciones adicionales. Es el ángulo diferenciador más claro frente a Giveth/Gitcoin/Endaoment.
- ImpactMarket parece inactivo o de baja actividad (inferencia por el token "[OLD]" y la falta de noticias); Grassroots Economics es un precedente valioso de "economía comunitaria on-chain" para citar como inspiración, no como competidor.

### Gaps
- Fee actual de The Giving Block no encontrado.
- Estado 2025–2026 de ImpactMarket y de Grassroots Economics no confirmado con fuentes oficiales.

## 4. Ecosistema Stellar (SCF, Beans, Vibrant, Lobstr, Decaf, MoneyGram, SDP, Trustless Work, Blend, hackathons) y quién ya hace splits

### Takeaway
Stellar es fuerte en wallets, remesas y rampas (Decaf, Beans, MoneyGram, SDP) y tiene infraestructura de escrow con fees de plataforma (Trustless Work), pero no se encontró un marketplace multi-vendedor con split automático a organizador + fondo comunitario. Los que ya reparten pagos en Stellar son: Trustless Work (fee de plataforma + receptores por hito), StellarSplit (facturas divididas entre pagadores) y SDP (desembolsos masivos 1-a-N, no split por venta).

### Cited Findings
- Trustless Work: escrow-como-servicio sobre Soroban para plataformas y marketplaces; API REST, React SDK y "Blocks" UI — [GitHub Trustless Work](https://github.com/Trustless-Work); [Docs](https://docs.trustlesswork.com/trustless-work/about/tldr)
- Trustless Work: roles (Service Provider, Approver, Release Signer, Receiver, Dispute Resolver, Platform Address); fee de protocolo 0,3% al liberar + fee de plataforma configurable (ej. 1%); single-release y multi-release con receptor por hito; resolución de disputas puede dividir fondos entre varias direcciones; USDC el activo más común, cualquier activo Stellar con trustline — [Trustless Work llms-full](https://docs.trustlesswork.com/trustless-work/llms-full.txt)
- Offer Hub (marketplace que usa contratos de Trustless Work) abrió a usuarios el 3-mar-2026; cifras auto-reportadas y en testnet — [SCF submission](https://communityfund.stellar.org/submissions/recNs5mLS2K2GFKVu)
- StellarSplit: contratos Soroban para facturas on-chain donde varios pagadores cubren su parte y, al completarse, el contrato enruta USDC a cada receptor; reembolso si vence sin fondear; casos: cuentas grupales, equipos freelance, remesas LatAm/África; múltiples forks idénticos en GitHub (origen poco claro) — [GitHub Stellar-split](https://github.com/Stellar-split/split-contracts)
- Beans App: wallet Stellar self-custodial con cash in/out MoneyGram, rendimiento en stablecoin y Beans Card; Merchant SDK genera QR "Pay with Beans" con monto, moneda, destino y webhook — [Alchemy](https://dapps.alchemy.com/dapps/beans); [npm beans-merchant-sdk](https://npmjs.com/package/beans-merchant-sdk); [SCF](https://communityfund.stellar.org/submissions/recoZCxDJu6l9Sy9S)
- Beans se integró al SDP como wallet para desembolsos masivos — [Stellar blog](https://stellar.org/blog/ecosystem/bulk-disbursements-with-beans-app-and-boss-money)
- Decaf: wallet no custodial de stablecoins, cash-out en 180+ países vía MoneyGram (#1 por volumen MG), 50k usuarios en 130+ países, >$32M volumen mensual (ago-2025), cifras de Decaf citadas por SDF — [Stellar i-Awards 2025](https://stellar.org/blog/ecosystem/stellar-i-awards-2025)
- Vibrant y LOBSTR fueron las primeras wallets Stellar con acceso al servicio MoneyGram (2022) — [Newsfile/Decaf](https://www.newsfilecorp.com/release/161302/Decaf-Integrates-with-Global-CryptotoCash-Service-Powered-by-MoneyGram-and-Stellar)
- MoneyGram lanzó en sept-2025 una app en Colombia con saldo en USDC sobre Stellar (wallet de Crossmint), sin llaves privadas ni gas para el usuario, cash-out en 6.000+ puntos; luego tarjeta Visa virtual (física prevista fines de 2026) — [Blockworks](https://blockworks.co/news/moneygram-stablecoin-app-colombia); [Cointelegraph](https://cointelegraph.com/news/moneygram-app-launch-colombia-stablecoin-savings?rand=6792); [The Defiant](https://thedefiant.io/news/tradfi-and-fintech/moneygram-stablecoin-visa-card-goes-live-in-colombia)
- Stellar Disbursement Platform: lotes de hasta 10.000 desembolsos; GIZ, UNDP y WFP procesaron $4,2M en lo que va de 2025 (+50% QoQ, Q3 2025) — [SDP](https://stellar.org/products-and-tools/disbursement-platform); [SDF Q3 2025](https://stellar.org/blog/foundation-news/q3-2025-quarterly-report)
- Blend (liquidez modular): ATH de $12M TVL (dic-2024); TVL de toda la red Stellar +95% a $211M+ en 2025 (cifra SDF) — [SDF Q3 2025](https://stellar.org/blog/foundation-news/q3-2025-quarterly-report); [Stellar 2025 review](https://stellar.org/blog/ecosystem/stellar-2025-year-in-review)
- Proyectos SCF cercanos al comercio: RAMM (marcas venden directo al consumidor sin fees de Amazon/eBay), TYPIQO (marketplace B2B productores–chefs), COINQVEST (pagos para e-commerce), Payabroad (vendedores callejeros cobran a turistas en stablecoins, SCF Growth Hack Cohort 1); estado actual no verificado — [SCF RAMM](https://communityfund.stellar.org/submissions/recclYO5p5WMKnecg); [SCF TYPIQO](https://communityfund.stellar.org/submissions/rech7PySqXaETT3Rl); [MEXC/Payabroad](https://www.mexc.com/news/568016)
- SCF: programa de $10M para Soroban (2023), >400 proyectos apoyados; selección comunitaria — [SDF press](https://stellar.org/press/stellar-community-fund-kicks-off-10m-open-application-funding-program-for-soroban-projects); [The Defiant](https://thedefiant.io/education/tutorials/the-stellar-community-fund-evolves-to-bring-more-projects-to-mainnet)

### Inferences
- Trustless Work es el actor Stellar más cercano técnicamente (contratos Soroban que reparten a plataforma + receptor, con USDC) y un posible aliado/infra, no competidor: su caso es escrow por hitos (servicios/freelance), no venta instantánea con split a 4 partes + fondo de recompensas.
- Decaf, Beans, MoneyGram y Vibrant/LOBSTR son wallets/rampas: complementarios (pueden ser el canal por el que vendedores retiran a efectivo). La app de MoneyGram valida que "USDC sin llaves ni gas" es la UX que el mercado LatAm adopta, igual que Cavos en Compaki.
- SDP valida el patrón 1-a-N (pagos masivos a beneficiarios), pertinente para la distribución periódica de recompensas pro-rata de Compaki.
- Hueco: en Stellar no se identificó a nadie que haga split por venta hacia un fondo comunitario con recompensas a compradores/vendedores.

### Gaps
- No se encontraron proyectos tipo Compaki en DoraHacks/Stellar Kickstart/ideathons con datos verificables (las búsquedas no devolvieron listados de BUIDLs).
- Estado 2025–2026 de Vibrant (SDF lo había descontinuado o cedido, según conocimiento previo no verificado aquí) y LOBSTR sin confirmar.
- Mainnet/auditoría de Trustless Work sin fecha formal en las fuentes revisadas.
- TVL de Blend en 2025 no encontrado.

## 5. Pros/contras y el hueco que llena Compaki

### Takeaway
Compaki se ubica en la intersección vacía de cuatro categorías: pasarelas stablecoin (resuelven cobro, no reparto comunitario), marketplaces Web3 (fracasaron por UX), plataformas de donación (desacopladas del comercio) y wallets/rampas Stellar (resuelven custodia y efectivo, no comercio multi-vendedor). Su diferencia defendible: cualquier organizador crea un mercado comunitario donde cada venta se reparte atómicamente on-chain y alimenta un fondo con recompensas o meta, con login de email/Google.

### Cited Findings
- Fees de mercado comparables: Coinbase Commerce 1%, Stripe stablecoin ~1,5%, BitPay 1–2% + $0,25, Endaoment 1,5%, Trustless Work 0,3% + fee de plataforma — [eco.com](https://eco.com/support/en/articles/14895614-stablecoin-payment-processor-fees-compared-2026); [Endaoment](https://blog.endaoment.org/blog/direct-donations-every-nonprofit-now); [Trustless Work](https://docs.trustlesswork.com/trustless-work/llms-full.txt)
- Abandono de marketplaces descentralizados por adopción insuficiente — [Decrypt](https://decrypt.co/43028/decentralized-marketplace-openbazaar-to-close-unless-community-donates)
- UX sin llaves ni gas como estándar en LatAm (app de MoneyGram en Colombia) — [Cointelegraph](https://cointelegraph.com/news/moneygram-app-launch-colombia-stablecoin-savings?rand=6792)

### Inferences
Tabla para la diapositiva (síntesis del investigador basada en los hallazgos anteriores):

| Actor | Categoría | Estado 2025–26 | Fee | Split multi-parte on-chain | Fondo comunitario | UX sin cripto | Multi-vendedor creado por cualquiera |
|---|---|---|---|---|---|---|---|
| Shopify USDC (Coinbase+Stripe, Base) | Pasarela | Activo (desde jun-2025) | n/d (rebate 0,5%) | No | No | Sí | No (1 tienda) |
| Stripe stablecoins / Bridge | Pasarela/infra | Activo, en expansión (Tempo) | ~1,5% (secundario) | No on-chain | No | Sí | Vía Connect (fiat) |
| Coinbase Commerce | Pasarela | Cerrado 31-mar-2026 fuera EE. UU./SG (secundario) | 1% | No | No | Parcial | No |
| BitPay | Pasarela | Activo | 1–2% + $0,25 | No | No | Parcial | No |
| MoonPay Commerce (Solana Pay/Helio) | Pasarela | Activo (oct-2025) | n/d | No | No | Parcial | No |
| OpenBazaar | Marketplace P2P | Cerrado 2021 | 0% | No | No | No | Sí |
| Origin Dshop | Tienda Web3 | Pivotado a DeFi | — | No | No | No | No |
| Fold | Buy-to-earn | Activo, con pérdidas | — | No | Recompensas BTC (subsidiadas) | Sí | No |
| Gitcoin / Giveth | Bienes públicos | Activo (GG24) | variable | Matching QF | Sí (donaciones) | No | No |
| Endaoment / The Giving Block | Donaciones | Activo | 1,5% / n/d | No | Sí (donaciones) | Sí | No |
| Grassroots Economics (Celo) | Moneda comunitaria | Activo (2024) | — | No | Pools comunitarios | Sí (USSD) | No |
| Trustless Work (Stellar) | Escrow infra | Activo (Offer Hub mar-2026) | 0,3% + plataforma | Plataforma + receptor/hito | No | Vía integrador | No |
| StellarSplit | Split de facturas | Repos en GitHub | — | Sí (N pagadores→receptores) | No | No | No |
| Beans / Decaf / MoneyGram app | Wallet/rampa Stellar | Activos | ~0 al usuario | No | No | Sí | No |
| SDP | Desembolsos 1-a-N | Activo ($4,2M 2025 YTD) | — | Pagos masivos | No | Vía wallets | No |
| **Compaki** | Marketplace comunitario | Testnet | 2% | **Sí, atómico (vendedor/organizador/fondo/plataforma)** | **Sí (recompensas pro-rata o meta)** | **Sí (Cavos email/Google)** | **Sí** |

- Pros de Compaki: transparencia verificable on-chain del reparto; el fondo se autofinancia con las ventas (a diferencia de Fold); "recaudar comprando" sin fatiga de donante; UX sin llaves; nativo de Stellar con rampas a efectivo (MoneyGram/Decaf/Beans) y estándares SEP-1/SEP-10.
- Contras/riesgos de Compaki: solo testnet; depende de la liquidez/rampas de USDC en cada país; arranque en frío doble (organizadores y compradores) como OpenBazaar; el 2% está por encima de Coinbase (1%) y Trustless Work (0,3%) si se mira solo el fee; riesgo regulatorio de distribuir "recompensas" pro-rata (posible lectura como valor/lotería según jurisdicción, no investigado).
- Posicionamiento sugerido: no "otra pasarela cripto" sino "Shopify + Patreon/kickstarter comunitario sobre Stellar"; potencial integración con Trustless Work (escrow para pedidos) y con Decaf/Beans/MoneyGram (cash-out de vendedores).

### Gaps
- No se hizo análisis regulatorio de recompensas pro-rata.
- No se pudo confirmar ausencia total de proyectos equivalentes en DoraHacks/ideathons Stellar; la conclusión "no existe" se basa en búsquedas que no encontraron coincidencias, no en una revisión exhaustiva de los listados.
