// Run with Node and installed playwright; browser cache may be selected via
// PLAYWRIGHT_BROWSERS_PATH. Renders local synthetic prototype, never inference.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const url=pathToFileURL(path.join(__dirname,'Apex_UI_Prototype.html')).href;
 const results=[];
 const check=(name,condition)=>{assert.ok(condition,name);results.push({name,status:'PASS'})};
 const shot=async name=>page.screenshot({path:path.join(__dirname,name+'.png'),fullPage:true});
 await page.goto(url);await page.evaluate(()=>document.fonts.ready);await shot('Desktop_Overview');
 check('Example/no inference label visible',await page.getByText('EXAMPLE DATA · NO INFERENCE',{exact:true}).isVisible());
 await page.getByRole('radio',{name:/^Sports/}).click();
 check('Mode ACK queues next request', (await page.locator('#revision').innerText()).includes('Sports queued'));
 check('Inflight example unchanged',(await page.locator('#active-model').innerText()).includes('Model B'));
 await page.locator('#toast').evaluate(e=>e.hidden=true);await shot('Desktop_Sports_Queued');
 await page.locator('#advance').click();
 check('Next demo boundary consumes mode',(await page.locator('#active-model').innerText()).includes('Model C'));
 check('Next demo ACK becomes active',(await page.locator('#revision').innerText()).includes('Sports active'));
 await page.locator('#auto').click();await page.getByRole('radio',{name:/^Eco/}).click();await page.locator('#advance').click();
 check('Manual hold prevents demo model change',(await page.locator('#active-model').innerText()).includes('Model C'));
 await page.locator('#auto').click();await page.locator('#advance').click();
 check('Auto resume allows demo mode application',(await page.locator('#active-model').innerText()).includes('Model C'));
 await page.goto(url);await page.locator('#credits').click();await shot('Credits_Dialog');
 await page.locator('#billing').click();check('Billing handoff accurately previewed',(await page.locator('#billing-status').innerText()).includes('opens no billing'));
 await page.locator('#budget').fill('0');await page.locator('#allow').click();check('Zero budget rejected',await page.locator('#credit-dialog').isVisible());
 await page.locator('#budget').fill('1');await page.locator('#allow').click();check('Consent separated from account',(await page.locator('#consent').innerText()).includes('account unknown'));
 await page.locator('#credits').click();check('Consent revoke works',(await page.locator('#consent').innerText())==='Not allowed');
 await page.locator('#inspect').click();await shot('Evidence_Drawer');await page.keyboard.press('Escape');check('Drawer Escape closes',!(await page.locator('#evidence-dialog').isVisible()));
 await page.locator('[data-view=models]').click();check('Model navigation visible',await page.locator('#view-models').isVisible());await page.locator('#refresh').click();check('Refresh is clearly a simulation',(await page.locator('#refresh-state').innerText()).includes('No external data'));await shot('Models_Catalogue');
 await page.locator('[data-view=settings]').click();await page.locator('#connection').click();check('Disconnected controls disabled',await page.locator('#credits').isDisabled());await shot('Disconnected_State');await page.locator('#connection').click();check('Reconnect restores controls',!(await page.locator('#credits').isDisabled()));
 await page.goto(url);await page.setViewportSize({width:390,height:844});await shot('Mobile_Overview');check('390px no horizontal overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.setViewportSize({width:900,height:1000});check('900px no horizontal overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.setViewportSize({width:720,height:500});check('720px reflow no horizontal overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.setViewportSize({width:840,height:800});await page.goto(url+'?view=native');await shot('Native_Pane');
 check('Native reference renders',await page.locator('.native-view').isVisible());await page.locator('#native-modes [data-mode=sports]').click();await page.locator('#native-advance').click();check('Native demo controls advance state',(await page.locator('#native-main').innerText()).includes('Model C'));
 for(const [state,name] of [['empty','Empty_State'],['loading','Loading_State'],['stale','Stale_Data_State'],['error','Refresh_Error_State']]){await page.setViewportSize({width:1440,height:1000});await page.goto(url+'?state='+state);await shot(name);check(state+' preview renders',(await page.locator('#revision').innerText()).includes('STATE PREVIEW'))}
 check('No page JavaScript errors',errors.length===0);
 fs.writeFileSync(path.join(__dirname,'Prototype_Checks.json'),JSON.stringify({scope:'Synthetic prototype interactions only. No live mod, account billing or model inference tested.',browser:await browser.version(),date:'2026-10-07',results},null,2)+'\n');
 console.log(JSON.stringify({passed:results.length,errors,screenshots:12},null,2));await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
