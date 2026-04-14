const {chromium} = require('playwright-core');
(async () => {
  const b = await chromium.launch({
    headless: true,
    executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
    args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage']
  });
  const ctx = await b.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'en-US'
  });
  const p = await ctx.newPage();
  try {
    const resp = await p.goto('https://backstagecapital.com/portfolio', {waitUntil:'domcontentloaded',timeout:18000});
    console.log('HTTP status:', resp ? resp.status() : 'no resp');
    await p.waitForTimeout(3000);
    const text = (await p.innerText('body')).replace(/\s+/g,' ').trim();
    console.log('chars:', text.length);
    console.log('preview:', text.slice(0, 1200));
  } catch(e) { console.log('ERROR:', e.message); }
  await b.close();
})().catch(console.error);
