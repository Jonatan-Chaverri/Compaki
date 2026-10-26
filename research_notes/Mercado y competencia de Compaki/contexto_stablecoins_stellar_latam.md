# Contexto macro para Compaki: stablecoins, LatAm, Stellar, comisiones y regulación

Fecha de corte: 2026-10-25. Cada cifra indica su año y periodo. Muchas fuentes secundarias (blogs de vendors o agregadores) se contradicen; donde pasa, se marca. Algunas fuentes primarias (IDB, World Bank RPW, Messari) devolvieron 403 al intentar abrirlas, así que esas cifras vienen de los snippets de búsqueda y conviene revisarlas antes de ponerlas en una slide.

## 1. Stablecoins globales: tamaño, volumen de pagos y regulación (GENIUS Act, MiCA)

### Takeaway
En 2026 la oferta de stablecoins está en máximos históricos (unos USD 308–322 mil millones). Pero los pagos "reales" son una fracción mínima del volumen bruto: unos USD 390 mil millones en 2025, frente a unos USD 35 billones de volumen total. EE.UU. ya tiene ley federal (GENIUS Act, julio 2025), aunque su reglamentación sigue en curso. MiCA en la UE se aplica plenamente desde 2024–2026.

### Cited Findings
- Oferta total de stablecoins: récord cercano a USD 322 mil millones en mayo/junio 2026 (las fuentes no coinciden en el día exacto). El 13 de agosto de 2026 estaba en USD 308,0 mil millones según datos de DefiLlama, 4,5% bajo el pico y +14,3% interanual — [Stablecoin Insider Q2 2026](https://stablecoininsider.org/q2-2026-stablecoin-market-report/); [Bitcoin Foundation, >USD 321B](https://bitcoinfoundation.org/news/stablecoin-news/stablecoin-market-cap-tops-321b/); [CoinMarketCap, USD 315B](https://coinmarketcap.com/academy/article/dollar315b-stablecoin-supply-hits-record-as-usdc-gains)
- Hitos de oferta en 2026: superó USD 313 mil millones el 8 de marzo y llegó a USD 315 mil millones al 31 de marzo — [Stablecoin Insider Q1 2026](https://stablecoininsider.org/q1-2026-stablecoin-report/)
- Concentración (2026): USDT tiene cerca del 59% de la oferta y USDC cerca del 23%, juntos alrededor del 82% — [Stablecoin Insider Q2 2026](https://stablecoininsider.org/q2-2026-stablecoin-market-report/)
- Pagos reales en 2025 (McKinsey + Artemis, publicado en febrero de 2026): USD 390 mil millones, el 0,02% de los pagos globales. El volumen bruto de unos USD 35 billones es sobre todo trading y transferencias internas — [McKinsey "Stablecoins find their niche"](https://www.mckinsey.com/featured-insights/charts/stablecoins-find-their-niche); [resumen KuCoin](https://www.kucoin.com/news/flash/mckinsey-and-artemis-report-only-1-of-stablecoin-35t-volume-is-real-payments)
- B2B es la categoría más grande: unos USD 226 mil millones en 2025 (aprox. 58% de los pagos reales), +733% interanual. Se calcula anualizando un snapshot de diciembre de 2025 sobre una muestra de empresas — [McKinsey](https://www.mckinsey.com/featured-insights/charts/stablecoins-find-their-niche); [Stablecoin Insider](https://stablecoininsider.org/the-institutional-gap-in-stablecoins/)
- Artemis, "Stablecoin Payments from the Ground Up" (2025): el volumen B2B mensual pasó de menos de USD 100 millones a inicios de 2023 a más de USD 6 mil millones a mediados de 2025. Un comunicado de junio de 2025 dice "más de USD 3 mil millones", así que las dos cifras no coinciden — [Artemis PDF](https://reports.artemisanalytics.com/stablecoins/artemis-stablecoin-payments-from-the-ground-up-2025.pdf); [Reap](https://reap.global/newsroom/b2b-stablecoin-payments-surge-30x-to-3-billion-monthly-volume-in-2025)
- Stripe ya cobra stablecoins: 1,5% del monto en USD como tarifa estándar, y aparece además una tarifa promocional de 0,8% hasta el 1 de enero de 2027 (+0,2% después). La página es ambigua sobre cuál aplica — [Stripe Pricing](https://stripe.com/pricing)
- GENIUS Act (EE.UU.): firmado en julio de 2025. Al vencer el plazo de un año (18 de julio de 2026), las reglas de implementación (OCC, FDIC, Treasury, FinCEN/OFAC) seguían como propuestas (NPRM), y una fuente sitúa la entrada en vigor efectiva el 18 de enero de 2027. Las fuentes secundarias no coinciden en el calendario — [BlindPay tracker 2026](https://blindpay.com/resources/more/stablecoin-regulation-tracker-2026); [Stablecoin Insider](https://stablecoininsider.org/stablecoin-regulations-in-2026/); [KuCoin](https://www.kucoin.com/blog/en-stablecoin-regulation-updates-2026-genius-act-mica-enforcement-global-compliance-trends)
- MiCA (UE): las reglas de stablecoins están vigentes desde mediados de 2024, y el periodo transitorio para proveedores existentes terminó el 1 de julio de 2026. Según una fuente, USDC y EURC son las únicas stablecoins del top 10 que cumplen MiCA y USDT fue retirado de los exchanges de la UE (dato de fuente única). No existe equivalencia entre GENIUS y MiCA — [Orochi](https://orochi.network/blog/2026-stablecoin-regulatory-expectations-the-future-of-global-payments); [Interexy](https://interexy.com/genius-act-vs-mica-the-2026-stablecoin-compliance-map-a-regulatory-deep-dive)

### Inferences
- Para el "why now": las stablecoins pasaron de especulación a infraestructura regulada (GENIUS + MiCA), y USDC, la stablecoin que usa Compaki en mainnet, sale favorecida como la opción "regulada" en ambos regímenes.
- Lo honesto es decir que los pagos con stablecoins todavía son casi nada del total global (0,02%). Eso se puede presentar como espacio para crecer, no como un mercado ya maduro. El comercio P2P/C2B de pequeños productores es un segmento aún poco atendido frente al B2B.
- Que Stripe cobre 1,5% (o 0,8% promocional) por aceptar stablecoins sirve de referencia directa para la comisión de 2% de Compaki, que además incluye el reparto on-chain.

### Gaps
- No encontré el informe "Visa Onchain Analytics" ni a16z "State of Crypto 2025/2026" con cifras verificables en esta búsqueda; no se citan.
- El informe de Chainalysis sobre volumen global de stablecoins no se consultó directamente.
- Quedan sin verificar en Federal Register/EUR-Lex: la fecha exacta de entrada en vigor del GENIUS Act y el estado de USDT bajo MiCA.

## 2. América Latina: adopción cripto/stablecoins, remesas, costo de envío, bancarización y Costa Rica

### Takeaway
LatAm es la región donde las stablecoins resuelven un problema concreto. En el periodo de julio 2025 a junio 2026 movió USD 593,8 mil millones en cripto (+9,8%), y las stablecoins representan el 32,1% del valor transfronterizo. Las remesas a la región alcanzaron un récord de unos USD 174 mil millones en 2025, y enviarlas todavía cuesta alrededor del 5,6%. Costa Rica tiene una base digital fuerte (SINPE Móvil) y desde 2026 una ley que obliga a los VASP a inscribirse ante SUGEF.

### Cited Findings
**Chainalysis 2026 (12 meses a junio de 2026)**
- LatAm movió USD 593,8 mil millones en actividad cripto, +9,8%, y es la sexta economía cripto del mundo. Los cinco primeros países concentran más del 80% — [Chainalysis 2026 LATAM](https://www.chainalysis.com/blog/latin-america-crypto-adoption-2026/)
- Por país: Brasil USD 252,5 mil millones (−1,6%; 43,7% de la región; primer lugar mundial en el índice 2026 según fuentes secundarias), Argentina USD 88,5 mil millones (+15,3%), México USD 77,6 mil millones (+25,5%), Venezuela USD 39,1 mil millones (+107,2%), Colombia USD 29,1 mil millones (+13,8%) — [Chainalysis 2026](https://www.chainalysis.com/blog/latin-america-crypto-adoption-2026/); ranking de Brasil: [OneBullEx](https://www.onebullex.com/news/articles/chainalysis-ranks-brazil-first-in-global-adoption-index-for-2026-5)
- Peso de las stablecoins en la región (junio de 2026): 32,1% del valor transfronterizo, 22,1% de la actividad P2P doméstica y 17,6% de los saldos en wallets personales — [Chainalysis 2026](https://www.chainalysis.com/blog/latin-america-crypto-adoption-2026/)
- México: más de USD 47 mil millones (61%) de sus USD 77,6 mil millones llegaron vía stablecoins. Los ingresos trimestrales por stablecoins fueron de USD 8,4 mil millones en el segundo trimestre de 2026, y los corredores que tocan México movieron USD 1,8 mil millones en stablecoins en junio de 2026, unas 4 veces lo de inicios de 2024. El corredor EE.UU.–México lleva cada vez más valor en stablecoins — [Chainalysis 2026](https://www.chainalysis.com/blog/latin-america-crypto-adoption-2026/)
- Brasil: su economía de stablecoins creció 495%, frente a 89,4% en el resto de la región. Las wallets brasileñas con al menos USD 10.000 en stablecoins aumentaron 347% desde julio de 2024 (en Argentina, 82%) — [Chainalysis 2026](https://www.chainalysis.com/blog/latin-america-crypto-adoption-2026/)
- Venezuela: los comerciantes reportan recibir cerca del 40% de sus ingresos en USDT. Colombia tuvo USD 3,5 mil millones de ingresos por servicios de stablecoins en el segundo trimestre de 2026 — [Chainalysis 2026](https://www.chainalysis.com/blog/latin-america-crypto-adoption-2026/)
- Centroamérica (crecimiento sobre bases pequeñas): Honduras +361,6%, Nicaragua +186,4%, Guatemala −51,4%. Costa Rica no aparece en el informe — [Chainalysis 2026](https://www.chainalysis.com/blog/latin-america-crypto-adoption-2026/)
- Dato previo (Chainalysis 2025, julio 2022 a junio 2025): en Argentina las stablecoins son más de la mitad de las compras en exchanges, empujadas por la inflación y el control cambiario — [Chainalysis 2025 LATAM](https://www.chainalysis.com/blog/latin-america-crypto-adoption-2025/)

**Remesas**
- El IDB estima un récord de USD 173,7 mil millones en 2025 hacia LatAm y el Caribe, +7,3% frente a 2024 (unos USD 162,7 mil millones). En noviembre de 2025 había proyectado USD 174,4 mil millones — [IDB blog](https://www.iadb.org/en/blog/migration/remittances-latin-america-and-caribbean-ease-after-2025-surge); [IDB Technical Note IDB-TN-3243](https://publications.iadb.org/publications/english/document/Remittances-to-Latin-America-and-the-Caribbean-in-2025-Adaptations-in-a-Context-of-Uncertainty.pdf); [UPI](https://www.upi.com/Top_News/World-News/2025/12/01/latam-money-sent-from-abroad/6641764613409/)
- México recibe el 35,4% del total, pero sus remesas cayeron 4,5% en 2025. Para Centroamérica se proyectaba +20,4% (unos USD 55,4 mil millones) y para el Caribe unos USD 20,9 mil millones (+9,2%). El IDB espera que el crecimiento sea más moderado en 2026 — [IDB blog](https://www.iadb.org/en/blog/migration/remittances-latin-america-and-caribbean-ease-after-2025-surge)
- IFAD (ONU) da otra cifra: USD 168,6 mil millones en 2025, por diferencias de metodología — [Caribbean National Weekly](https://www.caribbeannationalweekly.com/posts/caribbean-remittances-surge-as-migrants-send-7286-billion-home)
- Revisión del año 2025 de Inter-American Dialogue — [The Dialogue](https://thedialogue.org/blogs/2026/01/remittance-transfers-in-2025-the-year-in-review)

**Costo de enviar remesas (World Bank RPW)**
- Promedio global para enviar USD 200 en el tercer trimestre de 2025 (Issue 54): 6,36%, más del doble de la meta ODS de 3%. Promedio para LatAm y el Caribe: 5,64%. Por canal, los bancos promedian 14,99% y los operadores de remesas (MTO) 4,72%. Estas cifras vienen de resúmenes secundarios y no pude abrir el PDF del Banco Mundial — [World Bank RPW Q3 2025 PDF](https://remittanceprices.worldbank.org/sites/default/files/2026-04/RPW_main_report_and_annex_Q325.pdf); [Arca Wallet](https://arcawallet.app/research/true-cost-of-sending-200-by-country/)
- Primer trimestre de 2025 (Issue 53): 6,49% global y 5,72% en LatAm y el Caribe — [Remitbee](https://www.remitbee.com/blog/money-transfer/remittance/top-remittance-corridors-2025-fees-market-share)
- Ejemplos por país (RPW según una compilación): México 4,53%, Brasil 5,38% — [Arca Wallet](https://arcawallet.app/research/true-cost-of-sending-200-by-country/)

**Bancarización (Global Findex 2025, con datos de 2024)**
- Cuentas en LatAm y el Caribe: más del 75% de los adultos en 2025, frente a 39% en 2011 (IDB Invest/CGAP). Si se excluyen las economías de ingreso alto, la cifra es 70% en 2024 (54% en 2017) — [IDB Invest](https://idbinvest.org/en/blog/digital-economy/financial-health-driving-growth-latin-america-and-caribbean); [CGAP](https://www.cgap.org/blog/financial-health-driving-growth-in-latin-america-and-caribbean); [FinDev Gateway](https://www.findevgateway.org/region/financial-inclusion-latin-america-and-caribbean)
- El 37% de los adultos de la región tiene mobile money (22% en 2021). Cerca del 20% de quienes no tienen cuenta mencionan desconfianza y costos altos. A nivel mundial, 1.300 millones de adultos siguen sin cuenta — [FinDev Gateway](https://www.findevgateway.org/region/financial-inclusion-latin-america-and-caribbean); [Bairo González](https://bairogonzalez.com/en/in-the-world/financas/global-findex-2025-financial-inclusion/); [Global Findex 2025 PDF](https://www.uasb.edu.ec/observatorio-pyme/wp-content/uploads/sites/6/2025/11/the-global-findex.pdf)

**Costa Rica**
- SINPE Móvil, de enero a octubre de 2025: más de 615 millones de transferencias (+16,8% interanual) por ₡10,1 billones (+16,4%), con 4,4 millones de suscripciones activas (4,1 millones en octubre de 2024) y un monto promedio cercano a ₡16.500 (datos BCCR difundidos por la Asociación Bancaria Costarricense) — [El Observador](https://observador.cr/monto-transado-por-sinpe-movil-crecio-un-164-en-primeros-10-meses-del-2025/); [CRHoy](https://crhoy.com/economia/ticos-movieron-billones-en-sinpe-movil-durante-los-primeros-10-meses-del-ano/)
- Al cierre de 2024, SINPE Móvil registró 648 millones de transacciones y más de 3,5 millones de personas suscritas — [El Observador](https://observador.cr/monto-transado-por-sinpe-movil-crecio-un-164-en-primeros-10-meses-del-2025/)
- Regulación cripto en Costa Rica: el expediente 25.340, que reforma la Ley 7786 contra el lavado de dinero, se aprobó en mayo de 2026 y se publicó como Ley 10961 el 19 de junio de 2026. Entró en vigor unos 3 meses después (alrededor del 19 de septiembre de 2026), y el reglamento le corresponde al CONASSIF. Los VASP deben inscribirse ante SUGEF, hacer KYC y reportar a la UIF. Inscribirse no equivale a una licencia para operar. Las criptomonedas no están prohibidas y el colón sigue siendo la única moneda de curso legal — [Tico Times](https://ticotimes.net/2026/05/27/costa-rica-crypto-bill-approved-as-lawmakers-target-money-laundering-risks); [AG Legal](https://aglegal.com/es/regulacion-cripto-costa-rica/); [La Nación](https://www.nacion.com/economia/costa-rica-obligara-a-proveedores-de-criptomonedas/ZHJO4QQG5VHCBMAPAWZ4OJ3KUQ/story/); [Delfino](https://delfino.cr/2026/05/asamblea-aprueba-regulacion-de-criptoactivos-contra-lavado-de-dinero)

### Inferences
- Dos tendencias convergen en LatAm: dolarización informal mediante stablecoins (Argentina, Venezuela, México) y pagos digitales domésticos ya masivos (SINPE Móvil en Costa Rica, más allá de lo que se cita aquí). Los usuarios de Compaki ya pagan con el teléfono; lo que les falta es liquidación en USD con reparto automático entre varias partes.
- Si el 5,64% del RPW se aplica a USD 200, el costo es de unos USD 11,28 por envío (cálculo propio). Esto da un argumento secundario: la diáspora podría comprar directamente a productores de su país de origen en vez de enviar remesas.
- En Costa Rica, SINPE Móvil es competencia fuerte para pagos locales en colones (gratis o casi). La propuesta de valor de Compaki en el país debería apoyarse en ventas transfronterizas o a turistas, ingresos en USD y el reparto/fondo comunitario automático, no en el costo de pagar localmente.

### Gaps
- No encontré cifras de CEMLA en esta búsqueda.
- No encontré la cifra exacta de adultos sin cuenta en LatAm ni el dato de Costa Rica en Findex 2025; hay que buscarlos en el portal de Findex.
- No obtuve el porcentaje exacto de stablecoins en Brasil y Argentina en el informe 2026; las fuentes secundarias dicen entre 70% y 90% para Brasil, con métricas distintas.
- No encontré el costo RPW del corredor Costa Rica–Nicaragua ni EE.UU.–Costa Rica.
- No encontré la cifra de cierre anual 2025 de SINPE Móvil del BCCR. Semanario Universidad menciona 747,51 millones de transacciones y 4,52 millones de suscriptores, pero sin periodo claro.

## 3. Stellar: estadísticas de red, Soroban y adopción institucional

### Takeaway
Stellar está pensada para pagos: la comisión base es de 0,00001 XLM por operación y los ledgers cierran en unos 5 segundos. Tiene integraciones reales en LatAm (MoneyGram con un saldo en USDC en Colombia y El Salvador, 2026), dos stablecoins grandes en USD (USDC y PYUSD) y activos institucionales (BENJI de Franklin Templeton, piloto de U.S. Bank). Soroban, su capa de smart contracts, ya representa una porción importante de la actividad. La liquidez en stablecoins de Stellar todavía es pequeña comparada con otras redes.

### Cited Findings
- Comisiones: el mínimo es de 100 stroops (0,00001 XLM) por operación y sube con surge pricing cuando hay congestión. Soroban suma comisiones por recursos (CPU, lectura/escritura, renta de almacenamiento) — [Stellar Docs, fees](https://developers.stellar.org/docs/learn/fundamentals/fees-resource-limits-metering); [Stellar Docs glosario](https://developers.stellar.org/docs/glossary/fees/); [GitHub docs (archivo)](https://github.com/stellar/docs/blob/9c0100d80d32dfff9d9d071b77def6bf8599b151/guides/concepts/fees.md)
- Los ledgers cierran en unos 5 segundos (blog de SDF). La documentación oficial solo dice "unos pocos segundos" — [Stellar blog](https://stellar.org/blog/developers/transaction-submission-timeouts-and-dynamic-fees-faq); [Stellar Docs ledgers](https://developers.stellar.org/docs/learn/fundamentals/stellar-data-structures/ledgers)
- SDF, primer trimestre de 2025: 11,28 millones de cuentas en total (+3 millones en el trimestre), unos 10,29 millones de cuentas activas al mes y 94,6 millones de transacciones on-chain. Soroban sumó 12,9 millones de transacciones en ese trimestre — [SDF Q1 2025 report](https://stellar.org/blog/foundation-news/q1-2025-quarterly-report); [BitcoinKE](https://bitcoinke.io/2025/05/q1-2025-stellar-report/)
- Messari, cuarto trimestre de 2025: la capitalización de stablecoins en Stellar creció 53,1% interanual, de USD 159,1 millones a USD 243,6 millones, con USDC en USD 223,2 millones. El volumen promedio diario de transferencias USDC fue de USD 59,8 millones (+11,2% trimestral; +33,4% interanual frente a USD 44,8 millones). PYUSD llegó a Stellar en septiembre de 2025 — [Messari State of Stellar Q4 2025](https://messari.io/report/state-of-stellar-q4-2025)
- El 23 de septiembre de 2026, citando DefiLlama: unos USD 906 millones en stablecoins en Stellar (USD 214 millones un año antes), USDC en circulación de unos USD 343 millones y, según stellar.expert, 2,4 millones de trustlines USDC (unas 703.000 con saldo). No coincide con Messari, probablemente por metodología: verificar — [Upshift](https://www.upshift.finance/blog/usdc-on-stellar)
- Blockworks, segundo trimestre (aparentemente de 2026): Soroban fue el 41,3% de las transacciones de Stellar (38,8% en el primer trimestre), el 94,4% de las comisiones y el 82,4% del volumen de trading on-chain. Protocol 23 llegó a mainnet en septiembre de 2025 — [Blockworks Q2 Token Holder Report](https://x.com/Blockworks/article/2095893372086985047)
- Tercer trimestre de 2026: el volumen de stablecoins subió 121% frente al trimestre anterior, con un récord de 3.922 desarrolladores activos al mes, 99,99% de uptime y dos upgrades de protocolo (TokenPost, 20 de octubre de 2026). Otra fuente cita USD 4,1 mil millones en RWA tokenizados — [TokenPost](https://www.tokenpost.com/news/technology/35369); [Bitget](https://www.bitget.com/amp/news/detail/12560605989180)
- MoneyGram y SDF (22 de abril de 2026, Ciudad de México): extendieron su alianza por varios años, alianza que existe desde 2021. El saldo en stablecoin de la app de MoneyGram, respaldado por USDC (Circle, Stellar, Crossmint), está activo en Colombia y El Salvador, con más mercados de Centro y Sudamérica previstos en 2026. Permite recibir en USD, guardar el saldo y retirar efectivo en agencias. MoneyGram tiene presencia en más de 200 países, casi 500.000 puntos y más de 50 millones de clientes, además de la Ramps API — [PR Newswire](https://www.prnewswire.com/news-releases/moneygram-and-stellar-extend-partnership-to-scale-real-world-stablecoin-utility-globally-302749574.html)
- Franklin Templeton (BENJI / FOBXX): lanzado en Stellar en 2021, con más de USD 580 millones emitidos en Treasuries tokenizados en Stellar según SDF — [Stellar case study](https://stellar.org/case-studies/franklin-templeton); [RWA.xyz](https://app.rwa.xyz/assets/BENJI)
- U.S. Bancorp probó en noviembre de 2025 la emisión de una stablecoin propia en Stellar — [CoinDesk](https://www.coindesk.com/business/2025/11/25/u-s-bank-tests-custom-stablecoin-issuance-on-stellar-network)
- Resumen anual de SDF para 2025 — [SDF 2025 Year in Review](https://stellar.org/blog/foundation-news/2025-year-in-review)

### Inferences
- Para el "why Stellar": (a) el costo por transacción es casi cero, lo que hace viables ventas pequeñas de USD 1–20 de artesanos; (b) en unos 5 segundos la venta queda liquidada; (c) USDC es nativo y regulado; (d) MoneyGram ya ofrece retiro en efectivo en LatAm, clave para productores con poca bancarización; (e) Soroban permite el reparto atómico entre vendedor, organizador, fondo y plataforma.
- Las cuatro transferencias del reparto atómico de Compaki van en una sola invocación de contrato Soroban. Su costo real depende de las comisiones por recursos, no solo del base fee de 100 stroops. Hay que medirlo en testnet o mainnet antes de afirmar "fracciones de centavo"; lo más probable es que siga en esa magnitud, pero no está verificado aquí.
- Como riesgo, la liquidez de stablecoins en Stellar (unos USD 0,24–0,9 mil millones) es menos del 0,3% del mercado total. Es suficiente para pagos minoristas, pero limita las opciones de DeFi y de rampas.

### Gaps
- No obtuve números de red verificados para 2026: cuentas totales, transacciones al año, costo promedio por transacción en USD y precio de XLM.
- No encontré dashboards de Dune ni stellar.expert consultados directamente.
- No encontré detalles verificados de iniciativas de SDF en LatAm fuera de MoneyGram (por ejemplo, fondos o hackathons regionales).
- No encontré el monto actual de PYUSD en Stellar.

## 4. Comparativa de comisiones: tarjetas en LatAm, Mercado Pago, Stripe, PayPal vs Stellar

### Takeaway
Los procesadores tradicionales cobran a un comercio pequeño en LatAm alrededor de 3–4% más un fijo más IVA, y los cobros internacionales suman entre 1% y 2,5% adicional. Una transacción en Stellar cuesta 0,00001 XLM por operación. Así, la comisión total de 2% de Compaki (que ya incluye el reparto on-chain) compite bien, aunque las rampas de entrada y salida de fiat añaden costos que no están en la cuenta.

### Cited Findings
- Mercado Pago México, checkout online: 3,49% + MXN 4 con retiro inmediato, 3,19% a 14 días y 2,95% a 30 días, más IVA (fuente secundaria, 2026). Terminal Point: 3,5% + IVA con débito. Las cuotas "meses sin intereses" suben el costo de forma importante: unos +12,89% a 12 meses — [Atempora 2026](https://atempora.studio/blog/comisiones-mercado-pago-2026); [Mercado Pago blog Point](https://www.mercadopago.com.mx/blog/comisiones-terminal-point); [Guía de Bancos LatAm 2026](https://www.guiadebancos.com/ar/blog/comisiones-mercado-pago-latam-2026)
- PayPal México: 3,95% + MXN 4 + IVA por cobro con tarjeta, según un comparador; el dato tiene unos 9 meses, así que verificarlo — [ComoCobro / comparador](https://comocobro.cl/medios-de-pago/mercado-pago)
- Stripe EE.UU.: 2,9% + USD 0,30 en tarjetas domésticas, +1,5% en tarjetas internacionales y +1% si hay conversión de moneda. Las stablecoins pagan 1,5% (0,8% promocional hasta el 1 de enero de 2027) — [Stripe Pricing](https://stripe.com/pricing)
- Stellar: 100 stroops = 0,00001 XLM por operación como mínimo — [Stellar Docs](https://developers.stellar.org/docs/learn/fundamentals/fees-resource-limits-metering)
- Remesas: 5,64% en promedio en LatAm y el Caribe y 6,36% global para enviar USD 200 (tercer trimestre de 2025); 14,99% en bancos — ver sección 2 — [World Bank RPW](https://remittanceprices.worldbank.org/sites/default/files/2026-04/RPW_main_report_and_annex_Q325.pdf)

### Inferences
- Ejemplo calculado para una venta de USD 20: con Stripe y una tarjeta internacional con conversión, 2,9% + 1,5% + 1% + USD 0,30 da unos USD 1,38 (6,9%). Con Mercado Pago MX inmediato, 3,49% + IVA 16% más el fijo da alrededor de USD 1,0 (unos 5%). En Compaki, el 2% de plataforma son USD 0,40 más una comisión de red despreciable. El resto del reparto (organizador y fondo comunitario) es una decisión de la comunidad, no una comisión. Son cálculos propios.
- Hay que aclarar en el pitch que la comparación excluye las rampas: convertir USDC a moneda local (vía MoneyGram, exchanges o anchors) tiene sus propios costos.

### Gaps
- No encontré tasas MDR oficiales para tarjetas en Costa Rica ni en LatAm en general (bancos centrales o adquirentes). Tampoco las tarifas de Mercado Pago en Brasil, Argentina y Colombia en fuente oficial.
- No encontré la tarifa de PayPal transfronteriza de 2026 (el recargo internacional) en fuente oficial.
- No encontré el costo real por invocación de contrato Soroban de un reparto en 4 partes, en XLM ni en USD.

## 5. Notas regulatorias y de riesgo para un marketplace con fondo comunitario pagado en stablecoins

### Takeaway
La región avanza rápido hacia el registro y licenciamiento de VASP: Costa Rica (Ley 10961, 2026) y Brasil (Resoluciones BCB 519–521 de 2025, con plazo de adecuación hasta finales de octubre de 2026). Brasil, además, trata las operaciones con stablecoins como operaciones de cambio. Para Compaki los riesgos clave son si califica como VASP (según qué custodie o intermedie), KYC/AML del fondo comunitario y cómo se presenten las "recompensas" (riesgo de valor o de sorteo).

### Cited Findings
- Costa Rica: los VASP deben inscribirse ante SUGEF y cumplir obligaciones AML (KYC y reportes de operaciones sospechosas a la UIF). La ley está vigente desde septiembre de 2026, con reglamento de CONASSIF pendiente o en curso — [AG Legal](https://aglegal.com/es/regulacion-cripto-costa-rica/); [Bit2Me](https://bit2me.com/es/criptomonedas/costa-rica); [Substack José Morales](https://josemoras.substack.com/p/la-sugef-empieza-a-vigilar-el-negocio)
- Brasil: las Resoluciones BCB 519, 520 y 521 (noviembre de 2025) ponen a los VASP bajo autorización del Banco Central y tratan las transacciones con stablecoins, las transferencias internacionales con cripto y las transferencias a wallets propias como operaciones de cambio, con topes y reportes. Están vigentes desde el 2 de febrero de 2026, y las plataformas extranjeras con clientes brasileños tienen 270 días para adecuarse (aprox. 29 de octubre de 2026) — [Ledger Insights](https://www.ledgerinsights.com/brazil-imposes-partial-ban-on-stablecoins-crypto-for-cross-border-payments-and-fx/); [CryptoSlate Res. 521](https://cryptoslate.com/crypto-laws/brazil-central-bank-resolution-521-2025-virtual-assets-fx/); [JJ Associate](https://www.jj-associate.com/post/brazils-new-crypto-license-what-vasps-must-do-before-october-29-2026); [Forbes](https://www.forbes.com/sites/astanley/2025/11/19/incumbents-win-big-whats-inside-brazils-new-vasp-regulations/)
- Brasil, según una sola fuente: la Resolución BCB 561 impediría desde octubre de 2026 que los proveedores eFX liquiden operaciones transfronterizas en stablecoins — [Ledger Insights](https://www.ledgerinsights.com/brazil-imposes-partial-ban-on-stablecoins-crypto-for-cross-border-payments-and-fx/)
- Argentina: la CNV estableció en 2025 un registro obligatorio de PSAV/VASP — [Coincub](https://coincub.com/blog/crypto-adoption-latin-america-2025/)
- EE.UU. y UE: el GENIUS Act regula a los emisores; MiCA regula a emisores y proveedores (CASP). Ninguno reconoce al otro — ver sección 1 — [Interexy](https://interexy.com/genius-act-vs-mica-the-2026-stablecoin-compliance-map-a-regulatory-deep-dive)

### Inferences
- Si Compaki no custodia fondos (wallets no custodiales y un contrato que reparte directamente), el argumento para no ser VASP es más fuerte. Aun así, en Costa Rica la definición de VASP y el reglamento de CONASSIF determinarán si un operador de interfaz con un contrato de reparto debe inscribirse. Hace falta un análisis legal antes de mainnet.
- El fondo comunitario debería documentar quién lo controla (multisig o gobernanza), para qué se usa y cómo se reporta, con trazabilidad on-chain. Si recibe aportes de terceros podría aplicarle AML o normas de donaciones.
- Recompensas: si dependen del rendimiento del fondo o de la plataforma podrían parecerse a un valor (test de Howey en EE.UU. o equivalentes locales); si se asignan por azar podrían considerarse sorteo. Conviene que sean beneficios de uso fijos y no transferibles. Es una nota de alto nivel, no asesoría legal.
- Riesgos para la slide: (1) regulación cambiante (Brasil restringe usos cambiarios); (2) dependencia de rampas como MoneyGram o anchors; (3) concentración en el emisor (Circle/USDC); (4) protección al consumidor: devoluciones sin contracargo como en tarjetas, así que hace falta una política propia de disputas; (5) UX de wallets y trustlines para usuarios no cripto.

### Gaps
- No encontré el detalle de México: la Ley Fintech (2018), la Circular 4/2019 de Banxico (que restringe a entidades financieras operar con activos virtuales frente a clientes) y el estado en 2026. Tampoco hay fuentes verificadas en esta búsqueda.
- No encontré el reglamento definitivo de CONASSIF ni la definición exacta de VASP en la Ley 10961 (texto en La Gaceta).
- No encontré normativa de protección al consumidor para pagos cripto en Costa Rica (MEIC, Ley 7472) aplicada a stablecoins.
- No encontré análisis específico sobre recompensas como valores o sorteos en jurisdicciones de LatAm.
