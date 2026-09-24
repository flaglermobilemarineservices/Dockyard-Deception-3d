/* Dockyard Deception Halloween mode — 2026-09-22
   Load this AFTER the main game's inline script.
   It reuses the existing Three.js scene, Rick/Gage controllers, GLTF loader and music system. */
(function(){
  'use strict';
  if(window.__DOCKYARD_HALLOWEEN_ACTIVE)return;
  window.__DOCKYARD_HALLOWEEN_ACTIVE=true;

  const HALLOWEEN_ASSET_ROOT='https://raw.githubusercontent.com/flaglermobilemarineservices/Dockyard-Deception-3d/halloween-2026/';
  const halloweenAsset=name=>HALLOWEEN_ASSET_ROOT+encodeURIComponent(name).replace(/%2F/g,'/');

  const H=window.DOCKYARD_HALLOWEEN={
    wave:0,rickHP:100,gageHP:100,rickDown:false,gageDown:false,
    enemies:[],started:false,nextGageHit:0,nextRickHit:0,
    gagePunchAction:null,declineCooldownUntil:0,
    spookyWaypoint:null
  };

  function addStyles(){
    const s=document.createElement('style');
    s.textContent=
      '#halloweenHud{position:absolute;left:50%;top:max(10px,env(safe-area-inset-top));transform:translateX(-50%);z-index:126;width:min(390px,62vw);pointer-events:none;font-family:Inter,system-ui,Arial,sans-serif}'+
      '#halloweenHud .hhCard{background:rgba(3,5,12,.82);border:1px solid rgba(220,225,255,.35);border-radius:14px;padding:8px 10px;box-shadow:0 10px 32px rgba(0,0,0,.45);backdrop-filter:blur(7px)}'+
      '#halloweenHud .hhRow{display:grid;grid-template-columns:52px 1fr 42px;gap:7px;align-items:center;margin:4px 0;font-size:11px;font-weight:1000}'+
      '#halloweenHud .hhTrack{height:10px;border-radius:999px;background:#24131a;overflow:hidden;border:1px solid rgba(255,255,255,.18)}'+
      '#halloweenHud .hhFill{height:100%;width:100%;transform-origin:left center;background:linear-gradient(90deg,#51d36f,#cfe95b)}'+
      '#gageHealthFill{background:linear-gradient(90deg,#5ab8ff,#8ce8ff)!important}'+
      '#halloweenWave{text-align:center;margin-top:5px;font-size:10px;font-weight:1000;letter-spacing:.08em;color:#f3d7ff}'+
      '#halloweenPunchBtn{background:rgba(112,34,38,.94)!important;border-color:rgba(255,150,150,.7)!important;opacity:.97!important}'+
      '.actionGrid{width:74px!important;justify-items:center!important;gap:8px!important}.actionGrid .act{width:64px!important;height:64px!important;min-height:64px!important;border-radius:50%!important;padding:5px!important;line-height:1.02!important;font-size:9px!important;display:flex!important;align-items:center!important;justify-content:center!important;text-align:center!important}.actionGrid .act.trick{min-height:64px!important;height:64px!important;font-size:9px!important}'+
      '#halloweenPunchBtn{width:68px!important;height:68px!important;min-height:68px!important;font-size:10px!important;box-shadow:0 0 18px rgba(255,65,65,.42)!important}'+
      '@media(pointer:coarse){#halloweenHud{top:max(8px,env(safe-area-inset-top));width:min(360px,64vw)}#halloweenHud .hhCard{padding:6px 8px}#halloweenHud .hhRow{font-size:10px}.actionGrid{width:66px!important}.actionGrid .act{width:58px!important;height:58px!important;min-height:58px!important}.actionGrid .act.trick{height:58px!important;min-height:58px!important}#halloweenPunchBtn{width:62px!important;height:62px!important;min-height:62px!important}}';
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
    if(r)r.style.width=Math.max(0,H.rickHP)+'%';
    if(g)g.style.width=Math.max(0,H.gageHP)+'%';
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
      moon.position.set(20,32,10);
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

  function makePylonWeb(x,z,ry,scale=1){
    const pts=[];
    const anchorX=-.54, maxR=1.04;
    const spokes=8, rings=4;
    // A fan-shaped web whose left edge sits directly on the piling.
    for(let i=0;i<spokes;i++){
      const a=(-1.05)+(i/(spokes-1))*2.10;
      pts.push(anchorX,0,0,anchorX+Math.cos(a)*maxR,Math.sin(a)*maxR,0);
    }
    for(let r=1;r<=rings;r++){
      const rad=maxR*r/rings;
      for(let i=0;i<spokes-1;i++){
        const a=(-1.05)+(i/(spokes-1))*2.10;
        const b=(-1.05)+((i+1)/(spokes-1))*2.10;
        pts.push(anchorX+Math.cos(a)*rad,Math.sin(a)*rad,0,anchorX+Math.cos(b)*rad,Math.sin(b)*rad,0);
      }
    }
    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.Float32BufferAttribute(pts,3));
    const web=new THREE.LineSegments(geo,new THREE.LineBasicMaterial({color:0xf1f3ff,transparent:true,opacity:.72,depthWrite:false}));
    web.position.set(x,1.28,z);
    web.rotation.y=ry;
    web.scale.setScalar(scale);
    scene.add(web);
    return web;
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

  function addPumpkins(){
    try{
      gltfLoader.load(halloweenAsset('pumpkin-totem.glb'),g=>{
        const base=g.scene;
        const box=new THREE.Box3().setFromObject(base),size=new THREE.Vector3();
        box.getSize(size);
        // Rick is normalized to ~1.82m. These are intentionally monster-size decorations.
        const s=3.15/Math.max(.001,size.y);
        base.scale.setScalar(s);
        base.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true}});
        const spots=[[6.35,-23],[-6.35,13],[20,5]];
        spots.forEach((p,i)=>{
          const clone=i===0?base:base.clone(true);
          const y=getWalkSurfaceY(p[0],p[1]);
          clone.position.set(p[0],y===null?.18:y,p[1]);
          clone.rotation.y=i*1.7+.35;
          scene.add(clone);
          const glow=new THREE.PointLight(0xff6a19,1.35,7.5,2);
          glow.position.set(p[0],(y===null?.18:y)+1.7,p[1]);
          scene.add(glow);
        });
      },undefined,err=>console.warn('Halloween pumpkin load:',err));
    }catch(e){console.warn('Halloween pumpkin setup:',e)}
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
         new song once -> old Song 1 -> old Song 2 -> old Song 3 -> old Song 1... */
      setMusicScene=async function(sceneName,reset){
        musicScene=sceneName;
        if(!musicStarted)return playMusicIndex(musicIndex,!!reset);
        return true;
      };

      musicPlaylist.forEach((a,i)=>{
        a.addEventListener('ended',()=>{
          if(!musicWanted||i!==musicIndex)return;
          const next=(i===0)?1:((i>=musicPlaylist.length-1)?1:i+1);
          playMusicIndex(next,true);
        });
      });

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
      model.scale.setScalar(targetH/Math.max(.001,sz.y));
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

  function spawnWave(n){
    H.wave=n;

    if(n===1){
      setWaveText('WAVE 1 • ZOMBIE + SKELETON');
      spawnEnemy('zombie',.72,22);
      spawnEnemy('skeleton',13,16);
    }else{
      setWaveText('WAVE 2 • 2 ZOMBIES + 2 SKELETONS');
      spawnEnemy('zombie',-6.35,13);
      spawnEnemy('zombie',20,-6);
      spawnEnemy('skeleton',6.35,13);
      spawnEnemy('skeleton',20,5);
    }
  }

  function aliveEnemies(){
    return H.enemies.filter(e=>!e.dead&&!e.removed);
  }

  function updateEnemyBar(e){
    const f=e.group.userData.hpFill,b=e.group.userData.hpBar;
    if(!f||!b)return;

    const ratio=Math.max(0,e.hp/e.maxHP);
    f.scale.x=ratio;
    f.position.x=-.45*(1-ratio);
    b.quaternion.copy(camera.quaternion);
  }

  function damageEnemy(e,amount){
    if(!e||e.dead)return;

    e.hp=Math.max(0,e.hp-amount);
    updateEnemyBar(e);

    e.group.scale.multiplyScalar(1.045);
    setTimeout(()=>{
      if(e.group)e.group.scale.multiplyScalar(1/1.045);
    },70);

    if(e.hp<=0)killEnemy(e);
  }

  function killEnemy(e){
    if(e.dead)return;
    e.dead=true;

    e.group.rotation.z=(Math.random()<.5?-1:1)*1.18;
    e.group.position.y-=.05;

    setTimeout(()=>{
      if(e.group.parent)e.group.parent.remove(e.group);
      e.removed=true;
      checkWave();
    },650);
  }

  function checkWave(){
    if(aliveEnemies().length)return;

    if(H.wave===1){
      setWaveText('WAVE 1 CLEAR • MORE ARE COMING…');
      setTimeout(()=>{
        if(H.wave===1)spawnWave(2);
      },2200);
    }else if(H.wave===2){
      H.wave=3;
      setWaveText('DOCK CLEAR ✓ • HALLOWEEN NIGHT SURVIVED');
    }
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

    if(H.rickHP<=0){
      H.rickDown=true;
      setWaveText('RICK IS DOWN');

      try{
        controller.special=true;
        controller.specialName='halloweenDead';
        if(actions.dead)play('dead',{once:true,fade:.05});
      }catch(e){}

      setTimeout(()=>{
        H.rickHP=100;
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

        setWaveText(
          H.wave===1?'WAVE 1 • FIGHT!':
          H.wave===2?'WAVE 2 • FIGHT!':
          'DOCK CLEAR ✓'
        );
      },3000);
    }
  }

  function hurtGage(n){
    if(H.gageDown)return;

    H.gageHP=Math.max(0,H.gageHP-n);
    updateHud();

    if(H.gageHP<=0){
      H.gageDown=true;
      setWaveText('GAGE IS DOWN');

      try{
        gageState.target=null;
        gageState.idleUntil=999999;
        gageSetAction('idle');
      }catch(e){}

      setTimeout(()=>{
        H.gageHP=100;
        H.gageDown=false;
        updateHud();

        if(gageNPC){
          const y=getWalkSurfaceY(.72,-23);
          gageNPC.position.set(.72,y===null?.18:y,-23);
        }

        try{
          gageState.idleUntil=0;
          gageState.currentNode=1;
          gageState.nextNode=0;
        }catch(e){}

        setWaveText(
          H.wave===1?'WAVE 1 • FIGHT!':
          H.wave===2?'WAVE 2 • FIGHT!':
          'DOCK CLEAR ✓'
        );
      },3500);
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

  function rickPunch(){
    if(!H.started||H.rickDown)return;

    const now=performance.now();
    const flipping=!!(controller&&controller.special&&controller.specialName==='backflip');

    // Visual punch happens on EVERY press. During a flip it blends over the flip
    // instead of cancelling the aerial move, so Rick can land several hits mid-flip.
    try{
      const a=actions&&actions.punch;
      if(a){
        a.stop();
        a.reset();
        a.enabled=true;
        a.setEffectiveTimeScale(flipping?1.35:1.12);
        a.setEffectiveWeight(flipping?.72:1);
        a.setLoop(THREE.LoopOnce,1);
        a.clampWhenFinished=false;
        a.fadeIn(.015).play();
        if(!flipping){
          if(typeof currentAction!=='undefined'&&currentAction&&currentAction!==a)currentAction.fadeOut(.035);
          if(typeof currentAction!=='undefined')currentAction=a;
          if(typeof currentName!=='undefined')currentName='punch';
        }
      }
    }catch(e){console.warn('Rick punch animation:',e)}

    // One damage attempt per deliberate button press. Slightly more reach in the air.
    const hit=nearestEnemy(controller.pos,flipping?3.05:2.55);
    if(hit){
      const dmg=flipping?31:36;
      damageEnemy(hit.e,dmg);
    }
    H.nextRickHit=now;
  }

  function setupControls(){
    addEventListener('keydown',e=>{
      if(e.code==='KeyE'){
        e.preventDefault();
        if(!e.repeat)rickPunch();
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
      b.addEventListener('pointerdown',fire,{passive:false});
      grid.appendChild(b);
    }
  }

  function loadCombatAnimations(){
    try{
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

      gltfLoader.load(
        halloweenAsset('rick-gage-dead.glb'),
        g=>{
          const clip=typeof bestClip==='function'?bestClip(g):g.animations[0];
          if(!clip)return;

          if(mixer){
            actions.dead=mixer.clipAction(typeof cleanClip==='function'?cleanClip(clip):clip);
          }
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

      try{
        if(H.gagePunchAction){
          if(gageRunAction)gageRunAction.fadeOut(.05);
          if(gageIdleAction)gageIdleAction.fadeOut(.05);

          H.gagePunchAction.reset();
          H.gagePunchAction.setLoop(THREE.LoopOnce,1);
          H.gagePunchAction.clampWhenFinished=true;
          H.gagePunchAction.fadeIn(.04).play();
        }
      }catch(e){}

      damageEnemy(n.e,34);
    }
  }

  function updateEnemies(dt,now){
    const paused=
      (typeof callState!=='undefined'&&callState.active)||
      (typeof serviceState!=='undefined'&&serviceState.active)||
      (typeof firstJobState!=='undefined'&&firstJobState.cutscenePlaying)||
      (typeof arrivalState!=='undefined'&&arrivalState.cutscenePlaying);

    for(const e of H.enemies){
      if(e.dead||e.removed)continue;
      if(e.mixer)e.mixer.update(dt);

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

      const dir=new THREE.Vector3().subVectors(tp,e.group.position);
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
        const damage=e.type==='skeleton'?9:12;

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
      loadCombatAnimations();
    }catch(e){console.warn('Halloween start:',e)}
  }

  let last=performance.now();

  function loop(now){
    requestAnimationFrame(loop);

    const dt=Math.min(.04,Math.max(.001,(now-last)/1000));
    last=now;

    maybeStart();
    if(!H.started)return;

    updateEnemies(dt,now);
    gageFight(dt,now);
    updateSpookyWaypoint(now);
  }

  function init(){
    addStyles();
    addHud();
    installFiveMinuteDeclineCooldown();
    installSpookyFirstJobWaypoint();
    applyNight();
    addWebs();
    addPumpkins();
    setupMusic();
    setupControls();
    requestAnimationFrame(loop);
  }

  if(document.readyState==='loading'){
    addEventListener('DOMContentLoaded',init,{once:true});
  }else{
    setTimeout(init,0);
  }
})();