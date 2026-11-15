const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch({channel:'chrome',args:['--use-angle=d3d11','--enable-gpu']});const p=await b.newPage({viewport:{width:1440,height:900}});
const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
await p.goto('http://127.0.0.1:4545/');await p.waitForTimeout(10000);
const r=await p.evaluate(()=>new Promise(res=>{let n=0;const t0=performance.now();function f(){n++;if(performance.now()-t0<3000)requestAnimationFrame(f);else res({fps:n/3,stats:(()=>{try{return JSON.stringify(window.__fac.stats()).slice(0,400)}catch(e){return String(e)}})()})}requestAnimationFrame(f)}));
console.log(JSON.stringify({errs,r}));await b.close()})();
