/* Dockyard Deception Halloween mode — 2026-09-24
   Load this AFTER the main game's inline script.
   It reuses the existing Three.js scene, Rick/Gage controllers, GLTF loader and music system.
   Combat: Rick punch (E) + kick (Q), Gage alternates punch/kick, hit reactions + death
   animations for Rick/Gage/zombies/skeletons. Rick-sized jack-o'-lanterns, pylon webs,
   full moon, night sky with clouds, moonlit water, random werewolf howls. */
(function(){
  'use strict';
  if(window.__DOCKYARD_HALLOWEEN_ACTIVE)return;
  window.__DOCKYARD_HALLOWEEN_ACTIVE=true;

  const MAIN_ASSET_ROOT='https://raw.githubusercontent.com/flaglermobilemarineservices/Dockyard-Deception-3d/main/';
  const HALLOWEEN_ASSET_ROOT='https://raw.githubusercontent.com/flaglermobilemarineservices/Dockyard-Deception-3d/halloween-2026/';
  const MAIN_HALLOWEEN_ASSETS=new Set(['halloween-zombie.glb','halloween-skeleton.glb','rick-gage-dead.glb']);
  const halloweenAsset=name=>{
    const root=MAIN_HALLOWEEN_ASSETS.has(name)?MAIN_ASSET_ROOT:HALLOWEEN_ASSET_ROOT;
    return root+encodeURIComponent(name).replace(/%2F/g,'/');
  };

  // Swap the base game's loading artwork for our Halloween art. The <img> is
  // already parsed (it sits before the main script), and this runs during the
  // initial script execution, so the swap lands before loading finishes.
  // Relative URL: after document.write the document URL is still the Pages site.
  try{
    const la=document.getElementById('loadingArtwork');
    if(la&&!la.__halloweenArt){la.__halloweenArt=true;la.src='halloween-loading.webp';}
  }catch(e){}

  const H=window.DOCKYARD_HALLOWEEN={
    wave:0,rickHP:150,gageHP:150,rickMax:150,gageMax:150,rickDown:false,gageDown:false,foods:[],
    enemies:[],started:false,nextGageHit:0,nextRickHit:0,
    gagePunchAction:null,gageKickAction:null,gageHitAction:null,gageDeadAction:null,gageKickNext:false,
    enemyHitClip:null,enemyDeadClip:null,
    declineCooldownUntil:0,
    spookyWaypoint:null,
    _howlT:null,_howlInit:false,howlCtx:null
  };

  // Coarse pointer or small screen => phone-class GPU. The base game renders at
  // up to 1.75x pixel ratio with two shadow-casting lights; both are brutal on
  // mobile fill rate, so we run a lighter profile there.
  const PERF_MOBILE=(function(){
    try{
      if(typeof matchMedia==='function'&&matchMedia('(pointer:coarse)').matches)return true;
      if(typeof screen!=='undefined'&&Math.min(screen.width||9999,screen.height||9999)<760)return true;
    }catch(e){}
    return false;
  })();

  const H_QSCALES=[1,0.85,0.7,0.55];
  function overlayQLevel(){
    try{
      let lvl=H.qLevel||0;
      if(typeof oilCatchGame!=='undefined'&&oilCatchGame&&oilCatchGame.style.display==='block')lvl++;
      return Math.min(3,lvl);
    }catch(e){return H.qLevel||0;}
  }
  function reapplyPixelRatio(){
    try{
      if(H._prRaw&&H._prWant)H._prRaw(H._prWant*H_QSCALES[overlayQLevel()]);
    }catch(e){}
  }

  function applyPerfProfile(){
    try{
      // 1) Dynamic resolution. The base resize handler keeps calling
      //    setPixelRatio(1.75), so funnel every call through a wrapper. An FPS
      //    governor (in loop()) steps H.qLevel up/down; effective ratio =
      //    cap * Q_SCALES[qLevel], plus one extra step down while a 3D service
      //    minigame overlay is up (the main scene keeps rendering behind it).
      if(typeof renderer!=='undefined'&&renderer&&!renderer.__perfPRWrapped){
        renderer.__perfPRWrapped=true;
        H._prCap=PERF_MOBILE?1:Math.min(typeof devicePixelRatio!=='undefined'?devicePixelRatio:1,1.75);
        H.qLevel=0;H._qUpStreak=0;H._fpsN=0;H._fpsT=0;
        const rawPR=renderer.setPixelRatio.bind(renderer);
        H._prRaw=rawPR;
        renderer.setPixelRatio=function(pr){
          H._prWant=Math.min(pr||1,H._prCap);
          return rawPR(H._prWant*H_QSCALES[overlayQLevel()]);
        };
        renderer.setPixelRatio(H._prCap);
      }
      // 2) Shadows off. At night they're barely visible, but the sun and our
      //    moon light each re-render every skinned character into a shadow
      //    map every frame. Kill the lights' shadow casting and the map itself.
      if(typeof scene!=='undefined'&&scene){
        scene.traverse(o=>{try{if(o.isLight)o.castShadow=false;}catch(e){}});
      }
      if(typeof renderer!=='undefined'&&renderer&&renderer.shadowMap){
        renderer.shadowMap.enabled=false;
      }
      // Materials compiled with shadow support need one refresh after the toggle.
      if(typeof scene!=='undefined'&&scene){
        scene.traverse(o=>{
          if(!o.material)return;
          const ms=Array.isArray(o.material)?o.material:[o.material];
          for(const m of ms){try{m.needsUpdate=true;}catch(e){}}
        });
      }
    }catch(e){console.warn('perf profile:',e)}
  }

  function addStyles(){
    const s=document.createElement('style');
    s.textContent=
      '#halloweenHud{position:fixed;right:max(10px,env(safe-area-inset-right));left:auto;top:max(76px,env(safe-area-inset-top));transform:none;z-index:126;width:min(210px,42vw);pointer-events:none;font-family:Inter,system-ui,Arial,sans-serif}'+
      '#halloweenHud .hhCard{background:rgba(3,5,12,.82);border:1px solid rgba(220,225,255,.35);border-radius:14px;padding:8px 10px;box-shadow:0 10px 32px rgba(0,0,0,.45);backdrop-filter:blur(7px)}'+
      '#halloweenHud .hhRow{display:grid;grid-template-columns:52px 1fr 42px;gap:7px;align-items:center;margin:4px 0;font-size:11px;font-weight:1000}'+
      '#halloweenHud .hhTrack{height:10px;border-radius:999px;background:#24131a;overflow:hidden;border:1px solid rgba(255,255,255,.18)}'+
      '#halloweenHud .hhFill{height:100%;width:100%;transform-origin:left center;background:linear-gradient(90deg,#51d36f,#cfe95b)}'+
      '#gageHealthFill{background:linear-gradient(90deg,#5ab8ff,#8ce8ff)!important}'+
      '#halloweenWave{text-align:center;margin-top:5px;font-size:10px;font-weight:1000;letter-spacing:.08em;color:#f3d7ff}'+
      '#hlVignette{position:fixed;inset:0;pointer-events:none;z-index:120;background:radial-gradient(ellipse at center,transparent 58%,rgba(2,4,10,.42) 100%)}'+
      '#halloweenPunchBtn{background:rgba(112,34,38,.94)!important;border-color:rgba(255,150,150,.7)!important;opacity:.97!important}'+
      '#halloweenKickBtn{background:rgba(30,58,112,.94)!important;border-color:rgba(150,190,255,.7)!important;opacity:.97!important}'+
      '.actionGrid{width:74px!important;justify-items:center!important;gap:8px!important}.actionGrid .act{width:64px!important;height:64px!important;min-height:64px!important;border-radius:50%!important;padding:5px!important;line-height:1.02!important;font-size:9px!important;display:flex!important;align-items:center!important;justify-content:center!important;text-align:center!important}.actionGrid .act.trick{min-height:64px!important;height:64px!important;font-size:9px!important}'+
      '#halloweenPunchBtn{width:68px!important;height:68px!important;min-height:68px!important;font-size:10px!important;box-shadow:0 0 18px rgba(255,65,65,.42)!important}'+
      '#halloweenKickBtn{width:68px!important;height:68px!important;min-height:68px!important;font-size:10px!important;box-shadow:0 0 18px rgba(90,140,255,.42)!important}'+
      '@media(pointer:coarse){#halloweenHud{right:max(8px,env(safe-area-inset-right));left:auto;top:max(68px,env(safe-area-inset-top));width:min(180px,44vw);transform:none}#halloweenHud .hhCard{padding:6px 8px}#halloweenHud .hhRow{grid-template-columns:38px 1fr 28px;gap:5px;font-size:9px}#halloweenWave{font-size:8px}.actionGrid{width:66px!important}.actionGrid .act{width:58px!important;height:58px!important;min-height:58px!important;border-radius:50%!important}.actionGrid .act.trick{height:58px!important;min-height:58px!important;border-radius:50%!important}#halloweenPunchBtn{width:62px!important;height:62px!important;min-height:62px!important;border-radius:50%!important}#halloweenKickBtn{width:62px!important;height:62px!important;min-height:62px!important;border-radius:50%!important}}'+
      // Landscape phone: action buttons in one row along the bottom, centered between the two joysticks.
      '@media(pointer:coarse) and (orientation:landscape){.actionGrid{left:50%!important;right:auto!important;transform:translateX(-50%)!important;bottom:max(6px,env(safe-area-inset-bottom))!important;top:auto!important;width:auto!important;max-width:56vw!important;display:flex!important;flex-direction:row!important;flex-wrap:wrap!important;justify-content:center!important;align-items:center!important;gap:8px!important}}'+
      // Non-blocking "rotate your phone" banner, only in portrait on touch devices.
      '#hlRotateHint{display:none;position:fixed;top:calc(env(safe-area-inset-top,0px) + 10px);left:50%;transform:translateX(-50%);z-index:200000;pointer-events:none;background:rgba(3,5,12,.88);border:1px solid rgba(255,255,255,.4);border-radius:999px;padding:8px 16px;font:700 12px/1.2 system-ui,sans-serif;color:#fff;white-space:nowrap}'+
      '@media(pointer:coarse) and (orientation:portrait){#hlRotateHint{display:block}}'+
      // Manatee "FUCK YOU!" yell removed (the TTS voice mispronounces it). The boat stays.
      '#manateeYell{display:none!important;visibility:hidden!important}';
    document.head.appendChild(s);
  }

  function addHud(){
    const hud=document.createElement('div');
    hud.id='halloweenHud';
    hud.innerHTML='<div class="hhCard">'+
      '<div class="hhRow"><span>RICK</span><div class="hhTrack"><div class="hhFill" id="rickHealthFill"></div></div><span id="rickHealthText">100</span></div>'+
      '<div class="hhRow"><span>GAGE</span><div class="hhTrack"><div class="hhFill" id="gageHealthFill"></div></div><span id="gageHealthText">100</span></div>'+
      '<div id="halloweenWave">HALLOWEEN NIGHT • GET READY</div></div>';
    document.body.appendChild(hud);
    updateHud();
  }

  function updateHud(){
    const r=document.getElementById('rickHealthFill'),g=document.getElementById('gageHealthFill');
    const rt=document.getElementById('rickHealthText'),gt=document.getElementById('gageHealthText');
    if(r)r.style.width=Math.max(0,100*H.rickHP/Math.max(1,H.rickMax))+'%';
    if(g)g.style.width=Math.max(0,100*H.gageHP/Math.max(1,H.gageMax))+'%';
    if(rt)rt.textContent=Math.round(H.rickHP);
    if(gt)gt.textContent=Math.round(H.gageHP);
  }
  function setWaveText(t){const e=document.getElementById('halloweenWave');if(e)e.textContent=t}

  function applyNight(){
    try{
      scene.background=new THREE.Color(0x01040b);
      if(scene.fog){scene.fog.color.set(0x07101b);scene.fog.density=.0032}
      renderer.toneMappingExposure=.58;

      if(typeof skyUniforms!=='undefined'){
        skyUniforms.zenithColor.value.set(0x020612);
        skyUniforms.upperColor.value.set(0x07152d);
        skyUniforms.horizonColor.value.set(0x10243c);
        skyUniforms.warmColor.value.set(0x2b2440);
        skyUniforms.hazeColor.value.set(0x142033);
      }
      if(typeof waterUniforms!=='undefined'){
        waterUniforms.deepColor.value.set(0x010b17);
        waterUniforms.midColor.value.set(0x031b2b);
        waterUniforms.shallowColor.value.set(0x062d3c);
        waterUniforms.horizonColor.value.set(0x0c2236);
        waterUniforms.skyTop.value.set(0x07152d);
        waterUniforms.sunColor.value.set(0x7186a8);
      }

      scene.traverse(o=>{
        if(o.isHemisphereLight)o.intensity=Math.min(o.intensity,.28);
        if(o.isAmbientLight)o.intensity=Math.min(o.intensity,.18);
      });
      if(typeof sun!=='undefined'){
        sun.intensity=.28;
        sun.color.set(0x9fb7d8);
        sun.position.set(-24,30,-18);
      }

      const moon=new THREE.DirectionalLight(0xa9c7ff,1.25);
      moon.position.set(-38,24,-70);
      moon.castShadow=true;
      scene.add(moon);
      scene.add(new THREE.AmbientLight(0x152341,.22));

      const starPos=[];
      for(let i=0;i<420;i++){
        const a=Math.random()*Math.PI*2,y=18+Math.random()*92,rr=120+Math.random()*35;
        starPos.push(Math.cos(a)*rr,y,Math.sin(a)*rr);
      }
      const sg=new THREE.BufferGeometry();
      sg.setAttribute('position',new THREE.Float32BufferAttribute(starPos,3));
      scene.add(new THREE.Points(
        sg,
        new THREE.PointsMaterial({color:0xffffff,size:.18,transparent:true,opacity:.82,depthWrite:false})
      ));
    }catch(e){console.warn('Halloween night setup:',e)}
  }

  function makeWeb(x,y,z,ry,scale){
    const pts=[],spokes=9,rings=4,maxR=.72;
    for(let i=0;i<spokes;i++){
      const a=i/spokes*Math.PI*2;
      pts.push(0,0,0,Math.cos(a)*maxR,Math.sin(a)*maxR,0);
    }
    for(let r=1;r<=rings;r++){
      const rad=maxR*r/rings;
      for(let i=0;i<spokes;i++){
        const a=i/spokes*Math.PI*2,b=(i+1)/spokes*Math.PI*2;
        pts.push(Math.cos(a)*rad,Math.sin(a)*rad,0,Math.cos(b)*rad,Math.sin(b)*rad,0);
      }
    }
    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.Float32BufferAttribute(pts,3));
    const web=new THREE.LineSegments(
      geo,
      new THREE.LineBasicMaterial({color:0xe8eef6,transparent:true,opacity:.55,depthWrite:false})
    );
    web.position.set(x,y,z);
    web.rotation.y=ry;
    web.rotation.z=(Math.random()-.5)*.35;
    web.scale.setScalar(scale);
    scene.add(web);
    return web;
  }

  // Webs draped over the piling caps, sitting right on top of the pylons.
  function makePylonWeb(x,z,ry,scale=1){
    const pts=[];
    const spokes=9,rings=5,maxR=1.0;
    for(let i=0;i<spokes;i++){
      const a=i/spokes*Math.PI*2;
      pts.push(0,0,0,Math.cos(a)*maxR,Math.sin(a)*maxR,0);
    }
    for(let r=1;r<=rings;r++){
      const rad=maxR*r/rings;
      for(let i=0;i<spokes;i++){
        const a=i/spokes*Math.PI*2,b=(i+1)/spokes*Math.PI*2;
        pts.push(Math.cos(a)*rad,Math.sin(a)*rad,0,Math.cos(b)*rad,Math.sin(b)*rad,0);
      }
    }
    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.Float32BufferAttribute(pts,3));
    const g=new THREE.Group();
    g.add(new THREE.LineSegments(geo,new THREE.LineBasicMaterial({color:0xf1f3ff,transparent:true,opacity:.72,depthWrite:false})));
    // Dew sparkle.
    const dp=[];
    for(let i=0;i<22;i++){
      const a=Math.random()*Math.PI*2,rr=(.2+Math.random()*.8)*maxR;
      dp.push(Math.cos(a)*rr,Math.sin(a)*rr,0);
    }
    const dg=new THREE.BufferGeometry();
    dg.setAttribute('position',new THREE.Float32BufferAttribute(dp,3));
    g.add(new THREE.Points(dg,new THREE.PointsMaterial({color:0xcfe4ff,size:.04,transparent:true,opacity:.85,depthWrite:false})));
    // Drape it over the cap (cap top ~2.38): tilted so the threads catch the piling.
    g.position.set(x,2.46,z);
    g.rotation.y=ry;
    g.rotation.x=-.95;
    g.scale.setScalar(scale);
    scene.add(g);
    return g;
  }

  function addWebs(){
    try{
      const picks=[];
      if(typeof pilingPositions!=='undefined'&&Array.isArray(pilingPositions)&&pilingPositions.length){
        const wanted=[[-1.68,-23],[1.68,-14],[-1.68,4],[1.68,13],[-1.68,22]];
        for(const w of wanted){
          let best=null,bd=Infinity;
          for(const p of pilingPositions){const d=Math.hypot(p[0]-w[0],p[1]-w[1]);if(d<bd){bd=d;best=p}}
          if(best)picks.push(best);
        }
      }
      const use=picks.length?picks:[[-1.68,-23],[1.68,-14],[-1.68,4],[1.68,13],[-1.68,22]];
      use.forEach((p,i)=>makePylonWeb(p[0],p[1],p[0]<0?Math.PI/2:-Math.PI/2,.82+(i%2)*.12));
    }catch(e){console.warn('Halloween pylon webs:',e)}
  }

  // Night sky shader: stars, drifting moonlit clouds, moon halo.
  function makeNightSky(){
    try{
      if(typeof skyUniforms!=='undefined'){
        skyUniforms.zenithColor.value.set(0x020409);
        skyUniforms.upperColor.value.set(0x06101f);
        skyUniforms.horizonColor.value.set(0x0e1e33);
        skyUniforms.warmColor.value.set(0xcfdcff);
        skyUniforms.hazeColor.value.set(0x1b2a44);
      }
      if(typeof skyMat!=='undefined'){
        skyMat.fragmentShader=[
          'varying vec3 vWorld;',
          'uniform float uTime;',
          'uniform vec3 zenithColor,upperColor,horizonColor,warmColor,hazeColor;',
          'float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}',
          'float noise(vec2 p){vec2 i=floor(p);vec2 f=fract(p);vec2 u=f*f*(3.0-2.0*f);',
          ' return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),u.x),mix(hash(i+vec2(0.0,1.0)),hash(i+vec2(1.0,1.0)),u.x),u.y);}',
          'float fbm(vec2 p){float v=0.0;float a=0.5;for(int k=0;k<'+(PERF_MOBILE?3:5)+';k++){v+=a*noise(p);p=p*2.03+vec2(17.3,9.1);a*=0.5;}return v;}',
          'void main(){',
          ' vec3 d=normalize(vWorld-cameraPosition);',
          ' float h=clamp(d.y,-0.15,1.0);',
          ' vec3 c=mix(horizonColor,upperColor,smoothstep(-.02,.34,h));',
          ' c=mix(c,zenithColor,smoothstep(.34,.92,h));',
          ' vec3 mdir=normalize(vec3(-.457,.288,-.841));',
          ' float md=max(dot(d,mdir),0.0);',
          ' vec2 sp=d.xz/(abs(d.y)+.28)*36.0;',
          ' vec2 cell=floor(sp);',
          ' float sh=hash(cell);',
          ' float star=smoothstep(.10,.02,length(fract(sp)-.5))*step(.80,sh);',
          ' float tw=.55+.45*sin(uTime*2.4+sh*43.0);',
          ' c+=vec3(.85,.92,1.0)*star*tw*smoothstep(.04,.38,h);',
          ' vec2 cuv=d.xz/(abs(d.y)+.34);',
          ' float cl=fbm(cuv*2.4+vec2(uTime*.010,uTime*.005));',
          ' float clouds=smoothstep(.46,.80,cl)*smoothstep(.015,.22,h);',
          ' float moonlit=pow(md,2.0);',
          ' vec3 cloudCol=mix(hazeColor*.45,warmColor*.85,.20+.80*moonlit);',
          ' c=mix(c,cloudCol,clouds*.88);',
          ' c+=warmColor*pow(md,20.0)*.30;',
          ' c+=vec3(.96,.98,1.0)*pow(md,300.0)*.55;',
          ' float hz=1.0-smoothstep(-.015,.115,h);',
          ' c=mix(c,hazeColor*.6,hz*.55);',
          ' gl_FragColor=vec4(c,1.0);',
          '}'
        ].join('\n');
        skyMat.needsUpdate=true;
      }

      // Water: deep night water with silver moon glints.
      if(typeof waterUniforms!=='undefined'){
        waterUniforms.deepColor.value.set(0x020a14);
        waterUniforms.midColor.value.set(0x07202f);
        waterUniforms.shallowColor.value.set(0x0d3a4c);
        waterUniforms.horizonColor.value.set(0x0e1e33);
        waterUniforms.skyTop.value.set(0x06101f);
        waterUniforms.sunColor.value.set(0xb9d4ff);
        waterUniforms.foamColor.value.set(0x8fa8b8);
      }
      // Aim the water's specular glints at the moon instead of the old sun spot.
      if(typeof waterMat!=='undefined'&&waterMat.fragmentShader.indexOf('-.40,.76,-.50')!==-1){
        waterMat.fragmentShader=waterMat.fragmentShader.replace('vec3(-.40,.76,-.50)','vec3(-.457,.288,-.841)');
        waterMat.needsUpdate=true;
      }
      // Turn the old sunset glitter path into a moonlight path on the water.
      try{
        if(typeof sunsetReflection!=='undefined'){
          sunsetReflection.position.set(-14,-.392,-30);
          sunsetReflection.rotation.z=.50;
        }
        if(typeof reflectionMat!=='undefined'&&reflectionMat.fragmentShader.indexOf('1.0,.63,.31')!==-1){
          reflectionMat.fragmentShader=reflectionMat.fragmentShader.replace('vec4(1.0,.63,.31,a)','vec4(.70,.80,1.0,a*.75)');
          reflectionMat.needsUpdate=true;
        }
      }catch(e){}
    }catch(e){console.warn('Halloween night sky:',e)}
  }

  // Big cratered full moon with a soft glow.
  function addFullMoon(){
    try{
      const S=256;
      const c=document.createElement('canvas');c.width=c.height=S;
      const x=c.getContext('2d');
      const g=x.createRadialGradient(S/2,S/2,S*.08,S/2,S/2,S*.5);
      g.addColorStop(0,'#fdfbf3');g.addColorStop(.82,'#f1ebda');g.addColorStop(.94,'#d6d1bd');g.addColorStop(1,'rgba(214,209,189,0)');
      x.fillStyle=g;x.beginPath();x.arc(S/2,S/2,S*.5,0,7);x.fill();
      // Maria blotches.
      x.fillStyle='rgba(166,160,146,.5)';
      const blobs=[[96,88,26],[150,120,34],[118,160,20],[170,70,16],[80,140,14],[140,180,22],[190,140,18],[110,60,15]];
      for(const b of blobs){x.beginPath();x.ellipse(b[0],b[1],b[2],b[2]*.8,b[2],0,7);x.fill()}
      // Craters.
      for(let i=0;i<46;i++){
        const a=Math.random()*Math.PI*2,r=Math.random()*S*.36;
        const px=S/2+Math.cos(a)*r,py=S/2+Math.sin(a)*r,cr=2+Math.random()*7;
        x.fillStyle='rgba(148,142,126,.5)';
        x.beginPath();x.arc(px,py,cr,0,7);x.fill();
        x.fillStyle='rgba(255,255,250,.32)';
        x.beginPath();x.arc(px-cr*.25,py-cr*.25,cr*.55,0,7);x.fill();
      }
      const moon=new THREE.Mesh(
        new THREE.CircleGeometry(7.5,48),
        new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(c),transparent:true,fog:false})
      );
      moon.position.set(-38,24,-70);
      moon.lookAt(0,4,0);
      scene.add(moon);

      const gc=document.createElement('canvas');gc.width=gc.height=128;
      const gx=gc.getContext('2d');
      const gg=gx.createRadialGradient(64,64,8,64,64,64);
      gg.addColorStop(0,'rgba(210,225,255,.55)');gg.addColorStop(.4,'rgba(180,200,245,.20)');gg.addColorStop(1,'rgba(180,200,245,0)');
      gx.fillStyle=gg;gx.fillRect(0,0,128,128);
      const glow=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(gc),transparent:true,depthWrite:false,fog:false,opacity:.9}));
      glow.scale.setScalar(36);
      glow.position.copy(moon.position);
      scene.add(glow);
    }catch(e){console.warn('Halloween full moon:',e)}
  }

  // Random distant werewolf howls, synthesized with Web Audio (no audio files needed).
  function playHowl(pan){
    const ctx=H.howlCtx;
    if(!ctx||ctx.state!=='running')return;
    try{
      const t0=ctx.currentTime+.05;
      const dur=3.2+Math.random()*1.3;
      const master=ctx.createGain();
      master.gain.setValueAtTime(.0001,t0);
      master.gain.exponentialRampToValueAtTime(.30,t0+.55);
      master.gain.setValueAtTime(.30,t0+dur-.9);
      master.gain.exponentialRampToValueAtTime(.0001,t0+dur);
      let out=master;
      if(ctx.createStereoPanner){
        const p=ctx.createStereoPanner();
        p.pan.value=Math.max(-1,Math.min(1,pan||0));
        master.connect(p);out=p;
      }
      out.connect(ctx.destination);

      const baseF=330+Math.random()*90;
      const peakF=baseF*1.9;
      for(const det of [0,5]){
        const o=ctx.createOscillator();o.type='triangle';
        o.frequency.setValueAtTime(baseF+det,t0);
        o.frequency.exponentialRampToValueAtTime(peakF+det,t0+dur*.35);
        o.frequency.setValueAtTime(peakF+det,t0+dur*.55);
        o.frequency.exponentialRampToValueAtTime(baseF*.82+det,t0+dur);
        const lfo=ctx.createOscillator();lfo.frequency.value=5.2+Math.random()*1.4;
        const lfoG=ctx.createGain();lfoG.gain.value=baseF*.035;
        lfo.connect(lfoG);lfoG.connect(o.frequency);
        const og=ctx.createGain();og.gain.value=.5;
        o.connect(og);og.connect(master);
        o.start(t0);o.stop(t0+dur+.1);
        lfo.start(t0);lfo.stop(t0+dur+.1);
      }
      // Breathiness.
      const nb=ctx.createBuffer(1,Math.floor(ctx.sampleRate*dur),ctx.sampleRate);
      const dd=nb.getChannelData(0);
      for(let i=0;i<dd.length;i++)dd[i]=Math.random()*2-1;
      const ns=ctx.createBufferSource();ns.buffer=nb;
      const bp=ctx.createBiquadFilter();bp.type='bandpass';bp.frequency.value=850;bp.Q.value=1.1;
      const ng=ctx.createGain();ng.gain.value=.05;
      ns.connect(bp);bp.connect(ng);ng.connect(master);
      ns.start(t0);ns.stop(t0+dur);
    }catch(e){}
  }

  function scheduleHowl(){
    clearTimeout(H._howlT);
    H._howlT=setTimeout(()=>{
      try{playHowl((Math.random()*2-1)*.75)}catch(e){}
      scheduleHowl();
    },45000+Math.random()*75000);
  }

  function initHowls(){
    if(H._howlInit)return;
    H._howlInit=true;
    try{
      H.howlCtx=new (window.AudioContext||window.webkitAudioContext)();
      if(H.howlCtx.state==='suspended')H.howlCtx.resume();
      // First howl shortly after the mode starts, then randomly every 45-120s.
      setTimeout(()=>{try{playHowl(0)}catch(e){}},7000+Math.random()*9000);
      scheduleHowl();
    }catch(e){}
  }

  function setupMusic(){
    try{
      if(typeof musicPlaylist==='undefined'||typeof playMusicIndex!=='function')return;

      const intro=new Audio(halloweenAsset('boat-daddy-rick.mp3'));
      intro.preload='auto';
      intro.playsInline=true;
      intro.loop=false;

      musicPlaylist.unshift(intro);
      musicPlaylist.forEach(a=>{
        a.loop=false;
        a.preload='auto';
        a.playsInline=true;
      });

      musicIndex=0;

      playMusicIndex=async function(i,reset){
        musicIndex=(i+musicPlaylist.length)%musicPlaylist.length;
        const a=musicPlaylist[musicIndex];

        musicPlaylist.forEach(t=>{if(t!==a)t.pause()});
        if(reset){try{a.currentTime=0}catch(e){}}

        if(typeof setMusicVolume==='function')setMusicVolume(musicVolume);
        if(!musicWanted)return false;

        try{
          await a.play();
          musicStarted=true;
          if(musicCtl)musicCtl.textContent='MUSIC: ON';
          return true;
        }catch(e){
          musicStarted=false;
          if(musicCtl)musicCtl.textContent='TAP MUSIC';
          return false;
        }
      };

      /* Halloween uses one uninterrupted playlist:
         new song once -> old Song 1 -> old Song 2 -> old Song 3 -> old Song 1...
         When a second player joins (2-player), Gage's theme takes over. */
      setMusicScene=async function(sceneName,reset){
        musicScene=sceneName;
        // Never block game entry on audio: kick off playback but don't await it.
        // (A hung Audio.play() promise would otherwise freeze ENTER DOCKYARD.)
        if(!musicStarted){playMusicIndex(musicIndex,!!reset);return true;}
        return true;
      };

      // Gage's theme for 2-player: joins the playlist, loops while 2P is active.
      let gageTrackIndex=-1;
      try{
        const gageTrack=new Audio(halloweenAsset('boat_daddy_rides.mp3'));
        gageTrack.preload='auto';
        gageTrack.playsInline=true;
        gageTrack.loop=false;
        musicPlaylist.push(gageTrack);
        gageTrackIndex=musicPlaylist.length-1;
      }catch(e){console.warn('Halloween gage track:',e)}

      H.musicMode='rick';

      musicPlaylist.forEach((a,i)=>{
        a.addEventListener('ended',()=>{
          if(!musicWanted||i!==musicIndex)return;
          if(H.musicMode==='gage'&&gageTrackIndex>=0){playMusicIndex(gageTrackIndex,true);return;}
          const last=musicPlaylist.length-1-(gageTrackIndex>=0?1:0);
          const next=(i===0)?1:((i>=last)?1:i+1);
          playMusicIndex(next,true);
        });
      });

      // Watch for a second player joining/leaving and swap the theme.
      setInterval(()=>{
        try{
          if(typeof multiplayer==='undefined'||!multiplayer)return;
          const twoP=!!multiplayer.connected;
          if(twoP&&H.musicMode!=='gage'&&gageTrackIndex>=0){
            H.musicMode='gage';
            playMusicIndex(gageTrackIndex,true);
          }else if(!twoP&&H.musicMode!=='rick'){
            H.musicMode='rick';
            playMusicIndex(0,true);
          }
        }catch(e){}
      },2000);

      musicPlaylist.forEach(a=>{try{a.pause()}catch(e){}});
      musicStarted=false;
      musicIndex=0;
      setTimeout(()=>{if(musicWanted&&!musicStarted)playMusicIndex(0,true)},80);
    }catch(e){console.warn('Halloween music setup:',e)}
  }

  function mat(color,rough=.72,emissive=0){
    return new THREE.MeshStandardMaterial({color,roughness:rough,metalness:.03,emissive});
  }

  function mesh(geo,material,x,y,z,parent,rx=0,ry=0,rz=0){
    const m=new THREE.Mesh(geo,material);
    m.position.set(x,y,z);
    m.rotation.set(rx,ry,rz);
    m.castShadow=true;
    m.receiveShadow=true;
    parent.add(m);
    return m;
  }

  const GEO={
    head:new THREE.SphereGeometry(.24,12,10),
    eye:new THREE.SphereGeometry(.035,8,6),
    torso:new THREE.BoxGeometry(.48,.72,.28),
    limb:new THREE.CylinderGeometry(.065,.075,.62,8),
    bone:new THREE.CylinderGeometry(.045,.055,.6,7),
    pelvis:new THREE.BoxGeometry(.34,.18,.18),
    rib:new THREE.BoxGeometry(.48,.055,.10)
  };

  function makeZombie(){
    const g=new THREE.Group();
    const skin=mat(0x6d8f55),skinDark=mat(0x526f42),shirt=mat(0x39424b),pants=mat(0x252931),eye=mat(0xd8ef88,.35,0x5a6d15);

    mesh(GEO.torso,shirt,0,1.17,0,g);
    mesh(GEO.head,skin,.02,1.73,0,g);
    mesh(GEO.eye,eye,-.085,1.77,.215,g);
    mesh(GEO.eye,eye,.105,1.77,.215,g);

    const la=mesh(GEO.limb,skinDark,-.34,1.18,.02,g,0,0,-.42);
    const ra=mesh(GEO.limb,skin,.34,1.18,.02,g,0,0,.5);
    const ll=mesh(GEO.limb,pants,-.15,.55,0,g,0,0,.08);
    const rl=mesh(GEO.limb,pants,.15,.55,0,g,0,0,-.08);

    g.userData.swing=[la,ra,ll,rl];
    return g;
  }

  function makeSkeleton(){
    const g=new THREE.Group(),bone=mat(0xd8d4bd),dark=mat(0x07080a);

    const skull=mesh(GEO.head,bone,0,1.75,0,g);
    skull.scale.set(.82,1,.9);
    mesh(GEO.eye,dark,-.08,1.78,.205,g);
    mesh(GEO.eye,dark,.08,1.78,.205,g);

    mesh(new THREE.CylinderGeometry(.045,.055,.65,7),bone,0,1.18,0,g);
    [1.43,1.32,1.21,1.10].forEach((yy,i)=>{
      const rib=mesh(GEO.rib,bone,0,yy,0,g);
      rib.scale.x=1-i*.10;
    });

    mesh(GEO.pelvis,bone,0,.88,0,g);

    const la=mesh(GEO.bone,bone,-.33,1.2,0,g,0,0,-.18);
    const ra=mesh(GEO.bone,bone,.33,1.2,0,g,0,0,.18);
    const ll=mesh(GEO.bone,bone,-.14,.48,0,g,0,0,.04);
    const rl=mesh(GEO.bone,bone,.14,.48,0,g,0,0,-.04);

    g.userData.swing=[la,ra,ll,rl];
    return g;
  }

  function addEnemyBar(root){
    const grp=new THREE.Group();
    grp.position.set(0,2.12,0);

    const bg=new THREE.Mesh(
      new THREE.PlaneGeometry(.94,.09),
      new THREE.MeshBasicMaterial({color:0x14070a,transparent:true,opacity:.9,depthTest:false})
    );
    const fill=new THREE.Mesh(
      new THREE.PlaneGeometry(.90,.055),
      new THREE.MeshBasicMaterial({color:0xe14a4a,depthTest:false})
    );

    fill.position.z=.006;
    grp.add(bg,fill);
    grp.visible=false; // shown by updateEnemyBar once the enemy takes damage
    root.add(grp);

    root.userData.hpBar=grp;
    root.userData.hpFill=fill;
  }

  function spawnEnemy(type,x,z){
    const root=new THREE.Group();
    const y=getWalkSurfaceY(x,z);
    root.position.set(x,y===null?.18:y,z);
    addEnemyBar(root);
    scene.add(root);

    const e={type,group:root,hp:100,maxHP:100,speed:type==='zombie'?.78:1.04,nextAttack:0,dead:false,removed:false,ready:false,mixer:null,walkAction:null,model:null};
    H.enemies.push(e);

    const filename=type==='zombie'?'halloween-zombie.glb':'halloween-skeleton.glb';
    gltfLoader.load(halloweenAsset(filename),g=>{
      if(e.dead||e.removed)return;
      const model=g.scene;
      model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;o.frustumCulled=false}});
      model.updateMatrixWorld(true);
      const b0=new THREE.Box3().setFromObject(model),sz=new THREE.Vector3();b0.getSize(sz);
      const targetH=type==='zombie'?1.90:1.95;
      e.modelBaseScale=targetH/Math.max(.001,sz.y);
      e.spawnT=0;
      model.scale.setScalar(e.modelBaseScale*0.01);
      model.updateMatrixWorld(true);
      const b1=new THREE.Box3().setFromObject(model);
      model.position.y-=b1.min.y;
      root.add(model);
      e.model=model;
      if(g.animations&&g.animations.length){
        const clip=typeof bestClip==='function'?bestClip(g):g.animations[0];
        e.mixer=new THREE.AnimationMixer(model);
        e.walkAction=e.mixer.clipAction(clip);
        e.walkAction.play();
      }
      e.ready=true;
    },undefined,err=>{
      console.error('Halloween '+type+' model failed:',err);
      setWaveText(type.toUpperCase()+' MODEL MISSING • UPLOAD '+filename);
    });
    return e;
  }

  function nearbySpawnPoint(pos,slot=0){
    const offsets=[
      [3.0,0],[-3.0,0],[0,3.6],[0,-3.6],
      [4.2,2.0],[-4.2,2.0],[4.2,-2.0],[-4.2,-2.0]
    ];
    for(let i=0;i<offsets.length;i++){
      const o=offsets[(i+slot)%offsets.length];
      const x=pos.x+o[0],z=pos.z+o[1];
      if(getWalkSurfaceY(x,z)!==null)return [x,z];
    }
    return [pos.x,pos.z];
  }

  function spawnNear(type,targetPos,slot){
    const p=nearbySpawnPoint(targetPos,slot);
    return spawnEnemy(type,p[0],p[1]);
  }

  function pickFixedSpawn(options,fallbackPos,slot=0){
    for(const p of options){
      if(getWalkSurfaceY(p[0],p[1])!==null)return p;
    }
    return nearbySpawnPoint(fallbackPos,slot);
  }

  // ---- Food pickups: walk over one to heal 30 HP ----
  const FOOD_EMOJI=['🍔','🍕','🌮','🍎','🍩','🍗'];
  const _foodTexCache={};
  function foodTexture(emoji){
    if(_foodTexCache[emoji])return _foodTexCache[emoji];
    const c=document.createElement('canvas');c.width=c.height=128;
    const x=c.getContext('2d');
    x.font='96px serif';x.textAlign='center';x.textBaseline='middle';
    x.fillText(emoji,64,70);
    const t=new THREE.CanvasTexture(c);
    _foodTexCache[emoji]=t;
    return t;
  }
  function spawnFood(){
    try{
      if(H.foods.length>=6||typeof scene==='undefined')return;
      for(let i=0;i<14;i++){
        const x=Math.random()*16-8, z=-14-Math.random()*16;
        const y=getWalkSurfaceY(x,z);
        if(y===null||typeof y==='undefined')continue;
        const emoji=FOOD_EMOJI[(Math.random()*FOOD_EMOJI.length)|0];
        const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:foodTexture(emoji),transparent:true,depthWrite:false}));
        sp.position.set(x,y+0.85,z);
        sp.scale.set(0.85,0.85,1);
        scene.add(sp);
        H.foods.push({sprite:sp,baseY:y+0.85,phase:Math.random()*6.283});
        break;
      }
    }catch(e){}
  }
  function healPlayer(who,n){
    try{
      if(who==='rick'){
        if(H.rickDown)return;
        H.rickHP=Math.min(H.rickMax,H.rickHP+n);
      }else{
        if(H.gageDown)return;
        H.gageHP=Math.min(H.gageMax,H.gageHP+n);
      }
      updateHud();
    }catch(e){}
  }
  function chompSound(){
    try{
      const AC=window.AudioContext||window.webkitAudioContext;
      if(!AC)return;
      const ctx=new AC();
      [0,0.09].forEach((d,i)=>{
        const o=ctx.createOscillator(),g=ctx.createGain();
        o.type='sine';
        o.frequency.setValueAtTime(i?430:540,ctx.currentTime+d);
        o.frequency.exponentialRampToValueAtTime(170,ctx.currentTime+d+0.08);
        g.gain.setValueAtTime(0.22,ctx.currentTime+d);
        g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+d+0.09);
        o.connect(g);g.connect(ctx.destination);
        o.start(ctx.currentTime+d);o.stop(ctx.currentTime+d+0.1);
      });
      setTimeout(()=>{try{ctx.close();}catch(e){}},600);
    }catch(e){}
  }
  // ---- Combat SFX (tiny Web Audio synth, one shared context) ----
  let _sfxCtx=null;
  function sfxCtx(){
    try{
      if(!_sfxCtx){
        const AC=window.AudioContext||window.webkitAudioContext;
        if(!AC)return null;
        _sfxCtx=new AC();
      }
      if(_sfxCtx.state==='suspended')_sfxCtx.resume().catch(()=>{});
      return _sfxCtx;
    }catch(e){return null;}
  }
  function sfxTone(f0,f1,dur,type,vol,delay){
    try{
      const ctx=sfxCtx();if(!ctx)return;
      const t=ctx.currentTime+(delay||0);
      const o=ctx.createOscillator(),g=ctx.createGain();
      o.type=type||'sine';
      o.frequency.setValueAtTime(Math.max(1,f0),t);
      o.frequency.exponentialRampToValueAtTime(Math.max(1,f1),t+dur);
      g.gain.setValueAtTime(vol||0.3,t);
      g.gain.exponentialRampToValueAtTime(0.001,t+dur);
      o.connect(g);g.connect(ctx.destination);
      o.start(t);o.stop(t+dur+0.02);
    }catch(e){}
  }
  function sfxNoise(dur,vol,fType,f0,f1,delay){
    try{
      const ctx=sfxCtx();if(!ctx)return;
      const t=ctx.currentTime+(delay||0);
      const len=Math.max(1,(dur*ctx.sampleRate)|0);
      const buf=ctx.createBuffer(1,len,ctx.sampleRate);
      const d=buf.getChannelData(0);
      for(let i=0;i<len;i++)d[i]=Math.random()*2-1;
      const src=ctx.createBufferSource();src.buffer=buf;
      const fl=ctx.createBiquadFilter();fl.type=fType||'lowpass';
      fl.frequency.setValueAtTime(f0||1000,t);
      if(f1)fl.frequency.exponentialRampToValueAtTime(f1,t+dur);
      const g=ctx.createGain();
      g.gain.setValueAtTime(vol||0.3,t);
      g.gain.exponentialRampToValueAtTime(0.001,t+dur);
      src.connect(fl);fl.connect(g);g.connect(ctx.destination);
      src.start(t);src.stop(t+dur+0.02);
    }catch(e){}
  }
  function sfxPunchHit(){sfxNoise(0.09,0.5,'lowpass',900,300);sfxTone(210,70,0.1,'sine',0.5);}
  function sfxKickHit(){sfxNoise(0.12,0.55,'lowpass',600,200);sfxTone(150,45,0.14,'sine',0.55);}
  function sfxWhiff(){sfxNoise(0.14,0.12,'bandpass',500,2400);}
  function sfxHurt(){sfxTone(240,110,0.16,'square',0.22);sfxNoise(0.1,0.15,'lowpass',700,300);}
  function sfxEnemyDie(){sfxTone(320,55,0.22,'sawtooth',0.25);sfxNoise(0.18,0.3,'lowpass',1200,250);}
  function sfxGageHit(){sfxNoise(0.08,0.4,'lowpass',1000,350);sfxTone(230,80,0.09,'triangle',0.4);}
  function sfxRevive(){sfxTone(300,600,0.18,'sine',0.3);sfxTone(450,900,0.22,'sine',0.25,0.1);}

  // ---- Hit spark / death poof particles (one pooled THREE.Points = one draw call) ----
  const P_MAX=240;
  let _pPts=null,_pGeo=null,_pNext=0;
  const _pPos=new Float32Array(P_MAX*3),_pCol=new Float32Array(P_MAX*3),
        _pVel=new Float32Array(P_MAX*3),_pLife=new Float32Array(P_MAX);
  function initParticles(){
    try{
      if(_pPts||typeof scene==='undefined'||!scene)return;
      for(let i=0;i<P_MAX;i++)_pPos[i*3+1]=-999;
      _pGeo=new THREE.BufferGeometry();
      _pGeo.setAttribute('position',new THREE.BufferAttribute(_pPos,3));
      _pGeo.setAttribute('color',new THREE.BufferAttribute(_pCol,3));
      const m=new THREE.PointsMaterial({size:.14,vertexColors:true,transparent:true,opacity:.95,depthWrite:false,sizeAttenuation:true});
      _pPts=new THREE.Points(_pGeo,m);
      _pPts.frustumCulled=false;
      _pPts.renderOrder=5;
      scene.add(_pPts);
    }catch(e){}
  }
  function spawnBurst(x,y,z,r,g,b,n,spread,up){
    try{
      if(!_pPts||!_pGeo)return;
      for(let k=0;k<n;k++){
        const i=_pNext;_pNext=(_pNext+1)%P_MAX;
        _pPos[i*3]=x;_pPos[i*3+1]=y;_pPos[i*3+2]=z;
        _pCol[i*3]=r;_pCol[i*3+1]=g;_pCol[i*3+2]=b;
        const a=Math.random()*Math.PI*2,sp=spread*(0.4+Math.random()*0.6);
        _pVel[i*3]=Math.cos(a)*sp;
        _pVel[i*3+1]=up*(0.5+Math.random()*0.8);
        _pVel[i*3+2]=Math.sin(a)*sp;
        _pLife[i]=0.35+Math.random()*0.3;
      }
      _pGeo.attributes.position.needsUpdate=true;
      _pGeo.attributes.color.needsUpdate=true;
    }catch(e){}
  }
  function updateParticles(dt){
    try{
      if(!_pPts||!_pGeo)return;
      let any=false;
      for(let i=0;i<P_MAX;i++){
        if(_pLife[i]<=0)continue;
        any=true;
        _pLife[i]-=dt;
        if(_pLife[i]<=0){_pPos[i*3+1]=-999;continue;}
        _pVel[i*3+1]-=9*dt;
        _pPos[i*3]+=_pVel[i*3]*dt;
        _pPos[i*3+1]+=_pVel[i*3+1]*dt;
        _pPos[i*3+2]+=_pVel[i*3+2]*dt;
      }
      if(any)_pGeo.attributes.position.needsUpdate=true;
    }catch(e){}
  }

  function updateFoods(){
    try{
      const t=performance.now()/1000;
      const rickP=(controller&&controller.pos&&!H.rickDown)?controller.pos:null;
      const gageP=(typeof gageNPC!=='undefined'&&gageNPC&&!H.gageDown)?gageNPC.position:null;
      for(let i=H.foods.length-1;i>=0;i--){
        const f=H.foods[i];
        f.sprite.position.y=f.baseY+Math.sin(t*2.4+f.phase)*0.12;
        let eater=null;
        if(rickP&&Math.hypot(f.sprite.position.x-rickP.x,f.sprite.position.z-rickP.z)<1.35)eater='rick';
        else if(gageP&&Math.hypot(f.sprite.position.x-gageP.x,f.sprite.position.z-gageP.z)<1.35)eater='gage';
        if(eater){
          healPlayer(eater,30);
          chompSound();
          try{scene.remove(f.sprite);f.sprite.material.dispose();}catch(e){}
          H.foods.splice(i,1);
          setTimeout(()=>{try{spawnFood();}catch(e){}},4000+Math.random()*5000);
        }
      }
    }catch(e){}
  }

  function aliveOfType(t){
    let n=0;
    for(const e of H.enemies)if(!e.dead&&!e.removed&&e.type===t)n++;
    return n;
  }

  // Trickle spawner: at most 2 of each type alive at once. A wave's full quota
  // still arrives over time — replacements spawn as monsters die.
  function trickleSpawn(){
    if(!H.waveQuota)return;
    try{
      const rickPos=(controller&&controller.pos)?controller.pos:new THREE.Vector3(0,0,-27);
      const gagePos=(typeof gageNPC!=='undefined'&&gageNPC)?gageNPC.position:rickPos;
      for(const t of ['zombie','skeleton']){
        let guard=0;
        while(aliveOfType(t)<2&&H.waveQuota[t]>0&&guard++<4){
          H.waveQuota[t]--;
          spawnNear(t,t==='zombie'?rickPos:gagePos,Math.floor(Math.random()*8));
        }
      }
    }catch(e){}
  }

  function spawnWave(n){    H.wave=n;

    const rickPos=(controller&&controller.pos)?controller.pos:new THREE.Vector3(0,0,-27);
    const gagePos=(typeof gageNPC!=='undefined'&&gageNPC)?gageNPC.position:rickPos;

    // Endless doubling waves: 1+1, 2+2, 4+4, 8+8, 16+16, then hold at 16 each.
    // At most 2 of each type are alive at once — the rest of the wave's quota
    // trickles in as monsters die (max 4 concurrent enemies, phone-friendly).
    let count=Math.pow(2,n-1);
    const MAX_EACH=16;
    if(count>MAX_EACH)count=MAX_EACH;

    const zs=count===1?'ZOMBIE':'ZOMBIES',ss=count===1?'SKELETON':'SKELETONS';
    setWaveText('WAVE '+n+' • '+count+' '+zs+' + '+count+' '+ss);

    H.waveQuota={zombie:count,skeleton:count};
    if(n===1){
      // Top-deck startup spawns (count against the quota).
      const zombieTop=pickFixedSpawn([[6.35,-23],[6.35,-18],[3.2,-23]],rickPos,0);
      const skeletonTop=pickFixedSpawn([[-6.35,-23],[-6.35,-18],[-3.2,-23]],gagePos,2);
      spawnEnemy('zombie',zombieTop[0],zombieTop[1]);
      spawnEnemy('skeleton',skeletonTop[0],skeletonTop[1]);
      H.waveQuota.zombie--;H.waveQuota.skeleton--;
    }
    trickleSpawn();
  }

  function aliveEnemies(){
    return H.enemies.filter(e=>!e.dead&&!e.removed);
  }

  function updateEnemyBar(e){
    const f=e.group.userData.hpFill,b=e.group.userData.hpBar;
    if(!f||!b)return;

    const ratio=Math.max(0,e.hp/e.maxHP);
    // Hide the bar while the enemy is at full HP: 2 fewer draw calls per
    // undamaged enemy (up to 64 fewer in late waves).
    b.visible=ratio<1;
    if(!b.visible)return;
    f.scale.x=ratio;
    f.position.x=-.45*(1-ratio);
    b.quaternion.copy(camera.quaternion);
  }

  function damageEnemy(e,amount){
    if(!e||e.dead)return;

    e.hp=Math.max(0,e.hp-amount);
    updateEnemyBar(e);

    // Hit reaction animation (retargeted Brawler clip, same mixamo rig).
    try{
      if(H.enemyHitClip&&e.mixer){
        if(!e.hitAction)e.hitAction=e.mixer.clipAction(H.enemyHitClip);
        e.hitAction.stop();
        e.hitAction.reset();
        e.hitAction.enabled=true;
        e.hitAction.setEffectiveWeight(1);
        e.hitAction.setLoop(THREE.LoopOnce,1);
        e.hitAction.clampWhenFinished=false;
        if(e.walkAction)e.walkAction.fadeOut(.07);
        e.hitAction.fadeIn(.07).play();
        const dur=Math.max(.25,e.hitAction.getClip().duration);
        clearTimeout(e._hitT);
        e._hitT=setTimeout(()=>{
          if(!e.dead&&!e.removed&&e.walkAction){
            e.walkAction.reset();
            e.walkAction.fadeIn(.14).play();
          }
        },dur*880);
      }else{
        // Fallback pop if the clip hasn't loaded yet.
        e.group.scale.multiplyScalar(1.045);
        setTimeout(()=>{
          if(e.group)e.group.scale.multiplyScalar(1/1.045);
        },70);
      }
    }catch(err){}

    if(e.hp<=0)killEnemy(e);
  }

  function killEnemy(e){
    if(e.dead)return;
    e.dead=true;
    sfxEnemyDie();
    try{const pp=e.group.position;spawnBurst(pp.x,pp.y+1,pp.z,.5,.55,.45,16,2.6,3);}catch(pe){}
    clearTimeout(e._hitT);

    try{
      if(e.walkAction)e.walkAction.fadeOut(.06);
      if(e.hitAction)e.hitAction.stop();
      if(H.enemyDeadClip&&e.mixer){
        if(!e.deadAction)e.deadAction=e.mixer.clipAction(H.enemyDeadClip);
        e.deadAction.reset();
        e.deadAction.enabled=true;
        e.deadAction.setEffectiveWeight(1);
        e.deadAction.setLoop(THREE.LoopOnce,1);
        e.deadAction.clampWhenFinished=true;
        e.deadAction.fadeIn(.08).play();
      }else{
        // Fallback tip-over if the clip hasn't loaded yet.
        e.group.rotation.z=(Math.random()<.5?-1:1)*1.18;
        e.group.position.y-=.05;
      }
    }catch(err){
      try{e.group.rotation.z=(Math.random()<.5?-1:1)*1.18}catch(err2){}
    }

    const dur=(e.deadAction&&H.enemyDeadClip)
      ?Math.max(.8,e.deadAction.getClip().duration)
      :.65;
    setTimeout(()=>{
      if(e.group.parent)e.group.parent.remove(e.group);
      e.removed=true;
      trickleSpawn();
      checkWave();
    },dur*1000+250);
  }

  function checkWave(){
    if(aliveEnemies().length)return;

    // Endless waves: clearing a wave spawns the next, doubled.
    const cur=H.wave;
    setWaveText('WAVE '+cur+' CLEAR • MORE ARE COMING…');
    setTimeout(()=>{
      if(H.wave===cur)spawnWave(cur+1);
    },2200);
  }

  function tryMove(group,dir,speed,dt){
    const old=group.position;
    const next=old.clone().addScaledVector(dir,speed*dt);

    let y=getWalkSurfaceY(next.x,next.z);
    if(y!==null){
      next.y=y;
      group.position.copy(next);
      return true;
    }

    const nx=old.clone();
    nx.x=next.x;
    y=getWalkSurfaceY(nx.x,nx.z);
    if(y!==null){
      nx.y=y;
      group.position.copy(nx);
      return true;
    }

    const nz=old.clone();
    nz.z=next.z;
    y=getWalkSurfaceY(nz.x,nz.z);
    if(y!==null){
      nz.y=y;
      group.position.copy(nz);
      return true;
    }

    return false;
  }

  function hurtRick(n){
    if(H.rickDown)return;

    H.rickHP=Math.max(0,H.rickHP-n);
    updateHud();
    sfxHurt();

    // Hit reaction when hurt but still standing.
    if(H.rickHP>0){
      try{playRickCombat('hit',1.2,1.2,0.55);}
      catch(e){}
      try{spawnBurst(controller.pos.x,controller.pos.y+1.3,controller.pos.z,1,.25,.2,8,2,2.5);}catch(pe){}
    }

    if(H.rickHP<=0){
      H.rickDown=true;
      setWaveText('RICK IS DOWN');

      try{
        controller.special=true;
        controller.specialName='halloweenDead';
        if(actions.dead)play('dead',{once:true,fade:.05});
      }catch(e){}

      setTimeout(()=>{
        H.rickHP=H.rickMax;
        H.rickDown=false;
        updateHud();

        const y=getWalkSurfaceY(0,-27);
        controller.pos.set(0,y===null?.18:y,-27);
        controller.groundY=controller.pos.y;
        controller.onGround=true;
        controller.vertical=0;
        controller.special=false;
        controller.specialName='';

        if(actor){
          actor.visible=true;
          actor.position.copy(controller.pos);
        }

        try{play('idle',{fade:.08})}catch(e){}

        setWaveText('WAVE '+H.wave+' • FIGHT!');
      },3000);
    }
  }

  // ---- Gage revive: walk over to a downed Gage to pick him back up ----
  function showGageReviveMarker(){
    try{
      if(!H.gageReviveMarker&&typeof gageNPC!=='undefined'&&gageNPC&&typeof scene!=='undefined'){
        const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:foodTexture('🆘'),transparent:true,depthWrite:false}));
        sp.scale.set(1,1,1);
        scene.add(sp);
        H.gageReviveMarker=sp;
      }
      if(H.gageReviveMarker)H.gageReviveMarker.visible=true;
    }catch(e){}
  }
  function hideGageReviveMarker(){
    try{if(H.gageReviveMarker)H.gageReviveMarker.visible=false;}catch(e){}
  }
  function reviveGage(){
    if(!H.gageDown)return;
    try{
      clearTimeout(H._gageRespawnT);
      hideGageReviveMarker();
      H.gageHP=Math.round(H.gageMax*0.6);
      H.gageDown=false;
      updateHud();
      if(H.gageDeadAction)H.gageDeadAction.stop();
      gageState.target=null;
      gageState.idleUntil=0;
      gageState.currentNode=1;
      gageState.nextNode=0;
      gageSetAction('idle');
      sfxRevive();
      setWaveText('GAGE IS BACK! • WAVE '+H.wave);
      setTimeout(()=>{if(!H.gageDown)setWaveText('WAVE '+H.wave+' • FIGHT!');},2500);
    }catch(e){}
  }
  function updateGageRevive(){
    try{
      if(!H.gageDown||H.rickDown)return;
      if(typeof gageNPC==='undefined'||!gageNPC)return;
      if(H.gageReviveMarker&&H.gageReviveMarker.visible){
        H.gageReviveMarker.position.set(gageNPC.position.x,gageNPC.position.y+2.6,gageNPC.position.z);
      }
      if(controller&&controller.pos){
        const d=Math.hypot(gageNPC.position.x-controller.pos.x,gageNPC.position.z-controller.pos.z);
        if(d<2.0)reviveGage();
      }
    }catch(e){}
  }

  function hurtGage(n){
    if(H.gageDown)return;

    H.gageHP=Math.max(0,H.gageHP-n);
    updateHud();
    sfxHurt();

    // Hit reaction when hurt but still standing.
    if(H.gageHP>0){
      try{
        if(H.gageHitAction){
          if(gageRunAction)gageRunAction.fadeOut(.05);
          if(gageIdleAction)gageIdleAction.fadeOut(.05);
          H.gageHitAction.reset();
          H.gageHitAction.enabled=true;
          H.gageHitAction.setEffectiveWeight(1);
          H.gageHitAction.setLoop(THREE.LoopOnce,1);
          H.gageHitAction.clampWhenFinished=false;
          H.gageHitAction.fadeIn(.04).play();
          const dur=Math.max(.4,H.gageHitAction.getClip().duration);
          clearTimeout(H._gageHitT);
          H._gageHitT=setTimeout(()=>{
            try{if(!H.gageDown)gageSetAction('idle')}catch(e){}
          },dur*900);
        }
      }catch(e){}
    }

    if(H.gageHP<=0){
      H.gageDown=true;
      setWaveText('GAGE IS DOWN');

      try{
        gageState.target=null;
        gageState.idleUntil=999999;
        clearTimeout(H._gageHitT);
        if(gageIdleAction)gageIdleAction.fadeOut(.06);
        if(gageRunAction)gageRunAction.fadeOut(.06);
        if(H.gageDeadAction){
          H.gageDeadAction.reset();
          H.gageDeadAction.enabled=true;
          H.gageDeadAction.setEffectiveWeight(1);
          H.gageDeadAction.setLoop(THREE.LoopOnce,1);
          H.gageDeadAction.clampWhenFinished=true;
          H.gageDeadAction.fadeIn(.06).play();
        }else{
          gageSetAction('idle');
        }
      }catch(e){}

      // Gage stays down until Rick walks over to revive him (auto-revive after 30s as a fallback).
      showGageReviveMarker();
      setWaveText('GAGE IS DOWN \u2014 WALK OVER TO REVIVE!');
      clearTimeout(H._gageRespawnT);
      H._gageRespawnT=setTimeout(()=>{reviveGage();},30000);
    }
  }

  function nearestEnemy(pos,max=Infinity){
    let best=null,bd=max;

    for(const e of aliveEnemies()){
      const d=e.group.position.distanceTo(pos);
      if(d<bd){
        bd=d;
        best=e;
      }
    }

    return best?{e:best,d:bd}:null;
  }

  // ---- Rick combat animation lock ----
  // The base game's per-frame locomotion driver calls play('idle'/'walk'/'run')
  // every frame, which killed Rick's punch/kick/hit one frame after it started.
  // Rapidly popping between the attack pose and locomotion looked like shaking,
  // and the attack only ever played fully when something else (alternate idle,
  // mid-air flip) kept the driver quiet. While a combat animation is playing,
  // locomotion play() requests are ignored.
  let rickCombatLockUntil=0;
  try{
    const basePlay=play;
    play=function(name,opts){
      if(performance.now()<rickCombatLockUntil&&(name==='idle'||name==='walk'||name==='run'))return;
      return basePlay(name,opts);
    };
  }catch(e){console.warn('Halloween play() wrapper:',e)}

  function cancelAltIdle(){
    try{
      if(typeof alternateIdleActive!=='undefined'&&alternateIdleActive&&typeof cancelAlternateIdle==='function')cancelAlternateIdle();
    }catch(e){}
  }

  function lockRickCombat(a,timeScale,startAt){
    try{
      const d=Math.max(0.25,(a.getClip().duration-(startAt||0))/(timeScale||1));
      rickCombatLockUntil=performance.now()+d*1000+180;
    }catch(e){rickCombatLockUntil=performance.now()+900;}
  }

  // One-shot combat clip on Rick with restart-on-mash. Grounded: locks out the
  // locomotion driver and holds the final pose until the clip finishes, so the
  // driver blends cleanly back to idle/walk/run. Mid-flip: blends over the
  // aerial flip like before (the driver is silent mid-air).
  // startAt skips the clip's wind-up so the hit lands fast after the press
  // (the raw punch/kick/hit clips all idle for ~1s before the real motion).
  function playRickCombat(clipKey,timeScale,flipScale,startAt){
    const a=actions&&actions[clipKey];
    if(!a)return;
    const flipping=!!(controller&&controller.special&&controller.specialName==='backflip');
    a.stop();
    a.reset();
    a.enabled=true;
    const t0=Math.max(0,startAt||0);
    const skipTo=function(){
      try{if(t0>0)a.time=Math.min(t0,a.getClip().duration*0.9);}catch(e){}
    };
    if(flipping){
      a.setEffectiveTimeScale(flipScale||1.35);
      a.setEffectiveWeight(.72);
      a.setLoop(THREE.LoopOnce,1);
      a.clampWhenFinished=false;
      skipTo();
      a.fadeIn(.015).play();
      return;
    }
    cancelAltIdle();
    a.setEffectiveTimeScale(timeScale);
    a.setEffectiveWeight(1);
    a.setLoop(THREE.LoopOnce,1);
    a.clampWhenFinished=true;
    if(typeof currentAction!=='undefined'&&currentAction&&currentAction!==a)currentAction.fadeOut(.03);
    if(typeof currentAction!=='undefined')currentAction=a;
    if(typeof currentName!=='undefined')currentName=clipKey;
    skipTo();
    lockRickCombat(a,timeScale,t0);
    a.fadeIn(.03).play();
  }

  function rickPunch(){
    if(!H.started||H.rickDown)return;

    const now=performance.now();
    const flipping=!!(controller&&controller.special&&controller.specialName==='backflip');

    // Visual punch happens on EVERY press (restarts if mashed). During a flip it blends over the flip
    // instead of cancelling the aerial move, so Rick can land several hits mid-flip.
    try{playRickCombat('punch',1.3,1.35,0.55);}
    catch(e){console.warn('Rick punch animation:',e)}

    // One damage attempt per deliberate button press. Slightly more reach in the air.
    const hit=nearestEnemy(controller.pos,flipping?3.05:2.55);
    if(hit){
      const dmg=flipping?31:36;
      damageEnemy(hit.e,dmg);
      sfxPunchHit();
      try{const pp=hit.e.group.position;spawnBurst(pp.x,pp.y+1.2,pp.z,1,.62,.15,10,2.2,2.5);}catch(pe){}
    }else sfxWhiff();
    H.nextRickHit=now;
  }

  function rickKick(){
    if(!H.started||H.rickDown)return;

    const now=performance.now();
    const flipping=!!(controller&&controller.special&&controller.specialName==='backflip');

    // Visual kick happens on EVERY press (restarts if mashed). During a flip it blends over the flip
    // instead of cancelling the aerial move, so Rick can land hits mid-flip.
    try{playRickCombat('kick',1.3,1.3,1.05);}
    catch(e){console.warn('Rick kick animation:',e)}

    // Kicks hit a little harder with a touch more reach than punches.
    const hit=nearestEnemy(controller.pos,flipping?3.2:2.7);
    if(hit){
      const dmg=flipping?38:44;
      damageEnemy(hit.e,dmg);
      sfxKickHit();
      try{const pp=hit.e.group.position;spawnBurst(pp.x,pp.y+1.2,pp.z,1,.5,.1,14,2.8,3);}catch(pe){}
    }else sfxWhiff();
    H.nextRickHit=now;
  }

  function setupControls(){
    addEventListener('keydown',e=>{
      if(e.code==='KeyE'){
        e.preventDefault();
        if(!e.repeat)rickPunch();
      }
      if(e.code==='KeyQ'){
        e.preventDefault();
        if(!e.repeat)rickKick();
      }
    });

    const grid=document.querySelector('.actionGrid');
    if(grid&&!document.getElementById('halloweenPunchBtn')){
      const b=document.createElement('button');
      b.type='button';
      b.id='halloweenPunchBtn';
      b.className='act primary';
      b.textContent='PUNCH';
      b.setAttribute('aria-label','Punch');

      const fire=e=>{
        e.preventDefault();
        e.stopPropagation();
        rickPunch();
      };
      // Tap = one punch. Hold = keep punching (repeat while held).
      let holdT=null;
      const stopHold=()=>{if(holdT){clearInterval(holdT);holdT=null;}};
      b.addEventListener('pointerdown',e=>{
        fire(e);
        stopHold();
        holdT=setInterval(()=>{try{rickPunch();}catch(_){}},450);
      },{passive:false});
      b.addEventListener('pointerup',stopHold);
      b.addEventListener('pointercancel',stopHold);
      b.addEventListener('pointerleave',stopHold);
      grid.appendChild(b);
    }
    if(grid&&!document.getElementById('halloweenKickBtn')){
      const k=document.createElement('button');
      k.type='button';
      k.id='halloweenKickBtn';
      k.className='act primary';
      k.textContent='KICK';
      k.setAttribute('aria-label','Kick');

      const fireK=e=>{
        e.preventDefault();
        e.stopPropagation();
        rickKick();
      };
      // Tap = one kick. Hold = keep kicking (repeat while held).
      let holdTK=null;
      const stopHoldK=()=>{if(holdTK){clearInterval(holdTK);holdTK=null;}};
      k.addEventListener('pointerdown',e=>{
        fireK(e);
        stopHoldK();
        holdTK=setInterval(()=>{try{rickKick();}catch(_){}},450);
      },{passive:false});
      k.addEventListener('pointerup',stopHoldK);
      k.addEventListener('pointercancel',stopHoldK);
      k.addEventListener('pointerleave',stopHoldK);
      grid.appendChild(k);
    }
    // Button order: dance, flip, jump, punch, kick, run (works in flex + grid layouts).
    orderActionButtons();
    setTimeout(orderActionButtons,2500);
  }

  function orderActionButtons(){
    try{
      const grid=document.querySelector('.actionGrid');
      if(!grid)return;
      const orderFor=el=>{
        if(el.id==='halloweenPunchBtn')return 4;
        if(el.id==='halloweenKickBtn')return 5;
        const t=(el.textContent||'').toLowerCase();
        if(t.indexOf('dance')>=0)return 1;
        if(t.indexOf('flip')>=0)return 2;
        if(t.indexOf('jump')>=0)return 3;
        if(t.indexOf('run')>=0)return 6;
        return 7;
      };
      Array.prototype.forEach.call(grid.children,el=>{el.style.order=orderFor(el);});
    }catch(e){}
  }

  function loadCombatAnimations(){
    try{
      // ---- Rick (Iron Harbor Brawler rig -> main mixer) ----
      gltfLoader.load(
        encodeURI('Meshy_AI_Iron_Harbor_Brawler_biped_Animation_Punch_Combo_1_withSkin.glb'),
        g=>{
          const clip=typeof bestClip==='function'?bestClip(g):g.animations[0];
          if(clip&&mixer){
            actions.punch=mixer.clipAction(typeof cleanClip==='function'?cleanClip(clip):clip);
          }
        },
        undefined,
        ()=>{}
      );

      // Rick kick: Serpent Roundhouse_Kick retargeted (identical mixamo rig).
      gltfLoader.load(
        encodeURI('Meshy_AI_Serpent_Shoulder_Smil_biped_Animation_Roundhouse_Kick_withSkin.glb'),
        g=>{
          const clip=typeof bestClip==='function'?bestClip(g):g.animations[0];
          if(clip&&mixer){
            actions.kick=mixer.clipAction(typeof cleanClip==='function'?cleanClip(clip):clip);
          }
        },
        undefined,
        ()=>{}
      );

      // Rick hit reaction.
      gltfLoader.load(
        encodeURI('Meshy_AI_Iron_Harbor_Brawler_biped_Animation_Hit_Reaction_withSkin.glb'),
        g=>{
          const clip=typeof bestClip==='function'?bestClip(g):g.animations[0];
          if(clip&&mixer){
            actions.hit=mixer.clipAction(typeof cleanClip==='function'?cleanClip(clip):clip);
          }
        },
        undefined,
        ()=>{}
      );

      // ---- Gage (Serpent rig -> gageMixer) ----
      gltfLoader.load(
        encodeURI('Meshy_AI_Serpent_Shoulder_Smil_biped_Animation_Punch_Combo_1_withSkin.glb'),
        g=>{
          const clip=typeof bestClip==='function'?bestClip(g):g.animations[0];
          if(clip&&gageMixer){
            H.gagePunchAction=gageMixer.clipAction(
              typeof cleanNPCClip==='function'?cleanNPCClip(clip):clip
            );
          }
        },
        undefined,
        ()=>{}
      );

      // Gage kick.
      gltfLoader.load(
        encodeURI('Meshy_AI_Serpent_Shoulder_Smil_biped_Animation_Roundhouse_Kick_withSkin.glb'),
        g=>{
          const clip=typeof bestClip==='function'?bestClip(g):g.animations[0];
          if(clip&&gageMixer){
            H.gageKickAction=gageMixer.clipAction(
              typeof cleanNPCClip==='function'?cleanNPCClip(clip):clip
            );
          }
        },
        undefined,
        ()=>{}
      );

      // Gage hit reaction.
      gltfLoader.load(
        encodeURI('Meshy_AI_Serpent_Shoulder_Smil_biped_Animation_Hit_Reaction_withSkin.glb'),
        g=>{
          const clip=typeof bestClip==='function'?bestClip(g):g.animations[0];
          if(clip&&gageMixer){
            H.gageHitAction=gageMixer.clipAction(
              typeof cleanNPCClip==='function'?cleanNPCClip(clip):clip
            );
          }
        },
        undefined,
        ()=>{}
      );

      // Death animation for Rick AND Gage (shared mixamo rig).
      gltfLoader.load(
        halloweenAsset('rick-gage-dead.glb'),
        g=>{
          const clip=typeof bestClip==='function'?bestClip(g):g.animations[0];
          if(!clip)return;

          if(mixer){
            actions.dead=mixer.clipAction(typeof cleanClip==='function'?cleanClip(clip):clip);
          }
          if(typeof gageMixer!=='undefined'&&gageMixer){
            H.gageDeadAction=gageMixer.clipAction(
              typeof cleanNPCClip==='function'?cleanNPCClip(clip):clip
            );
          }
        },
        undefined,
        ()=>{}
      );

      // Zombie/skeleton hit + death clips (retargeted Brawler clips, same rig).
      gltfLoader.load(
        encodeURI('Meshy_AI_Iron_Harbor_Brawler_biped_Animation_Hit_Reaction_withSkin.glb'),
        g=>{
          const clip=typeof bestClip==='function'?bestClip(g):g.animations[0];
          if(clip)H.enemyHitClip=typeof cleanNPCClip==='function'?cleanNPCClip(clip):clip;
        },
        undefined,
        ()=>{}
      );
      gltfLoader.load(
        encodeURI('Meshy_AI_Iron_Harbor_Brawler_biped_Animation_Dead_withSkin.glb'),
        g=>{
          const clip=typeof bestClip==='function'?bestClip(g):g.animations[0];
          if(clip)H.enemyDeadClip=typeof cleanNPCClip==='function'?cleanNPCClip(clip):clip;
        },
        undefined,
        ()=>{}
      );
    }catch(e){}
  }

  function gageFight(dt,now){
    if(
      H.gageDown||
      typeof gageNPC==='undefined'||
      !gageNPC||
      (typeof multiplayer!=='undefined'&&multiplayer.connected)
    )return;

    const n=nearestEnemy(gageNPC.position,8.5);
    if(!n)return;

    try{
      gageState.target=null;
      gageState.idleUntil=now/1000+.3;
    }catch(e){}

    const dir=new THREE.Vector3().subVectors(n.e.group.position,gageNPC.position);
    dir.y=0;

    if(n.d>1.45){
      dir.normalize();
      tryMove(gageNPC,dir,1.28,dt);

      gageNPC.rotation.y=lerpAngle(
        gageNPC.rotation.y,
        Math.atan2(dir.x,dir.z)+Math.PI,
        Math.min(1,dt*8)
      );

      try{gageSetAction('run')}catch(e){}
    }else if(now>=H.nextGageHit){
      H.nextGageHit=now+760;

      gageNPC.rotation.y=lerpAngle(
        gageNPC.rotation.y,
        Math.atan2(dir.x,dir.z)+Math.PI,
        1
      );

      // Alternate punches and kicks.
      H.gageKickNext=!H.gageKickNext;
      const useKick=H.gageKickNext&&H.gageKickAction;
      const act=useKick?H.gageKickAction:H.gagePunchAction;

      try{
        if(act){
          if(gageRunAction)gageRunAction.fadeOut(.05);
          if(gageIdleAction)gageIdleAction.fadeOut(.05);

          act.reset();
          act.enabled=true;
          act.setEffectiveTimeScale(1.15);
          try{act.time=Math.min(useKick?1.05:0.55,act.getClip().duration*0.9);}catch(e){}
          act.setEffectiveWeight(1);
          act.setLoop(THREE.LoopOnce,1);
          act.clampWhenFinished=true;
          act.fadeIn(.04).play();
        }
      }catch(e){}

      damageEnemy(n.e,useKick?42:34);
      if(useKick)sfxKickHit();else sfxGageHit();
    }
  }

  const _enemyDir=new THREE.Vector3();

  function updateEnemies(dt,now){
    const paused=
      (typeof callState!=='undefined'&&callState.active)||
      (typeof serviceState!=='undefined'&&serviceState.active)||
      (typeof firstJobState!=='undefined'&&firstJobState.cutscenePlaying)||
      (typeof arrivalState!=='undefined'&&arrivalState.cutscenePlaying);

    for(const e of H.enemies){
      if(e.removed)continue;
      if(e.mixer){
        // Animation LOD: dead/close enemies animate every frame; mid-range every
        // 2nd frame; far ones every 3rd (time-scaled so motion stays correct).
        let skip=1;
        try{
          if(!e.dead&&typeof controller!=='undefined'&&controller&&controller.pos){
            const d2=e.group.position.distanceToSquared(controller.pos);
            skip=d2>900?3:d2>400?2:1;
          }
        }catch(lodE){}
        e._lodTick=(e._lodTick||0)+1;
        if(e._lodTick%skip===0)e.mixer.update(dt*skip);
      }
      // Spawn-in: grow up out of the dock instead of popping into existence.
      if(e.spawnT<0.35&&e.model&&e.modelBaseScale){
        e.spawnT=Math.min(0.35,e.spawnT+dt);
        const k=e.spawnT/0.35,ease=1-Math.pow(1-k,2);
        e.model.scale.setScalar(Math.max(0.01,e.modelBaseScale*(0.01+0.99*ease)));
      }
      if(e.dead)continue;
      updateEnemyBar(e);
      if(!e.ready)continue;

      const swing=e.group.userData.swing||[];
      const phase=now*.008*(e.type==='skeleton'?1.35:1);

      if(swing[0])swing[0].rotation.x=Math.sin(phase)*.45;
      if(swing[1])swing[1].rotation.x=-Math.sin(phase)*.45;
      if(swing[2])swing[2].rotation.x=-Math.sin(phase)*.32;
      if(swing[3])swing[3].rotation.x=Math.sin(phase)*.32;

      if(paused)continue;

      const rp=controller.pos;
      let target='rick',tp=rp,rd=e.group.position.distanceTo(rp);

      if(!H.gageDown&&typeof gageNPC!=='undefined'&&gageNPC){
        const gd=e.group.position.distanceTo(gageNPC.position);
        if(gd<rd){
          target='gage';
          tp=gageNPC.position;
          rd=gd;
        }
      }

      const dir=_enemyDir.subVectors(tp,e.group.position);
      dir.y=0;
      const dist=dir.length();

      if(dist>1.12){
        dir.normalize();
        tryMove(e.group,dir,e.speed,dt);
        e.group.rotation.y=lerpAngle(
          e.group.rotation.y,
          Math.atan2(dir.x,dir.z),
          Math.min(1,dt*6)
        );
      }else if(now>=e.nextAttack){
        e.nextAttack=now+(e.type==='skeleton'?900:1120);
        const damage=e.type==='skeleton'?5:6;

        if(target==='gage')hurtGage(damage);
        else hurtRick(damage);
      }
    }
  }


  function installFiveMinuteDeclineCooldown(){
    try{
      if(typeof handleFirstJobDecline!=='function'||typeof showCustomerCall!=='function')return;
      const originalShowCustomerCall=showCustomerCall;
      showCustomerCall=function(force=false){
        const left=H.declineCooldownUntil-Date.now();
        if(left>0){
          const total=Math.ceil(left/1000),m=Math.floor(total/60),s=String(total%60).padStart(2,'0');
          if(typeof jobBadge!=='undefined'&&jobBadge)jobBadge.textContent='NEXT CALL '+m+':'+s;
          return;
        }
        return originalShowCustomerCall(force);
      };

      handleFirstJobDecline=function(){
        try{clearTimeout(declineRetryTimer);clearInterval(declineTickTimer)}catch(e){}
        H.declineCooldownUntil=Date.now()+300000;
        if(declineCountdown){
          declineCountdown.textContent='5:00';
          if(declineCountdown.nextSibling&&declineCountdown.nextSibling.nodeType===3)declineCountdown.nextSibling.textContent='.';
        }
        declinePopup?.classList.remove('show');
        if(declinePopup){void declinePopup.offsetWidth;declinePopup.classList.add('show')}
        if(typeof animStatus!=='undefined'&&animStatus)animStatus.textContent='First job declined — next customer call in 5 minutes';
        let remaining=300;
        declineTickTimer=setInterval(()=>{
          remaining=Math.max(0,Math.ceil((H.declineCooldownUntil-Date.now())/1000));
          const m=Math.floor(remaining/60),ss=String(remaining%60).padStart(2,'0');
          if(declineCountdown)declineCountdown.textContent=m+':'+ss;
          if(typeof jobBadge!=='undefined'&&jobBadge)jobBadge.textContent=remaining?'NEXT CALL '+m+':'+ss:'CUSTOMERS CALLING AGAIN';
          if(!remaining){clearInterval(declineTickTimer);declinePopup?.classList.remove('show')}
        },1000);
        declineRetryTimer=setTimeout(()=>{
          H.declineCooldownUntil=0;
          declinePopup?.classList.remove('show');
          callState.triggered=false;callState.accepted=false;
          originalShowCustomerCall(true);
        },300000);
      };
    }catch(e){console.warn('Halloween decline cooldown:',e)}
  }

  function installSpookyFirstJobWaypoint(){
    try{
      if(typeof createJobWaypoint!=='function')return;
      createJobWaypoint=function(){
        if(jobWaypoint)return jobWaypoint;
        const group=new THREE.Group();

        const ringMat=new THREE.MeshBasicMaterial({color:0xff6a18,transparent:true,opacity:.98,depthTest:false});
        const ring=new THREE.Mesh(new THREE.TorusGeometry(.88,.13,16,48),ringMat);
        ring.rotation.x=Math.PI/2;ring.renderOrder=950;group.add(ring);

        const ring2Mat=new THREE.MeshBasicMaterial({color:0xa85cff,transparent:true,opacity:.80,depthTest:false});
        const ring2=new THREE.Mesh(new THREE.TorusGeometry(.58,.055,12,40),ring2Mat);
        ring2.rotation.x=Math.PI/2;ring2.position.y=.24;ring2.renderOrder=951;group.add(ring2);

        const arrowMat=new THREE.MeshBasicMaterial({color:0xffd34e,depthTest:false});
        const arrow=new THREE.Mesh(new THREE.ConeGeometry(.38,.88,20),arrowMat);
        arrow.rotation.x=Math.PI;arrow.position.y=1.18;arrow.renderOrder=953;group.add(arrow);

        const beamMat=new THREE.MeshBasicMaterial({color:0x8b36ff,transparent:true,opacity:.30,depthTest:false,side:THREE.DoubleSide});
        const beam=new THREE.Mesh(new THREE.CylinderGeometry(.16,.72,5.4,18,1,true),beamMat);
        beam.position.y=2.25;beam.renderOrder=949;group.add(beam);

        const glow=new THREE.PointLight(0xff4c16,2.5,8,2);
        glow.position.y=1.0;group.add(glow);

        group.userData.halloweenWaypoint={ring,ring2,arrow,beam,glow};
        group.visible=false;scene.add(group);jobWaypoint=group;H.spookyWaypoint=group;return group;
      };
    }catch(e){console.warn('Halloween waypoint override:',e)}
  }

  function updateSpookyWaypoint(now){
    const w=(typeof jobWaypoint!=='undefined'&&jobWaypoint)?jobWaypoint:H.spookyWaypoint;
    if(!w||!w.visible||!w.userData.halloweenWaypoint)return;
    const q=w.userData.halloweenWaypoint,t=now*.001;
    const pulse=1+Math.sin(t*5.2)*.11;
    q.ring.scale.setScalar(pulse);
    q.ring.rotation.z=t*.85;
    q.ring2.scale.setScalar(1.08-Math.sin(t*5.2)*.09);
    q.ring2.rotation.z=-t*1.25;
    q.arrow.position.y=1.18+Math.sin(t*4.3)*.22;
    q.beam.material.opacity=.22+(Math.sin(t*3.4)+1)*.08;
    q.glow.intensity=2.1+(Math.sin(t*5.2)+1)*.6;
  }

  function maybeStart(){
    if(H.started)return;
    try{
      if(typeof gameAssetsReady!=='undefined'&&!gameAssetsReady)return;
      if(typeof loaderUI!=='undefined'&&loaderUI&&loaderUI.style.display!=='none')return;
      if(typeof scene==='undefined'||typeof gltfLoader==='undefined'||typeof controller==='undefined')return;
      H.started=true;
      spawnWave(1);
      for(let i=0;i<6;i++)spawnFood();
      loadCombatAnimations();
    }catch(e){console.warn('Halloween start:',e)}
  }

  let last=performance.now();

  function loop(now){
    requestAnimationFrame(loop);

    const dt=Math.min(.04,Math.max(.001,(now-last)/1000));
    last=now;

    // FPS governor: step render resolution down when slow, back up when smooth.
    try{
      H._fpsN=(H._fpsN||0)+1;H._fpsT=(H._fpsT||0)+dt;
      if(H._fpsT>=2){
        const fps=H._fpsN/Math.max(.001,H._fpsT);
        H._fpsN=0;H._fpsT=0;
        if(H._prRaw){
          if(fps<45&&(H.qLevel||0)<3){H.qLevel=(H.qLevel||0)+1;H._qUpStreak=0;reapplyPixelRatio();}
          else if(fps>57&&(H.qLevel||0)>0){
            H._qUpStreak=(H._qUpStreak||0)+1;
            if(H._qUpStreak>=2){H.qLevel--;H._qUpStreak=0;reapplyPixelRatio();}
          }
          else H._qUpStreak=0;
        }
      }
    }catch(e){}

    maybeStart();
    if(!H.started)return;

    updateEnemies(dt,now);
    updateFoods();
    updateGageRevive();
    updateParticles(dt);
    gageFight(dt,now);
    updateSpookyWaypoint(now);
  }

  function init(){
    addStyles();
    addHud();
    // Rotate hint banner (CSS shows it only in portrait on touch devices).
    try{
      if(!document.getElementById('hlRotateHint')){
        const rh=document.createElement('div');
        rh.id='hlRotateHint';
        rh.textContent='ROTATE YOUR PHONE FOR LANDSCAPE PLAY';
        document.body.appendChild(rh);
      }
    }catch(e){}
    // Auto fullscreen + landscape lock when entering the dockyard (user tap = valid gesture).
    try{
      const startBtn=document.getElementById('loaderStartBtn');
      if(startBtn&&!startBtn.__hlLandscape){
        startBtn.__hlLandscape=true;
        startBtn.addEventListener('click',()=>{
          try{if(typeof enterGameFullscreen==='function')enterGameFullscreen();}catch(e){}
        });
      }
    }catch(e){}
    installFiveMinuteDeclineCooldown();
    initParticles();
    try{
      if(!document.getElementById('hlVignette')){
        const v=document.createElement('div');
        v.id='hlVignette';
        document.body.appendChild(v);
      }
    }catch(e){}
    // Remove the manatee's "FUCK YOU!" yell (TTS mispronounces it). Boat itself stays.
    try{
      yellFromManatee=function(){};
      const my=document.getElementById('manateeYell');
      if(my){my.classList.remove('show');my.style.visibility='hidden';}
    }catch(e){}
  // Gear-oil minigame tuning: calmer wind + catch if oil touches ANY of the pan.
  // (Base lives on the backup branch; this global override wins at call time.)
  try{
    window.runOilCatch=function(now){
    if(serviceState.step!=='catch')return;
    const dt=Math.min(.05,(now-serviceState.lastOilTime)/1000||.016);serviceState.lastOilTime=now;
    if(!serviceState.catchStarted){
      serviceState.wind=0;
      oilStream.style.opacity='0';
      windReadout.textContent='READY — TOUCH THE PAN';
      serviceState.oilLoop=requestAnimationFrame(runOilCatch);
      return;
    }
    oilStream.style.opacity='1';
    // Strong, shifting marina gusts, but the collision target now matches the VISIBLE oil stream.
    serviceState.wind=(
      .78*Math.sin(now*.00185)+
      .41*Math.sin(now*.0049+1.7)+
      .22*Math.sin(now*.0107+4.1))*.55; // calmed to 55%

    const absWind=Math.abs(serviceState.wind);
    const streamX=THREE.MathUtils.clamp(.55+serviceState.wind*.22,.12,.88);
    oilStream.style.transform=`translateX(-50%) rotate(${serviceState.wind*12}deg)`;
    oilStream.style.left=(streamX*100)+'%';
    oilDrainPoint.style.left=(streamX*100)+'%';

    windReadout.textContent=
      serviceState.wind>.65?'GUST: →→':
      serviceState.wind>.18?'WIND: →':
      serviceState.wind<-.65?'GUST: ←←':
      serviceState.wind<-.18?'WIND: ←':'WIND: CALM';

    // v18.19.1 — the oil NEVER pauses just because the pan missed it.
    // The drain continues for the full cycle; oil is either caught or becomes a real spill.
    const drainSeconds=7.0;
    const panHalfWidth=.15; // full pan width — oil touching any of the pan counts as caught
    const caught=Math.abs(serviceState.panX-streamX)<=panHalfWidth;

    serviceState.drainProgress+=dt;
    if(caught){
      serviceState.catchProgress+=dt;
    }else{
      serviceState.spill+=dt;
    }

    const drainPct=Math.min(100,(serviceState.drainProgress/drainSeconds)*100);
    const spillPct=Math.min(100,(serviceState.spill/drainSeconds)*100);
    catchReadout.textContent=`DRAIN: ${Math.round(drainPct)}% • SPILL: ${Math.round(spillPct)}%`;
    spillFill.style.width=spillPct+'%';

    // Make missed oil visibly hit the floor/water beneath the drain instead of silently disappearing.
    if(oilSpillPuddle){
      oilSpillPuddle.style.left=(streamX*100)+'%';
      if(!caught){
        const puddleScale=.35+Math.min(2.4,serviceState.spill*.48);
        oilSpillPuddle.style.opacity=String(Math.min(.92,.24+serviceState.spill*.16));
        oilSpillPuddle.style.transform=`translateX(-50%) scale(${puddleScale})`;
      }
    }

    if(spillPct>=40){
      serviceState.step='catchFail';
      oilPanDragging=false;
      oilCatchGame.style.display='none';
      stopGearOilPan3DLoop();
      serviceCard.style.display='block';
      setServiceText(
        'OIL SPILL',
        'Too much gear oil missed the pan. The wind can move the stream fast — keep the pan directly under the visible stream.',
        'SPILL LIMIT REACHED'
      );
      serviceButtons.innerHTML='';
      serviceButton('TRY AGAIN',()=>{
        serviceCard.style.display='none';
        startOilCatch();
      });
      return;
    }
    if(serviceState.drainProgress>=7){
      serviceState.step='catchDone';
      oilCatchGame.style.display='none';
      stopGearOilPan3DLoop();
      setTimeout(startSelectFill,350);
      return;
    }
    serviceState.oilLoop=requestAnimationFrame(runOilCatch);
  };
  }catch(e){}
  // Gear-oil minigame look: lower-unit drain, thick glossy gear oil, lower pan.
  try{
    if(!document.getElementById('halloweenGearOilLook')){
      const st=document.createElement('style');
      st.id='halloweenGearOilLook';
      st.textContent=`
#oilDrainPoint{
  width:40px!important;height:64px!important;top:13.5%!important;
  border-radius:46% 46% 48% 48%/60% 60% 40% 40%!important;
  background:linear-gradient(90deg,#0b0d0f 0%,#232a30 20%,#4d585f 42%,#767f88 50%,#4d585f 58%,#232a30 80%,#0b0d0f 100%)!important;
  border:1px solid rgba(165,180,190,.55)!important;
  box-shadow:0 3px 10px rgba(0,0,0,.55)!important;
}
#oilDrainPoint::after{
  content:'';position:absolute;left:50%;bottom:4px;transform:translateX(-50%);
  width:20px;height:8px;border-radius:4px;
  background:radial-gradient(circle at 35% 30%,#ffe9a8,#c8922e 60%,#6e4d14)!important;
  box-shadow:0 0 4px rgba(0,0,0,.6);
}
#oilStream{
  top:19%!important;height:88%!important;width:15px!important;
  border-radius:7px!important;
  background:
    repeating-linear-gradient(180deg,rgba(255,214,140,.13) 0 7px,rgba(255,214,140,0) 7px 15px),
    linear-gradient(90deg,#0f0a04 0%,#241605 16%,#5a3a10 36%,#a5762a 50%,#5a3a10 64%,#241605 84%,#0f0a04 100%)!important;
  box-shadow:0 0 8px rgba(0,0,0,.65)!important;
  animation:gearOilFlow .45s linear infinite!important;
}
@keyframes gearOilFlow{to{background-position:0 15px,0 0}}
#gearOilPanCanvas{transform:translateY(40%)!important}
#oilSpillPuddle{
  background:radial-gradient(ellipse at center,rgba(52,34,10,.98) 0 45%,rgba(28,18,7,.96) 60%,rgba(14,9,4,.18) 78%,transparent 82%)!important;
}`;
      document.head.appendChild(st);
    }
  }catch(e){}
    installSpookyFirstJobWaypoint();
    applyNight();
    makeNightSky();
    applyPerfProfile();
    addFullMoon();
    addWebs();
    setupMusic();
    setupControls();
    initHowls();
    // Mobile browsers keep AudioContext suspended until a user gesture — unlock howls on first tap.
    addEventListener('pointerdown',()=>{
      try{
        if(!H._howlInit)initHowls();
        else if(H.howlCtx&&H.howlCtx.state==='suspended')H.howlCtx.resume();
      }catch(e){}
    },{passive:true});
    addEventListener('keydown',()=>{
      try{if(H.howlCtx&&H.howlCtx.state==='suspended')H.howlCtx.resume()}catch(e){}
    });
    requestAnimationFrame(loop);
  }

  if(document.readyState==='loading'){
    addEventListener('DOMContentLoaded',init,{once:true});
  }else{
    setTimeout(init,0);
  }
})();