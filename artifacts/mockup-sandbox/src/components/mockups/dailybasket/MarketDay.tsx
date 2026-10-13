import { useState, type ReactNode } from "react";
import "./marketday.css";

type Glyph = "pin" | "chevron" | "search" | "bell" | "check" | "plus" | "minus" | "arrow" | "bag" | "grid" | "heart" | "user" | "close" | "spark" | "clock";

function Icon({ name, size = 18 }: { name: Glyph; size?: number }) {
  const shared = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true as const };
  const paths: Record<Glyph, ReactNode> = {
    pin: <><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
    chevron: <path d="m9 18 6-6-6-6" />,
    search: <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" /></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    minus: <path d="M5 12h14" />,
    arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
    bag: <><path d="M5 8h14l1 13H4L5 8Z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></>,
    grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
    heart: <path d="M20.8 8.8c0 5.3-8.8 11-8.8 11S3.2 14.1 3.2 8.8A4.8 4.8 0 0 1 12 6a4.8 4.8 0 0 1 8.8 2.8Z" />,
    user: <><circle cx="12" cy="8" r="3.5" /><path d="M5 21a7 7 0 0 1 14 0" /></>,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
    spark: <><path d="m12 3 1.6 6.4L20 11l-6.4 1.6L12 19l-1.6-6.4L4 11l6.4-1.6L12 3Z" /><path d="m19 15 .7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7L19 15Z" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  };
  return <svg {...shared}>{paths[name]}</svg>;
}

const starterItems = [
  { name: "Avocados", detail: "3 ripe · produce", done: false },
  { name: "Farm fresh milk", detail: "2 × 500 ml · dairy", done: false },
  { name: "Brown bread", detail: "1 loaf · bakery", done: true },
  { name: "Maize flour", detail: "2 kg · pantry", done: false },
];
const picks = [
  { name: "Free-range eggs", size: "Tray of 6", price: "KES 230", art: "eggs", glyph: "◉" },
  { name: "Sweet bananas", size: "Bunch · Mwea", price: "KES 95", art: "bananas", glyph: "⌒" },
];

