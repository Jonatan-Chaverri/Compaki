import Link from "next/link";
import { Icon, type IconName } from "@/components/icon";
import { MarketArt } from "@/components/market-art";
import { AppHeader } from "@/components/shell";

const collections = [
  { title: "From the farm", description: "Coffee, fresh finds & everyday goodness", variant: "coffee" as const, category: "Coffee & agriculture" },
  { title: "Made with care", description: "Handcrafted pieces with a story to tell", variant: "craft" as const, category: "Crafts" },
  { title: "Rooted in community", description: "Discover more from independent sellers", variant: "grow" as const, category: "Other" },
];
const benefits: { icon: IconName; title: string; text: string }[] = [
  { icon: "store", title: "Real people. Thoughtful products.", text: "Discover independent makers and growers." },
  { icon: "leaf", title: "Small purchases. Shared impact.", text: "Help communities grow with every order." },
  { icon: "shield", title: "See where your money goes.", text: "A clear breakdown, with every purchase." },
];

export default function LandingPage() {
  return <div className="landing">
    <AppHeader right={<Link href="/onboarding" className="button-primary button-small">Start a marketplace<Icon name="arrow" className="h-3.5 w-3.5" /></Link>} />
    <main id="main-content">
      <section className="landing-hero">
        <div>
          <span className="hero-tag"><Icon name="leaf" className="h-3.5 w-3.5" /> A little more local. A lot more connected.</span>
          <h1>Good things.<br />Great people.<br /><em>Growing together.</em></h1>
          <p className="hero-description">Discover products with a story. Support the people behind them. And help your community thrive, one purchase at a time.</p>
          <div className="hero-buttons"><Link href="/marketplaces" className="button-primary">Explore marketplaces<Icon name="arrow" className="h-4 w-4" /></Link><Link href="/onboarding" className="button-secondary">Start your own</Link></div>
          <p className="hero-reassurance"><Icon name="check" className="h-3 w-3" /> One simple account. No crypto experience needed.</p>
        </div>
        <div className="hero-scene">
          <MarketArt />
          <p className="scene-label">A basket full of better</p>
          <div className="floating-receipt">
            <div className="receipt-top"><span><Icon name="check" className="h-4 w-4" /></span><div><strong>A purchase with purpose</strong><p>Example · $40.00 order</p></div></div>
            <div className="receipt-line"><span>To the maker</span><strong>$36.00</strong></div>
            <div className="receipt-line"><span>To the marketplace</span><strong>$3.20</strong></div>
            <div className="receipt-line"><span>To the community</span><strong>$0.80 ♡</strong></div>
          </div>
          <span className="floating-impact"><Icon name="leaf" className="h-4 w-4" /> A little back. A better future.</span>
        </div>
      </section>
      <section className="benefit-strip" aria-label="Why shop with Compaki"><div className="benefit-inner">{benefits.map(b => <div className="benefit-item" key={b.title}><span className="benefit-icon"><Icon name={b.icon} className="h-5 w-5" /></span><div><strong>{b.title}</strong><p>{b.text}</p></div></div>)}</div></section>
      <section className="landing-section">
        <div className="section-heading-row"><div><p className="eyebrow">Find your kind of good</p><h2 className="section-title">A world of small discoveries.</h2></div><Link href="/marketplaces" className="text-link">Explore all marketplaces<Icon name="arrow" className="h-4 w-4" /></Link></div>
        <div className="collection-grid">{collections.map(c => <Link href={`/marketplaces?category=${encodeURIComponent(c.category)}`} key={c.title} className="collection-card"><div className="collection-art"><MarketArt variant={c.variant} /></div><div className="collection-body"><div><h3>{c.title}</h3><p>{c.description}</p></div><span className="circle-arrow"><Icon name="arrow" className="h-4 w-4" /></span></div></Link>)}</div>
      </section>
      <section id="how-it-works" className="how-section"><div className="landing-section">
        <div className="how-header"><p className="eyebrow">Good for you. Good for your community.</p><h2 className="section-title">Simple to use. Meaningful by nature.</h2><p className="section-copy">Shopping with purpose should feel as natural as shopping.</p></div>
        <div className="how-grid">
          <div><span className="step-number">01 / DISCOVER</span><h3>Find a community you love.</h3><p>Explore marketplaces brought together by shared places, passions and people. Meet your next favorite maker or grower.</p></div>
          <div><span className="step-number">02 / SHOP</span><h3>Choose something that matters.</h3><p>Add your favorites to your cart and check out with your Compaki account. No separate wallet or technical setup required.</p></div>
          <div><span className="step-number">03 / GROW</span><h3>See the good your purchase does.</h3><p>Sellers receive their share automatically. When a marketplace supports a community fund, you can see its share on your receipt too.</p></div>
        </div>
      </div></section>
      <section id="community" className="landing-section impact-section">
        <div className="impact-example"><div className="impact-example-inner"><p className="eyebrow mb-3">A little transparency goes a long way</p><h3>One purchase. Shared good.</h3><p className="mt-2 mb-3 text-xs text-slate-400">An example of a $40 order</p><div className="split-row"><span><Icon name="store" className="h-4 w-4" /></span>The maker <strong>$36.00</strong></div><div className="split-row"><span><Icon name="people" className="h-4 w-4" /></span>The marketplace <strong>$3.20</strong></div><div className="split-row"><span><Icon name="leaf" className="h-4 w-4" /></span>The community <strong>$0.80</strong></div><div className="mt-5 flex h-2 gap-1 overflow-hidden rounded-full"><span className="w-[90%] rounded-full bg-navy-900" /><span className="w-[8%] rounded-full bg-[#d2ac7d]" /><span className="w-[2%] rounded-full bg-[#92ab6c]" /></div></div><p className="impact-note">Each marketplace chooses its own percentages.</p></div>
        <div className="impact-copy"><p className="eyebrow">Commerce with a sense of community</p><h2 className="section-title">When your community wins,<br />everyone grows.</h2><p className="section-copy">A school project. A neighborhood initiative. The people who make it all possible. Marketplaces can dedicate part of each sale to their community, with the contribution built into the price and shown on every receipt.</p><Link href="/onboarding" className="text-link">Build something good together<Icon name="arrow" className="h-4 w-4" /></Link></div>
      </section>
      <section className="landing-cta"><div><h2>Your people. Your marketplace.</h2><p>Bring your sellers together, share your story, and start growing your community.</p></div><Link href="/onboarding" className="button-primary">Create your marketplace<Icon name="arrow" className="h-4 w-4" /></Link></section>
    </main>
  </div>;
}
