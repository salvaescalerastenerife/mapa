let base=[],all=[],filtered=[],markers=L.layerGroup(),map,deferredPrompt,current=null,pickMode=false,tempMarker=null;
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const STORE='ca-mapa-overrides-v3', STYLE='ca-mapa-styles-v3', MASTER='ca-mapa-master-v5';
const defaults={size:6,kml:{color:'#2f80ed',shape:'circle'},OLIVER:{color:'#f2994a',shape:'square'},BERNARDO:{color:'#9b51e0',shape:'diamond'},POSTVENTA:{color:'#27ae60',shape:'circle'},pending:{color:'#9aa8b6',shape:'circle'}};
let styles=loadStyles();
function loadStyles(){try{return {...structuredClone(defaults),...JSON.parse(localStorage.getItem(STYLE)||'{}')}}catch{return structuredClone(defaults)}}
function overrides(){try{return JSON.parse(localStorage.getItem(STORE)||'{}')}catch{return {}}}
function saveOverride(id,patch){const o=overrides();o[id]={...(o[id]||{}),...patch,updatedAt:new Date().toISOString()};localStorage.setItem(STORE,JSON.stringify(o));mergeData()}
function mergeData(){const o=overrides();all=base.map(x=>({...x,...(o[x.id]||{})}));render()}
async function init(){
  base=await fetch('data/installations.json').then(r=>r.json());
  map=L.map('map',{zoomControl:true}).setView([28.35,-15.9],7);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap'}).addTo(map);
  markers.addTo(map);bind();mergeData();
  if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js');
}
function bind(){
  $('#search').addEventListener('input',render);$('#tech').addEventListener('change',render);$('#source').addEventListener('change',render);
  $('#fit').onclick=()=>map.setView([28.35,-15.9],7);$('#closeDetail').onclick=closeDetail;$('#styleBtn').onclick=openStyles;$('#backupBtn').onclick=openBackup;
  $$('[data-close]').forEach(b=>b.onclick=()=>$('#'+b.dataset.close).hidden=true);
  $$('nav button').forEach(b=>b.onclick=()=>{$$('nav button').forEach(x=>x.classList.remove('active'));b.classList.add('active');$('#source').value=b.dataset.view==='pending'?'unmapped':'';render()});
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;$('#installBtn').hidden=false});
  $('#installBtn').onclick=()=>deferredPrompt?.prompt();$('#excelFile').addEventListener('change',importExcel);$('#exportBackup').onclick=exportMasterBackup;$('#backupFile').addEventListener('change',importMasterBackup);
  $('#pointSize').addEventListener('input',()=>{styles.size=Number($('#pointSize').value);saveStyles()});
  $('#resetStyles').onclick=()=>{styles=structuredClone(defaults);saveStyles();openStyles()};
  $('#saveLocation').onclick=saveLocation;$('#cancelLocation').onclick=closeLocation;$('#geocodeAddress').onclick=geocodeCurrent;$('#openGoogleMaps').onclick=openInGoogleMaps;$('#useGps').onclick=useCurrentGps;$('#pickOnMap').onclick=startMapPicking;
  map.on('click',e=>{if(!pickMode)return;setPicked(e.latlng.lat,e.latlng.lng,'Punto seleccionado manualmente en el mapa.')});
}
function render(){
  if(!all.length)return;
  const q=$('#search').value.trim().toLowerCase(),tech=$('#tech').value,src=$('#source').value;
  filtered=all.filter(x=>{
    const hay=[x.installation,x.client,x.address,x.model,x.articleDescription,x.contact,x.phone,x.zone,x.comments,x.contractType].join(' ').toLowerCase();
    return(!q||hay.includes(q))&&(!tech||String(x.technician).toUpperCase()===tech)&&(!src||(src==='mapped'?x.lat!=null:x.lat==null));
  });
  stats();list();drawMarkers();notice();
}
function stats(){
  const mapped=all.filter(x=>x.lat!=null).length,pending=all.length-mapped,ol=all.filter(x=>x.technician==='OLIVER').length,be=all.filter(x=>x.technician==='BERNARDO').length;
  $('#stats').innerHTML=[[all.length,'Total'],[mapped,'En el mapa'],[pending,'Sin ubicar'],[ol+be,'Oliver + Bernardo']].map(x=>`<div class="stat"><b>${x[0].toLocaleString('es-ES')}</b><span>${x[1]}</span></div>`).join('');
}
function notice(){
  const tech=$('#tech').value,mapped=filtered.filter(x=>x.lat!=null).length,n=$('#notice');
  if(tech){n.hidden=false;n.innerHTML=`<b>${esc(tech)}: ${filtered.length.toLocaleString('es-ES')} instalaciones</b> · ${mapped.toLocaleString('es-ES')} ya geolocalizadas · ${(filtered.length-mapped).toLocaleString('es-ES')} pendientes.`}
  else n.hidden=true;
}
function list(){
  const mapped=filtered.filter(x=>x.lat!=null).length;
  $('#resultCount').textContent=`${filtered.length.toLocaleString('es-ES')} instalaciones · ${mapped.toLocaleString('es-ES')} en mapa`;
  $('#list').innerHTML=filtered.slice(0,900).map(x=>`<article class="item" data-id="${esc(x.id)}"><div class="item-top"><h3>ID ${esc(x.installation)} · ${esc(x.client||x.address||'Instalación')}</h3><span class="dot" style="background:${markerStyle(x).color}"></span></div><p>${esc(x.address||'Dirección no incluida')}</p><p><span class="badge">${esc(x.model||'Modelo sin indicar')}</span>${x.technician?`<span class="badge">${esc(x.technician)}</span>`:''}<span class="badge ${x.lat==null?'pending':''}">${esc(x.coordinateSource||'Sin origen')}</span></p></article>`).join('')||'<div class="detail">No hay resultados.</div>';
  $$('.item').forEach(el=>el.onclick=()=>show(all.find(x=>x.id===el.dataset.id)));
}
function markerStyle(x){
  if(x.customColor)return {color:x.customColor,shape:x.customShape||'circle'};
  if(x.technician==='OLIVER')return styles.OLIVER;
  if(x.technician==='BERNARDO')return styles.BERNARDO;
  if(x.technician==='POST VENTA')return styles.POSTVENTA;
  return styles.kml;
}
function iconFor(x){
  const st=markerStyle(x),s=styles.size||6,shape=x.customShape||st.shape||'circle';let transform='';
  if(shape==='diamond')transform='transform:rotate(45deg)';const radius=shape==='circle'?'50%':'3px';
  return L.divIcon({className:'custom-marker',html:`<span style="width:${s*2}px;height:${s*2}px;background:${st.color};border-radius:${radius};${transform}"></span>`,iconSize:[s*2+4,s*2+4],iconAnchor:[s+2,s+2]});
}
function drawMarkers(){
  markers.clearLayers();filtered.filter(x=>x.lat!=null).slice(0,5000).forEach(x=>{const m=L.marker([x.lat,x.lng],{icon:iconFor(x)});m.bindTooltip(`ID ${x.installation} · ${x.client||x.address||''}`);m.on('click',()=>show(x));m.addTo(markers)});
}
function field(label,value){return value!==''&&value!=null?`<dt>${label}</dt><dd>${esc(value)}</dd>`:''}
function price(v){if(v===''||v==null)return '';const n=Number(String(v).replace(',','.'));return Number.isFinite(n)?n.toLocaleString('es-ES',{style:'currency',currency:'EUR'}):v}
function phoneLinks(v){if(!v)return '';const nums=String(v).match(/\d{9}/g)||[];return nums.map(n=>`<a class="mini-link" href="tel:${n}">${n}</a>`).join(' ')}
function show(x){
  current=x;$('#detail').hidden=false;$('#list').hidden=true;$('#closeDetail').hidden=false;
  const nav=x.lat!=null?`https://www.google.com/maps/dir/?api=1&destination=${x.lat},${x.lng}`:'';const st=markerStyle(x);
  $('#detail').innerHTML=`<div class="detail"><div class="title-row"><div><small>${esc(x.coordinateSource||'REGISTRO')}</small><h2>ID ${esc(x.installation)}</h2></div><span class="large-dot" style="background:${st.color}"></span></div>
  <dl>${field('Cliente',x.client)}${field('Código cliente',x.clientCode)}${field('Dirección',x.address)}${field('Contacto',x.contact)}${x.phone?`<dt>Teléfono</dt><dd>${phoneLinks(x.phone)}</dd>`:''}${field('Tipo de instalación',x.model)}${field('Descripción del artículo',x.articleDescription)}${field('Código artículo',x.articleCode)}${field('Técnico / zona',x.zone)}${field('Ejercicio',x.year)}${field('Fecha de pedido',x.orderDate)}${field('Fecha de instalación',x.installDate)}${field('Fecha de montaje',x.assemblyDate)}${field('Entrada en fábrica',x.factoryEntryDate)}${field('Salida de fábrica',x.factoryExitDate)}${field('Envío al instalador',x.installerShippingDate)}${field('Contrato',x.contract)}${field('Tipo de contrato',x.contractType)}${field('Precio de venta',price(x.salePrice))}${field('Origen coordenadas',x.coordinateSource)}${field('Latitud',x.lat)}${field('Longitud',x.lng)}${field('Observaciones',x.comments)}</dl>
  <div class="point-custom"><label>Color del punto<input id="customColor" type="color" value="${st.color}"></label><label>Forma<select id="customShape"><option value="circle">Círculo</option><option value="square">Cuadrado</option><option value="diamond">Rombo</option></select></label><button id="savePointStyle">Guardar estilo</button></div>
  <div class="actions">${nav?`<a target="_blank" href="${nav}">Cómo llegar</a>`:''}<button id="editLocation">${x.lat==null?'Ubicar instalación':'Revisar ubicación'}</button></div>
  <p><small>Las coordenadas del KML nunca se sustituyen automáticamente. Las correcciones manuales también tienen prioridad en futuras importaciones.</small></p></div>`;
  $('#customShape').value=x.customShape||st.shape||'circle';$('#savePointStyle').onclick=()=>saveOverride(x.id,{customColor:$('#customColor').value,customShape:$('#customShape').value});$('#editLocation').onclick=()=>openLocation(x);if(x.lat!=null)map.setView([x.lat,x.lng],16);
}
function closeDetail(){$('#detail').hidden=true;$('#list').hidden=false;$('#closeDetail').hidden=true;current=null}

