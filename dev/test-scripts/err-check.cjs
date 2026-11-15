const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch({channel:'chrome',args:['--use-angle=d3d11','--enable-gpu']});const p=await b.newPage({viewport:{width:1440,height:900}});
const errs=[];p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});p.on('pageerror',e=>errs.push('PAGEERR '+e.message));
await p.goto('http://127.0.0.1:4545/');await p.waitForTimeout(15000);
const st=await p.evaluate(()=>{const f=window.__fac;const j=x=>{try{return JSON.stringify(x).slice(0,700)}catch(e){return String(e)}};return {robots:j(f.robots()),docks:j(f.docks()),belts:j(f.belts())}});
console.log(JSON.stringify({errs:errs.slice(0,10),st},null,1));await b.close()})();
