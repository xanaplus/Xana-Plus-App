import { useState, type ReactNode } from "react";
import "./homepolish.css";

type IconName = "pin" | "bell" | "user" | "search" | "scan" | "arrow" | "chevron" | "clock" | "bag" | "home" | "grid" | "heart" | "plus" | "close" | "check" | "spark";

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true as const };
  const shapes: Record<IconName, ReactNode> = {
    pin: <><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
    user: <><circle cx="12" cy="8" r="3.5" /><path d="M5 21a7 7 0 0 1 14 0" /></>,
    search: <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" /></>,
    scan: <><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" /><path d="M7 12h10M9 9h6M9 15h6" /></>,
    arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
    chevron: <path d="m9 18 6-6-6-6" />,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    bag: <><path d="M5 8h14l1 13H4L5 8Z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></>,
    home: <><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-6v-7h-4v7H4a1 1 0 0 1-1-1V10Z" /></>,
    grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
    heart: <path d="M20.8 8.8c0 5.3-8.8 11-8.8 11S3.2 14.1 3.2 8.8A4.8 4.8 0 0 1 12 6a4.8 4.8 0 0 1 8.8 2.8Z" />,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    spark: <><path d="m12 3 1.6 6.4L20 11l-6.4 1.6L12 19l-1.6-6.4L4 11l6.4-1.6L12 3Z" /><path d="m19 15 .7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7L19 15Z" /></>,
  };
  return <svg {...common}>{shapes[name]}</svg>;
}

const categories = [
  { label: "Fresh\nproduce", image: "/__mockup/images/homepolish-greens.jpg" },
  { label: "Meat &\npoultry", image: "/__mockup/images/homepolish-meat.jpg" },
  { label: "Bakery", image: "/__mockup/images/homepolish-bakery.jpg" },
  { label: "Pharmacy", image: null },
  { label: "Pantry", image: "/__mockup/images/homepolish-avocados.jpg" },
];

const offers = [
  { eyebrow: "FARM TO TABLE", title: "Greens worth\ngetting up for", note: "Picked fresh this morning", image: "/__mockup/images/homepolish-greens.jpg", color: "sage" },
  { eyebrow: "THE EVERYDAY EDIT", title: "Good food,\ncloser to home", note: "Find your weekly favourites", image: "/__mockup/images/homepolish-bakery.jpg", color: "peach" },
];

const products = [
  { name: "Kenyan Hass Avocados", detail: "Pack of 3 · Syokimau grown", price: "KES 180", was: "KES 220", image: "/__mockup/images/homepolish-avocados.jpg", badge: "SAVE 18%" },
  { name: "Farmers Choice Sausages", detail: "Beef · 400g chilled", price: "KES 340", was: "", image: "/__mockup/images/homepolish-meat.jpg", badge: "FRESH" },
];

