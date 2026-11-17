const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const out=__dirname+'/../github-graphics/';
const jobs=[['banner','dark',1280,440],['banner','light',1280,440],['social','dark',1280,640],['social','light',1280,640]];
for(const [k,t,w,h] of jobs){const p=await b.newPage({viewport:{width:w,height:h},deviceScaleFactor:2});
await p.goto('file://'+__dirname+`/graphics.html?kind=${k}&theme=${t}`);await p.evaluate(()=>document.fonts.ready);
const el=await p.$('.frame');await el.screenshot({path:out+(k==='social'?`social-preview-${t}.png`:`banner-${t}.png`),omitBackground:true});await p.close();}
await b.close();})();
