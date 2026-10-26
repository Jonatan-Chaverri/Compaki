# Competidores tradicionales (Web2) de Compaki: tiendas, marketplaces, software multi-vendedor e infraestructura de split payments

Notas de investigación. Precios revisados el 2026-10-25 (fecha de las búsquedas y fetches). Cuando la fuente es un blog o calculadora de terceros se indica; varias páginas oficiales (Etsy fees, Mercado Libre ayuda MX, Tiendanube MX precios) devolvieron 403/404 al hacer fetch, así que algunas cifras vienen de resúmenes de buscador de esas páginas oficiales o de terceros.

## 1. Constructores de tiendas: Shopify (+ apps multi-vendedor), WooCommerce + Dokan/WCFM, Wix, Tiendanube/Nuvemshop

### Takeaway
Los constructores de tiendas son de un solo comerciante por diseño: el modo multi-vendedor es un añadido (app o plugin) que cuesta suscripción extra y no hace un split atómico nativo. Para repartir dinero a vendedores dependen de Stripe Connect / PayPal / Mangopay, que en Latinoamérica tienen cobertura limitada. Tiendanube es el actor local más fuerte en LatAm pero también es de un solo comerciante.

### Cited Findings
- **Shopify, planes (USD, revisado 2026-10-25):** Basic $25/mes ($19/mes con pago anual); Grow $65/mes ($49 anual); Advanced $399/mes ($299 anual); Plus desde $2,300/mes. Recargo por usar un procesador de pagos externo (no Shopify Payments): 2% (Basic), 1% (Grow), 0.6% (Advanced), 0.2% (Plus) — [Shopify Pricing](https://www.shopify.com/pricing)
- **Shopify Payments, tarifa de tarjeta en EE. UU. (plan Basic):** 2.9% + 30¢ online; 2.6% + 10¢ presencial (varias fuentes de terceros coinciden; la página oficial de precios no mostró las tasas en el fetch) — [ecommerce-platforms.com](https://ecommerce-platforms.com/?p=32623); [letstalkshop.com](https://www.letstalkshop.com/blog/shopify-payment-gateways-comparison-by-country)
- **Shopify en LatAm:** una guía de terceros indica que en México se usan pasarelas como Mercado Pago o Conekta en lugar de Shopify Payments (sin confirmar con la lista oficial de países) — [letstalkshop.com](https://www.letstalkshop.com/blog/shopify-payment-gateways-comparison-by-country). Si Shopify Payments no está disponible, aplica el recargo de 0.6–2% del procesador externo — [Shopify Pricing](https://www.shopify.com/pricing)
- **Shopify, multi-vendedor vía la app "Multi Vendor Marketplace" (Webkul):** Basic $15/mes (hasta 3 vendedores activos), Executive $40/mes (hasta 10), Pro $60/mes o $650/año (vendedores ilimitados); add-ons de pago para funciones avanzadas; calificación 4.7/5 con 363 reseñas (7% de una estrella); menciona "automated payouts" y lista Stripe y PayPal como integraciones, sin explicar el split — [Shopify App Store](https://apps.shopify.com/multi-vendor-marketplace)
- **Facturación de apps Shopify:** las apps se cobran en ciclos de 30 días independientes; los reembolsos dependen del desarrollador, no de Shopify — [Shopify Help Center](https://help.shopify.com/en/manual/your-account/manage-billing/your-invoice/apps)
- **WooCommerce + Dokan (revisado 2026-10-25):** Dokan Lite gratis (WordPress.org). Planes anuales: Starter $149 lista ($119 con descuento de primer año), Professional $249 ($187), Business $499 ($349), Enterprise $999 ($649); licencias lifetime de $559 a $2,747. Módulos de split: Stripe Connect, Stripe Express, Razorpay y MANGOPAY desde Professional; PayPal Marketplace desde Business. Tipos de comisión múltiples desde Starter (no en Free). Precios sin impuestos — [Dokan Pricing](https://dokan.co/wordpress/pricing/)
- **Tiendanube México (planes):** Gratis; Básico $149 MXN/mes; Tiendanube $374 MXN/mes; Avanzado $999 MXN/mes; Evolución a cotizar — [Tiendanube MX planes y precios](https://www.tiendanube.com/mx/planes-y-precios) (página sin fecha visible; vista vía buscador)
- **Tiendanube, costo por transacción:** 2%, 1%, 0.6% o 0.5% según plan, calculado sobre ventas del mes anterior (ayuda actualizada 09/03/2026); se bonifica (no se cobra) si se cobra con Pago Nube — [Ayuda Tiendanube MX](https://ayuda.tiendanube.com/es_MX/123484-costos-por-transaccion/como-se-calculan-los-costos-por-transaccion); [Ayuda Tiendanube MX (por qué se cobra)](https://ayuda.tiendanube.com/es_MX/123484-costos-por-transaccion/por-que-tiendanube-cobra-un-costo-por-transaccion)
- La guía de Tiendanube usa como comparación Mercado Pago a 3.49% + $4.64 MXN + IVA — [Ayuda Tiendanube MX](https://ayuda.tiendanube.com/es_MX/123484-costos-por-transaccion/como-se-calculan-los-costos-por-transaccion)

### Inferences
- Costo mínimo de un "marketplace comunitario" sobre Shopify en LatAm: ~$25 + $15–60/mes de app + 0.6–2% de recargo + ~3.5% + fijo del procesador local + IVA. Para un grupo pequeño de productores son ~$40–85 USD/mes fijos antes de vender nada, frente a Compaki (sin suscripción, 2% de plataforma).
- WooCommerce + Dokan es lo más barato en licencia, pero requiere hosting, mantenimiento y un procesador con split (Stripe Connect/Mangopay/PayPal), que tienen cobertura limitada para cuentas conectadas en LatAm (ver sección 4). Las funciones de split nativo empiezan en el plan Professional (~$187–249/año).
- Ninguno de estos ofrece "fondo comunitario" ni transparencia pública del reparto; el organizador tendría que hacerlo manualmente.
- Tiendanube es el benchmark local de UX y precio para un solo comerciante; su modelo (Pago Nube sin costo de transacción) muestra que el mercado LatAm valora no pagar comisión doble.

### Gaps
- **Wix:** no se obtuvieron precios actuales ni detalles de multi-vendedor (Wix no tiene multi-vendedor nativo según conocimiento previo, sin verificar).
- **WCFM Marketplace:** no se obtuvo precio actual.
- **Nuvemshop (Brasil):** no se obtuvieron precios en BRL ni tarifas de Pago Nuvem.
- No se confirmó en la lista oficial si Shopify Payments opera en México o Brasil.
- Tasas y plazos de liberación de Pago Nube para el comerciante no se obtuvieron.

## 2. Marketplaces: Etsy, Mercado Libre, Amazon Handmade, Facebook/Instagram Shops, comercio por WhatsApp

### Takeaway
En los marketplaces el vendedor paga típicamente 10–25% (Etsy ~10% base y hasta ~22–25% con Offsite Ads; Mercado Libre MX ~10–20% + cargo fijo + IVA; Amazon Handmade ~15%), no controla la relación con el cliente y espera días para cobrar. Ninguno permite que una comunidad u organizador cobre su propia comisión ni tenga un fondo común. Meta eliminó el checkout nativo en 2025, así que el comercio social en LatAm es informal (WhatsApp + transferencia/link de pago).

### Cited Findings
- **Etsy (EE. UU.):** $0.20 por publicación; 6.5% de comisión de transacción (sobre precio + envío + envoltura); procesamiento de pago 3% + $0.25 sobre el total del pedido; base ~9.5% + fijos; en una venta de $100 el efectivo es ~9.95% — [checkoutpage.com](https://checkoutpage.com/blog/etsy-fees); [Craftybase](https://app.craftybase.com/blog/the-complete-guide-to-etsy-fees) (fuentes de terceros; la página oficial etsy.com/legal/fees devolvió 403)
- **Etsy Offsite Ads:** 15% del pedido atribuido si la tienda vendió menos de $10k en el último año (opcional), 12% si vendió más de $10k (obligatorio), tope de $100 por pedido; con Offsite Ads una venta de $100 puede llegar a ~$21.95 de comisiones totales y una de $50 a ~25% — [checkoutpage.com](https://checkoutpage.com/blog/etsy-fees); [growingyourcraft.com](https://www.growingyourcraft.com/blog/how-much-does-it-really-cost-to-sell-on-etsy)
- **Etsy, conversión de moneda:** 2.5% adicional si la moneda del anuncio difiere de la moneda del pago — [checkoutpage.com](https://checkoutpage.com/blog/etsy-fees)
- **Mercado Libre México, comisión por venta (terceros, sin tabla oficial obtenida):** Clásica ~10–15% (otra fuente 8–16%); Premium ~14–19.5% (otra fuente 12.5–20.5%), incluye meses sin intereses; cargo fijo por unidad en productos de menos de $299 MXN (una calculadora: <$99 → $25; $99–149 → $30; $149–299 → $37); ejemplo: venta de $500 con 16% + IVA sobre la comisión = 18.6% efectivo — [jaguarsheet.com](https://jaguarsheet.com/es/blog/comisiones-mercado-libre); [base.com blog MX](https://base.com/es-MX/blog/?p=18397); [calcforlife.com](https://calcforlife.com/es/calculadora-mercado-libre-comisiones/)
- **Mercado Libre, liberación del dinero (varía por país, reputación, envío y condición):** Argentina — con Mercado Envíos y reputación, 8 días tras la entrega (nuevo) / 14 (usado); sin reputación, 14 días; con Full, 6 días. Chile — 2 días tras la entrega con reputación, 6 sin reputación, 22 días desde la acreditación si no es MercadoLíder o el comprador no califica (UpSeller, enero 2026) — [UpSeller](https://upseller.com/es/blog-article-511)
- **Mercado Libre México:** con Mercado Envíos el dinero llega a Mercado Pago ~48 h después; sin reputación o con producto usado hasta 6 días (medio de divulgación, no oficial) — [Telediario](https://www.telediario.mx/comunidad/ventas-mercado-libre-cuanto-tardan-depositar-el-dinero)
- **Retenciones prolongadas:** quejas de usuarios describen retenciones de 21–28 días cuando no se usó Mercado Envíos o por riesgo de desempeño (anecdótico) — [tuquejasuma.com](https://tuquejasuma.com/mercado-libre/reclamos/mercadolibre-me-retiene-el-dinero-28-dias-abuso)
- **Amazon Handmade:** comisión de referencia ~15% fija; Amazon sigue eximiendo la suscripción Professional ($39.99/mes) a artesanos aprobados; requiere aplicar y ser aprobado — [Craftybase](https://app.craftybase.com/blog/where-can-i-sell-my-handmade-products-online); [bebolddigital.com](https://www.bebolddigital.com/blog/sell-on-amazon-handmade)
- **Facebook/Instagram Shops:** Meta descontinuó el checkout en Facebook/Instagram el 4 de septiembre de 2025; los compradores son redirigidos al sitio del comerciante; Meta ya no procesa pagos ni resuelve contracargos para Shops — [ppc.land](https://ppc.land/meta-phases-out-facebook-and-instagram-shops-checkout-by-august-2025/); [Value Added Resource](https://www.valueaddedresource.net/meta-phases-out-native-checkout-facebook-instagram-shops/); [BigCommerce](https://www.bigcommerce.com/blog/updates-to-meta-shops-checkout-for-bigcommerce/)
- **Facebook Marketplace:** gratis para listados locales; ~5% en pedidos con envío (fuente de terceros) — [Craftybase](https://app.craftybase.com/blog/where-can-i-sell-my-handmade-products-online)
- **WhatsApp en LatAm:** penetración de uso >90% en Brasil y México en 2022 (DataReportal); ingresos de la app WhatsApp Business: Brasil US$5.28 mil millones, México US$1.94 mil millones (AppMagic) — [ecommerceDB](https://ecommercedb.com/insights/whatsapp-business-app-ecommerce-exploring-global-revenues/4622); un blog de proveedor afirma que ~78% de negocios en Brasil y ~71% en México venden por WhatsApp, sin metodología (baja confiabilidad) — [Aurora Inbox](https://www.aurorainbox.com/en/2026/03/04/estadisticas-ecommerce-whatsapp-latam/)

### Inferences
- Take rate típico para un vendedor pequeño: Etsy ~10% sin anuncios y hasta ~22–25% con Offsite Ads; Mercado Libre MX ~12–22% efectivo con IVA + cargo fijo en tickets bajos (en un producto de $150 MXN el cargo fijo de ~$37 solo ya es ~25%); Amazon Handmade ~15%. Compaki: 2% plataforma + lo que defina el organizador + fondo comunitario, y ese excedente vuelve a la comunidad en vez de quedarse en la plataforma.
- Pagos: de 2 a 14+ días tras la entrega en Mercado Libre según país y reputación, con riesgo de retenciones; Compaki ofrece liquidación inmediata en stablecoin.
- El comercio por WhatsApp/Instagram es el competidor real de los grupos de productores en LatAm: costo de plataforma cero, pero sin checkout, sin reparto automático, sin registro transparente y con conciliación manual. Compaki puede posicionarse como "formalizar lo que ya hacen por WhatsApp".
- Pros de los marketplaces: tráfico enorme, confianza del comprador, logística (Mercado Envíos/Full), financiamiento (meses sin intereses). Contras: comisión alta, pérdida de marca/comunidad, reglas cambiantes, sin parte para el organizador.

### Gaps
- No se obtuvo la tabla oficial de comisiones de Mercado Libre 2026 para México, Argentina, Colombia, Chile o Brasil (página de ayuda devolvió 403); las cifras son de terceros y no coinciden del todo.
- No se confirmó si Etsy Payments opera en México/Brasil ni la tasa de procesamiento en esos países.
- No se obtuvieron cifras confiables de qué porcentaje de pymes en LatAm vende por WhatsApp.
- Tarifas de checkout de Instagram en LatAm no aplicables desde 2025 (checkout nativo eliminado), pero no se verificó la página oficial de Meta.

## 3. Software para construir marketplaces: Sharetribe, CS-Cart Multi-Vendor, Arcadier, Medusa, Mirakl, Kreoh, Marketplacer

### Takeaway
El software para marketplaces va desde ~$40–260/mes (Sharetribe) y licencias de ~$1.5–3.8k (CS-Cart) hasta contratos enterprise de $20k–50k+/año (Mirakl, Marketplacer). Todos externalizan los pagos a Stripe Connect u otro PSP, así que heredan sus limitaciones en LatAm y sus 1.5–3% de procesamiento. Ninguno trae fondo comunitario ni reparto transparente on-chain.

### Cited Findings
- **Sharetribe (USD, sin IVA, revisado 2026-10-25):** Build $39/mes (solo modo de prueba); Live $199/mes facturado anualmente ($259/mes mensual), pagos reales, marca blanca; Hold $49/mes. Sin comisión de transacción de Sharetribe, pero aplica el procesamiento de Stripe (~1.5–3%). El sistema de pagos por defecto funciona con Stripe — [Sharetribe Pricing](https://www.sharetribe.com/pricing/)
- **CS-Cart Multi-Vendor:** precios en conflicto según la fuente: suscripción desde ~$61/mes o licencia lifetime desde $3,590; otra fuente indica suscripción anual $725 (Standard) / $1,449 (Plus); otra, licencia única $1,450 (Multi-Vendor) / $3,750 (Plus); Software Advice lista $599–2,999/año. Self-hosted (hosting, actualizaciones y seguridad aparte) — [Software Advice](https://www.softwareadvice.com/product/176908-CS-Cart-Multi-Vendor/); [yourstore.io](https://yourstore.io/blogs/best-multi-vendor-marketplace-platforms-software-cs-cart-vs.-yourstore-vs.-mirakl-comparison/); [Guideflow](https://www.guideflow.com/blog/multi-vendor-ecommerce-platforms)
- **CS-Cart** tiene un add-on "PayPal for Marketplaces" para split — [CS-Cart docs](https://docs.cs-cart.com/4.8.x/user_guide/addons/paypal_for_marketplaces/index.html)
- **Arcadier:** sin tarifa pública; estimaciones de terceros desde ~$800/mes hasta ~$1,500/mes facturado anual; otra fuente: cotización personalizada con setup fee + mensualidad — [Roobykon](https://roobykon.com/blog/posts/best-marketplace-software); [Garnet](https://garnetmarketplace.com/blog/best-marketplace-platforms.html)
- **Medusa:** núcleo open source; Medusa Cloud desde $29/mes; framework headless que requiere desarrollo propio de frontend e integraciones — [Mercur blog](https://www.mercurjs.com/blog/best-marketplace-software); [Prometora](https://www.prometora.com/learn/marketplace-software-comparison)
- **Mirakl:** precios enterprise no publicados; estimaciones de >$20,000/año y de $50k+/año (junto con Marketplacer); cobra además un porcentaje del GMV del marketplace; Mirakl Connect (producto multicanal) $699/mes Growth y $2,299/mes Pro — [Prometora](https://www.prometora.com/learn/marketplace-software-comparison); [yourstore.io](https://yourstore.io/blogs/best-multi-vendor-marketplace-platforms-software-cs-cart-vs.-yourstore-vs.-mirakl-comparison/); [ivristech](https://ivristech.com/best-b2b-marketplace-software/)
- **Marketplacer:** en el rango enterprise junto a Mirakl ($50k+/año, estimación de terceros) — [ivristech](https://ivristech.com/best-b2b-marketplace-software/)

### Inferences
- Para un grupo comunitario, estas herramientas implican costo fijo (≥$199/mes en Sharetribe Live) + procesamiento de Stripe + trabajo técnico; están pensadas para emprendedores que construyen un negocio de marketplace, no para comunidades que quieren lanzar en minutos.
- Mirakl y Marketplacer apuntan a grandes retailers (no compiten directamente); sirven en la slide como "extremo enterprise".
- Medusa (y extensiones multi-vendedor como Mercur) es el competidor open source más cercano para equipos técnicos, pero sin pagos nativos ni presencia LatAm específica.
- Dado que Sharetribe depende de Stripe, un marketplace en Sharetribe con vendedores en México/Colombia/Argentina enfrenta los límites de cuentas conectadas de Stripe (sección 4).

### Gaps
- **Kreoh:** no se encontró información de precios ni de producto en esta ronda.
- **Marketplacer:** sin precio oficial; solo estimación de terceros.
- Los precios de CS-Cart y Arcadier provienen de blogs/agregadores en conflicto; no se verificó en las páginas oficiales.
- No se verificó si Medusa tiene un módulo multi-vendedor oficial ni su costo.

## 4. Infraestructura de split payments: Stripe Connect, Mercado Pago (marketplace), PayPal para marketplaces

### Takeaway
Stripe Connect es el estándar global, pero agrega costos ($2/cuenta activa/mes + 0.25% + 25¢ por payout en el modelo "you handle pricing", 1% por payouts instantáneos) y no soporta de forma self-serve cuentas conectadas fuera de EE. UU./UK/EEE/Canadá/Suiza para cross-border. Mercado Pago split es la opción LatAm, pero su modelo documentado es 1:1 (un vendedor + la comisión del marketplace) vía OAuth por vendedor, no un reparto N-vías a organizador + fondo + plataforma. PayPal permite comisión de partner y retención de fondos, con aprobación previa.

### Cited Findings
- **Stripe Connect (revisado 2026-10-25):** dos modelos. "Stripe handles pricing": Stripe cobra al usuario y la plataforma no paga por cuenta ni payout. "You handle pricing": $2 por cuenta activa al mes; 0.25% + 25¢ por payout; funds routing 0.25%; Instant Payouts 1% del volumen (ambos modelos); payouts cross-border desde 0.25%; débitos de cuenta 1.5%; formularios 1099 $2.99 c/u. Tarifa base de Stripe Payments: 2.9% + 30¢ por cargo con tarjeta — [Stripe Connect Pricing](https://stripe.com/connect/pricing)
- **Stripe cross-border:** plataformas en EE. UU., UK, EEE, Canadá y Suiza pueden transferir a cuentas conectadas en esas mismas regiones; Stripe no soporta payouts cross-border self-serve a otros países; requiere el acuerdo de servicio "Full" para las cuentas conectadas; cada payout cross-border cuesta 0.25% — [Stripe Docs: cross-border payouts](https://docs.stripe.com/connect/cross-border-payouts)
- **Stripe Global Payouts** permite pagar a destinatarios que no pueden incorporarse con el acuerdo Full, pero solo desde plataformas en EE. UU. y UK — [Stripe Support](https://support.stripe.com/questions/pay-out-to-connected-accounts-in-other-countries); [Stripe Docs](https://docs.stripe.com/connect/cross-border-payouts-to-recipients)
- **Mercado Pago split (marketplace):** Checkout Pro usa `marketplace_fee` en `/checkout/preferences`; Checkout API usa `application_fee` en `/v1/payments`; requiere un access token por vendedor obtenido vía OAuth; la comisión de Mercado Pago se descuenta primero del monto del vendedor y luego la comisión del marketplace del remanente. La documentación se ubica bajo "split-1-1" (un vendedor por pago) y existe para AR, BR, MX, CL, CO, UY — [Mercado Pago Developers (CL)](https://mercadopago.cl/developers/en/docs/split-payments/integration-configuration/integrate-marketplace); [Mercado Pago Developers (MX)](https://www.mercadopago.com.mx/developers/pt/docs/split-payments/split-1-1/integration-configuration/integrate-marketplace); [Mercado Pago Developers (AR)](https://www.mercadopago.com.ar/developers/en/docs/split-payments/split-1-1/integration-configuration/integrate-marketplace)
- **Mercado Pago México, tarifas (terceros, sin tabla oficial obtenida):** link de pago 3.49% + $4 MXN + IVA; Point (terminal) 3.5% + IVA con dinero inmediato; las tarifas varían según el plazo de disponibilidad elegido — [calcforlife.com](https://calcforlife.com/?p=3417); [Tiendanube blog](https://www.tiendanube.com/blog/claves-para-tu-comercio-como-funciona-mercado-pago/). Tiendanube usa como referencia 3.49% + $4.64 MXN + IVA — [Ayuda Tiendanube MX](https://ayuda.tiendanube.com/es_MX/123484-costos-por-transaccion/como-se-calculan-los-costos-por-transaccion)
- **PayPal multiparty:** los "partner fees" permiten a la plataforma cobrar comisión por transacción, en la moneda de la transacción, descontada antes de liquidar al vendedor; el permiso DELAY_FUNDS_DISBURSEMENT permite al partner retener y liberar fondos del vendedor según su política; se requiere aprobación de la plataforma para obtener credenciales live — [PayPal Developer: Multiparty](https://developer.paypal.com/docs/multiparty/); [PayPal Developer: permissions](https://developer.paypal.com/limited-release/commerce-platform/v3/seller-onboarding/permissions)

### Inferences
- Para un reparto de 4 vías (vendedor + organizador + fondo + plataforma) en Web2 haría falta: un PSP con split 1:N (Mercado Pago documenta 1:1), cuentas KYC para cada vendedor (OAuth/onboarding por vendedor), conciliación del fondo comunitario fuera del PSP y asumir contracargos. Compaki hace esto en un solo contrato Soroban, con login por email/Google.
- Costo apilado típico de un marketplace Web2 en LatAm: ~3.5% + fijo + IVA del PSP (~4–4.5% efectivo) + comisión del software (0–2%) + suscripción. Stripe agrega $2/cuenta activa/mes, lo que pesa en comunidades con muchos vendedores de bajo volumen.
- Payouts instantáneos existen en Web2 (Stripe Instant Payouts 1%, Mercado Pago "dinero al instante" con una tarifa mayor), pero cuestan extra; en Compaki la liquidación instantánea es el comportamiento por defecto.
- Contracargos: con tarjeta, el riesgo de contracargo recae en vendedor/plataforma (Meta incluso abandonó la resolución de disputas en Shops). Los pagos en stablecoin no tienen contracargos, una ventaja para el vendedor y un riesgo de protección al comprador que Compaki debe resolver con políticas propias.

### Gaps
- No se obtuvo la lista completa de países de cuentas conectadas de Stripe (si México y Brasil admiten cuentas conectadas locales con plataforma local).
- No se encontró documentación de Mercado Pago sobre split 1:N (múltiples receptores por pago) ni tarifas oficiales de split.
- No se obtuvieron tarifas ni países de PayPal para marketplaces en LatAm, ni plazos de payout.
- Requisitos KYC específicos por país (RFC en México, CPF/CNPJ en Brasil) no se verificaron en esta ronda.

## 5. Plataformas locales, comunitarias y cooperativas: Open Food Network, Local Line, apps de ferias, plataformas cooperativas; comercio justo (Novica, Ten Thousand Villages)

### Takeaway
Open Food Network es el análogo conceptual más cercano a Compaki: hubs comunitarios multi-productor, "enterprise fees" transparentes que se muestran al comprador e incluso un precedente de cuota para recaudar fondos para proyectos locales. Pero usa pagos tradicionales (sin split instantáneo) y tiene poca presencia en LatAm. Local Line apunta a granjas norteamericanas con suscripción de $29–99+/mes.

### Cited Findings
- **Open Food Network (OFN):** las "enterprise fees" permiten asignar costos de administración, empaque, transporte, ventas y recaudación de fondos a distintas partes; ejemplo: un hub agrega 10% de fee administrativo; los compradores pueden ver cómo se divide cada precio — [OFN User Guide: Enterprise Fees](https://guide.openfoodnetwork.org/basic-features/shopfront/enterprise-fees)
- **OFN:** el precio que ingresa el productor es lo que recibe íntegro (precio "mayorista"); los hubs suman sus fees encima — [OFN User Guide: Products](https://guide.openfoodnetwork.org/basic-features/products-1)
- **OFN, modelos locales:** una instancia canadiense cobraba 1–3% de facturación (2% con tope de $150/mes) y los hubs lo consideraron caro; un hub noruego reportó 2% a la plataforma OFN como fee administrativo + 2% como fee de recaudación para proyectos locales (discusión comunitaria, posiblemente desactualizada) — [OFN Community: percentage vs flat fee](https://community.openfoodnetwork.org/t/percentage-based-vs-flat-fee-models-for-hubs/2113); [OFN Community: business models](https://community.openfoodnetwork.org/t/sharing-business-models-of-local-ofn-entities/485)
- **Local Line:** Capterra lista precio desde US$99 (tarifa plana, prueba gratis), planes Core → Premium, 20% de descuento anual; el blog de Local Line describe un antiguo plan Starter de $0/mes + 3% de ventas, reemplazado por Starter a $29/mes porque "no funcionó en la práctica" — [Capterra](https://www.capterra.ca/software/200999/local-line); [Local Line blog](https://blog.localline.ca/starter-plan-updates)

### Inferences
- OFN valida la tesis de Compaki: comunidades de productores quieren fees de hub/organizador transparentes y una parte para fondos comunitarios (el caso noruego de 2% para proyectos locales es casi idéntico al fondo comunitario de Compaki). La diferencia de Compaki: reparto atómico on-chain, payout instantáneo, recompensas a compradores/vendedores y verificabilidad pública.
- La experiencia de Local Line (abandonar el 0 $/mes + 3%) sugiere que un modelo solo de comisión puede ser difícil de sostener con vendedores de bajo volumen; un punto a considerar para la sostenibilidad del 2% de Compaki.
- Las plataformas de comercio justo (Novica, Ten Thousand Villages) compiten en narrativa de "precio justo al productor", pero son curadas/centralizadas, no herramientas para que una comunidad lance su propio marketplace.

### Gaps
- **Novica** (comisión, cómo fija precios con artesanos) y **Ten Thousand Villages** (modelo de pago a artesanos): no se encontraron datos en esta ronda.
- No se encontró el precio oficial actual de las instancias hospedadas de OFN ni su presencia en Latinoamérica.
- No se investigaron apps de ferias de productores ni plataformas cooperativas (p. ej., Stocksy, Up&Go) específicamente.

## 6. Take rate total típico para un vendedor pequeño, plazos de payout y costo de pagos transfronterizos

### Takeaway
Un vendedor pequeño en LatAm típicamente pierde ~4–5% solo en procesamiento (Mercado Pago ~3.5% + fijo + IVA) y entre ~10% y ~25% si vende en un marketplace grande, con dinero disponible de 2 a 14+ días después de la entrega. Compaki puede presentarse como "2% plataforma + lo que la comunidad decida, y ese excedente vuelve a la comunidad; liquidación inmediata".

### Cited Findings
- **Etsy:** ~9.5–10% base en EE. UU.; ~22–25% con Offsite Ads; +2.5% por conversión de moneda — [checkoutpage.com](https://checkoutpage.com/blog/etsy-fees); [growingyourcraft.com](https://www.growingyourcraft.com/blog/how-much-does-it-really-cost-to-sell-on-etsy)
- **Mercado Libre MX:** ejemplo de 18.6% efectivo (16% + IVA) en venta de $500 MXN; cargo fijo de $25–37 MXN en artículos de menos de $299 — [calcforlife.com](https://calcforlife.com/es/calculadora-mercado-libre-comisiones/); payout 2–14 días tras la entrega según país/reputación — [UpSeller](https://upseller.com/es/blog-article-511); [Telediario](https://www.telediario.mx/comunidad/ventas-mercado-libre-cuanto-tardan-depositar-el-dinero)
- **Amazon Handmade:** ~15% — [Craftybase](https://app.craftybase.com/blog/where-can-i-sell-my-handmade-products-online)
- **Shopify (EE. UU.):** 2.9% + 30¢ con Shopify Payments, o 0.6–2% + tarifa del procesador externo, más suscripción $19–399/mes — [Shopify Pricing](https://www.shopify.com/pricing); [ecommerce-platforms.com](https://ecommerce-platforms.com/?p=32623)
- **Tiendanube MX:** 0.5–2% por transacción si no usa Pago Nube + procesador (~3.49% + $4.64 MXN + IVA con Mercado Pago) + mensualidad $0–999 MXN — [Ayuda Tiendanube MX](https://ayuda.tiendanube.com/es_MX/123484-costos-por-transaccion/como-se-calculan-los-costos-por-transaccion); [Tiendanube MX planes](https://www.tiendanube.com/mx/planes-y-precios)
- **Sharetribe:** 0% de comisión de plataforma + ~1.5–3% de Stripe + $199–259/mes — [Sharetribe Pricing](https://www.sharetribe.com/pricing/)
- **Stripe Connect:** 2.9% + 30¢ + (si la plataforma fija precios) $2/cuenta activa/mes + 0.25% + 25¢ por payout; Instant Payouts +1%; cross-border desde 0.25% — [Stripe Connect Pricing](https://stripe.com/connect/pricing)
- **OFN:** 2% plataforma (+2% de recaudación en un hub noruego) + fees de hub (~10% de ejemplo) — [OFN Community](https://community.openfoodnetwork.org/t/sharing-business-models-of-local-ofn-entities/485); [OFN Guide](https://guide.openfoodnetwork.org/basic-features/shopfront/enterprise-fees)

### Inferences
Tabla resumen sugerida para la slide (cifras aproximadas a 2026-10-25; ver fuentes arriba):

| Competidor | Tipo | Costo fijo | Take rate típico vendedor pequeño | Payout | Multi-vendedor / split organizador | Fondo comunitario | Transparencia del reparto | LatAm |
|---|---|---|---|---|---|---|---|---|
| Shopify + Webkul | Tienda + app | $19–65 + $15–60/mes | ~3–5% (procesador + 0.6–2% si no es Shopify Payments) | Según PSP | Vía app; split depende de Stripe/PayPal | No | No | Sí, con PSP local + recargo |
| WooCommerce + Dokan | Plugin self-hosted | $0–649/año + hosting | ~3–5% (PSP) | Según PSP | Sí (Stripe Connect/Mangopay/PayPal desde Pro/Business) | No | No | Limitada por PSP |
| Tiendanube | Tienda LatAm | $0–999 MXN/mes | ~4–6% (PSP + 0.5–2%) o solo PSP con Pago Nube | Según PSP | No (un solo comerciante) | No | No | Fuerte (MX, AR, BR, CO, CL) |
| Etsy | Marketplace | $0.20/listado | ~10% base; ~22–25% con Offsite Ads | Días (no verificado) | No | No | No | Limitado |
| Mercado Libre | Marketplace | $0 | ~12–22% + IVA + fijo en tickets bajos | 2–14+ días tras entrega | No | No | No | Líder regional |
| Amazon Handmade | Marketplace | $0 (exento) | ~15% + procesamiento | Ciclo Amazon (no verificado) | No | No | No | MX/BR parcial (no verificado) |
| Instagram/WhatsApp | Social informal | $0 | 0% plataforma + costo de link/transferencia | Según medio | Manual | Manual | No | Masivo |
| Sharetribe | Builder | $199–259/mes | ~1.5–3% Stripe | Stripe | Sí (Stripe Connect) | No | No | Limitada por Stripe |
| CS-Cart MV | Software | ~$1.5–3.8k licencia o ~$600–3k/año | PSP | Según PSP | Sí | No | No | Self-hosted |
| Mirakl / Marketplacer | Enterprise | $20k–50k+/año + % GMV | n/a (retailers) | Según PSP | Sí | No | No | Enterprise |
| Open Food Network | Comunitario | Bajo / por instancia | 2% plataforma + fees de hub | PSP tradicional | Sí (fees de hub) | Precedente (2% recaudación en un hub) | Sí (desglose al comprador) | Escasa |
| **Compaki** | Marketplace comunitario on-chain | $0 | 2% plataforma + % organizador + % fondo (definidos por la comunidad) | Instantáneo | Sí, atómico | Sí (recompensas o meta de recaudación) | On-chain verificable | Diseñado para LatAm |

- Pros transversales de los competidores Web2: tráfico y confianza (Mercado Libre, Etsy), madurez de herramientas (Shopify), pagos locales con tarjeta/OXXO/Pix y meses sin intereses (Mercado Pago/Tiendanube), protección al comprador.
- Contras transversales: comisiones apiladas, payout diferido, reparto multi-parte no nativo, KYC por vendedor, contracargos, ningún mecanismo de fondo comunitario, reparto opaco.
- Riesgos para la narrativa de Compaki: los compradores LatAm pagan con tarjeta, OXXO, Pix o transferencia, no con stablecoin; la rampa de entrada/salida (on/off-ramp) tiene costo propio que debe sumarse al 2% para una comparación honesta.

### Gaps
- No se obtuvo el promedio global del costo de remesas del Banco Mundial (Remittance Prices Worldwide) ni datos por corredor LatAm (Statista mostró los valores ocultos); conocimiento previo sugiere ~6% global para envíos de $200, sin verificar en esta ronda.
- No se verificaron los plazos de payout de Etsy y Amazon Handmade.
- No se obtuvo el costo de on/off-ramp de stablecoin (USDC en Stellar ↔ MXN/ARS/COP) para comparar el costo total real de Compaki.
