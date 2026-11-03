'use strict';

const LOCAL_PREVIEW_DATA=null;
let feed={features:[],changes:[],mode:'public'},map=null,ready=false,overlay=false,activePopup=null;
const sourceId='crafl-data', layerIds=['crafl-fill','crafl-polygon-borders','crafl-lines','crafl-points'];
const categories={restrictions:'#E32219',access:'#df922e',pedestrians:'#21896e',parking:'#2d73b5',services:'#7676b0'};
const inicio=Date.parse('2026-11-04T00:00:00-03:00'),fin=Date.parse('2026-11-12T23:30:00-03:00'),step=1800000;
const slider=document.getElementById('slider');slider.max=Math.floor((fin-inicio)/step);slider.value=Math.max(0,Math.min(Number(slider.max),Math.floor((Date.now()-inicio)/step)));
const momentfmt=new Intl.DateTimeFormat('es-AR',{timeZone:'America/Argentina/Buenos_Aires',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
const inputfmt=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&quot;'}[c]));
const cleanURL=x=>{try{let u=new URL(String(x||''));return /^https?:$/.test(u.protocol)?u.href:''}catch{return''}};
function category(f){let l=String(f.properties?.layer||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');const n=String(f.properties?.name||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');if(n.includes('punto de control'))return'access';if(l.startsWith('01')||l.includes('perimetro'))return'restrictions';if(l.startsWith('03')||l.includes('recorrido'))return'pedestrians';if(l.startsWith('04')||/puntos? clave/.test(l))return'services';if(l.startsWith('05')||l.includes('estacionamiento'))return'parking';if(n.includes('punto de control'))return'access';if(/corte|cierre|restriccion/.test(n))return'restrictions';return'access'}
const index=()=>new Map(feed.features.map(f=>[String(f.properties.id),f]));
function instant(date,time){if(!/^\d{4}-\d\d-\d\d$/.test(String(date))||!/^\d\d:\d\d$/.test(String(time)))return NaN;return Date.parse(date+'T'+time+':00-03:00')}
function nowSelected(){return inicio+Number(slider.value)*step}
function getState(f,t){const list=feed.changes.filter(c=>String(c.feature)===String(f.properties.id)&&Number.isFinite(instant(c.date,c.time))&&instant(c.date,c.time)<=t).sort((a,b)=>instant(a.date,a.time)-instant(b.date,b.time));const last=list.at(-1);if(!last)return null;const selectedDay=inputfmt.format(new Date(t)).slice(0,10);if(feed.changes.some(c=>String(c.feature)===String(f.properties.id)&&!c.time&&c.date>=last.date&&c.date<=selectedDay))return null;if(last.endDate&&last.endTime){const stop=instant(last.endDate,last.endTime);if(Number.isFinite(stop)&&t>=stop)return null}return last}
function continuityUnknown(state,t=nowSelected()){return !!state&&!state.endDate&&t>=instant('2026-11-12','00:00')}
function continuityNotice(t=nowSelected()){return t>=instant('2026-11-12','00:00')?'<div class="continuityNotice"><b>Jueves 12: continuidad sin confirmar</b><p>El municipio no publicó una fecha de finalización para varias medidas del operativo. Los elementos grises muestran el último estado anunciado; no confirman que el corte o servicio especial siga vigente, ni que haya finalizado. Consultá los canales municipales antes de circular.</p></div>':''}
function filter(cat){return document.querySelector('[data-cat="'+cat+'"]')?.checked!==false}

// Each entry supplies the name, colour and 24-unit pictogram used by both map and key.
const symbols={
 unknown:['Continuidad sin confirmar','#777d83','M8 8Q8 4 12 4Q17 4 17 8Q17 11 12 13V15M12 19h.1'],
 taxi:['Parada de taxis','#92600b','M5 10L7 6H17L19 10V17H5ZM5 11H19M8 17V19M16 17V19M10 6V4H14V6'],
 closed:['Corte','#ad302c','M7 7L17 17M17 7L7 17'],
 control:['Punto de control','#92600b','M4 9H20V14H4ZM6 14V19M18 14V19M8 9L5 14M14 9L11 14M20 9L17 14'],
 open:['Circulación normal','#317047','M5 12L10 17L19 7'],
 walk:['Paso peatonal','#24725b','M13 5h.1M9 12l3-4 3 4 3 1M12 9l-1 6-4 5M11 14l4 2 1 4'],
 health:['Centro de salud','#237d59','M9 5H15V9H19V15H15V19H9V15H5V9H9Z'],
 train:['Ferrocarril','#285d90','M7 5H17V16H7ZM7 11H17M9 16L6 20M15 16L18 20M8 18H16'],
 bus:['Ómnibus','#285d90','M5 6Q12 3 19 6V17H5ZM5 12H19M8 17V19M16 17V19'],
 parking:['Estacionamiento','#285d90','M9 19V5H14Q20 5 18 11Q17 14 9 13'],
 shop:['Venta de productos','#087b81','M4 10L6 5H18L20 10ZM6 11V19H18V11M10 19V14H14V19'],
 event:['Escenario o misa','#743f83','M12 4L14.5 9L20 10L16 14L17 20L12 17L7 20L8 14L4 10L9.5 9Z'],
 site:['Sede o referencia','#585281','M5 11L12 5L19 11M7 10V19H17V10M11 19V14H14V19']
};
function symbolFor(f){
 const n=f.properties.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
 if(n.includes('punto de control'))return 'control';
 if(/cierre|corte/.test(n))return 'closed';
 if(n.includes('circulacion normal'))return 'open';
 if(n.includes('peatonal'))return 'walk';
 if(/caps|hospital|clinica|policlinico/.test(n))return 'health';
 if(n.includes('ferrocarril'))return 'train';
 if(n.includes('omnibus'))return 'bus';
 if(n.includes('taxis'))return 'taxi';
 if(n.includes('venta de productos'))return 'shop';
 if(n.includes('estacionamiento'))return 'parking';
 if(/escenario|misas?/.test(n))return 'event';
 return 'site';
}
function registerSymbols(){
 const key=document.getElementById('keyItems');
 for(const [id,[label,color,path]] of Object.entries(symbols)){
  if(map.hasImage('crafl-'+id))continue;
  const c=document.createElement('canvas');c.width=c.height=64;
  const g=c.getContext('2d');g.scale(64/24,64/24);g.beginPath();g.arc(12,12,11,0,2*Math.PI);g.fillStyle=color;g.fill();g.lineWidth=1.5;g.strokeStyle='white';g.stroke();
  g.translate(2,2);g.scale(.83,.83);g.lineJoin=g.lineCap='round';g.lineWidth=2;g.stroke(new Path2D(path));
  map.addImage('crafl-'+id,g.getImageData(0,0,64,64),{pixelRatio:2});
  if(!key.querySelector('[data-symbol="'+id+'"]')){
   const row=document.createElement('span');row.className='keyItemsRow';row.dataset.symbol=id;
   const img=new Image();img.alt='';img.src=c.toDataURL();row.append(img,label);key.append(row);
  }
 }
 if(!key.querySelector('i'))key.insertAdjacentHTML('beforeend','<span class="keyItemsRow"><i style="background:#21896e"></i>Recorrido peatonal</span><span class="keyItemsRow"><i class="zone" style="border:2px dashed #E32219"></i>Zona Cero</span><span class="keyItemsRow"><i class="zone" style="border:2px dashed #6b6eb3;background:#edecf6"></i>Zona de influencia</span><span class="keyItemsRow"><i style="background:#005da5"></i>Corte en zona de influencia</span><span class="keyItemsRow"><i style="background:#E32219"></i>Tramo con corte</span>');
}

function shownAt(f,state){
 if(!f.geometry||!filter(category(f)))return false;
 if(['IM-014','IM-015'].includes(String(f.properties.id)))return nowSelected()<instant('2026-11-12','00:00')&&feed.features.some(other=>['IM-012','IM-013'].includes(String(other.properties.id))&&getState(other,nowSelected()));
 if(state)return true;
 if(/caps|hospital|clínica|clinica|policlínico|policlinico|cic san ferm/i.test(f.properties.name))return true;
 if(feed.changes.some(c=>String(c.feature)===String(f.properties.id)&&Number.isFinite(instant(c.date,c.time))))return false;
 if(symbolFor(f)==='control')return true; return !/corte|cierre/i.test(f.properties.name);
}
function normalizedFeatures(){
 const features=[];
 for(const f of feed.features){
  const state=getState(f,nowSelected());
  if(!shownAt(f,state))continue;
  const name=f.properties.name||'';
  let zoneColor=null;
  if(/zona\s*(?:cero|0)\b/i.test(name))zoneColor='#E32219';
  else if(/influencia/i.test(name))zoneColor=/corte|cierre/i.test(name)?'#005da5':'#6b6eb3';
  const uncertain=continuityUnknown(state);
  const color=uncertain?'#858b90':zoneColor||(state?(/cierre|corte/i.test(state.state)?'#E32219':/peatonal/i.test(state.state)?'#21896e':'#b66a09'):null);
  features.push({type:'Feature',geometry:f.geometry,properties:{...f.properties,category:category(f),active:!!state&&!uncertain,symbol:'crafl-'+(uncertain?'unknown':state&&/corte|cierre/i.test(state.state)&&f.geometry.type==='Point'?'closed':symbolFor(f)),stateColor:color}});
 }
 return features;
}
const layerColor=['coalesce',['get','stateColor'],['match',['get','category'],'restrictions','#E32219','access','#df922e','pedestrians','#21896e','parking','#2d73b5','services','#7676b0','#727b83']];
function installOverlay(){if(!map||!ready)return false;
 if(!map.getSource(sourceId))map.addSource(sourceId,{type:'geojson',data:{type:'FeatureCollection',features:[]}});
 const typ=['geometry-type'];
 if(!map.getLayer('crafl-fill'))map.addLayer({id:'crafl-fill',source:sourceId,type:'fill',filter:['==',typ,'Polygon'],paint:{'fill-color':layerColor,'fill-opacity':['case',['get','active'],0.14,0.07]}});
 if(!map.getLayer('crafl-polygon-borders'))map.addLayer({id:'crafl-polygon-borders',source:sourceId,type:'line',filter:['==',typ,'Polygon'],paint:{'line-color':layerColor,'line-width':2.5,'line-dasharray':[2,2],'line-opacity':.95}});
 if(!map.getLayer('crafl-lines'))map.addLayer({id:'crafl-lines',source:sourceId,type:'line',filter:['any',['==',typ,'LineString'],['==',typ,'MultiLineString']],paint:{'line-color':layerColor,'line-width':['case',['get','active'],5,3.5],'line-opacity':.95}});
 registerSymbols();
 if(!map.getLayer('crafl-points'))map.addLayer({id:'crafl-points',source:sourceId,type:'symbol',filter:['==',typ,'Point'],layout:{'icon-image':['get','symbol'],'icon-offset':['case',['==',['get','symbol'],'crafl-taxi'],['literal',[36,0]],['literal',[0,0]]],'icon-size':['interpolate',['linear'],['zoom'],10,.62,13,.88,16,1.1],'icon-allow-overlap':true,'icon-ignore-placement':true}});
 overlay=true;return true;
}
function syncMap(){if(!ready||!map)return;try{if(installOverlay()){map.getSource(sourceId).setData({type:'FeatureCollection',features:normalizedFeatures()});document.getElementById('mapnotice').textContent=nowSelected()>=instant('2026-11-12','00:00')?'12/11: los elementos grises tienen continuidad sin confirmar.':feed.features.length && !feed.changes.length ? 'Solo referencias geográficas. Todavía no hay horarios publicados.' : feed.features.length?(matchMedia('(hover: hover) and (pointer: fine)').matches&&!matchMedia('(max-width:800px)').matches?'Pasá el cursor por un punto, línea o zona.':'Tocá un punto, línea o zona.'):'Sin ubicaciones habilitadas para mostrar.';}}catch(e){document.getElementById('mapnotice').textContent='No se pudo mostrar la información en el mapa. Probá Actualizar.';console.error(e)}}
const guidePanel=document.getElementById('guidePanel');
const days=document.getElementById('guideDays');
const dayLabel=new Intl.DateTimeFormat('es-AR',{weekday:'long',day:'numeric',month:'long',timeZone:'America/Argentina/Buenos_Aires'});
let guideScroll=0,loadedGuide=false;
for(let t=inicio;t<=fin;t+=86400000){
 const day=inputfmt.format(new Date(t)).slice(0,10),btn=document.createElement('button');
 btn.textContent=dayLabel.format(t).slice(0,3).toUpperCase()+' '+Number(day.slice(8));btn.dataset.day=day;btn.setAttribute('aria-label',dayLabel.format(t));
 btn.onclick=()=>{slider.value=(t-inicio)/step;render();guidePanel.scrollTop=0};days.append(btn);
}
const recommendationsPanel=document.getElementById('recommendationsPanel');
let recommendationsScroll=0;
function setView(view){
 if(typeof view==='boolean')view=view?'guide':'map';
 if(!guidePanel.hidden)guideScroll=guidePanel.scrollTop;
 if(!recommendationsPanel.hidden)recommendationsScroll=recommendationsPanel.scrollTop;
 document.body.classList.toggle('readGuide',view==='guide');
 document.body.classList.toggle('readRecommendations',view==='recommendations');
 guidePanel.hidden=view!=='guide';recommendationsPanel.hidden=view!=='recommendations';
 document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===view)));
 activePopup?.remove();activePopup=null;document.getElementById('mapDetail').hidden=true;
 if(view==='guide'){drawGuide();guidePanel.scrollTop=guideScroll}
 else if(view==='recommendations'){drawGeneralInfo();recommendationsPanel.scrollTop=recommendationsScroll}
 else map?.resize();
}
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));
function drawGeneralInfo(){
 const info=feed.features.filter(f=>!f.geometry&&!feed.changes.some(c=>String(c.feature)===String(f.properties.id))).map(f=>'<article class="guideCard"><h4>'+esc(f.properties.name)+'</h4><p>'+esc(f.properties.description)+'</p>'+sourceLink(f.properties.sourceUrl)+'</article>').join('');
 const general=document.getElementById('generalContent');
 if(general.dataset.content!==info){general.innerHTML=info;general.dataset.content=info;}
 document.getElementById('generalInfo').hidden=!info;
}
function clearNotice(period){
 return '<div class="clearNotice"><strong>Sin restricciones programadas</strong><p>El cronograma de la filial no registra cortes '+period+'.</p></div>';
}
function dateNotices(day){
 const latest=new Map();
 for(const c of feed.changes){
  if(c.time||c.date>day||(c.endDate&&c.endDate<day))continue;
  const previous=latest.get(String(c.feature));
  if(!previous||previous.date<=c.date)latest.set(String(c.feature),c);
 }
 return [...latest.values()];
}
const sectorReferences={'IM-044':'IM-003','IM-046':'IM-049'};
function mapReference(f){return f.geometry?String(f.properties.id):sectorReferences[f.properties.id]||''}
function sourceLink(url){const href=cleanURL(url);return href?'<a class="link" href="'+esc(href)+'" target="_blank" rel="noopener noreferrer">Consultar fuente municipal</a>':'';}
function drawGuide(){
 if(guidePanel.hidden)return;
 const day=inputfmt.format(new Date(nowSelected())).slice(0,10),start=instant(day,'00:00'),byId=index();
 document.getElementById('guideTitle').textContent=dayLabel.format(start);
 for(const b of days.children)b.setAttribute('aria-pressed',String(b.dataset.day===day));
 const today=feed.changes.filter(c=>c.date===day&&c.time).sort((a,b)=>a.time.localeCompare(b.time));
 const earlier=feed.features.map(f=>getState(f,start)).filter(c=>c&&c.date<day);
 function section(title,rows,prior){
  if(!rows.length)return '';
  const groups=new Map(),tones=new Map();
  for(const c of rows){
   if(['IM-005','IM-007','IM-009','IM-010','IM-011'].includes(String(c.feature)))continue;
   const f=byId.get(String(c.feature));if(!f)continue;
   const label=/puente/i.test(f.properties.name)?'Puentes sobre el río Luján':f.properties.layer;
   const group=(prior?'':c.time+' h · ')+label;
   tones.set(group,/puente/i.test(label)?'bridges':category(f));if(!groups.has(group))groups.set(group,[]);
   const target=mapReference(f);const jump=target?' <button class="guideLink" data-place="'+esc(target)+'" data-at="'+(prior?start:instant(c.date,c.time))+'">'+(f.geometry?'Ver en el mapa':'Ver sector en el mapa')+'</button>':'';
   groups.get(group).push('<p><b>'+esc(f.properties.name)+'</b> · '+esc(c.state)+(prior?' <small>desde el '+esc(c.date.slice(8))+'/'+esc(c.date.slice(5,7))+'</small>':'')+jump+'</p>');
   if(f.properties.description)groups.get(group).push('<details><summary>Detalle y fuente municipal</summary><p>'+esc(f.properties.description)+'</p>'+sourceLink(c.sourceUrl||f.properties.sourceUrl)+'</details>');
  }
  return '<h3>'+title+'</h3>'+Array.from(groups,([k,v])=>'<article class="guideCard '+tones.get(k)+'"><h4>'+esc(k)+'</h4>'+v.join('')+'</article>').join('');
 }
 const notices=dateNotices(day).map(c=>{const f=byId.get(String(c.feature));return f?'<article class="guideCard '+category(f)+'"><h4>'+esc(f.properties.name)+'</h4><p>'+esc(c.state)+'</p><small>Fecha anunciada: '+esc(c.date.slice(8))+'/'+esc(c.date.slice(5,7))+'. Sin hora exacta publicada.</small></article>':'';}).join('');
 const scheduled=section('Cambios del día',today,false)+(earlier.length?'<section class="continuing">'+section(start>=instant('2026-11-12','00:00')?'Últimos estados publicados · continuidad sin confirmar':'Continúa de días anteriores',earlier,true)+'</section>':'');
 document.getElementById('guideContent').innerHTML=!loadedGuide?'Cargando información…':continuityNotice(start)+(scheduled||(!notices?clearNotice('para este día'):'<p>No hay otros cambios con hora exacta publicados para este día.</p>'))+(notices?'<h3>Avisos por fecha, sin hora exacta publicada</h3>'+notices:'');
}

