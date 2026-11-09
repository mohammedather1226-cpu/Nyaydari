import Link from "next/link";

const navigation = [
  { href: "/", label: "Home" },
  { href: "/legal-assistance", label: "Legal Assistance" },
  { href: "/pdf-summary", label: "PDF Summary" },
];

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="header-inner">
        <Link aria-label="LegalEase home" className="brand" href="/">
          <span aria-hidden="true" className="brand-mark">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M12 3v18M5 7h14M7 7l-4 8h8L7 7Zm10 0-4 8h8l-4-8ZM7 21h10" />
            </svg>
          </span>
          <span>Legal<span className="brand-light">Ease</span></span>
        </Link>
        <nav aria-label="Main navigation" className="main-nav">
          {navigation.map((item) => (
            <Link
              className="nav-link"
              href={item.href}
              key={item.href}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <Link className="header-cta" href="/legal-assistance">
          Get started <span aria-hidden="true">↗</span>
        </Link>
      </div>
    </header>
  );
}
