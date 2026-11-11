import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';
import shp from 'shpjs';
import * as turf from '@turf/turf';

const parseShapefile = typeof shp === 'function' ? shp : shp.default;

async function generarComparativa() {
  console.log("Extrayendo polígono original para la comparativa...");
  
  // Usaremos la capa RTP porque es de tamaño moderado y tiene bordes sinuosos perfectos para la prueba
  const shpPath = path.resolve('public/layers/RTP/SHP/rtp1mgw.shp');
  const dir = path.dirname(shpPath);
  const baseName = path.basename(shpPath, path.extname(shpPath)).toLowerCase();
  const companions = fs.readdirSync(dir).filter(f => f.toLowerCase().startsWith(baseName));

  const zip = new JSZip();
  for (const file of companions) {
    zip.file(file, fs.readFileSync(path.join(dir, file)));
  }

  let geojson = await parseShapefile(await zip.generateAsync({ type: 'nodebuffer' }));
  if (Array.isArray(geojson)) geojson = geojson[0];

  // Tomamos solo el primer polígono masivo para que tu navegador no sufra al renderizar
  const featureOriginal = geojson.features[1]; 
  const original = { type: 'FeatureCollection', features: [featureOriginal] };

  console.log("Calculando simplificaciones...");
  // Tolerancia 0.002 (La que aplicamos a las Cuencas)
  const suave = turf.simplify(JSON.parse(JSON.stringify(original)), { tolerance: 0.002, highQuality: true, mutate: true });
  // Tolerancia 0.008 (La agresiva que requiere Edafología y USV para bajar de 100 MB)
  const agresivo = turf.simplify(JSON.parse(JSON.stringify(original)), { tolerance: 0.008, highQuality: true, mutate: true });

  const htmlContent = `
  <!DOCTYPE html>
  <html>
  <head>
    <title>Comparativa de Vértices PROFEPA</title>
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <style>body, html, #map { height: 100%; margin: 0; font-family: sans-serif; }</style>
  </head>
  <body>
    <div id="map"></div>
    <div style="position: absolute; top: 10px; right: 10px; z-index: 1000; background: white; padding: 15px; border-radius: 8px; border: 2px solid black;">
      <h4 style="margin-top:0;">Nivel de Compresión</h4>
      <div style="margin-bottom: 5px;"><span style="display:inline-block; width: 20px; height: 4px; background: blue; margin-right: 8px;"></span> <b>Original (Intacto - 100% peso)</b></div>
      <div style="margin-bottom: 5px;"><span style="display:inline-block; width: 20px; border-top: 3px dashed orange; margin-right: 8px;"></span> <b>Tolerancia 0.002 (Intermedio)</b></div>
      <div><span style="display:inline-block; width: 20px; border-top: 3px dotted red; margin-right: 8px;"></span> <b>Tolerancia 0.008 (Edafología/USV)</b></div>
      <p style="font-size: 12px; max-width: 250px; color: #555;">Haz zoom máximo en los bordes para ver cuántos metros se desvía la línea roja respecto a la azul real.</p>
    </div>
    <script>
      const map = L.map('map').setView([19, -99], 6);
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}').addTo(map);

      const original = ${JSON.stringify(original)};
      const suave = ${JSON.stringify(suave)};
      const agresivo = ${JSON.stringify(agresivo)};

      const layerOrg = L.geoJSON(original, { style: { color: 'blue', weight: 5, fillOpacity: 0.2 } }).bindPopup('Borde Original').addTo(map);
      L.geoJSON(suave, { style: { color: 'orange', weight: 3, dashArray: '6, 6', fillOpacity: 0 } }).addTo(map);
      L.geoJSON(agresivo, { style: { color: 'red', weight: 3, dashArray: '2, 6', fillOpacity: 0 } }).addTo(map);

      map.fitBounds(layerOrg.getBounds());
    </script>
  </body>
  </html>
  `;

  fs.writeFileSync('public/comparador.html', htmlContent);
  console.log("¡Archivo generado exitosamente!");
  console.log("👉 Abre en tu navegador: http://localhost:5173/comparador.html");
}

generarComparativa();