guidePanel.onclick=e=>{
 const b=e.target.closest('[data-place]');if(!b)return;
 const f=index().get(b.dataset.place);if(!f)return;
 document.querySelector('[data-cat="'+category(f)+'"]').checked=true;
 slider.value=(Number(b.dataset.at)-inicio)/step;setView(false);render();
 document.querySelector('.mapbox').scrollIntoView({block:'nearest'});
 if(ready)focus(b.dataset.place);else map?.once('load',()=>focus(b.dataset.place));
};
function detail(f,center){
 document.getElementById('mapDetail').hidden=true;activePopup?.remove();activePopup=null;
 if(matchMedia('(max-width:800px)').matches){activePopup?.remove();activePopup=new maplibregl.Popup({maxWidth:'325px'}).setLngLat(center).setHTML(popupHTML(f)).addTo(map);return}
 const panel=document.getElementById('mapDetail');panel.hidden=false;panel.innerHTML='<button aria-label="Cerrar detalle">Cerrar</button>'+popupHTML(f);panel.querySelector('button').onclick=()=>panel.hidden=true;
}

function render(){
 activePopup?.remove();activePopup=null;
 document.getElementById('mapDetail').hidden=true;drawGuide();drawGeneralInfo();
 slider.style.setProperty('--progress',(100*(slider.value-slider.min)/(slider.max-slider.min))+'%');
 const t=nowSelected(),day=inputfmt.format(new Date(t)).slice(0,10);
 document.getElementById('moment').textContent=momentfmt.format(new Date(t));
 document.querySelectorAll('[data-moment]').forEach(b=>b.setAttribute('aria-pressed',String(day===b.dataset.moment.slice(0,10))));
 const active=[];let visible=0;
 for(const f of feed.features){const state=getState(f,t);if(!filter(category(f)))continue;if(shownAt(f,state))visible++;if(state)active.push({f,state});}
 document.getElementById('events').previousElementSibling.textContent=day>='2026-11-12'?'Últimos estados publicados':'Medidas y servicios a esta hora';
 const els=document.getElementById('events');
 els.innerHTML=active.length?active.sort((a,b)=>a.f.properties.name.localeCompare(b.f.properties.name,'es')).map(({f,state})=>'<'+(mapReference(f)?'button':'div')+' class="entry'+(continuityUnknown(state,t)?' uncertain':'')+'"'+(mapReference(f)?' data-id="'+esc(mapReference(f))+'"':'')+'><b>'+esc(f.properties.name)+'</b><span>'+esc(state.state)+' · desde '+esc(state.date)+' '+esc(state.time)+'</span></'+(mapReference(f)?'button':'div')+'>').join(''):(loadedGuide?clearNotice('para esta fecha y hora'):'<div class="empty">Consultando la información…</div>');
 els.insertAdjacentHTML('afterbegin',continuityNotice(t));
 const notices=dateNotices(day).filter(c=>{const f=index().get(String(c.feature));return f&&filter(category(f));});
 if(notices.length)els.innerHTML+='<div class="info">Hay '+notices.length+' avisos por fecha sin hora exacta publicada. Consultalos en Guía por día.</div>';
 els.querySelectorAll('[data-id]').forEach(el=>el.addEventListener('click',()=>focus(el.dataset.id)));
 syncMap();
}

