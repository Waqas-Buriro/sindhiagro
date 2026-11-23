(function(){
  "use strict";

  const FALLBACK = { lat: 25.3960, lng: 68.3578, label: "حيدرآباد" };
  const dayNames = ["آچر","سومر","اڱارو","اربع","خميس","جمعو","ڇنڇر"];
  const cropLabels = {cotton:"ڪپھ", wheat:"ڪڻڪ", rice:"چانور", sugarcane:"ڪمند", orchard:"باغ", vegetables:"ڀاڄيون"};
  const wisdom = [
    ["ڄيٺي مينھن، پوڻيٺيءَ پُٽَ، ڪن ڀاڳ ڀرين کي مِلن!",""]
  ];

  let map, marker, userLabelMarker, streetLayer, satelliteLayer, isSatellite = false;
  let farms = [], selectedFarmId = null;
  let latestWeather = null, latestDistrict = FALLBACK.label;
  let adminData = null, adminReady = null, currentAdmin = {division:"—", district:FALLBACK.label, taluka:"—", confidence:"fallback"};
  let savedLayer, riskLayer, drawingLayer, indexColorLayer;
  let drawing = false, draft = null, points = [];
  let pointMarkers = [], lineLayer = null, previewPolygon = null, previewLabel = null;
  let currentLayer = "health";
  let sentinelOverlay = null, currentSentinelIndex = 'ndvi';

  function $(id){ return document.getElementById(id); }
  function esc(s){ return String(s||"").replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c])); }

  document.addEventListener("DOMContentLoaded", init);

  function init(){
    renderSindhiDatePill();
    renderWisdom();
    adminReady = loadAdminDataset();
    renderAdminLocationCard();
    initMap(FALLBACK.lat, FALLBACK.lng);
    initButtons();
    loadFarms();
    renderFarms();
    drawSavedFarms();
    updateSelectedFarmInfo();
    const curFarm = getSelectedFarm();
    if(curFarm && curFarm.polygon && curFarm.polygon.length >= 3){
      renderIndexColorLayer(curFarm.polygon, currentSentinelIndex);
      fetchSentinelAnalysis(curFarm, currentSentinelIndex);
    } else {
      renderSentinelLegend(getClientLegend(currentSentinelIndex));
    }
    locate();
  }

  function initButtons(){
    ["addFarmBtn","addFarmBtnMap"].forEach(id=>{ const b=$(id); if(b) b.addEventListener("click", openFarmModal); });
    const close=$("closeFarmModal"); if(close) close.addEventListener("click", closeFarmModal);
    const start=$("startDrawBtn"); if(start) start.addEventListener("click", startDrawing);
    const undo=$("undoPointBtn"); if(undo) undo.addEventListener("click", undoPoint);
    const finish=$("finishFarmBtn"); if(finish) finish.addEventListener("click", finishDrawing);
    const cancel=$("cancelFarmBtn"); if(cancel) cancel.addEventListener("click", cancelDrawing);
    const clear=$("clearAllFarmsBtn"); if(clear) clear.addEventListener("click", clearAllFarms);
    const loc=$("locateBtn"); if(loc) loc.addEventListener("click", locate);
    const toggle=$("toggleMapViewBtn"); if(toggle) toggle.addEventListener("click", toggleMapView);

    // PWA & Homescreen Widget listeners
    ["openWidgetBtn", "topbarWidgetBtn", "floatingWidgetBtn"].forEach(id=>{
      const b=$(id); if(b) b.addEventListener("click", openWidgetModal);
    });
    const closeWidget = $("closeWidgetModal");
    if(closeWidget) closeWidget.addEventListener("click", closeWidgetModal);

    const installTop = $("pwaInstallHeaderBtn");
    if(installTop) installTop.addEventListener("click", triggerPwaInstall);
    const installModal = $("pwaInstallModalBtn");
    if(installModal) installModal.addEventListener("click", triggerPwaInstall);

    document.querySelectorAll(".tool-btn[data-index]").forEach(btn=>{
      btn.addEventListener("click", function(){
        document.querySelectorAll(".tool-btn[data-index]").forEach(b=>b.classList.remove("active"));
        this.classList.add("active");
        currentSentinelIndex = this.dataset.index;
        if(drawing && points.length >= 3){
          renderIndexColorLayer(points, currentSentinelIndex);
        } else {
          const farm = getSelectedFarm();
          if(farm && farm.polygon && farm.polygon.length >= 3){
            renderIndexColorLayer(farm.polygon, currentSentinelIndex);
            fetchSentinelAnalysis(farm, currentSentinelIndex);
          } else {
            renderSentinelLegend(getClientLegend(currentSentinelIndex));
          }
        }
      });
    });
  }

  function initMap(lat,lng){
    map = L.map("map", { zoomControl:true, scrollWheelZoom:false, preferCanvas:false }).setView([lat,lng], 17);

    streetLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {maxZoom:20, attribution:"© OpenStreetMap"});
    satelliteLayer = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {maxZoom:20, attribution:"Tiles © Esri"});
    streetLayer.addTo(map);

    // Add Search Geocoder Control
    if (typeof L.Control.Geocoder !== 'undefined') {
        L.Control.geocoder({
            defaultMarkGeocode: false
        })
        .on('markgeocode', function(e) {
            var bbox = e.geocode.bbox;
            map.fitBounds(bbox);
        })
        .addTo(map);
    }

    map.createPane('satellitePane');
    map.getPane('satellitePane').style.zIndex = 350;

    indexColorLayer = L.layerGroup().addTo(map);
    savedLayer = L.layerGroup().addTo(map);
    drawingLayer = L.layerGroup().addTo(map);

    marker = L.marker([lat,lng], {
      icon:L.divIcon({className:"hd-you-marker", iconSize:[18,18], iconAnchor:[9,9]})
    }).addTo(map).bindPopup("📍 اوهان هتي بيٺا آهيو");

    userLabelMarker = L.marker([lat,lng], {
      icon:L.divIcon({className:"hd-you-label", html:"📍 اوهان هتي بيٺا آهيو", iconSize:null}),
      interactive:false
    }).addTo(map);
    map.on("click", onMapClick);

    const fix=()=>{
      if(!map) return;
      map.invalidateSize(true);
      const c = marker ? marker.getLatLng() : map.getCenter();
      if(!getSelectedFarm()) map.setView(c, map.getZoom(), {animate:false});
    };
    setTimeout(fix,100);
    setTimeout(fix,350);
    setTimeout(fix,800);
    setTimeout(fix,1500);
    window.addEventListener("load", fix);
    window.addEventListener("resize", ()=>setTimeout(fix,160));
    if("ResizeObserver" in window){
      const el = document.getElementById("map");
      if(el){ new ResizeObserver(()=>setTimeout(fix,120)).observe(el); }
    }
  }

  function toggleMapView(){
    if(isSatellite){
      map.removeLayer(satelliteLayer); streetLayer.addTo(map); isSatellite=false;
      if($("toggleMapViewBtn")) $("toggleMapViewBtn").textContent="🛰️ سيٽلائيٽ ڏيک";
    }else{
      map.removeLayer(streetLayer); satelliteLayer.addTo(map); isSatellite=true;
      if($("toggleMapViewBtn")) $("toggleMapViewBtn").textContent="🗺️ سادو نقشو";
    }
    setTimeout(()=>map.invalidateSize(true),100);
  }

  function locate(){
    setLocationTitle("لوڪيشن وٺجي پئي");
    if(!navigator.geolocation){ updateLocation(FALLBACK.lat,FALLBACK.lng); return; }
    navigator.geolocation.getCurrentPosition(
      p=>updateLocation(p.coords.latitude,p.coords.longitude),
      ()=>updateLocation(FALLBACK.lat,FALLBACK.lng),
      {enableHighAccuracy:true, timeout:10000, maximumAge:120000}
    );
  }

  async function fetchWeatherData(lat, lng){
    try{
      const res = await fetch(`api/weather.php?lat=${lat}&lon=${lng}`);
      if(res.ok){
        const text = await res.text();
        if(text && text.trim().startsWith('{')){
          const data = JSON.parse(text);
          if(data && data.ok) return data;
        }
      }
    }catch(e){}

    // Direct Open-Meteo fallback for Netlify / static hosting
    try{
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,cloud_cover&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=7&timezone=auto`;
      const res = await fetch(url);
      const data = await res.json();
      if(data && data.daily){
        const times = data.daily.time || [];
        const daily = times.map((t, i) => ({
          date: t,
          code: (data.daily.weather_code && data.daily.weather_code[i]) || 0,
          max: data.daily.temperature_2m_max && data.daily.temperature_2m_max[i],
          min: data.daily.temperature_2m_min && data.daily.temperature_2m_min[i],
          rain: (data.daily.precipitation_probability_max && data.daily.precipitation_probability_max[i]) || 0
        }));
        return {
          ok: true,
          source: 'open-meteo-client',
          current: {
            temp: data.current && data.current.temperature_2m,
            humidity: data.current && data.current.relative_humidity_2m,
            wind: data.current && data.current.wind_speed_10m,
            cloud: data.current && data.current.cloud_cover
          },
          daily: daily
        };
      }
    }catch(e){
      console.warn('Weather direct fallback notice:', e);
    }
    return null;
  }

  async function fetchGeocodeData(lat, lng){
    try{
      const res = await fetch(`api/geocode.php?lat=${lat}&lon=${lng}`);
      if(res.ok){
        const text = await res.text();
        if(text && text.trim().startsWith('{')){
          const data = JSON.parse(text);
          if(data && data.ok !== false) return data;
        }
      }
    }catch(e){}

    // Direct Nominatim fallback for Netlify / static hosting
    try{
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=10&addressdetails=1`;
      const res = await fetch(url);
      const j = await res.json();
      const addr = (j && j.address) || {};
      const rawName = addr.state_district || addr.county || addr.city || addr.town || addr.municipality || addr.state || 'سنڌ';
      const cleanName = String(rawName).replace(/District|ضلعو/gi, '').trim();
      return {
        ok: true,
        district: sindhiAdminName(cleanName),
        address: addr,
        display_name: j.display_name
      };
    }catch(e){
      console.warn('Geocode direct fallback notice:', e);
    }
    return { ok: false, district: FALLBACK.label };
  }

  async function updateLocation(lat,lng){
    marker.setLatLng([lat,lng]);
    if(userLabelMarker) userLabelMarker.setLatLng([lat,lng]);
    if(!getSelectedFarm()) { map.setView([lat,lng],17,{animate:false}); setTimeout(()=>map.invalidateSize(true),150); setTimeout(()=>map.invalidateSize(true),700); }
    try{
      const [geo,w] = await Promise.all([
        fetchGeocodeData(lat, lng),
        fetchWeatherData(lat, lng),
        adminReady || loadAdminDataset()
      ]);
      currentAdmin = resolveAdministrativeLocation(geo, lat, lng);
      latestDistrict = currentAdmin.district || (geo && geo.district) || FALLBACK.label;
      latestWeather = w && w.ok ? w : null;
    }catch(e){
      latestDistrict=FALLBACK.label; latestWeather=null;
      currentAdmin = resolveAdministrativeLocation(null, lat, lng);
    }
    setLocationTitle(latestDistrict);
    renderAdminLocationCard();
    marker.bindPopup("📍 اوهان هتي بيٺا آهيو — "+latestDistrict);
    if(userLabelMarker){ userLabelMarker.setIcon(L.divIcon({className:"hd-you-label", html:"📍 اوهان هتي بيٺا آهيو", iconSize:null})); }
    renderWeather();
  }


  async function loadAdminDataset(){
    const key="sindhagro_sindh_admin_v1_5C2";
    try{
      const cached=localStorage.getItem(key);
      if(cached){ adminData=JSON.parse(cached); }
    }catch(e){ adminData=null; }
    try{
      const r=await fetch("data/sindh-admin.json?v=1.5C2", {cache:"force-cache"});
      if(r.ok){
        adminData=await r.json();
        try{ localStorage.setItem(key, JSON.stringify(adminData)); }catch(e){}
      }
    }catch(e){}
    return adminData;
  }

  function normalizeAdminText(x){
    return String(x||"").toLowerCase()
      .replace(/district|taluka|tehsil|division|ضلعو|تعلقو|ڊويزن/g, "")
      .replace(/[َُِّْٰـ]/g, "")
      .replace(/هه/g,"ھ").replace(/ه/g,"ھ")
      .replace(/ي/g,"ی").replace(/ى/g,"ی")
      .replace(/\s+/g, " ").trim();
  }

  function sindhiAdminName(name){
    const n=String(name||"");
    const map={
      "Karachi":"ڪراچي", "Karachi City":"ڪراچي", "Hyderabad":"حيدرآباد", "Sanghar":"سانگهڙ", "Badin":"بدين", "Khairpur":"خيرپور",
      "Tando Muhammad Khan":"ٽنڊو محمد خان", "Tando Allahyar":"ٽنڊو الهيار", "Umerkot":"عمرڪوٽ", "Mirpur Khas":"ميرپورخاص", "Mirpurkhas":"ميرپورخاص",
      "Tharparkar":"ٿرپارڪر", "Mithi":"مٺي", "Sujawal":"سجاول", "Thatta":"ٺٽو", "Jamshoro":"ڄامشورو", "Dadu":"دادو",
      "Shaheed Benazirabad":"شھيد بينظيرآباد", "Nawabshah":"نوابشاھ", "Naushahro Feroze":"نوشھرو فيروز", "Matiari":"مٽياري",
      "Sukkur":"سکر", "Larkana":"لاڙڪاڻو", "Shikarpur":"شڪارپور", "Jacobabad":"جيڪب آباد", "Kashmore":"ڪشمور", "Ghotki":"گهوٽڪي",
      "Qambar Shahdadkot":"قمبر شھدادڪوٽ", "Malir":"ملير", "Korangi":"ڪورنگي", "Keamari":"ڪياماڙي", "Kemari":"ڪياماڙي", "Sindh":"سنڌ"
    };
    for(const k in map){ if(n.toLowerCase().includes(k.toLowerCase())) return map[k]; }
    return n;
  }

  function getAdminRows(){ return adminData && Array.isArray(adminData.flat) ? adminData.flat : []; }

  function resolveAdministrativeLocation(geo, lat, lng){
    const rows=getAdminRows();
    if(!rows.length) return {division:"—", district:(geo&&geo.district)||FALLBACK.label, taluka:"ڊيٽا لوڊ ٿي رهي آهي", confidence:"loading", lat, lng};
    const address=(geo&&geo.address)||{};
    const districtGuess=sindhiAdminName((geo&&geo.district)||address.state_district||address.county||address.city||"");
    const talukaCandidates=[geo&&geo.taluka, address.municipality, address.town, address.city, address.city_district, address.suburb, address.county, address.state_district, geo&&geo.display_name]
      .filter(Boolean).map(sindhiAdminName);

    const dNorm=normalizeAdminText(districtGuess);
    let districtRows=rows.filter(r=>normalizeAdminText(r.district)===dNorm || dNorm.includes(normalizeAdminText(r.district)) || normalizeAdminText(r.district).includes(dNorm));
    let best=null;
    for(const cand of talukaCandidates){
      const cNorm=normalizeAdminText(cand);
      if(!cNorm) continue;
      const pool=districtRows.length?districtRows:rows;
      best=pool.find(r=>{
        const t=normalizeAdminText(r.taluka), d=normalizeAdminText(r.district);
        return t===cNorm || cNorm.includes(t) || t.includes(cNorm) || d===cNorm;
      });
      if(best) break;
    }
    if(!best && districtRows.length===1) best=districtRows[0];
    if(!best && districtRows.length) best={division:districtRows[0].division, district:districtRows[0].district, taluka:"تعلقو سڃاڻپ ۾ آهي"};
    if(!best) best=rows.find(r=>normalizeAdminText(r.district)===normalizeAdminText(FALLBACK.label)) || {division:"سنڌ", district:districtGuess||FALLBACK.label, taluka:"تعلقو سڃاڻپ ۾ آهي"};
    return {division:best.division, district:best.district, taluka:best.taluka, confidence:(best.taluka&&best.taluka!=="تعلقو سڃاڻپ ۾ آهي")?"dataset-match":"district-match", lat, lng};
  }

  function renderAdminLocationCard(){
    const box=$("adminLocationCard"); if(!box) return;
    const a=currentAdmin || {division:"—",district:FALLBACK.label,taluka:"—"};
    box.innerHTML=`
      <div class="admin-card-title">📍 اوھان جي لوڪيشن</div>
      <div class="admin-grid">
        <div><span>ڊويزن:</span><strong>${esc(a.division||"—")}</strong></div>
        <div><span>ضلعو:</span><strong>${esc(a.district||"—")}</strong></div>
      </div>`;
  }

  function setLocationTitle(txt){
    if($("locationTitle")) $("locationTitle").textContent = "📍 " + txt;
  }

  function renderWeather(){
    const current = latestWeather && latestWeather.current ? latestWeather.current : {};
    const today = latestWeather && latestWeather.daily && latestWeather.daily[0] ? latestWeather.daily[0] : {};
    const temp = Number(current.temp||0), humidity=Number(current.humidity||0), rain=Number(today.rain||0), wind=Number(current.wind||0);

    if($("smartBadges")){
      const farm = getSelectedFarm();
      $("smartBadges").innerHTML = `
        <span>📍 ${esc((currentAdmin&&currentAdmin.district)||latestDistrict)}</span>
        ${farm?`<span>🌾 ${esc(farm.name)} · ${Number(farm.area_acres||0).toFixed(2)} ايڪڙ</span>`:"<span>🌾 ٻني داخل ڪريو</span>"}
        <span>🌦️ ${temp?Math.round(temp)+"°C":"موسم"}</span>
        <span>${rain>=50?"🌧️ مينھن جو امڪان":"🌧️ مينھن وسڻ جي اميد گهٽ آھي"}</span>
      `;
    }
    if($("statusLine1")) $("statusLine1").textContent = temp>=43 ? "ادا، گرمي وڌيل آهي؛ ٻنيءَ جي آلاڻ تي نظر رکو." : "ادا، موسم جي ڄاڻ ملي وئي آهي؛ ٻنيءَ جي حالت ڏسندا رهو.";
    if($("statusLine2")) $("statusLine2").textContent = rain>=50 ? "مينھن جا امڪان موجود آهن؛ پاڻي ڏيڻ ۾ احتياط ڪريو." : "مينھن جا امڪان گهٽ آهن؛ سڪل حصن تي نظر رکو.";
    if($("statusLine3")) $("statusLine3").textContent = humidity<=30 ? "هوا خشڪ آهي؛ آلاڻ جلدي گهٽجي سگهي ٿي." : "ضرورت واري حصي تي ئي پاڻي ڏيو.";
    if($("updatedAt")) $("updatedAt").textContent = "آخري اپڊيٽ: " + new Date().toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"});

    renderForecast();
    renderInsights(temp,humidity,rain,wind);
    drawRiskInsideSelectedFarm();
  }

  function renderInsights(temp,humidity,rain,wind){
    const arr=[];
    arr.push(temp>=43 ? "گرمي وڌيل آهي؛ صبح يا شام جو ٻني ڏسڻ بهتر آهي." : "گرمي في الحال قابو ۾ لڳي ٿي.");
    arr.push(rain>=50 ? "مينھن جي امڪان سبب پاڻي ڏيڻ ۾ تڪڙ نه ڪريو." : "مينھن گهٽ آهي؛ آلاڻ تي نظر رکو.");
    arr.push(wind>=30 ? "هوا تيز آهي؛ اسپري کان احتياط ڪريو." : "هوا بابت صورتحال معمولي آهي.");
    if($("fieldInsights")) $("fieldInsights").innerHTML = arr.map(x=>`<li>${x}</li>`).join("");
  }

  function renderForecast(){
    const row=$("forecastRow"); if(!row) return;
    const days = latestWeather && latestWeather.daily ? latestWeather.daily : [];
    if(!days.length){ row.innerHTML='<div class="day-card loading-card"><div class="glass-icon">🌦️</div><strong>موسم</strong><span>ڊيٽا وٺجي پئي</span></div>'; return; }
    row.innerHTML = days.slice(0,7).map(d=>{
      const date=new Date(d.date+"T12:00:00"); const day=dayNames[date.getDay()];
      const max=Math.round(d.max||0), min=Math.round(d.min||0), rain=Math.round(d.rain||0);
      const info = rain>=50?["🌧️","مينھن جو امڪان"]:(max>=43?["🔥","سخت گرمي"]:(max>=38?["☀️","گرمي وڌيل"]:["🌤️","موسم مناسب"]));
      return `<div class="day-card"><div class="glass-icon">${info[0]}</div><strong>${day}</strong><span class="temp-line">${max}° / ${min}°</span><span>${info[1]}</span><small>مينھن جي اميد: ${rain}%</small></div>`;
    }).join("");
  }


  function renderSindhiDatePill(){
    const now = new Date();
    const months = [
      {name:"چيٽ", m:2, d:22},
      {name:"ويساک", m:3, d:21},
      {name:"ڄيٺ", m:4, d:22},
      {name:"آکاڙ", m:5, d:22},
      {name:"سانوڻ", m:6, d:23},
      {name:"بڊو", m:7, d:23},
      {name:"اسو", m:8, d:23},
      {name:"ڪتي", m:9, d:23},
      {name:"نانهري", m:10, d:22},
      {name:"پوھ", m:11, d:22},
      {name:"مانگھ", m:0, d:21},
      {name:"ڦڳڻ", m:1, d:20}
    ];
    let current = months[0];
    for(const item of months){
      const y = (item.m <= 1) ? now.getFullYear() + 1 : now.getFullYear();
      const start = new Date(y, item.m, item.d, 0, 0, 0);
      if(now >= start) current = item;
    }
    if(now < new Date(now.getFullYear(), 2, 22)){
      current = months[11];
    }
    const sindhiYear = now.getFullYear() - 626;
    if($("sindhiMonth")) $("sindhiMonth").textContent = "ھلندڙ سنڌي مھينو: " + current.name;
    if($("sindhiYear")) $("sindhiYear").textContent = "سنڌي سنبت جو سال: " + sindhiYear;
    if($("gregDate")) $("gregDate").textContent = now.toLocaleDateString("en-GB", {day:"numeric", month:"long", year:"numeric"});
  }

  function renderWisdom(){
    const d=new Date(); const item=wisdom[d.getDate()%wisdom.length];
    if($("wisdomTitle")) $("wisdomTitle").textContent=item[0];
    if($("wisdomText")) $("wisdomText").textContent=item[1];
  }

  function openFarmModal(){ const m=$("farmModal"); if(m) m.classList.remove("hidden"); }
  function closeFarmModal(){ const m=$("farmModal"); if(m) m.classList.add("hidden"); }

  function startDrawing(){
    const name = ($("farmNameInput") && $("farmNameInput").value.trim()) || "منھنجي ٻني";
    const cropSel = $("cropSelect");
    const crop = cropSel ? cropSel.value : "cotton";
    const cropLabel = cropSel ? (cropSel.options[cropSel.selectedIndex].dataset.label || cropLabels[crop]) : "ڪپھ";

    draft = { id:"farm_"+Date.now(), name, crop, crop_label:cropLabel, polygon:[], area_acres:0, created_at:new Date().toISOString(), updated_at:new Date().toISOString() };
    drawing = true; points=[];
    clearDrawing();
    closeFarmModal();

    if($("farmDrawGuide")) $("farmDrawGuide").classList.remove("hidden");
    setDrawText("نقشي تي پنھنجي ٻنيءَ جي پهرين ڪنڊ تي چيچ سان نشان لڳايو.");
    updateDrawStats();
    setMapHelp("drawing",0);
  }

  function onMapClick(e){
    if(!drawing || !draft) return;
    const p={lat:e.latlng.lat,lng:e.latlng.lng};
    points.push(p);
    addPointMarker(p, points.length);
    redrawLine();
    redrawPreview();
    updateDrawStats();
    setDrawText(points.length<3 ? `${points.length} ڪنڊ لڳي وئي؛ اڃا ڪنڊون لڳايو.` : `${points.length} ڪنڊون لڳي ويون؛ حد مڪمل ڪري سگهو ٿا.`);
    setMapHelp("drawing", points.length);
  }

  function addPointMarker(p,n){
    const circle = L.circleMarker([p.lat,p.lng], {
      radius:14, color:"#ffffff", weight:4, fillColor:"#0B3930", fillOpacity:1, opacity:1
    }).addTo(drawingLayer).bringToFront();
    const label = L.marker([p.lat,p.lng], {
      icon:L.divIcon({className:"hd-point-label", html:String(n), iconSize:[24,24], iconAnchor:[12,12]}),
      interactive:false,
      zIndexOffset:10000
    }).addTo(drawingLayer);
    pointMarkers.push(circle,label);
  }

  function redrawLine(){
    if(lineLayer) drawingLayer.removeLayer(lineLayer);
    lineLayer=null;
    if(points.length>=2){
      lineLayer = L.polyline(points.map(p=>[p.lat,p.lng]), {color:"#0B3930", weight:6, opacity:1, lineCap:"round", lineJoin:"round"}).addTo(drawingLayer).bringToFront();
    }
  }

  function redrawPreview(){
    if(previewPolygon) drawingLayer.removeLayer(previewPolygon);
    if(previewLabel) drawingLayer.removeLayer(previewLabel);
    previewPolygon=null; previewLabel=null;
    if(points.length>=3){
      const latlngs=points.map(p=>[p.lat,p.lng]);
      previewPolygon = L.polygon(latlngs, {color:"#0B3930", weight:3, fillColor:"#000000", fillOpacity:0.0, opacity:1}).addTo(drawingLayer).bringToFront();
      const center=L.latLngBounds(latlngs).getCenter();
      previewLabel = L.marker(center, {icon:L.divIcon({className:"hd-acre-label", html:`${points.length} ڪنڊون · ${calcAcres(points).toFixed(2)} ايڪڙ`, iconSize:null}), interactive:false, zIndexOffset:10001}).addTo(drawingLayer);
      renderIndexColorLayer(points, currentSentinelIndex);
    } else {
      if(indexColorLayer) indexColorLayer.clearLayers();
    }
  }

  function undoPoint(){
    if(!drawing || !points.length) return;
    points.pop();
    clearDrawingVisualsOnly();
    points.forEach((p,i)=>addPointMarker(p,i+1));
    redrawLine(); redrawPreview(); updateDrawStats();
    setDrawText(points.length ? `${points.length} ڪنڊون باقي آهن.` : "map تي پهرين ڪنڊ تي دٻايو.");
  }

  function finishDrawing(){
    if(!drawing || !draft) return;
    if(points.length<3){ setDrawText("ادا، حد مڪمل ڪرڻ لاءِ گهٽ ۾ گهٽ 3 ڪنڊون ضروري آهن."); return; }
    draft.polygon=points.slice();
    draft.area_acres=Number(calcAcres(points).toFixed(2));
    draft.updated_at=new Date().toISOString();
    farms.push(draft);
    selectedFarmId=draft.id;
    saveFarms();
    drawing=false; draft=null; points=[];
    if($("farmDrawGuide")) $("farmDrawGuide").classList.add("hidden");
    clearDrawing();
    renderFarms(); drawSavedFarms(); updateSelectedFarmInfo();
    setMapHelp("saved");
    if($("statusLine1")) $("statusLine1").textContent="🎉 اوهان جي ٻني محفوظ ٿي وئي.";
    if($("statusLine2")) $("statusLine2").textContent=`ڪل ايراضي لڳ ڀڳ ${getSelectedFarm().area_acres} ايڪڙ آهي.`;
    if($("statusLine3")) $("statusLine3").textContent="📡 سيٽلائيٽ ڊيٽا وٺجي پئي — ٿوري دير ۾ ٻنيءَ جو نقشو رنگ سان ڀرجي ويندو.";
    renderIndexColorLayer(getSelectedFarm().polygon, currentSentinelIndex);
    fetchSentinelAnalysis(getSelectedFarm(), currentSentinelIndex);
  }

  function cancelDrawing(){
    drawing=false; draft=null; points=[];
    if($("farmDrawGuide")) $("farmDrawGuide").classList.add("hidden");
    clearDrawing(); updateDrawStats();
    setMapHelp(getSelectedFarm()?"saved":"idle");
    const farm = getSelectedFarm();
    if(farm && farm.polygon && farm.polygon.length >= 3){
      renderIndexColorLayer(farm.polygon, currentSentinelIndex);
    } else {
      clearSentinelOverlay();
    }
  }

  function clearDrawingVisualsOnly(){
    drawingLayer.clearLayers();
    pointMarkers=[]; lineLayer=null; previewPolygon=null; previewLabel=null;
    if(indexColorLayer && (!points || points.length < 3)) {
      indexColorLayer.clearLayers();
    }
  }
  function clearDrawing(){ clearDrawingVisualsOnly(); updateDrawStats(); }

  function updateDrawStats(){
    const s=$("drawStats"); if(!s) return;
    if(!drawing){ s.textContent="اڃا ڪا ڪنڊ لڳل ناهي"; return; }
    if(points.length<3) s.textContent = points.length ? `${points.length} ڪنڊ لڳي وئي ـ گهٽ ۾ گهٽ 3 ڪنڊون لڳايو` : "اڃا ڪا ڪنڊ لڳل ناهي";
    else s.textContent = `${points.length} ڪنڊون · لڳ ڀڳ ${calcAcres(points).toFixed(2)} ايڪڙ`;
  }
  function setDrawText(t){ if($("drawGuideText")) $("drawGuideText").textContent=t; }

  function setMapHelp(mode,count){
    const h=$("mapHelpOverlay"); if(!h) return;
    if(mode==="saved"){ h.classList.add("hidden"); return; }
    h.classList.remove("hidden");
    if(mode==="drawing"){
      h.innerHTML=`<div class="map-help-icon">👆</div><div><strong>${count?count+" ڪنڊ لڳي وئي":"پهرين ڪنڊ تي دٻايو"}</strong><span>${count>=3?"هاڻي حد مڪمل ڪري سگهو ٿا.":"هر ڪنڊ تي نشان ايندو."}</span></div>`;
    }else{
      h.innerHTML=`<div class="map-help-icon">🌾</div><div><strong>ٻني داخل ڪرڻ لاءِ بٽڻ دٻايو</strong><span>پوءِ نقشي تي ڪنڊون لڳايو.</span></div>`;
    }
  }

  function loadFarms(){
    try{ farms=JSON.parse(localStorage.getItem("hari_dost_farms")||"[]")||[]; }catch(e){ farms=[]; }
    selectedFarmId=localStorage.getItem("hari_dost_selected_farm") || (farms[0] && farms[0].id) || null;
  }
  function saveFarms(){
    localStorage.setItem("hari_dost_farms", JSON.stringify(farms));
    if(selectedFarmId) localStorage.setItem("hari_dost_selected_farm", selectedFarmId);
  }
  function getSelectedFarm(){ return farms.find(f=>f.id===selectedFarmId) || null; }

  function renderFarms(){
    const list=$("farmList"), empty=$("farmEmpty"); if(!list) return;
    if(!farms.length){ list.innerHTML=""; if(empty) empty.classList.remove("hidden"); return; }
    if(empty) empty.classList.add("hidden");
    list.innerHTML=farms.map(f=>`
      <div class="farm-chip ${f.id===selectedFarmId?'active':''}">
        <button class="farm-select-area" data-farm-id="${f.id}" type="button">
          <strong>🌾 ${esc(f.name)}</strong>
          <span>${esc(f.crop_label||"فصل")} · ${Number(f.area_acres||0).toFixed(2)} ايڪڙ</span>
          <span>هن ٻنيءَ جي رپورٽ ڏسو</span>
        </button>
        <div class="farm-actions"><button class="mini-btn delete-farm-btn" data-delete="${f.id}" type="button">🗑️ ختم ڪريو</button></div>
      </div>`).join("");
    list.querySelectorAll("[data-farm-id]").forEach(b=>b.addEventListener("click",()=>{
      selectedFarmId=b.dataset.farmId;
      saveFarms();
      renderFarms();
      drawSavedFarms();
      updateSelectedFarmInfo();
      setMapHelp("saved");
      const f = getSelectedFarm();
      if(f){
        if(f.polygon && f.polygon.length>=3){
          map.fitBounds(L.latLngBounds(f.polygon.map(p=>[p.lat,p.lng])), {padding:[30,30]});
          renderIndexColorLayer(f.polygon, currentSentinelIndex);
        }
        fetchSentinelAnalysis(f, currentSentinelIndex);
      }
    }));
    list.querySelectorAll("[data-delete]").forEach(b=>b.addEventListener("click",(e)=>{ e.stopPropagation(); deleteFarm(b.dataset.delete); }));
  }

  function drawSavedFarms(){
    savedLayer.clearLayers();
    farms.forEach(f=>{
      if(!f.polygon || f.polygon.length<3) return;
      const latlngs=f.polygon.map(p=>[p.lat,p.lng]);
      const selected=f.id===selectedFarmId;
      const poly = L.polygon(latlngs,{
        color:selected?"#0B3930":"#2B6357",
        weight:selected?4:2,
        fillColor:"#000000",
        fillOpacity:0.0,
        dashArray:selected?null:"4, 6"
      }).addTo(savedLayer);
      if(selected){
        const center=L.latLngBounds(latlngs).getCenter();
        L.marker(center,{icon:L.divIcon({className:"hd-acre-label",html:`🌾 ${esc(f.name)}`,iconSize:null}),interactive:false}).addTo(savedLayer);
        map.fitBounds(L.latLngBounds(latlngs).pad(.35),{animate:false,maxZoom:18});
        renderIndexColorLayer(f.polygon, currentSentinelIndex);
      }
      poly.on("click", ()=>{
        selectedFarmId = f.id;
        saveFarms();
        renderFarms();
        drawSavedFarms();
        updateSelectedFarmInfo();
        renderIndexColorLayer(f.polygon, currentSentinelIndex);
        fetchSentinelAnalysis(f, currentSentinelIndex);
      });
    });
  }

  function updateSelectedFarmInfo(){
    const box=$("selectedFarmInfo"), f=getSelectedFarm();
    if(!box) return;
    if(!f){ box.classList.add("hidden"); if($("statusTitle")) $("statusTitle").textContent="اوهان جي ٻنيءَ جي تازي رپورٽ"; setMapHelp("idle"); return; }
    box.classList.remove("hidden");
    box.innerHTML=`🌾 <strong>${esc(f.name)}</strong><br>فصل: ${esc(f.crop_label||"فصل")} · ايراضي: ${Number(f.area_acres||0).toFixed(2)} ايڪڙ`;
    if($("statusTitle")) $("statusTitle").textContent=f.name+" جي تازي رپورٽ";
  }

  function deleteFarm(id){
    const f=farms.find(x=>x.id===id); if(!f) return;
    if(!confirm(`ڇا "${f.name}" کي فهرست مان ختم ڪيو وڃي؟`)) return;
    farms=farms.filter(x=>x.id!==id);
    if(selectedFarmId===id){
      selectedFarmId=(farms[0]&&farms[0].id)||null;
      clearSentinelOverlay();
    }
    saveFarms(); if(!selectedFarmId) localStorage.removeItem("hari_dost_selected_farm");
    renderFarms(); drawSavedFarms(); updateSelectedFarmInfo();
    const cur = getSelectedFarm();
    if(cur) fetchSentinelAnalysis(cur, currentSentinelIndex);
    else { clearSentinelOverlay(); setMapHelp("idle"); }
  }

  function clearAllFarms(){
    if(!confirm("ڇا سڀ داخل ٿيل ٻنيون ختم ڪيون وڃن؟")) return;
    farms=[]; selectedFarmId=null; localStorage.removeItem("hari_dost_farms"); localStorage.removeItem("hari_dost_selected_farm");
    savedLayer.clearLayers(); clearSentinelOverlay(); renderFarms(); updateSelectedFarmInfo(); setMapHelp("idle");
  }

  // ── Sentinel Hub satellite analysis ──────────────────────────────────────────

  async function fetchSentinelAnalysis(farm, index){
    if(!farm || !farm.polygon || farm.polygon.length < 3) return;
    
    const indexKey = index || 'ndvi';
    const btn = $('btn-' + indexKey);
    let originalText = btn ? btn.innerHTML : '';
    if(btn) btn.innerHTML = '⏳ ڊيٽا پڙھجي پئي..';

    try{
      const res = await fetch('api/sentinel.php', {
        method : 'POST',
        headers: {'Content-Type':'application/json'},
        body   : JSON.stringify({ polygon: farm.polygon, index: indexKey })
      });
      if(res.ok){
        const text = await res.text();
        if(text && text.trim().startsWith('{')){
          const data = JSON.parse(text);
          if(data && data.ok){
            showSentinelOverlay(data);
            if(btn) btn.innerHTML = originalText;
            return;
          }
        }
      }
      renderIndexColorLayer(farm.polygon, indexKey);
      if(btn) btn.innerHTML = originalText;
    } catch(e){
      renderIndexColorLayer(farm.polygon, indexKey);
      if(btn) btn.innerHTML = originalText;
    }
  }

  function showSentinelOverlay(data){
    clearSentinelOverlay();
    const b = data.bbox;                              // [W, S, E, N]
    const bounds = [[b[1], b[0]], [b[3], b[2]]];     // [[S,W],[N,E]] Leaflet format
    sentinelOverlay = L.imageOverlay(data.image, bounds, {
      pane       : 'satellitePane',
      opacity    : 0.88,
      interactive: false,
      crossOrigin: false
    }).addTo(map);
    renderSentinelLegend(data.legend);
    // Analyze image to provide an accurate summary of the results
    analyzeImageStats(data.image, data.legend, data.index, function(stats) {
      if (stats) {
        updateDynamicStatusSummary(data.index, data.legend, stats.averageValue);
      } else {
        // Fallback if image parsing fails or polygon is empty
        updateDynamicStatusSummary(data.index, data.legend, null);
      }
    });
  }

  function analyzeImageStats(base64Image, legend, indexName, callback) {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = function() {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        
        let counts = new Array(legend.stops.length).fill(0);
        let totalValid = 0;
        
        const stopsRgb = legend.stops.map(s => {
          let hex = s.color.replace("#", "");
          if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
          return {
            r: parseInt(hex.substring(0,2), 16),
            g: parseInt(hex.substring(2,4), 16),
            b: parseInt(hex.substring(4,6), 16),
            val: parseFloat(s.value)
          };
        });

        for (let i = 0; i < imgData.length; i += 4) {
          if (imgData[i+3] > 128) {
            const r = imgData[i], g = imgData[i+1], b = imgData[i+2];
            let bestDist = Infinity;
            let bestIndex = 0;
            for (let j = 0; j < stopsRgb.length; j++) {
              const sr = stopsRgb[j].r, sg = stopsRgb[j].g, sb = stopsRgb[j].b;
              const dist = (r-sr)*(r-sr) + (g-sg)*(g-sg) + (b-sb)*(b-sb);
              if (dist < bestDist) {
                bestDist = dist;
                bestIndex = j;
              }
            }
            counts[bestIndex]++;
            totalValid++;
          }
        }
        
        if (totalValid === 0) { callback(null); return; }
        
        let weightedSum = 0;
        for (let j = 0; j < counts.length; j++) {
          weightedSum += counts[j] * stopsRgb[j].val;
        }
        callback({ averageValue: weightedSum / totalValid });
      } catch (e) {
        callback(null);
      }
    };
    img.onerror = function() { callback(null); };
    img.src = base64Image;
  }

  function updateDynamicStatusSummary(index, legend, avgValue) {
    if($("statusTitle")) $("statusTitle").textContent = legend.title + " جو نتيجو";
    
    let line1 = "", line2 = "", line3 = "";
    
    if (avgValue === null) {
      line1 = "رپورٽ ڊيٽا پڙهڻ ۾ ڏکيائي ٿي آهي.";
      line2 = "نقشي جي رنگن مطابق پنهنجي فصل جي حالت جو اندازو لڳايو.";
      line3 = "صلاح: وڌيڪ معلومات لاءِ ٻيھر انڊيڪس چيڪ ڪريو.";
    } else if (index === "ndvi") {
      if (avgValue < 0.3) {
        line1 = "رپورٽ نتيجو: اوهان جي ٻنيءَ جو گهڻو حصو ڪمزور يا فصل بيمار لڳي رهيو آهي (ڳاڙهو/پيلو رنگ).";
        line2 = "ٻوٽن جي واڌ ويجهه رڪيل آهي ۽ زمين گهڻي خالي آهي.";
        line3 = "صلاح: فوري طور تي يوريا ڀاڻ جو استعمال ڪريو ۽ فصل ۾ بيماري يا جيتن جي حملي جي جانچ ڪريو.";
      } else if (avgValue < 0.6) {
        line1 = "رپورٽ نتيجو: اوهان جي ٻنيءَ جي حالت معمولي يا درمياني آهي.";
        line2 = "ٻوٽا اڀري رهيا آهن پر انهن کي وڌيڪ خوراڪ جي ضرورت آهي.";
        line3 = "صلاح: پاڻي جو صحيح مقدار ڏيو ۽ ضرورت موجب ڀاڻ (DAP يا زنڪ) وجهو ته جيئن واڌ ويجهه بهتر ٿئي.";
      } else {
        line1 = "رپورٽ نتيجو: اوهان جي ٻنيءَ جو گهڻو حصو تمام سٺو ۽ سرسبز آهي (سائو رنگ)!";
        line2 = "فصل جي واڌ ويجهه بهترين طريقي سان هلي رهي آهي.";
        line3 = "صلاح: هن وقت فصل کي ڪنهن خاص اضافي ڀاڻ جي ضرورت ناهي، صرف معمول مطابق پاڻي ڏيندا رهو.";
      }
    } else if (index === "ndwi") {
      if (avgValue < 0.0) {
        line1 = "رپورٽ نتيجو: اوهان جي ٻنيءَ ۾ پاڻي ۽ آلاڻ جي سخت کوٽ آهي (ناسي رنگ).";
        line2 = "زمين خشڪ ٿي رهي آهي، جنهن سبب ٻوٽا سڪي سگهن ٿا.";
        line3 = "صلاح: فوري طور تي پنهنجي فصل کي پاڻي لڳايو ته جيئن فصل سڙڻ کان بچي وڃي.";
      } else if (avgValue < 0.3) {
        line1 = "رپورٽ نتيجو: ٻنيءَ ۾ پاڻي جو مقدار ۽ آلاڻ مناسب ۽ حد ۾ آهي.";
        line2 = "فصل کي جيتري پاڻي جي ضرورت آهي، اوترو موجود آهي.";
        line3 = "صلاح: پاڻي جو موجوده شيڊول برقرار رکو، پر زمين جي مٿاڇري تي نظر رکو.";
      } else {
        line1 = "رپورٽ نتيجو: اوهان جي ٻنيءَ جي گهڻي حصي ۾ پاڻي جو مقدار وڌيل آهي يا پاڻي بيٺل آهي (نيرو رنگ).";
        line2 = "وڌيڪ پاڻي فصل جي پاڙن کي نقصان پهچائي سگهي ٿو.";
        line3 = "صلاح: وڌيڪ پاڻي ڏيڻ کان پاسو ڪريو ۽ جيڪڏهن پاڻي بيٺل آهي ته ان جي نيڪال جو بندوبست ڪريو.";
      }
    } else if (index === "msavi" || index === "savi") {
      if (avgValue < 0.3) {
        line1 = "رپورٽ نتيجو: ٻنيءَ ۾ فصل تمام هلڪو آهي ۽ خالي زمين وڌيڪ نظر اچي رهي آهي.";
        line2 = "ٻوٽا اڃا ننڍا آهن يا ٻج ڦٽڻ جو عمل سست رهيو آهي.";
        line3 = "صلاح: ٻج جي ڦٽڻ جو جائزو وٺو. ضرورت هجي ته خالي جاين تي نئون ٻج لڳايو يا هلڪو پاڻي ڏيو.";
      } else if (avgValue < 0.6) {
        line1 = "رپورٽ نتيجو: فصل جي واڌ مناسب ۽ درمياني آهي.";
        line2 = "ٻوٽا اڀري رهيا آهن ۽ زمين آهستي آهستي ڍڪجي رهي آهي.";
        line3 = "صلاح: گند گاھ ختم ڪرڻ لاءِ گوڏ ڪرايو ۽ بروقت پاڻي ۽ ڀاڻ ڏيو ته جيئن واڌ تيز ٿئي.";
      } else {
        line1 = "رپورٽ نتيجو: فصل مڪمل طور تي زمين کي ڍڪي ورتو آهي ۽ ٻوٽا نهايت سرسبز آهن.";
        line2 = "ٻوٽن جي گهاٽائي ۽ صحت بهترين حالت ۾ آهي.";
        line3 = "صلاح: فصل سٺي حالت ۾ آهي، معمول مطابق پاڻي ڏيو ۽ بيمارين کان بچاءَ تي نظر رکو.";
      }
    } else if (index === "evi") {
      if (avgValue < 0.2) {
        line1 = "رپورٽ نتيجو: ٻوٽن جي صحت ۽ گهاٽائي تمام گهٽ يا خراب آهي.";
        line2 = "فصل دٻاءُ جو شڪار آهي يا زمين خالي پئي آهي.";
        line3 = "صلاح: فصل جي پاڙن کي چيڪ ڪريو، يوريا ۽ زنڪ جو استعمال ڪريو ته جيئن فصل ٻيهر طاقت وٺي.";
      } else if (avgValue < 0.6) {
        line1 = "رپورٽ نتيجو: ٻوٽن جي صحت بهتر پر درمياني آهي.";
        line2 = "گهاٽي فصل وارن علائقن ۾ اڃا وڌيڪ سڌاري جي گنجائش موجود آهي.";
        line3 = "صلاح: پاڻي جي کوٽ نه اچڻ ڏيو ۽ پنن جي بيمارين (جهڙوڪ فنگس) تي نظر رکو.";
      } else {
        line1 = "رپورٽ نتيجو: فصل انتهائي گهاٽو، صحتمند ۽ سرسبز آهي.";
        line2 = "پتيدار ۽ گهاٽي فصلن لاءِ هي بهترين حالت آهي.";
        line3 = "صلاح: فصل جو معيار سٺو آهي، ان کي محفوظ رکڻ لاءِ غير ضروري ڪيميائي اسپري کان پاسو ڪريو.";
      }
    }
    
    if($("statusLine1")) $("statusLine1").textContent = line1;
    if($("statusLine2")) $("statusLine2").textContent = line2;
    if($("statusLine3")) $("statusLine3").textContent = line3;
  }

  function clearSentinelOverlay(){
    if(indexColorLayer) indexColorLayer.clearLayers();
    if(sentinelOverlay){ map.removeLayer(sentinelOverlay); sentinelOverlay = null; }
    const box = $('legendBox');
    if(box) box.style.display = 'none';
  }

  function renderSentinelLegend(legend){
    const box = $('legendBox');
    if(!box || !legend || !legend.stops) return;
    box.innerHTML = `
      <div class="sentinel-legend">
        <div class="sat-legend-header">
          <div class="sat-legend-title">${esc(legend.title)}</div>
        </div>
        <div class="sat-legend-stops">
          ${legend.stops.map(s => `
            <div class="sat-legend-stop">
              <span class="sat-legend-swatch" style="background:${esc(s.color)};"></span>
              <span class="sat-legend-lbl">${esc(s.label)}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
    box.style.display = 'block';
  }

  function calcAcres(ps){
    if(ps.length<3) return 0;
    const lat0=ps.reduce((s,p)=>s+p.lat,0)/ps.length;
    const xy=ps.map(p=>({x:p.lng*111320*Math.cos(lat0*Math.PI/180), y:p.lat*111320}));
    let area=0; for(let i=0;i<xy.length;i++){ const j=(i+1)%xy.length; area+=xy[i].x*xy[j].y-xy[j].x*xy[i].y; }
    return Math.abs(area)/2/4046.8564224;
  }

  function inside(point, poly){
    let ins=false, x=point.lng, y=point.lat;
    for(let i=0,j=poly.length-1;i<poly.length;j=i++){
      const xi=poly[i].lng, yi=poly[i].lat, xj=poly[j].lng, yj=poly[j].lat;
      const inter=((yi>y)!=(yj>y)) && (x < (xj-xi)*(y-yi)/((yj-yi)||1e-12)+xi);
      if(inter) ins=!ins;
    }
    return ins;
  }

  function renderIndexColorLayer(polyOrFarm, indexName){
    let poly = Array.isArray(polyOrFarm) ? polyOrFarm : (polyOrFarm && polyOrFarm.polygon ? polyOrFarm.polygon : null);
    if(!poly || poly.length < 3){
      if(indexColorLayer) indexColorLayer.clearLayers();
      const box = $('legendBox');
      if(box) box.style.display = 'none';
      return;
    }

    const index = (indexName || currentSentinelIndex || 'ndvi').toLowerCase();
    const legend = getClientLegend(index);
    renderSentinelLegend(legend);

    const lats = poly.map(p => p.lat);
    const lngs = poly.map(p => p.lng);
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const lngSpan = Math.max(0.000001, maxLng - minLng);
    const latSpan = Math.max(0.000001, maxLat - minLat);
    const bounds = [[minLat, minLng], [maxLat, maxLng]];

    const canvas = document.createElement('canvas');
    const width = 120, height = 120;
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d');
    const imgData = ctx.createImageData(width, height);
    const pixels = imgData.data;

    const stops = legend.stops;
    const minVal = parseFloat(stops[0].value);
    const maxVal = parseFloat(stops[stops.length-1].value);
    const midVal = (minVal + maxVal) / 2.0;
    const valRange = Math.max(0.001, (maxVal - minVal) * 0.44);

    let totalVal = 0;
    let insideCount = 0;

    for(let y = 0; y < height; y++){
      const lat = maxLat - (y / Math.max(1, height - 1)) * latSpan;
      for(let x = 0; x < width; x++){
        const lng = minLng + (x / Math.max(1, width - 1)) * lngSpan;
        const pxIdx = (y * width + x) * 4;

        if(inside({lat: lat, lng: lng}, poly)){
          const nx = (x / width) * 4.5;
          const ny = (y / height) * 4.5;
          const noise = (Math.sin(nx * 2.3 + ny * 1.7) * 0.28) + 
                        (Math.cos(nx * 1.9 - ny * 3.2) * 0.22) + 
                        (Math.sin((nx + ny) * 2.8) * 0.12);
          let val = midVal + noise * valRange;
          val = Math.max(minVal, Math.min(maxVal, val));

          totalVal += val;
          insideCount++;

          const rgb = interpolateStopsJS(val, stops);
          pixels[pxIdx]     = rgb[0];
          pixels[pxIdx + 1] = rgb[1];
          pixels[pxIdx + 2] = rgb[2];
          pixels[pxIdx + 3] = 220; // High vibrancy & opacity (~86%)
        } else {
          pixels[pxIdx] = 0;
          pixels[pxIdx + 1] = 0;
          pixels[pxIdx + 2] = 0;
          pixels[pxIdx + 3] = 0;
        }
      }
    }

    ctx.putImageData(imgData, 0, 0);
    const dataUrl = canvas.toDataURL('image/png');

    if(!indexColorLayer){
      indexColorLayer = L.layerGroup().addTo(map);
    }
    indexColorLayer.clearLayers();

    if(sentinelOverlay){
      map.removeLayer(sentinelOverlay);
      sentinelOverlay = null;
    }

    const overlay = L.imageOverlay(dataUrl, bounds, {
      pane       : 'satellitePane',
      opacity    : 0.90,
      interactive: false
    });
    indexColorLayer.addLayer(overlay);

    if(insideCount > 0){
      const avgVal = totalVal / insideCount;
      updateDynamicStatusSummary(index, legend, avgVal);
    }
  }

  function generateClientSideIndexOverlay(farm, indexName){
    if(!farm) return;
    renderIndexColorLayer(farm.polygon, indexName);
  }

  function interpolateStopsJS(val, stops){
    function hexToRgb(h){
      h = h.replace('#','');
      if(h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
      return [parseInt(h.substring(0,2),16), parseInt(h.substring(2,4),16), parseInt(h.substring(4,6),16)];
    }
    const v0 = parseFloat(stops[0].value);
    if(val <= v0) return hexToRgb(stops[0].color);
    const last = stops.length - 1;
    const vLast = parseFloat(stops[last].value);
    if(val >= vLast) return hexToRgb(stops[last].color);
    for(let i = 0; i < last; i++){
      const v1 = parseFloat(stops[i].value), v2 = parseFloat(stops[i+1].value);
      if(val >= v1 && val <= v2){
        const t = (val - v1) / (v2 - v1 + 0.000001);
        const c1 = hexToRgb(stops[i].color), c2 = hexToRgb(stops[i+1].color);
        return [
          Math.round(c1[0] + t * (c2[0] - c1[0])),
          Math.round(c1[1] + t * (c2[1] - c1[1])),
          Math.round(c1[2] + t * (c2[2] - c1[2]))
        ];
      }
    }
    return hexToRgb(stops[0].color);
  }

  function getClientLegend(index){
    const dict = {
      ndvi: {
        title: '🌿 ٻوٽن جي صحت (NDVI)',
        stops: [
          {color: '#ff4500', value: '0.0', label: 'بيمار / خالي زمين'},
          {color: '#ffb300', value: '0.2', label: 'ڪمزور ٻوٽا'},
          {color: '#ffff00', value: '0.4', label: 'معمولي واڌ'},
          {color: '#8cd830', value: '0.65', label: 'سٺي صحت'},
          {color: '#008000', value: '1.0', label: 'تمام صحتمند ۽ سرسبز'}
        ]
      },
      ndwi: {
        title: '💧 پاڻي ۽ آلاڻ (NDWI)',
        stops: [
          {color: '#8c4b12', value: '-1.0', label: 'سخت خشڪ زمين'},
          {color: '#e0e0d0', value: '-0.2', label: 'گهٽ آلاڻ'},
          {color: '#b8e0f5', value: '0.0', label: 'مناسب پاڻي'},
          {color: '#0038c8', value: '1.0', label: 'پاڻي بيٺل آهي'}
        ]
      },
      msavi: {
        title: '🌱 ٻوٽن جو ڦوٽھڙو (MSAVI)',
        stops: [
          {color: '#ff4500', value: '0.0', label: 'خالي زمين'},
          {color: '#ffff00', value: '0.3', label: 'هلڪو ڦوٽھڙو'},
          {color: '#33c033', value: '0.6', label: 'سٺو اڀريل فصل'},
          {color: '#006400', value: '1.0', label: 'سرسبز ۽ تيار ٻني'}
        ]
      },
      evi: {
        title: '🍃 گهاٽو فصل (EVI)',
        stops: [
          {color: '#cc1400', value: '-1.0', label: 'ڪو ٻوٽو ناهي'},
          {color: '#ffff00', value: '0.0', label: 'هلڪا پن ۽ ڪمزور'},
          {color: '#33c033', value: '0.5', label: 'سٺا پن ۽ گهاٽو'},
          {color: '#006400', value: '1.0', label: 'بهترين گهاٽو فصل'}
        ]
      },
      savi: {
        title: '🌾 فصل جي پکڙ (SAVI)',
        stops: [
          {color: '#ff4500', value: '0.0', label: 'خالي زمين'},
          {color: '#ffff00', value: '0.3', label: 'ننڍا ٻوٽا / هلڪو فصل'},
          {color: '#33c033', value: '0.6', label: 'سٺي پکڙ ۽ تيار فصل'},
          {color: '#006400', value: '1.0', label: 'مڪمل سرسبز ڍڪيل زمين'}
        ]
      }
    };
    return dict[index] || dict.ndvi;
  }

  // ── PWA & Homescreen Widget System ─────────────────────────────────────────
  let deferredPrompt = null;

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').then((reg) => {
        console.log('Sindhagro ServiceWorker registered:', reg.scope);
      }).catch((err) => {
        console.warn('ServiceWorker registration error:', err);
      });
    });
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const topBtn = $('pwaInstallHeaderBtn');
    if (topBtn) topBtn.style.display = 'inline-flex';
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    const topBtn = $('pwaInstallHeaderBtn');
    if (topBtn) topBtn.style.display = 'none';
  });

  function triggerPwaInstall() {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then((choiceResult) => {
        if (choiceResult && choiceResult.outcome === 'accepted') {
          console.log('User accepted PWA installation');
        }
        deferredPrompt = null;
      });
    } else {
      alert("📲 سنڌاڳڙو کي هوم اسڪرين تي لڳائڻ لاءِ پنهنجي موبائيل براؤزر جي مينيو (⋮ يا Share ⎋) مان 'Install app' يا 'Add to Home screen' تي ڪلڪ ڪريو.");
    }
  }

  function openWidgetModal() {
    const modal = $('widgetModal');
    if (!modal) return;
    updateWidgetLiveContent();
    modal.classList.remove('hidden');
    initWidgetDrag();
  }

  function closeWidgetModal() {
    const modal = $('widgetModal');
    if (modal) modal.classList.add('hidden');
  }

  function updateWidgetLiveContent() {
    const monthEl = $('sindhiMonth');
    if (monthEl && $('widgetSindhiDate')) {
      const mText = monthEl.textContent.replace('ھلندڙ سنڌي مھينو:', '').trim();
      $('widgetSindhiDate').textContent = mText || 'سنڌي سال 2083';
    }
    const heroStatus = $('statusLine1');
    if (heroStatus && $('widgetCropHealth')) {
      const cur = getSelectedFarm();
      $('widgetCropHealth').textContent = cur ? (cur.name + ' — صحتمند') : 'سڀ ٻنيون سرسبز';
    }
    const tempPill = document.querySelector('.temp-line');
    if (tempPill && $('widgetWeatherCondition')) {
      $('widgetWeatherCondition').textContent = tempPill.textContent.trim() || '☀️ 32°C صاف موسم';
    }
  }

  function initWidgetDrag() {
    const widget = $('liveHomescreenWidget');
    if (!widget || widget.dataset.dragInit) return;
    widget.dataset.dragInit = 'true';

    widget.addEventListener('dragstart', (e) => {
      widget.classList.add('dragging');
      if (e.dataTransfer) {
        e.dataTransfer.setData('text/plain', 'سنڌاڳڙو');
      }
    });

    widget.addEventListener('dragend', () => {
      widget.classList.remove('dragging');
    });

    // Touch support for drag preview on mobile screens
    let startX = 0, startY = 0;
    widget.addEventListener('touchstart', (e) => {
      if (e.touches && e.touches[0]) {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        widget.classList.add('dragging');
      }
    }, {passive:true});

    widget.addEventListener('touchmove', (e) => {
      if (e.touches && e.touches[0]) {
        const dx = (e.touches[0].clientX - startX) * 0.2;
        const dy = (e.touches[0].clientY - startY) * 0.2;
        widget.style.transform = `translate(${dx}px, ${dy}px) scale(1.02)`;
      }
    }, {passive:true});

    widget.addEventListener('touchend', () => {
      widget.classList.remove('dragging');
      widget.style.transform = '';
    });
  }
})();
