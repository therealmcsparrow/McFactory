const { chromium } = require('playwright');
// node tm.js port seed tb gap fn dur
const PORT=process.argv[2],SEED=+process.argv[3],TB=+process.argv[4],GAP=+process.argv[5],FN=+process.argv[6],DUR=+(process.argv[7]||90);
(async () => {
  const b = await chromium.launch({ channel:'chrome', headless:true, args:['--enable-gpu','--use-angle=d3d11','--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport:{width:480,height:300}, reducedMotion: process.env.NOTOW?'reduce':'no-preference' });
  await p.addInitScript(s=>{let a=s;Math.random=()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};},SEED);
  const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  await p.goto(`http://127.0.0.1:${PORT}/`); await p.waitForFunction(()=>window.__fac&&window.__fac.stats().factories>0,null,{timeout:30000}); await p.waitForTimeout(1500);
  const r = await p.evaluate(([DUR,FN,TB,GAP])=>{
    const F=window.__fac,DT=1/30,s0=F.stats(),t0=F.simT(); let minT=1e9,floods=0,still=0,busy=0,stillT=0,busyT=0,minD=1e9,nextF=TB,tows=0,lastPh=null,towT0=null; const towDur=[]; const jt={};let dump=null; let mx=0,mxId=null,jamEv=0,inJam=false,stillStop={},where=[];
    for(;;){const el=F.simT()-t0; if(el>=DUR)break;
      if(el<31&&floods<=Math.floor(el/5)){F.flood(FN);floods++;}
      let tw=F.tow(); if(!tw.ph&&el>=nextF){F.breakdown(); nextF=el+GAP;}
      F.step(DT,DT);
      tw=F.tow(); const act=!!tw.ph&&['out','hook','tow'].includes(tw.ph); if(act&&towT0===null)towT0=el; if(!act&&towT0!==null){towDur.push(+(el-towT0).toFixed(1));towT0=null;tows++;}
      const rs=F.robots(),st=F.stats();
      if(act)for(const q of rs){if(q.id===tw.id||q.born<.5||q.dying)continue;const d=Math.hypot(q.x-tw.truck[0],q.z-tw.truck[1]);if(d<minT)minT=d;}
      const live=rs.filter(r=>r.born>.5&&!r.dying&&r.st!=='broken'); for(let i=0;i<live.length;i++)for(let j=i+1;j<live.length;j++){const d=Math.hypot(live[i].x-live[j].x,live[i].z-live[j].z); if(d<minD)minD=d;}
      if(st.queued>0)for(const r of rs){busy++; const s=(r.st==='park'||(r.st==='go'&&r.v<.05)); if(s)still++; if(act){busyT++; if(s)stillT++;}}
      let n8=0; for(const r of rs){ if(r.st==='go'&&r.v<.05&&st.queued>0){jt[r.id]=(jt[r.id]||0)+DT;} else jt[r.id]=0; if(jt[r.id]>mx){mx=jt[r.id];mxId=r.id;} if(jt[r.id]>8)n8++; }
      if(n8>=1&&!dump){const T={T:tw.dbg||[],blk:null};dump={el:+el.toFixed(1),tow:tw,T:(T.T||[]).map(x=>typeof x==='number'?+x.toFixed(2):x),tblk:T.blk,rob:rs.filter(r=>r.st!=='park').map(r=>{return [r.id,r.st,r.task,+r.x.toFixed(2),+r.z.toFixed(2),'v'+r.v.toFixed(2),r.why,'blk'+r.blk,r.wait?'W':'',r.held.join('/'),r.wb?JSON.stringify(r.wb):'','left'+r.left.toFixed(1)].join(' ')})};}
      if(n8>=2&&!inJam){jamEv++;inJam=true;where.push(+el.toFixed(0)+':'+tw.ph+'@'+tw.truck);} if(n8===0)inJam=false;
    }
    const s1=F.stats(); if(towT0!==null)towDur.push('open'+(DUR-towT0).toFixed(0));
    return {tows,towDur,still:+(100*still/Math.max(1,busy)).toFixed(1),stillTow:busyT?+(100*stillT/busyT).toFixed(1):null,jamEv,where,dump,maxStillS:+mx.toFixed(1),minD:+minD.toFixed(3),minT:+minT.toFixed(3),deliv:s1.delivered-s0.delivered,bal:s1.docked-s1.delivered-s1.queued-s1.carried-s1.dropping};
  },[DUR,FN,TB,GAP]);
  const D=r.dump;delete r.dump;console.log(JSON.stringify({port:PORT,seed:SEED,tb:TB,gap:GAP,fn:FN,...r,errs:errs.slice(0,3)})); if(D&&process.env.DUMP){console.log(JSON.stringify(D.tow),'el',D.el,JSON.stringify(D.T),'tblk',D.tblk);console.log(D.rob.join(String.fromCharCode(10)));} await b.close();
})();