function relatedNotices(f){return Object.entries(sectorReferences).filter(([,target])=>target===String(f.properties.id)).map(([id])=>{const related=index().get(id),state=related&&getState(related,nowSelected());if(!state)return '';return '<div class="relatedNotice"><h4>'+esc(related.properties.name)+'</h4><p>'+esc(state.state)+'</p><p>'+esc(related.properties.description)+'</p>'+sourceLink(state.sourceUrl||related.properties.sourceUrl)+'</div>'}).join('')}
function popupHTML(f){const state=getState(f,nowSelected());const p=f.properties;const href=cleanURL(state?state.sourceUrl:p.sourceUrl);let val=`<h3>${esc(p.name)}</h3><span class="tag">${esc(state?state.state:'Referencia geográfica')}</span>`;if(continuityUnknown(state))val+='<p><b>Continuidad sin confirmar para esta fecha.</b> Este es el último estado publicado por el municipio.</p>';if(state)val+='<p>Anunciado desde el '+esc(state.date.slice(8))+'/'+esc(state.date.slice(5,7))+' a las '+esc(state.time)+' h</p>';if(p.description)val+=`<p>${esc(p.description)}</p>`;if(href&&!/^https?:\/\/(www\.)?cruzroja\.org\.ar\/?$/i.test(href))val+=`<p><a href="${esc(href)}" target="_blank" rel="noopener noreferrer">Consultar fuente</a></p>`;return val+relatedNotices(f);}
let hoveredFeatureId=null;
function onMapHover(e){
 if(!ready||!matchMedia('(hover: hover) and (pointer: fine)').matches||matchMedia('(max-width:800px)').matches||e.originalEvent?.buttons)return;
 const layers=layerIds.filter(id=>map.getLayer(id));
 const hit=layers.length?map.queryRenderedFeatures(e.point,{layers})[0]:null;
 const id=hit?.properties?.id, f=id==null?null:index().get(String(id));
 map.getCanvas().style.cursor=f?'pointer':'';
 if(!f){hoveredFeatureId=null;return}
 if(hoveredFeatureId===String(id)&&!document.getElementById('mapDetail').hidden)return;
 hoveredFeatureId=String(id);detail(f,e.lngLat);
}
function onClick(e){const feature=e.features?.[0];if(!feature)return;const f=index().get(String(feature.properties?.id));if(!f)return;detail(f,e.lngLat)}
function bboxOf(features){let bb=[Infinity,Infinity,-Infinity,-Infinity];const walk=c=>{if(!Array.isArray(c))return;if(typeof c[0]==='number'&&typeof c[1]==='number'){bb[0]=Math.min(bb[0],c[0]);bb[1]=Math.min(bb[1],c[1]);bb[2]=Math.max(bb[2],c[0]);bb[3]=Math.max(bb[3],c[1]);}else for(const x of c)walk(x)};features.forEach(f=>walk(f.geometry?.coordinates));return bb.every(Number.isFinite)?bb:null}
function fitAll(){if(!map||!ready||!feed.features.length)return;const b=bboxOf(feed.features);if(b)map.fitBounds([[b[0],b[1]],[b[2],b[3]]],{padding:48,maxZoom:13,duration:500})}
function focus(id){if(!ready||!map)return;const f=index().get(String(id));if(!f)return;const b=bboxOf([f]);if(b){if(b[0]===b[2]&&b[1]===b[3])map.flyTo({center:[b[0],b[1]],zoom:14,duration:400});else map.fitBounds([[b[0],b[1]],[b[2],b[3]]],{padding:50,maxZoom:14,duration:400});const center=[(b[0]+b[2])/2,(b[1]+b[3])/2];detail(f,center)}}
function setup(){if(typeof maplibregl==='undefined'){document.getElementById('mapnotice').textContent='No se pudo cargar el mapa. Revisá tu conexión.';return}map=new maplibregl.Map({container:'map',style:'https://tiles.openfreemap.org/styles/liberty',center:[-59.119,-34.561],zoom:13.4,attributionControl:true});map.addControl(new maplibregl.NavigationControl(),'top-right');map.on('load',()=>{ready=true;syncMap();});map.on('style.load',()=>{ready=true;syncMap()});map.on('error',e=>{console.warn('Error cartográfico',e?.error||e)});map.on('mousemove',onMapHover);map.getCanvas().addEventListener('mouseleave',()=>{hoveredFeatureId=null;map.getCanvas().style.cursor=''});layerIds.forEach(id=>{map.on('click',id,onClick);map.on('mouseenter',id,()=>map.getCanvas().style.cursor='pointer');map.on('mouseleave',id,()=>map.getCanvas().style.cursor='')});if(typeof ResizeObserver!=='undefined')new ResizeObserver(()=>map.resize()).observe(document.querySelector('.mapbox'));window.addEventListener('resize',()=>map.resize());}
function normalizeWholeDays(changes){
 return changes.map(original=>{
  const c={...original};
  if(!c.time&&/^\d{4}-\d\d-\d\d$/.test(c.date)){c.time='00:00';c.condition='Anunciado por día completo';}
  if(c.endDate&&!c.endTime&&/^\d{4}-\d\d-\d\d$/.test(c.endDate)){const end=new Date(c.endDate+'T00:00:00Z');end.setUTCDate(end.getUTCDate()+1);c.endDate=end.toISOString().slice(0,10);c.endTime='00:00';}
  return c;
 });
}
function receive(data){if(!data||!Array.isArray(data.features)||!Array.isArray(data.changes))throw Error('La información recibida no está disponible.');/* Apps Script returns objects from another frame. Recreate the GeoJSON in this frame for MapLibre workers. */ feed=JSON.parse(JSON.stringify(data));feed.changes=normalizeWholeDays(feed.changes);loadedGuide=true;document.getElementById('loadStatus').textContent=feed.mode==='test'?`Simulación: ${feed.features.length} ubicaciones`:``;document.getElementById('updated').textContent='Consulta de información: '+momentfmt.format(new Date())+' (hora argentina).';render();}
let pendingPublicRequest=null;
function load(){
 if(pendingPublicRequest)return;
 const status=document.getElementById('loadStatus');status.textContent='Actualizando datos.';
 const script=document.createElement('script');let timer;
 function cleanup(){clearTimeout(timer);script.remove();pendingPublicRequest=null;window.craflReceiveData=()=>{};}
 window.craflReceiveData=data=>{cleanup();try{if(data?.error)throw Error(data.error);receive(data)}catch(error){status.textContent='No se pudo actualizar. '+(loadedGuide?'Se conserva la última consulta. ':'')+error.message}};
 script.onerror=()=>{cleanup();status.textContent='No se pudo actualizar la información. '+(loadedGuide?'Se conserva la última consulta.':'Probá Actualizar.');};
 timer=setTimeout(()=>{cleanup();status.textContent='La consulta tardó demasiado. Probá Actualizar.';},30000);
 pendingPublicRequest=script;script.src='https://script.google.com/macros/s/AKfycbytuf2FDVj3yo55B_Uacbj_APKuLDzChSu_ESRnXTBb3xk3_1pyzmw83LXI7jF1HLA9/exec?action=public-data&t='+Date.now();document.head.appendChild(script);
}



