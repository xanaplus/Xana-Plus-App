// Render the real account row with real Card/Button/Text components and no live session.
// Stub only context, unused icons and animations. No SMS, account change or backend requests.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { chromium } from 'playwright';
const root = process.cwd();
const stubs = {
  theme: `import {colors,darkColors} from './src/theme/tokens'; export const useTheme=()=>({colors:location.search.includes('dark')?darkColors:colors});`,
  icon: 'export const Icon=()=>null;',
  animation: `import {useRef} from 'react'; import {View} from 'react-native-web'; export default {View,createAnimatedComponent:c=>c}; export const useAnimatedStyle=f=>f(); export const useSharedValue=v=>useRef({value:v,set(n){this.value=n}}).current; export const withSpring=v=>v;`,
};
const result = await build({
  stdin: { contents: `
    import React from 'react'; import {createRoot} from 'react-dom/client';
    import {Card} from './src/components/ui/card'; import {SignInDetails} from './src/features/account/sign-in-details';
    import {layout,spacing} from './src/theme';
    createRoot(document.getElementById('fixture')).render(
      <div style={{maxWidth:layout.maxContentWidth,padding:layout.screenMargin,margin:'auto'}}>
        <Card variant="flat" padding={spacing.lg}>
          <SignInDetails maskedPhone="+254 700 ••• •00" onChangeNumber={()=>window.__changes=(window.__changes||0)+1}/>
        </Card>
      </div>);`,
    loader: 'tsx', resolveDir: root,
  },
  bundle: true, write: false, format: 'iife', platform: 'browser',
  alias: { '@': `${root}/src`, 'react-native': 'react-native-web' },
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{
    name: 'isolated-layout-boundaries',
    setup(api) {
      api.onResolve({ filter: /^@\/theme\/provider$/ }, () => ({ path: 'theme', namespace: 'fixture' }));
      api.onResolve({ filter: /^react-native-reanimated$/ }, () => ({ path: 'animation', namespace: 'fixture' }));
      api.onResolve({ filter: /^\.\/icon$/ }, () => ({ path: 'icon', namespace: 'fixture' }));
      api.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: stubs[args.path], loader: 'tsx', resolveDir: root }));
    },
  }],
});
const fonts = [['400Regular', 'Inter_400Regular'], ['500Medium', 'Inter_500Medium'], ['600SemiBold', 'Inter_600SemiBold'], ['700Bold', 'Inter_700Bold']]
  .map(([folder, name]) => `@font-face{font-family:'${name}';src:url(data:font/ttf;base64,${readFileSync(`node_modules/@expo-google-fonts/inter/${folder}/${name}.ttf`).toString('base64')})}`).join('');
const html = `<!doctype html><style>body{margin:0;background:#fcf9f8}${fonts}</style><div id="fixture"></div><script src="/fixture.js"></script>`;
const server = createServer((req,res) => {
  res.setHeader('Content-Type',req.url==='/fixture.js'?'application/javascript':'text/html');
  res.end(req.url==='/fixture.js'?result.outputFiles[0].contents:html);
});
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
const browser = await chromium.launch({executablePath:'/repl/tools/bin/chromium',headless:true,args:['--no-sandbox']});
try {
  const page = await browser.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  for (const [width,theme] of [[320,'light'],[360,'light'],[402,'light'],[320,'dark'],[1280,'light']]) {
    await page.setViewportSize({width,height:400});
    await page.goto(`http://127.0.0.1:${server.address().port}/?${theme}`);
    const button=page.getByRole('button',{name:'Change number',exact:true});
    await button.waitFor();await page.evaluate(()=>document.fonts.ready);
    const action=await button.boundingBox();
    const phone=await page.getByText('+254 700 ••• •00',{exact:true}).boundingBox();
    const caption=await page.getByText('Used to sign in and receive the M-Pesa prompt',{exact:true}).boundingBox();
    for(const box of [action,phone,caption]) assert.ok(box.x>=20 && box.x+box.width<=width-20+1,'Account row must stay inside the card/screen');
    assert.ok(action.height>=44);
    assert.ok(action.y>=caption.y+caption.height-1 || action.x>=caption.x+caption.width-1,'Button must not overlap account text');
    await button.click();assert.equal(await page.evaluate(()=>window.__changes),1);
    await page.screenshot({path:`/tmp/sign-in-row-${width}-${theme}.png`});
  }
  assert.deepEqual(errors,[]);
  console.log('PASS: real sign-in row, Card/Button/Text; no clipping or overlap at 320/360/402/desktop; 44px action; light/dark and callback. Isolated fixture; no auth or backend.');
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