export default function HomePolish() {
  const [store, setStore] = useState("Syokimau");
  const [storeOpen, setStoreOpen] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [unread, setUnread] = useState(true);
  const [cartCount, setCartCount] = useState(1);
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState("Home");
  const [toast, setToast] = useState("");

  const announce = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2200);
  };

  return (
    <main className="hp-app">
      <header className="hp-header">
        <div className="hp-brand-line">
          <div className="hp-brand">
            <span className="hp-brand-mark">x</span>
            <span className="hp-brand-name">Xana<span>Plus</span></span>
          </div>
          <button className="hp-store" onClick={() => setStoreOpen(true)} aria-label="Change store">
            <Icon name="pin" size={15} /><span>{store}</span><Icon name="chevron" size={13} />
          </button>
          <button className="hp-icon-button hp-notice-button" aria-label="Notifications" onClick={() => setNoticeOpen(true)}>
            <Icon name="bell" size={19} />{unread && <i />}
          </button>
          <button className="hp-avatar" aria-label="Your profile" onClick={() => announce("Your account is ready")}>A</button>
        </div>
        <label className="hp-search">
          <Icon name="search" size={19} />
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder="What are you looking for?" />
          {query ? <button aria-label="Clear search" onClick={() => setQuery("")}><Icon name="close" size={16} /></button> : <button aria-label="Scan a barcode" onClick={() => announce("Barcode scanner ready")}><Icon name="scan" size={19} /></button>}
        </label>
      </header>

      <div className="hp-scroll">
        <section className="hp-hero">
          <img src="/__mockup/images/homepolish-hero.jpg" alt="" />
          <div className="hp-hero-shade" />
          <div className="hp-hero-content">
            <div className="hp-hero-meta"><span className="hp-sale-tag">UP TO 35% OFF</span><span className="hp-countdown"><Icon name="clock" size={12} /> 04:22:15</span></div>
            <p className="hp-eyebrow">THIS WEEK AT XANA</p>
            <h1>Good things<br />are on special.</h1>
            <p className="hp-hero-copy">Fresh picks, pantry favourites<br />and more for less.</p>
            <button className="hp-hero-cta" onClick={() => announce("Showing this week's offers")}>Shop this week <Icon name="arrow" size={16} /></button>
          </div>
          <div className="hp-hero-foot"><span><span className="hp-mpesa-dot">M</span> KES 200 M-Pesa cashback</span><b>01 <i>/</i> 03</b></div>
        </section>

        <section className="hp-categories">
          <div className="hp-section-heading"><div><span className="hp-kicker">A LITTLE OF EVERYTHING</span><h2>Shop by aisle</h2></div><button onClick={() => announce("All aisles")}>All aisles <Icon name="arrow" size={15} /></button></div>
          <div className="hp-category-row">
            {categories.map((category, index) => <button className="hp-category" key={category.label} onClick={() => announce(`${category.label.replace("\n", " ")} selected`)}>
              <span className={`hp-category-image hp-category-${index}`}>{category.image ? <img src={category.image} alt="" /> : <span className="hp-pharmacy-symbol">+</span>}</span>
              <span>{category.label.split("\n").map((part, i) => <span key={i}>{part}{i === 0 && category.label.includes("\n") ? <br /> : null}</span>)}</span>
            </button>)}
          </div>
        </section>

        <section className="hp-club">
          <div className="hp-club-icon"><Icon name="spark" size={20} /></div>
          <div className="hp-club-main"><div className="hp-club-title">Xana Club <span>GOLD</span></div><p>1,240 points <span>·</span> 760 to your next reward</p><div className="hp-progress"><i /></div></div>
          <button className="hp-club-arrow" aria-label="View rewards" onClick={() => announce("Xana Club rewards")}><Icon name="arrow" size={17} /></button>
        </section>

        <section className="hp-offers-section">
          <div className="hp-section-heading"><div><span className="hp-kicker">GOOD VALUE, GOOD MOOD</span><h2>Little things to love</h2></div><button onClick={() => announce("All offers")}>See all <Icon name="arrow" size={15} /></button></div>
          <div className="hp-offer-row">{offers.map(offer => <button key={offer.eyebrow} className={`hp-offer ${offer.color}`} onClick={() => announce(offer.note)}>
            <img src={offer.image} alt="" />
            <div className="hp-offer-fade" />
            <div className="hp-offer-copy"><span>{offer.eyebrow}</span><strong>{offer.title.split("\n").map((line, i) => <span key={i}>{line}<br /></span>)}</strong><small>{offer.note} <Icon name="arrow" size={13} /></small></div>
          </button>)}</div>
        </section>

        <section className="hp-products">
          <div className="hp-section-heading"><div><span className="hp-kicker">FRESH IN STORE</span><h2>Everyday, made better</h2></div><button onClick={() => announce("Fresh everyday aisle")}>View all <Icon name="arrow" size={15} /></button></div>
          <div className="hp-product-row">{products.map(product => <article className="hp-product" key={product.name}>
            <div className="hp-product-photo"><img src={product.image} alt={product.name} /><span>{product.badge}</span><button aria-label={`Save ${product.name}`} onClick={() => announce(`${product.name} saved`)}><Icon name="heart" size={16} /></button></div>
            <div className="hp-product-copy"><strong>{product.name}</strong><span>{product.detail}</span><div><b>{product.price}</b>{product.was && <del>{product.was}</del>}</div></div>
            <button className="hp-add" aria-label={`Add ${product.name} to basket`} onClick={() => { setCartCount(cartCount + 1); announce(`${product.name} added to basket`); }}><Icon name="plus" size={17} /></button>
          </article>)}</div>
        </section>

        <button className="hp-payment" onClick={() => announce("Fast M-Pesa checkout selected")}><span className="hp-payment-symbol">M</span><span><strong>Pay with M-Pesa in a tap</strong><small>Quick, secure checkout. No waiting around.</small></span><Icon name="chevron" size={17} /></button>
        <div className="hp-footer-note"><span>GOOD FOOD. GOOD DAYS.</span><span>Made for your neighbourhood.</span></div>
      </div>

      <nav className="hp-tabbar" aria-label="Main navigation">
        {[{ label: "Home", icon: "home" as const }, { label: "Aisles", icon: "grid" as const }, { label: "Saved", icon: "heart" as const }, { label: "Basket", icon: "bag" as const }].map(tab => <button key={tab.label} className={activeTab === tab.label ? "active" : ""} onClick={() => { setActiveTab(tab.label); if (tab.label !== "Home") announce(`${tab.label} selected`); }}><span className="hp-tab-icon"><Icon name={tab.icon} size={19} />{tab.label === "Basket" && cartCount > 0 && <i>{cartCount}</i>}</span><span>{tab.label}</span></button>)}
      </nav>

      {(storeOpen || noticeOpen) && <div className="hp-modal-backdrop" onClick={() => { setStoreOpen(false); setNoticeOpen(false); }}>
        <section className="hp-modal" onClick={event => event.stopPropagation()}>
          <div className="hp-modal-handle" />
          <button className="hp-modal-close" aria-label="Close" onClick={() => { setStoreOpen(false); setNoticeOpen(false); }}><Icon name="close" size={18} /></button>
          {storeOpen ? <><span className="hp-kicker">SHOP LOCAL</span><h2>Choose your store</h2><p>Prices and delivery options follow your nearest Xana Plus.</p>{["Syokimau", "Ruiru"].map((place, index) => <button className="hp-store-option" key={place} onClick={() => { setStore(place); setStoreOpen(false); }}><span><b>Xana Plus {place}</b><small>{index ? "Ruiru, Kamakis" : "Syokimau, Mombasa Road"}</small></span>{place === store ? <Icon name="check" size={19} /> : <Icon name="chevron" size={17} />}</button>)}</> : <><span className="hp-kicker">JUST FOR YOU</span><h2>Your latest updates</h2><div className="hp-notification"><span className="hp-notification-icon"><Icon name="spark" size={18} /></span><span><b>Fresh offers just landed</b><small>Save on your weekly favourites at Xana Plus.</small><em>Today · Syokimau store</em></span></div><button className="hp-read-button" onClick={() => { setUnread(false); setNoticeOpen(false); }}>Mark all as read</button></>}
        </section>
      </div>}
      {toast && <div role="status" className="hp-toast"><Icon name="check" size={16} />{toast}</div>}
    </main>
  );
}
