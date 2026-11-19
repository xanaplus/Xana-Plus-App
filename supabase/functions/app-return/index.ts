/**
 * GET /app-return/AP-123456[?no=…&cancelled=1] → 302 to xanaplus://orders/AP-123456.
 *
 * DPO's return after paying in the app (19 Nov 2026). DPO turns a `xanaplus://` return
 * link into `http://xanaplus://…` (live account, first app payments), so the app gives
 * DPO this https address instead and it hands the phone back to the app. It reads
 * nothing and writes nothing: the app asks the dpo function whether the order is paid.
 * Supabase serves function pages as plain text, so the fallback is plain words.
 */
const ORDER_NO = /^(AP|XN)-[0-9]{6}$/;

Deno.serve(request => {
  const url = new URL(request.url);
  const fromPath = decodeURIComponent(url.pathname.split('/').pop() ?? '').toUpperCase();
  const orderNo = ORDER_NO.test(fromPath) ? fromPath : (url.searchParams.get('no') ?? '').toUpperCase();
  if (!ORDER_NO.test(orderNo)) {
    return new Response('Go back to the Xana Plus app: tap the X at the top of this page.', { status: 404 });
  }
  const cancelled = url.searchParams.get('cancelled') === '1' ? '?cancelled=1' : '';
  return new Response('Taking you back to the Xana Plus app. If nothing happens, tap the X at the top of this page.', {
    status: 302,
    headers: { Location: `xanaplus://orders/${orderNo}${cancelled}`, 'Cache-Control': 'no-store' },
  });
});