function openBackup(){
  const o=overrides(),mapped=all.filter(x=>x.lat!=null).length,manual=all.filter(x=>String(x.coordinateSource||'').toLowerCase().includes('manual')||String(x.coordinateSource||'').toLowerCase().includes('confirmada')).length;
  $('#backupSummary').innerHTML=[[all.length,'Instalaciones'],[mapped,'Con coordenadas'],[Object.keys(o).length,'Cambios locales'],[manual,'Ubicaciones revisadas']].map(x=>`<div class="stat"><b>${x[0].toLocaleString('es-ES')}</b><span>${x[1]}</span></div>`).join('');
  $('#backupStatus').hidden=true;$('#backupPanel').hidden=false;
}
function backupPayload(){
  return {format:'canarias-accesible-master-backup',version:1,createdAt:new Date().toISOString(),appVersion:'4.0',recordCount:all.length,base,overrides:overrides(),styles,meta:{mapped:all.filter(x=>x.lat!=null).length,pending:all.filter(x=>x.lat==null).length}};
}
function downloadJson(payload,name){
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
}
function exportMasterBackup(){
  const stamp=new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
  downloadJson(backupPayload(),`Canarias-Accesible-MASTER-${stamp}.json`);
  $('#backupStatus').hidden=false;$('#backupStatus').innerHTML='<b>Copia máster exportada.</b> Guárdala en Archivos, iCloud Drive, AirDrop o WhatsApp para llevarla al otro dispositivo.';
}
function isValidBackup(data){
  return data&&data.format==='canarias-accesible-master-backup'&&Number(data.version)>=1&&Array.isArray(data.base)&&data.base.length>0&&data.overrides&&typeof data.overrides==='object'&&data.styles&&typeof data.styles==='object';
}
async function importMasterBackup(e){
  const file=e.target.files[0];if(!file)return;
  try{
    const data=JSON.parse(await file.text());
    if(!isValidBackup(data))throw new Error('El archivo no es una copia máster válida de Canarias Accesible.');
    const ok=confirm(`Se importarán ${data.base.length.toLocaleString('es-ES')} instalaciones.\n\nEl estado actual de este dispositivo será sustituido, aunque antes se descargará una copia automática de seguridad.\n\n¿Continuar?`);
    if(!ok)return;
    const stamp=new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');downloadJson(backupPayload(),`Canarias-Accesible-AUTOBACKUP-${stamp}.json`);
    base=data.base;localStorage.setItem(STORE,JSON.stringify(data.overrides));styles={...structuredClone(defaults),...data.styles};localStorage.setItem(STYLE,JSON.stringify(styles));localStorage.setItem(MASTER,JSON.stringify({importedAt:new Date().toISOString(),sourceCreatedAt:data.createdAt||'',recordCount:data.base.length}));
    mergeData();closeDetail();map.setView([28.35,-15.9],7);openBackup();
    $('#backupStatus').hidden=false;$('#backupStatus').innerHTML=`<b>Copia máster importada correctamente.</b> ${all.length.toLocaleString('es-ES')} instalaciones y ${all.filter(x=>x.lat!=null).length.toLocaleString('es-ES')} ubicaciones disponibles.`;
  }catch(err){alert('No se pudo importar la copia máster: '+err.message)}finally{e.target.value=''}
}