export default function MarketDay() {
  const [list, setList] = useState(starterItems);
  const [basket, setBasket] = useState(2);
  const [store, setStore] = useState("Syokimau");
  const [storeOpen, setStoreOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("Today");
  const [toast, setToast] = useState("");
  const [noticeOpen, setNoticeOpen] = useState(false);

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2100);
  };
  const toggleItem = (index: number) => setList(current => current.map((item, i) => i === index ? { ...item, done: !item.done } : item));
  const addItem = (name: string) => {
    setList(current => [...current, { name, detail: "Added just now · shopping list", done: false }]);
    setBasket(value => value + 1);
    notify(`${name} added to your list`);
  };
  const remaining = list.filter(item => !item.done).length;

  return (
    <main className="md-app">
      <header className="md-header">
        <div className="md-topline">
          <div className="md-wordmark"><span className="md-mark">x</span><span>Xana<span className="md-plus">Plus</span></span></div>
          <button className="md-store" onClick={() => setStoreOpen(true)} aria-label="Change fulfilment store"><Icon name="pin" size={14} />{store}<Icon name="chevron" size={12} /></button>
          <button className="md-head-icon" onClick={() => setNoticeOpen(true)} aria-label="Open updates"><Icon name="bell" size={18} /><i /></button>
          <button className="md-user" onClick={() => notify("Your account is ready")} aria-label="Your account">A</button>
        </div>
        <label className="md-search"><Icon name="search" size={18} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Find something for your list" />{query && <button onClick={() => setQuery("")} aria-label="Clear search"><Icon name="close" size={15} /></button>}</label>
      </header>

      <div className="md-scroll">
        <section className="md-greeting">
          <div>
            <span className="md-kicker">MONDAY, 18 NOVEMBER</span>
            <h1>Good morning,<br /><em>Amina.</em></h1>
            <p>Your neighbourhood shop, at your pace.</p>
          </div>
          <div className="md-daymark" aria-label={`${remaining} items left on your list`}><span>{remaining}</span><small>left<br />to shop</small><i /></div>
        </section>

        <section className="md-list-card">
          <div className="md-list-head">
            <div><span className="md-kicker">YOUR NEXT SHOP</span><h2>The weekly little things</h2></div>
            <button className="md-edit" onClick={() => addItem("Something for dinner")}><Icon name="plus" size={16} /> Add</button>
          </div>
          <div className="md-list-meta"><span><Icon name="clock" size={13} /> Ready whenever you are</span><span>{list.length} things</span></div>
          <div className="md-checklist">
            {list.slice(0, 5).map((item, index) => <button className={`md-list-item ${item.done ? "is-done" : ""}`} key={`${item.name}-${index}`} onClick={() => toggleItem(index)}>
              <span className="md-checkbox">{item.done && <Icon name="check" size={13} />}</span>
              <span className="md-item-copy"><strong>{item.name}</strong><small>{item.detail}</small></span>
              <Icon name="chevron" size={15} />
            </button>)}
          </div>
          <button className="md-start" onClick={() => notify(`Your shop is ready · ${remaining} items to go`)}><span><Icon name="bag" size={17} /> Start this shop</span><span className="md-start-price">KES 1,460 <Icon name="arrow" size={15} /></span></button>
          <div className="md-note"><span>GOOD TO KNOW</span> Your Syokimau store can deliver by 12:30 pm.</div>
        </section>

        <section className="md-picks">
          <div className="md-section-title"><div><span className="md-kicker">A FEW THINGS YOU MAY NEED</span><h2>Good with your list</h2></div><button onClick={() => notify("Showing your usuals")}>Your usuals <Icon name="arrow" size={14} /></button></div>
          <div className="md-pick-list">
            {picks.map(product => <article className="md-pick" key={product.name}>
              <div className={`md-pick-art ${product.art}`}><span>{product.glyph}</span><small>FRESH<br />TODAY</small></div>
              <div className="md-pick-info"><strong>{product.name}</strong><small>{product.size}</small><b>{product.price}</b></div>
              <button className="md-add" onClick={() => addItem(product.name)} aria-label={`Add ${product.name}`}><Icon name="plus" size={17} /></button>
            </article>)}
          </div>
        </section>

        <section className="md-aisles">
          <div className="md-section-title"><div><span className="md-kicker">WHENEVER YOU'RE READY</span><h2>Walk the aisles</h2></div><button onClick={() => notify("All aisles opened")}>All aisles <Icon name="arrow" size={14} /></button></div>
          <div className="md-aisle-row">
            {[["Produce", "01", "md-produce"], ["Pantry", "02", "md-pantry"], ["Bakery", "03", "md-bakery"], ["Pharmacy", "04", "md-pharmacy"]].map(([label, number, style]) => <button className={`md-aisle ${style}`} key={label} onClick={() => { setTab(label); notify(`${label} aisle selected`); }}><span>{number}</span><strong>{label}</strong><Icon name="arrow" size={14} /></button>)}
          </div>
        </section>

        <section className="md-club"><span className="md-club-mark"><Icon name="spark" size={18} /></span><div><span>YOUR XANA CLUB</span><strong>1,240 points <i>·</i> 760 to Silver</strong><div className="md-progress"><i /></div></div><button onClick={() => notify("Your rewards are on their way")} aria-label="See your rewards"><Icon name="chevron" size={17} /></button></section>
        <footer className="md-footer"><span>GOOD FOOD. GOOD DAYS.</span><span>Little shops make a good week.</span></footer>
      </div>

      <nav className="md-tabbar" aria-label="Main navigation">
        {[["Today", "bag"], ["Aisles", "grid"], ["Saved", "heart"], ["Account", "user"]].map(([label, icon]) => <button key={label} className={tab === label ? "active" : ""} onClick={() => { setTab(label); if (label !== "Today") notify(`${label} selected`); }}><Icon name={icon as Glyph} size={19} /><span>{label}</span>{label === "Today" && basket > 0 && <i>{basket}</i>}</button>)}
      </nav>

      {(storeOpen || noticeOpen) && <div className="md-backdrop" onClick={() => { setStoreOpen(false); setNoticeOpen(false); }}>
        <section className="md-sheet" onClick={event => event.stopPropagation()}>
          <span className="md-handle" />
          <button className="md-close" aria-label="Close" onClick={() => { setStoreOpen(false); setNoticeOpen(false); }}><Icon name="close" size={17} /></button>
          {storeOpen ? <><span className="md-kicker">SHOP AROUND YOU</span><h2>Choose your store</h2><p>Your prices and delivery times follow your local Xana Plus.</p>{["Syokimau", "Ruiru", "Kitengela"].map((place, i) => <button className="md-store-option" key={place} onClick={() => { setStore(place); setStoreOpen(false); }}><span><strong>Xana Plus {place}</strong><small>{["Mombasa Road · 2.1 km", "Kamakis · 4.8 km", "Namanga Road · 6.3 km"][i]}</small></span>{place === store ? <Icon name="check" size={17} /> : <Icon name="chevron" size={16} />}</button>)}</> :
            <><span className="md-kicker">A NOTE FROM YOUR STORE</span><h2>Good things are in.</h2><p>Avocados and fresh farm eggs arrived at Syokimau this morning.</p><button className="md-notice-cta" onClick={() => { setNoticeOpen(false); notify("Fresh picks added to your ideas"); }}>See today's fresh picks <Icon name="arrow" size={15} /></button></>}
        </section>
      </div>}
      {toast && <div className="md-toast" role="status"><Icon name="check" size={15} />{toast}</div>}
    </main>
  );
}
