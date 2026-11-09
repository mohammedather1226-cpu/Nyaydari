import Link from "next/link";

const features = [
  {
    number: "01",
    icon: "✳",
    title: "Understand your situation",
    description:
      "Turn a complicated legal concern into a clear, plain-language starting point.",
  },
  {
    number: "02",
    icon: "▤",
    title: "Get document-ready",
    description:
      "See what paperwork may help and keep track of what you already have.",
  },
  {
    number: "03",
    icon: "⌕",
    title: "Find a next step",
    description:
      "Explore practical options and discover legal aid resources to follow up with.",
  },
];

export default function Home() {
  return (
    <>
      <section className="hero">
        <div className="hero-grid" aria-hidden="true" />
        <div className="hero-inner">
          <div className="hero-copy">
            <div className="eyebrow"><span /> LEGAL CLARITY, MADE SIMPLE</div>
            <h1>Understand Your Legal Problems, <span>Simply</span></h1>
            <p className="hero-description">
              Get a clearer starting point for life&apos;s legal questions.
              Nyaydari offers initial legal information and document
              assistance, in language that makes sense.
            </p>
            <div className="hero-actions">
              <Link className="button button-primary" href="/legal-assistance">
                Start Legal Assistance <span aria-hidden="true">→</span>
              </Link>
              <Link className="button button-secondary" href="/pdf-summary">
                <span aria-hidden="true">▤</span> Summarize a PDF
              </Link>
            </div>
            <div className="hero-note">
              <span aria-hidden="true">✓</span> Private by design · No account needed
            </div>
          </div>
          <div className="hero-art" aria-label="An illustration of organized legal documents">
            <div className="art-orbit orbit-one" />
            <div className="art-orbit orbit-two" />
            <div className="art-card art-card-back">
              <span className="art-card-label">YOUR NEXT STEP</span>
              <span className="art-lines"><i /><i /><i /></span>
            </div>
            <div className="art-document">
              <div className="document-top"><span>LEGAL<span>EASE</span></span><b>01</b></div>
              <div className="document-title">A clearer<br />way forward.</div>
              <div className="document-rule" />
              <span className="document-caption">YOUR PERSONAL GUIDE</span>
              <div className="document-lines"><i /><i /><i /><i /></div>
              <div className="document-seal" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none"><path d="m6 12 4 4 8-9" /></svg>
              </div>
            </div>
            <div className="art-floating art-floating-top"><span>✦</span> Plain-language guidance</div>
            <div className="art-floating art-floating-bottom"><span className="floating-check">✓</span> Know what to gather</div>
            <div className="art-sparkle sparkle-one">✳</div>
            <div className="art-sparkle sparkle-two">✦</div>
          </div>
        </div>
        <div className="hero-bottom">
          <span>BUILT FOR YOUR FIRST STEP</span>
          <span className="hero-bottom-line" />
          <span>Helpful information, without the legalese.</span>
        </div>
      </section>

      <section className="features-section">
        <div className="section-heading">
          <div>
            <div className="eyebrow"><span /> A LITTLE MORE CLARITY</div>
            <h2>Legal support that starts <span>with you.</span></h2>
          </div>
          <p>
            Not sure where to begin? We help you organize your thoughts and
            prepare for a more informed conversation.
          </p>
        </div>
        <div className="feature-grid">
          {features.map((feature) => (
            <article className="feature-card" key={feature.number}>
              <div className="feature-card-top">
                <span className="feature-icon" aria-hidden="true">{feature.icon}</span>
                <span className="feature-number">{feature.number}</span>
              </div>
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
              <span className="feature-arrow" aria-hidden="true">↗</span>
            </article>
          ))}
        </div>
      </section>

      <section className="disclaimer-banner">
        <span aria-hidden="true" className="disclaimer-icon">i</span>
        <p>
          <strong>A helpful place to start, not a substitute for a lawyer.</strong>
          {" "}Nyaydari provides general information only. It is not legal advice
          and does not create an attorney-client relationship. For advice about
          your situation, speak with a qualified legal professional.
        </p>
        <Link href="/legal-assistance">Learn more <span aria-hidden="true">→</span></Link>
      </section>
    </>
  );
}