function openStyles(){
  const defs=[['kml','Históricas / sin técnico'],['OLIVER','Oliver'],['BERNARDO','Bernardo'],['POSTVENTA','Post Venta']];
  $('#styleRows').innerHTML=defs.map(([k,n])=>`<div class="style-row"><strong>${n}</strong><input data-style="${k}" data-key="color" type="color" value="${styles[k].color}"><select data-style="${k}" data-key="shape"><option value="circle">Círculo</option><option value="square">Cuadrado</option><option value="diamond">Rombo</option></select></div>`).join('');
  $$('[data-style]').forEach(el=>{if(el.dataset.key==='shape')el.value=styles[el.dataset.style].shape;el.onchange=()=>{styles[el.dataset.style][el.dataset.key]=el.value;saveStyles()}});$('#pointSize').value=styles.size||6;$('#stylePanel').hidden=false;
}
function saveStyles(){localStorage.setItem(STYLE,JSON.stringify(styles));drawMarkers();list()}
function openLocation(x){
  current=x;pickMode=true;$('#locationPanel').hidden=false;$('#editAddress').value=x.address||'';$('#editLat').value=x.lat??'';$('#editLng').value=x.lng??'';$('#geocodeResults').hidden=true;$('#geocodeResults').innerHTML='';
  $('#pickStatus').textContent=x.coordinateSource==='KML manual'?'Ubicación del KML protegida. Solo se cambiará si guardas una corrección manual.':'Puedes buscar la dirección o tocar el mapa.';
  if(x.lat!=null){map.setView([x.lat,x.lng],17);tempMarker=L.marker([x.lat,x.lng]).addTo(map)}else map.setView([28.35,-15.9],7);
}
function closeLocation(){pickMode=false;$('#locationPanel').hidden=true;if(tempMarker){map.removeLayer(tempMarker);tempMarker=null}}
function setPicked(lat,lng,msg){$('#editLat').value=Number(lat).toFixed(7);$('#editLng').value=Number(lng).toFixed(7);$('#pickStatus').textContent=msg;$('#locationPanel').hidden=false;if(tempMarker)map.removeLayer(tempMarker);tempMarker=L.marker([lat,lng]).addTo(map);map.setView([lat,lng],17)}
function cleanAddress(value){
  return String(value||'').trim()
    .replace(/\bC\/?\s*/gi,'Calle ')
    .replace(/\bAVDA?\.?\s*/gi,'Avenida ')
    .replace(/\bCTRA\.?\s*/gi,'Carretera ')
    .replace(/\bN[º°\.]?\s*/gi,' ')
    .replace(/\bS\/?N\b/gi,'')
    .replace(/\s*,\s*/g,', ')
    .replace(/\s{2,}/g,' ')
    .replace(/,+/g,',')
    .trim();
}
function addressQueries(){
  const typed=cleanAddress($('#editAddress').value), x=current||{};
  const street=cleanAddress(x.street||typed.split(',')[0]||'');
  const postal=String(x.postalCode||'').trim(), municipality=String(x.municipality||'').trim(), province=String(x.province||'Las Palmas').trim();
  const place=municipality||typed.split(',').slice(1).join(',').trim();
  const variants=[
    typed,
    [street,postal,place,'Canarias','España'].filter(Boolean).join(', '),
    [street,place,'Gran Canaria','España'].filter(Boolean).join(', '),
    [street,postal,'Telde','Gran Canaria','España'].filter(Boolean).join(', '),
    [street,place,province,'España'].filter(Boolean).join(', '),
    [postal,place,'Canarias','España'].filter(Boolean).join(', ')
  ];
  return [...new Set(variants.map(cleanAddress).filter(q=>q.length>4))];
}
function precisionLabel(item){
  const t=String(item.type||'').toLowerCase(), c=String(item.class||'').toLowerCase();
  if(['house','building','residential'].includes(t)||c==='building')return'Portal o edificio';
  if(['road','street','pedestrian'].includes(t)||c==='highway')return'Calle aproximada';
  if(['postcode'].includes(t))return'Código postal';
  if(['suburb','neighbourhood','quarter'].includes(t))return'Barrio o zona';
  return'Municipio o zona aproximada';
}
function renderGeocodeResults(items){
  const box=$('#geocodeResults');
  if(!items.length){box.hidden=true;box.innerHTML='';return}
  box.hidden=false;box.innerHTML='<h3>Coincidencias encontradas</h3>'+items.map((r,i)=>`<button type="button" class="geo-result" data-geo="${i}"><strong>${esc(r.display_name)}</strong><span>Lat. ${Number(r.lat).toFixed(6)} · Long. ${Number(r.lon).toFixed(6)}</span><span class="precision">${precisionLabel(r)}</span></button>`).join('');
  $$('[data-geo]').forEach(btn=>btn.onclick=()=>{const r=items[Number(btn.dataset.geo)];setPicked(Number(r.lat),Number(r.lon),`${precisionLabel(r)} seleccionada. Comprueba visualmente el punto antes de guardar.`)});
}
async function nominatimSearch(q){
  const params=new URLSearchParams({format:'jsonv2',limit:'5',countrycodes:'es',addressdetails:'1',dedupe:'1',viewbox:'-18.6,29.5,-13.2,27.3',bounded:'1',q});
  const res=await fetch('https://nominatim.openstreetmap.org/search?'+params.toString(),{headers:{Accept:'application/json','Accept-Language':'es'}});
  if(!res.ok)throw new Error('respuesta '+res.status);
  return res.json();
}
async function geocodeCurrent(){
  const address=$('#editAddress').value.trim();if(!address){alert('Escribe una dirección.');return}
  $('#pickStatus').textContent='Limpiando y buscando varias formas de la dirección…';$('#geocodeAddress').disabled=true;renderGeocodeResults([]);
  try{
    const found=[],seen=new Set(),queries=addressQueries();
    for(let i=0;i<queries.length&&found.length<5;i++){
      const list=await nominatimSearch(queries[i]);
      for(const r of list){const key=Number(r.lat).toFixed(5)+','+Number(r.lon).toFixed(5);if(!seen.has(key)){seen.add(key);found.push(r)}}
      if(found.length)break;
    }
    if(!found.length){$('#pickStatus').textContent='No apareció ninguna coincidencia fiable. Prueba corrigiendo el municipio, abre Google Maps o elige el punto tocando el mapa.';return}
    renderGeocodeResults(found.slice(0,5));
    $('#pickStatus').textContent=found.length===1?'Se encontró una opción. Revísala antes de guardar.':`Se encontraron ${Math.min(found.length,5)} opciones. Elige la correcta.`;
  }catch(err){$('#pickStatus').textContent='El servicio de búsqueda no respondió. Puedes abrir Google Maps, usar el GPS o tocar el mapa.'}finally{$('#geocodeAddress').disabled=false}
}
function openInGoogleMaps(){
  const q=cleanAddress($('#editAddress').value);if(!q){alert('Escribe primero una dirección.');return}
  window.open('https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(q),'_blank','noopener');
}
function useCurrentGps(){
  if(!navigator.geolocation){$('#pickStatus').textContent='Este navegador no permite obtener la ubicación.';return}
  $('#pickStatus').textContent='Solicitando la ubicación del iPhone…';$('#useGps').disabled=true;
  navigator.geolocation.getCurrentPosition(pos=>{setPicked(pos.coords.latitude,pos.coords.longitude,`Ubicación GPS obtenida con una precisión aproximada de ${Math.round(pos.coords.accuracy)} m. Comprueba el punto antes de guardar.`);$('#useGps').disabled=false},err=>{$('#pickStatus').textContent=err.code===1?'Permiso de ubicación denegado. Actívalo en los ajustes de Safari para esta web.':'No se pudo obtener una posición GPS fiable.';$('#useGps').disabled=false},{enableHighAccuracy:true,timeout:15000,maximumAge:0});
}
function startMapPicking(){
  pickMode=true;$('#locationPanel').hidden=true;$('#pickStatus').textContent='Toca el punto exacto en el mapa.';
}

function saveLocation(){
  if(!current)return;const lat=Number($('#editLat').value),lng=Number($('#editLng').value);
  if(!Number.isFinite(lat)||!Number.isFinite(lng)||lat<27||lat>30||lng<-19||lng>-13){alert('Revisa las coordenadas. Deben corresponder a Canarias.');return}
  const wasKml=current.coordinateSource==='KML manual';const source=wasKml?'Corregida manualmente':'Geolocalizada y confirmada';
  saveOverride(current.id,{lat,lng,address:$('#editAddress').value.trim()||current.address,coordinateSource:source});closeLocation();show(all.find(x=>x.id===current.id));
}
function normal(v){return String(v??'').trim()}
function excelDate(v){if(!v)return '';if(v instanceof Date&&!isNaN(v))return v.toLocaleDateString('es-ES');return normal(v)}
function techFromZone(zone){const z=normal(zone).toUpperCase();if(z.includes('OLIVER'))return'OLIVER';if(z.includes('BERNARDO'))return'BERNARDO';if(z.includes('POST VENTA'))return'POST VENTA';return''}
async function importExcel(e){
  const file=e.target.files[0];if(!file)return;
  try{
    const buf=await file.arrayBuffer(),wb=XLSX.read(buf,{type:'array',cellDates:true}),rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:'',raw:true});
    const oldByCode=new Map(all.map(x=>[String(x.installation),x]));let added=0,updated=0,keptCoords=0;
    const imported=rows.map(r=>{
      const code=normal(r['Cód. instalación']);const old=oldByCode.get(code);const street=normal(r['Domicilio']);const postal=normal(r['Cód. Postal']);const municipality=normal(r['Municipio']);const province=normal(r['Provincia']);
      const fresh={id:old?.id||`inst-${code}`,installation:code,year:normal(r['Ejercicio']),leadCode:normal(r['Código Lead']),clientCode:normal(r['Codigo Cliente']),client:normal(r['Razon Social']),address:[street,postal,municipality,province].filter(Boolean).join(', '),street,postalCode:postal,municipality,province,contact:normal(r['Persona contacto']),phone:normal(r['Tlfn. contacto']),installationTypeCode:normal(r['Cód. tipo instalación']),model:normal(r['Tipo instalación']),installDate:excelDate(r['Fecha instalación']),orderDate:excelDate(r['FechaPedido']),contract:normal(r['Contrato']),contractTypeCode:normal(r['Cód. tipo contrato']),contractType:normal(r['Tipo contrato']),contractEndDate:excelDate(r['Fecha Baja Contrato']),salePrice:normal(r['Precio venta']),reviewDate:excelDate(r['Fecha Revisión']),articleCode:normal(r['Código artículo']),articleDescription:normal(r['Descripcion Articulo']),municipalityCode:normal(r['Cód. municipio']),provinceCode:normal(r['Cód. Provincia']),zoneCode:normal(r['Cód. Zona']),zone:normal(r['Zona']),technician:techFromZone(r['Zona']),factoryEntryDate:excelDate(r['Fecha entrada fábrica']),plansDate:excelDate(r['Fecha planos']),factoryExitDate:excelDate(r['Fecha salida fabrica']),factoryExpectedDate:excelDate(r['Fecha previsión llegada a fábrica']),warehouseEntryDate:excelDate(r['Fecha entrada almacén']),installerShippingDate:excelDate(r['Fecha envío al instalador']),assemblyDate:excelDate(r['Fecha montaje']),comments:normal(r['Observaciones']),source:'excel-import'};
      if(old){updated++;fresh.lat=old.lat;fresh.lng=old.lng;fresh.coordinateSource=old.coordinateSource||'Pendiente de ubicar';if(old.lat!=null)keptCoords++}else{added++;fresh.lat=null;fresh.lng=null;fresh.coordinateSource='Pendiente de ubicar'}return fresh;
    });
    const importedCodes=new Set(imported.map(x=>x.installation));const preserved=all.filter(x=>x.source==='kml-only'&&!importedCodes.has(x.installation));base=[...imported,...preserved];mergeData();
    alert(`Excel importado correctamente.\n\nFilas: ${rows.length}\nActualizadas: ${updated}\nNuevas: ${added}\nCoordenadas conservadas: ${keptCoords}\nPendientes de ubicar: ${all.filter(x=>x.lat==null).length}\n\nLas coordenadas existentes no se han sobrescrito.`);
  }catch(err){alert('No se pudo leer el Excel: '+err.message)}finally{e.target.value=''}
}
init();
