import assert from 'node:assert/strict';
import {spawn, execFileSync} from 'node:child_process';
import {createHash, X509Certificate} from 'node:crypto';
import {once} from 'node:events';
import {cpSync, mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {createServer} from 'node:https';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';


const sourceExtension = new URL('../extension/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', sourceExtension)));
const tmp = mkdtempSync(join(tmpdir(), 'scholar-browser-'));
const chrome = process.env.CHROME_BIN ?? (process.platform === 'darwin'
  ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  : 'google-chrome');
const ext = join(tmp, 'extension');
const popupPath = manifest.action.default_popup;
const profileUrl = 'https://scholar.google.com/citations?user=W9Ag9CkAAAAJ';
let browser;
let server;

try {
  cpSync(fileURLToPath(sourceExtension), ext, {recursive:true});
  execFileSync('openssl', ['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-subj','/CN=scholar.google.com','-keyout',tmp+'/key.pem','-out',tmp+'/cert.pem'], {stdio:'ignore'});
  const cert = readFileSync(join(tmp, 'cert.pem'));
  const publicKey = new X509Certificate(cert).publicKey.export({type:'spki', format:'der'});
  const fingerprint = createHash('sha256').update(publicKey).digest('base64');
  server = createServer({key:readFileSync(join(tmp, 'key.pem')), cert}, (req,res)=>{
    if (req.headers.host !== 'scholar.google.com') res.statusCode = 404;
    res.setHeader('Content-Type','text/plain');
    res.end('fixture');
  });
  server.listen(0, '127.0.0.1');
  await once(server,'listening');
  const port = server.address().port;

  async function goChrome() {
    browser = spawn(chrome,['--headless','--no-first-run','--no-default-browser-check','--disable-background-networking','--remote-debugging-pipe','--enable-unsafe-extension-debugging',`--ignore-certificate-errors-spki-list=${fingerprint}`,'--no-proxy-server',`--host-resolver-rules=MAP * 127.0.0.1:${port}, EXCLUDE localhost`,'--user-data-dir='+tmp+'/profile'],{stdio:['ignore','ignore','pipe','pipe','pipe']});
    browser.stderr.on('data', data => {
      const line = data.toString();
      if (/ruleset|extension/i.test(line)) process.stderr.write(data);
    });
    browser.stdio[3].on('error', () => {});
    let nextId = 1;
    let buffer = '';
    const pending = new Map();
    browser.stdio[4].setEncoding('utf8');
    browser.stdio[4].on('data', (data) => {
      buffer += data;
      const lines = buffer.split('\0');
      buffer = lines.pop();
      for (const line of lines) {
        const message = JSON.parse(line);
        const task = pending.get(message.id);
        if (task) {
          pending.delete(message.id);
          if (message.error) task.reject(new Error(JSON.stringify(message.error)));
          else task.resolve(message.result);
        }
      }
    });
    browser.on('error', (error) => {
      for (const task of pending.values()) task.reject(error);
      pending.clear();
    });
    browser.on('exit', (code, signal)=>{
      for (const task of pending.values()) task.reject(new Error(`Chrome exited (${code}, ${signal})`));
      pending.clear();
    });
    const command = (method, params = {}, sessionId) => new Promise((resolve,reject)=>{
      const id = nextId++;
      const timeout = setTimeout(() => {
        pending.delete(id);
        reject(new Error('Timeout calling ' + method));
      }, 15000);
      pending.set(id, {
        resolve: (result) => {clearTimeout(timeout);resolve(result);},
        reject: (error) => {clearTimeout(timeout);reject(error);},
      });
      browser.stdio[3].write(JSON.stringify({id,method,params,sessionId})+'\0');
    });
    const {product} = await command('Browser.getVersion');
    console.log('Testing with ' + product);
    return command;
  }

  async function makeTab(command, url) {
    const {targetId} = await command('Target.createTarget',{url:'about:blank'});
    const {sessionId} = await command('Target.attachToTarget',{targetId,flatten:true});
    const page = (method, params) => command(method, params, sessionId);
    const evalCode = async (expression) => {
      const value = await page('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
      if (value.exceptionDetails) throw new Error(JSON.stringify(value.exceptionDetails));
      return value.result.value;
    };
    async function navigate(url, ready) {
      const result = await page('Page.navigate',{url});
      if (result.errorText) throw new Error(result.errorText);
      for (let attempts=0; attempts<60; attempts++) {
        const value = await evalCode(ready).catch(()=>undefined);
        if (value) return value;
        await new Promise(resolve => setTimeout(resolve,100));
      }
      throw new Error('Page did not become ready: '+url);
    }
    if (url) await navigate(url, 'document.readyState === "complete" && document.querySelector("#settings")?.disabled === false');
    return {evalCode,navigate};
  }

  const command = await goChrome();
  const {id} = await command('Extensions.loadUnpacked',{path:ext});
  const popupUrl = 'chrome-extension://'+id+'/'+popupPath;
  const popup = await makeTab(command, popupUrl);
  const tab = await makeTab(command);
  assert.deepEqual(await popup.evalCode("({enabled:document.querySelector('#enabled').checked, language:document.querySelector('#language').value})"), {enabled:true, language:'en'});
  assert.deepEqual(await popup.evalCode('chrome.declarativeNetRequest.getEnabledRulesets()'), ['english_default']);
  for (const [url, type, method, ruleCount] of [
    [profileUrl,'main_frame','get',1],
    [profileUrl,'main_frame','post',0],
    [profileUrl,'sub_frame','get',0],
    ['https://scholar.google.com.evil.example/citations','main_frame','get',0],
    ['https://scholar.google.invalid/citations','main_frame','get',0],
  ]) {
    const {matchedRules} = await popup.evalCode(`chrome.declarativeNetRequest.testMatchOutcome(${JSON.stringify({url,type,method})})`);
    assert.equal(matchedRules.length,ruleCount,JSON.stringify({url,type,method,matchedRules}));
  }
  const rejected = await popup.evalCode(`(async () => {
    const { LANGUAGES, buildDynamicRules } = await import("./rules.mjs");
    const failures = [];
    for (const language of Object.keys(LANGUAGES)) {
      for (const rule of buildDynamicRules({enabled: false, language})) {
        const result = await chrome.declarativeNetRequest.isRegexSupported({regex:rule.condition.regexFilter, isCaseSensitive:true});
        if (!result.isSupported) failures.push({language, id:rule.id, result});
      }
    }
    return failures;
  })()`);
  assert.deepEqual(rejected, []);
  for (const rule of JSON.parse(readFileSync(join(ext, 'rules.json')))) {
    const parameters = {regex: rule.condition.regexFilter, isCaseSensitive: true};
    const support = await popup.evalCode(`chrome.declarativeNetRequest.isRegexSupported(${JSON.stringify(parameters)})`);
    assert.equal(support.isSupported, true, JSON.stringify({id: rule.id, support}));
  }
  const navigate = (url) => tab.navigate(url, 'document.body?.innerText === "fixture" && location.href');
  for (const [input, expected] of [
    ['', '&hl=en'],
    ['&hl=de#papers', '&hl=en#papers'],
    ['&a=x%20y&hl=en&b=1&hl=de#papers', '&a=x%20y&b=1&hl=en#papers'],
    ['&hl&hl', '&hl=en'],
    ['&hl=en', '&hl=en'],
  ]) {
    const current = await navigate(profileUrl+input);
    assert.equal(current, profileUrl+expected);
  }
  const select = (enabled, language) => popup.evalCode(`(async () => {
    const controls = document.querySelector("#settings");
    for (let i = 0; controls.disabled && i < 100; i++) await new Promise(r => setTimeout(r, 20));
    const toggle = document.querySelector("#enabled");
    const menu = document.querySelector("#language");
    toggle.checked = ${enabled};
    menu.value = ${JSON.stringify(language)};
    menu.dispatchEvent(new Event("change", {bubbles:true}));
    for (let i = 0; controls.disabled && i < 100; i++) await new Promise(r => setTimeout(r, 20));
    if (!document.querySelector("#status").textContent.startsWith("Saved")) throw new Error("Popup save failed");
  })()`);
  await select(true,'ja');
  assert.equal(await navigate(profileUrl+'&hl=en'),profileUrl+'&hl=ja');
  await select(false,'ja');
  assert.equal(await navigate(profileUrl+'&hl=de'),profileUrl+'&hl=de');
  await select(true,'fr');
  assert.equal(await navigate(profileUrl),profileUrl+'&hl=fr');

  // A fresh popup must read the saved settings from Chrome's rule store.
  const reopenedPopup = await makeTab(command, popupUrl);
  assert.deepEqual(await reopenedPopup.evalCode("({enabled:document.querySelector('#enabled').checked, language:document.querySelector('#language').value})"), {enabled:true, language:'fr'});
  console.log('Headless integration passed');
} finally {
  if (browser?.pid && browser.exitCode === null && browser.signalCode === null) {
    const stopped = once(browser,'close');
    browser.kill();
    await stopped;
  }
  if (server) {
    server.closeAllConnections();
    server.close();
  }
  rmSync(tmp,{recursive:true,force:true});
}
