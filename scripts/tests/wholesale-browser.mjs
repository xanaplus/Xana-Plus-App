// Guest-only checks against real catalogue data. No SMS, login, payment or order.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';

assert.ok(process.env.REPLIT_DEV_DOMAIN && process.env.EXPO_PUBLIC_SUPABASE_URL && process.env.EXPO_PUBLIC_SUPABASE_KEY, 'Test configuration missing');
const db = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.EXPO_PUBLIC_SUPABASE_KEY, { auth: { persistSession: false } });
const { data: products, error } = await db.from('catalogue').select('item_no,name,price,price_tiers,stock').in('item_no',['AF0005','AF0006']);
assert.ok(!error && products?.length === 2, 'Live sample products unavailable');
const first = products.find(product=>product.item_no==='AF0005');
const second = products.find(product=>product.item_no==='AF0006');
const tier = first.price_tiers.find(tier=>tier.minQty===6 && !tier.startsOn && !tier.endsOn);
assert.ok(tier && Number(first.stock)>=6 && Number(second.stock)>=3, 'Sample requires a current six-unit tier and available stock');
assert.ok(second.price_tiers.every(tier=>tier.minQty>3), 'Second sample must not qualify at three units');
const money = value => new Intl.NumberFormat('en-KE',{maximumFractionDigits:2}).format(value);
const browser = await chromium.launch({ executablePath:'/repl/tools/bin/chromium',headless:true,args:['--no-sandbox'] });
try {
  const page = await browser.newPage({viewport:{width:402,height:874}});
  await page.route('**/functions/v1/*',route => {
    if (/\/(request-otp|verify-otp|place-order)(?:\?|$)/.test(route.request().url()))
      return route.abort('blockedbyclient');
    return route.continue();
  });
  const button = name => page.getByRole('button',{name}).filter({visible:true}).last();
  await page.goto(`https://${process.env.REPLIT_DEV_DOMAIN}/product/${first.item_no}`);
  await page.getByText('Quantity pricing',{exact:true}).waitFor();
  for(let i=0;i<5;i++) await button('Increase quantity').click();
  await page.getByText(`6 units selected · KES ${money(tier.unitPrice)} each`,{exact:true}).filter({visible:true}).waitFor();
  await button(new RegExp(`Add to Cart.*${money(tier.unitPrice*6)}`)).waitFor();
  await button('Decrease quantity').click();
  await page.getByText(`5 units selected · KES ${money(Number(first.price))} each`,{exact:true}).filter({visible:true}).waitFor();
  await button('Increase quantity').click();
  await button(/Add to Cart/).click();
  await button('View cart').click(); // Test shared state without a full reload.
  await page.getByText(/Wholesale pricing applied/).filter({visible:true}).waitFor();
  assert.ok((await page.locator('body').innerText()).includes(money(tier.unitPrice*6)), 'Cart did not use the tier total');
  for(let i=0;i<3;i++) await button('Decrease quantity').click();
  assert.equal(await page.getByText(/Wholesale pricing applied/).filter({visible:true}).count(),0);
  // Two different SKUs at three units each must not combine into a six-unit tier.
  await page.goto(`https://${process.env.REPLIT_DEV_DOMAIN}/product/${second.item_no}`);
  await page.getByText('Quantity pricing',{exact:true}).filter({visible:true}).waitFor();
  for(let i=0;i<2;i++) await button('Increase quantity').click();
  await button(/Add to Cart/).click();
  await button('View cart').click();
  await page.getByText(first.name,{exact:true}).filter({visible:true}).waitFor();
  await page.getByText(second.name,{exact:true}).filter({visible:true}).waitFor();
  assert.equal(await page.getByText(/Wholesale pricing applied/).filter({visible:true}).count(),0);
  const retailSubtotal = 3*Number(first.price) + 3*Number(second.price);
  assert.ok((await page.locator('body').innerText()).includes(money(retailSubtotal)), 'Mixed-SKU basket subtotal is incorrect');
  console.log('PASS: real BC product tiers, threshold crossing, quantity decrease, cached add-to-cart pricing, and per-SKU isolation. No login, SMS or order.');
} finally {
  await browser.close();
}