let mapBootstrapDone=false;
function mapBootstrapFailed(){
 document.getElementById('mapnotice').textContent='No fue posible cargar el mapa base. Probá actualizar o abrirlo desde otro navegador.';
 document.getElementById('loadStatus').textContent=feed.features.length?'Datos cargados: '+feed.features.length+' ubicaciones (mapa temporalmente no disponible)':'No se pudo cargar el mapa base';
}
function startMapOnce(){
 if(mapBootstrapDone)return;
 if(typeof maplibregl==='undefined'){mapBootstrapFailed();return}
 try {setup();mapBootstrapDone=true;}
 catch(e){console.error('Error al inicializar el mapa:',e);document.getElementById('mapnotice').textContent='No se pudo iniciar el mapa. Probá Actualizar.';}
}
function loadMapEngine(){

 const style=document.createElement('link');style.rel='stylesheet';style.href='https://cdn.jsdelivr.net/npm/maplibre-gl@5.24.0/dist/maplibre-gl.css';document.head.appendChild(style);
 const urls=['https://cdn.jsdelivr.net/npm/maplibre-gl@5.24.0/dist/maplibre-gl.js','https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.js'];
 let index=0;
 function next(){
  if(typeof maplibregl!=='undefined'){startMapOnce();return}
  if(index>=urls.length){mapBootstrapFailed();return}
  const u=urls[index++], node=document.createElement('script');node.async=true;node.src=u;
  let finished=false;
  const timeout=setTimeout(()=>{if(finished)return;finished=true;node.remove();console.warn('Tiempo de espera agotado para '+u);next()},9000);
  node.onload=()=>{if(finished)return;finished=true;clearTimeout(timeout);if(typeof maplibregl==='undefined')next();else startMapOnce()};
  node.onerror=()=>{if(finished)return;finished=true;clearTimeout(timeout);console.warn('Biblioteca cartográfica no disponible: '+u);next()};
  document.head.appendChild(node);
 }
 next();
}
slider.addEventListener('input',render);document.querySelectorAll('[data-cat]').forEach(e=>e.addEventListener('change',render));document.querySelectorAll('[data-moment]').forEach(e=>e.addEventListener('click',()=>{const v=e.dataset.moment;const t=instant(v.slice(0,10),v.slice(11));if(Number.isFinite(t)){slider.value=Math.round((t-inicio)/step);render()}}));document.getElementById('center').addEventListener('click',()=>map?.flyTo({center:[-59.119,-34.561],zoom:13,duration:500}));document.getElementById('fit').addEventListener('click',fitAll);document.getElementById('refresh').addEventListener('click',load);setView(matchMedia('(max-width:800px)').matches);render();load();loadMapEngine();setInterval(load,120000);
