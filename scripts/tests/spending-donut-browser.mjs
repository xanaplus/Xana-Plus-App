// Isolated real-component rendering; no app auth bypass, shared orders or backend writes.
import assert from 'node:assert/strict';
import path from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const bundled = await build({
  stdin: {
    resolveDir: process.cwd(), loader: 'tsx',
    contents: `
      import React, {useState} from 'react';
      import {createRoot} from 'react-dom/client';
      import {View, Pressable, Text} from 'react-native';
      import DepartmentDonut from '@/components/spending/department-donut';
      import {ThemeProvider, useTheme} from '@/theme/provider';
      import {spendingBreakdown} from '@/lib/spending-breakdown';
      const fixtures = {
        normal: [{id:'groceries',label:'Groceries',total:7500},{id:'deli',label:'Deli',total:3000},{id:'pharmacy',label:'Pharmacy',total:1200}],
        grouped: ['groceries','deli','pharmacy','liquor','household','beauty','retail','wholesale'].map(id=>({id,label:id,total:200})),
        single: [{id:'deli',label:'Deli',total:125.5}],
        empty: [],
      };
      function Fixture() {
        const {colors}=useTheme();
        const [fixture,setFixture]=useState('normal');
        return <View style={{backgroundColor:colors.background,padding:20,minHeight:'100vh'}}>
          <View style={{flexDirection:'row',gap:10,marginBottom:12}}>
            {Object.keys(fixtures).map(key=><Pressable key={key} accessibilityRole="button" accessibilityLabel={key} onPress={()=>setFixture(key)}><Text style={{color:colors.onSurface}}>{key}</Text></Pressable>)}
          </View>
          <View style={{padding:16,backgroundColor:colors.surface,borderRadius:16}}>
            <DepartmentDonut breakdown={spendingBreakdown(fixtures[fixture])} onDepartmentPress={id=>window.lastDepartment=id} />
          </View>
        </View>;
      }
      createRoot(document.getElementById('root')).render(<ThemeProvider><Fixture/></ThemeProvider>);
    `,
  },
  bundle: true, write: false, format: 'iife', platform: 'browser',
  resolveExtensions: ['.web.tsx', '.tsx', '.web.ts', '.ts', '.web.jsx', '.jsx', '.web.js', '.js', '.json'],
  define: { __DEV__: 'false', 'process.env.NODE_ENV': '"production"' },
  alias: {
    '@': path.resolve('src'),
    'react-native': 'react-native-web',
    'react-native-svg': path.resolve('node_modules/react-native-svg/lib/module/ReactNativeSVG.web.js'),
  },
  plugins: [{
    name: 'isolated-chart',
    setup(builder) {
      builder.onResolve({ filter: /^@\/components\/ui$/ }, () => ({ path: 'chart-text', namespace: 'fixture' }));
      builder.onResolve({ filter: /^@\/lib\/storage$/ }, () => ({ path: 'storage', namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({
        loader: 'ts', resolveDir: process.cwd(),
        contents: args.path === 'chart-text'
          ? `export {Txt} from '${path.resolve('src/components/ui/text.tsx')}';`
          : `export const persisted=()=>({appearance:JSON.stringify(new URLSearchParams(location.search).get('theme')||'light')});
             export const parsePersisted=(raw,guard)=>raw&&guard(JSON.parse(raw))?JSON.parse(raw):null;
             export const saveWithResult=async()=>true; export const STORAGE_KEYS={appearance:'fixture'};`,
      }));
    },
  }],
});
const script = bundled.outputFiles[0].text.replaceAll('</script', '<\\/script');
const html = `<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}*{box-sizing:border-box}</style></head><body><div id="root"></div><script>${script}</script></body></html>`;
const browser = await chromium.launch({ executablePath: '/repl/tools/bin/chromium', headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 402, height: 874 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body: html }));
  for (const theme of ['light', 'dark']) {
    await page.goto(`https://${process.env.REPLIT_DEV_DOMAIN}/__isolated-chart-test?theme=${theme}`);
    const chart = page.getByRole('img', { name: /Department spending donut/ });
    await chart.waitFor();
    assert.match(await chart.getAttribute('aria-label'), /KES 11,700/);
    assert.equal(await page.locator('circle').count(), 4);
    await page.getByRole('button', { name: /^Deli,/ }).click();
    assert.equal(await page.evaluate(() => window.lastDepartment), 'deli');
    const before = await page.locator('circle').nth(1).getAttribute('stroke');
    await page.screenshot({ path: `/tmp/spending-donut-${theme}.png`, fullPage: true });
    await page.getByRole('button', { name: 'grouped', exact: true }).click();
    assert.equal(await page.locator('circle').count(), 6);
    await page.getByRole('button', { name: 'Show other department amounts' }).click();
    await page.getByRole('button', { name: 'Hide other department amounts' }).waitFor();
    await page.getByRole('button', { name: /^wholesale,/ }).waitFor();
    await page.getByRole('button', { name: 'single', exact: true }).click();
    assert.equal(await page.locator('circle').count(), 2);
    assert.match(await chart.getAttribute('aria-label'), /100%/);
    await page.getByRole('button', { name: /^Deli, KES 125.50/ }).waitFor();
    await page.getByRole('button', { name: 'empty', exact: true }).click();
    assert.equal(await page.locator('circle').count(), 0);
    await page.getByText('No spending', { exact: false }).waitFor();
    await page.setViewportSize({ width: 320, height: 874 });
    await page.getByRole('button', { name: 'normal', exact: true }).click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.ok(before);
    await page.setViewportSize({ width: 402, height: 874 });
  }
  assert.deepEqual(errors, []);
  console.log('PASS: actual SVG donut in light/dark mode, 320px layout, department navigation, grouped expansion, single ring and empty state. Isolated test data only; no backend writes.');
} finally {
  await browser.close();
}
