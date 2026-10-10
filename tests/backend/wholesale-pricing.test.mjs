import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { activePriceTiers, pricingDate, quantityUnitPrice } from '../../src/lib/quantity-pricing.ts';

const tiers = [{ minQty: 6, unitPrice: 155 }, { minQty: 24, unitPrice: 145 }];
describe('BC per-product quantity prices', () => {
  it.each([[1,160],[5,160],[6,155],[23,155],[24,145],[30,145]])('prices quantity %s at %s', (qty, price) => {
    expect(quantityUnitPrice(160, qty, tiers)).toBe(price);
  });
  it('returns to the earlier tier and retail when quantity decreases', () => {
    expect([24,6,5].map(qty => quantityUnitPrice(160,qty,tiers))).toEqual([145,155,160]);
  });
  it('does not combine unrelated product quantities', () => {
    expect(quantityUnitPrice(160,3,tiers) * 3 + quantityUnitPrice(100,3,[{minQty:6,unitPrice:90}]) * 3).toBe(780);
  });
  it('ignores expired and not-yet-started rules, including boundary dates correctly', () => {
    const rules = [{ minQty:6,unitPrice:130,endsOn:'2026-10-07' },{minQty:6,unitPrice:120,startsOn:'2026-10-09'},{minQty:6,unitPrice:155,startsOn:'2026-10-08',endsOn:'2026-10-08'}];
    expect(quantityUnitPrice(160,6,rules,'2026-10-08')).toBe(155);
  });
  it('uses Nairobi dates around midnight', () => {
    expect(pricingDate(new Date('2026-10-07T21:01:00Z'))).toBe('2026-10-08');
  });
  it('never charges more than retail or uses invalid/free tiers', () => {
    expect(quantityUnitPrice(160,24,[{minQty:6,unitPrice:180},{minQty:6,unitPrice:0},{minQty:6,unitPrice:NaN}])).toBe(160);
  });
  it('uses the best eligible price and preserves cents', () => {
    expect(quantityUnitPrice(200,24,[{minQty:6,unitPrice:155.2},{minQty:24,unitPrice:170}])).toBe(155.2);
    expect(activePriceTiers(tiers.slice().reverse()).map(t=>t.minQty)).toEqual([6,24]);
  });
});

const compile = file => ts.transpileModule(readFileSync(file,'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText;
function checkout(rows) {
  let handler; const saved = { headers: [], lines: [] };
  const db = {
    auth: { getUser: async () => ({data:{user:{id:'synthetic-local-only'}}}) },
    from(table) {
      if(table==='catalogue') return { select:()=>({in:async()=>({data:rows,error:null})}) };
      if(table==='profiles') return { select:()=>({eq:()=>({maybeSingle:async()=>({data:{club_points:0}})})}) };
      if(table==='orders') return { insert:row=>{saved.headers.push(row);return {select:()=>({single:async()=>({data:{id:'local-order',order_no:row.order_no,created_at:'2026-10-08'}})})};} };
      if(table==='order_items') return {insert:async rows=>{saved.lines.push(...rows);return {error:null};}};
      throw Error('Unexpected table '+table);
    },
  };
  const helpers={adminClient:()=>db,preflight:()=>null,reply:(status,body)=>Response.json(body,{status})};
  const context={exports:{},Request,Response,Intl,Date,Math,Number,Map,Set,crypto:webcrypto,Deno:{serve:fn=>{handler=fn;}},require:path=>path.includes('quantity-pricing')?{quantityUnitPrice}:helpers};
  vm.runInNewContext(compile('supabase/functions/place-order/index.ts'),context);
  return {saved, async run(lines, extra={}) {
    const response=await handler(new Request('https://test.invalid',{method:'POST',headers:{Authorization:'Bearer synthetic'},body:JSON.stringify({
      lines,paymentMethod:'cod',substitution:'refund',contact:'synthetic',addressLine:'DO NOT FULFIL',
      slotLabel:'test',storeName:'test',pointsRedeemed:0,...extra,
    })}));return {status:response.status,body:await response.json()};
  }};
}
const row={item_no:'BC-TEST',name:'Synthetic',price:160,stock:100,requires_rx:false,age_restricted:false,price_tiers:tiers};
describe('actual checkout handler uses BC tiers',()=>{
  it('persists tier unit prices, line totals and the matching order subtotal',async()=>{
    const h=checkout([row]);const result=await h.run([{itemNo:row.item_no,quantity:6,expectedUnitPrice:155}]);
    expect(result.status).toBe(200);
    expect(h.saved.lines[0]).toMatchObject({unit_price:155,quantity:6,line_total:930});
    expect(h.saved.headers[0]).toMatchObject({items_subtotal:930,is_test:true,payment_status:'simulated'});
    expect(result.body.itemsSubtotal).toBe(930);
  });
  it('refuses stale/tampered prices without creating an order',async()=>{
    const h=checkout([row]);const result=await h.run([{itemNo:row.item_no,quantity:6,expectedUnitPrice:1}]);
    expect(result).toMatchObject({status:409,body:{error:'price_changed'}});
    expect(h.saved.headers).toHaveLength(0);
  });
  it('rejects duplicate product lines and insufficient stock',async()=>{
    const h=checkout([row]);expect((await h.run([{itemNo:row.item_no,quantity:3},{itemNo:row.item_no,quantity:3}])).status).toBe(400);
    expect((await checkout([{...row,stock:5}]).run([{itemNo:row.item_no,quantity:6}])).status).toBe(409);
  });
  it('does not allow wholesale pricing to bypass pharmacist approval',async()=>{
    const h=checkout([{...row,requires_rx:true}]);expect((await h.run([{itemNo:row.item_no,quantity:6}],{rxSupplied:true,rxReference:'typed'})).body.error).toBe('rx_missing');
    expect(h.saved.headers).toHaveLength(0);
  });
});
