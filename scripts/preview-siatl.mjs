import http from 'http';
import fs from 'fs';
import path from 'path';
import { deserialize } from 'flatgeobuf/lib/mjs/geojson.js';

const FGB_DIR = path.resolve('public/layers/fgb');
const OUT_HTML = path.resolve('public/layers/siatl_50k/preview.html');

// Por defecto usa la zona de Bahía de Santa Cruz, Huatulco (Oaxaca) de tus pruebas anteriores
// Puedes pasar otro encuadre con: node scripts/preview-siatl.mjs --bbox=-99.20,19.35,-99.05,19.50
const bboxArg = process.argv.find((a) => a.startsWith('--bbox='));
const [minX, minY, maxX, maxY] = bboxArg
  ? bboxArg.replace('--bbox=', '').split(',').map(Number)
  : [-96.22, 15.70, -96.05, 15.84];

const rect = { minX, minY, maxX, maxY };

// Servidor HTTP local con soporte de HTTP Range Requests (simula Cloudflare R2)
function startRangeServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const fileName = path.basename(new URL(req.url, 'http://localhost').pathname);
      const filePath = path.join(FGB_DIR, fileName);

      if (!fs.existsSync(filePath)) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }

      const stat = fs.statSync(filePath);
      const total = stat.size;

      if (req.method === 'HEAD') {
        res.writeHead(200, {
          'Content-Length': total,
          'Accept-Ranges': 'bytes',
          'Content-Type': 'application/octet-stream',
        });
        res.end();
        return;
      }

      const range = req.headers.range;
      if (range) {
        const match = range.match(/bytes=(\d+)-(\d*)/);
        if (match) {
          const start = Number(match[1]);
          const end = match[2] ? Math.min(Number(match[2]), total - 1) : total - 1;
          const chunkSize = end - start + 1;

          res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${total}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunkSize,
            'Content-Type': 'application/octet-stream',
          });
          fs.createReadStream(filePath, { start, end }).pipe(res);
          return;
        }
      }

      res.writeHead(200, {
        'Content-Length': total,
        'Accept-Ranges': 'bytes',
        'Content-Type': 'application/octet-stream',
      });
      fs.createReadStream(filePath).pipe(res);
    });

    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

async function queryLayer(baseUrl, fileName, queryRect) {
  const t0 = performance.now();
  const features = [];
  for await (const feat of deserialize(`${baseUrl}/${fileName}`, { rect: queryRect })) {
    features.push(feat);
  }
  const elapsedMs = (performance.now() - t0).toFixed(1);
  return { features, elapsedMs };
}

async function main() {
  console.log(`Consultando índice espacial R-Tree en BBOX [${minX}, ${minY}, ${maxX}, ${maxY}]...\n`);
  const { server, baseUrl } = await startRangeServer();

  try {
    const subc = await queryLayer(baseUrl, 'subcuencas_50k.fgb', rect);
    const agua = await queryLayer(baseUrl, 'cuerpos_agua_50k.fgb', rect);
    const rios = await queryLayer(baseUrl, 'red_hidrografica_50k.fgb', rect);

    console.log(`1. subcuencas_50k.fgb       -> ${subc.features.length} polígonos en ${subc.elapsedMs} ms`);
    if (subc.features[0]) {
      console.log('   Atributos muestra:', subc.features[0].properties);
    }

    console.log(`2. cuerpos_agua_50k.fgb     -> ${agua.features.length} polígonos en ${agua.elapsedMs} ms`);

    console.log(`3. red_hidrografica_50k.fgb -> ${rios.features.length} tramos en ${rios.elapsedMs} ms`);
    const ordenCounts = {};
    for (const f of rios.features) {
      const ord = f.properties?.ORDER_1 ?? 'S/D';
      ordenCounts[ord] = (ordenCounts[ord] || 0) + 1;
    }
    console.log('   Desglose por Orden de Escorrentía (ORDER_1):', ordenCounts);

    // Generar HTML interactivo con Leaflet para inspección visual inmediata
    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Previsualización SIATL 1:50,000 - PROFEPA</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    body { margin: 0; font-family: system-ui, sans-serif; }
    #map { width: 100vw; height: 100vh; }
    .legend {
      background: white; padding: 12px 14px; border: 1px solid #333;
      border-radius: 6px; font-size: 12px; line-height: 1.5; box-shadow: 0 2px 8px rgba(0,0,0,.25);
    }
    .row { display: flex; align-items: center; gap: 8px; }
    .line-sample { width: 22px; display: inline-block; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    const subcuencas = ${JSON.stringify({ type: 'FeatureCollection', features: subc.features })};
    const cuerposAgua = ${JSON.stringify({ type: 'FeatureCollection', features: agua.features })};
    const corrientes = ${JSON.stringify({ type: 'FeatureCollection', features: rios.features })};

    const map = L.map('map').fitBounds([[${minY}, ${minX}], [${maxY}, ${maxX}]]);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'ESRI World Imagery'
    }).addTo(map);

    L.geoJSON(subcuencas, {
      style: { color: '#78350f', weight: 2, fillColor: '#d6c7a9', fillOpacity: 0.28 },
      onEachFeature: (f, layer) => {
        const p = f.properties || {};
        layer.bindPopup('<b>Subcuenca:</b> ' + (p.SUBCUENCA || '') + ' (' + (p.CVE_SUBCUE || '') + ')<br>' +
                        '<b>Cuenca:</b> ' + (p.CUENCA || '') + '<br>' +
                        '<b>Región Hidrológica:</b> ' + (p.RH || '') + '<br>' +
                        '<b>Área:</b> ' + (p.AREA_KM2 || '') + ' km²');
      }
    }).addTo(map);

    L.geoJSON(cuerposAgua, {
      style: { color: '#0284c7', weight: 1, fillColor: '#38bdf8', fillOpacity: 0.55 },
      onEachFeature: (f, layer) => {
        layer.bindPopup('<b>Cuerpo de agua:</b> ' + (f.properties?.CONDICION || 'N/D'));
      }
    }).addTo(map);

    const strahlerStyle = (order) => {
      const o = Number(order) || 1;
      if (o === 1) return { color: '#e0f2fe', weight: 0.9, opacity: 0.85 };
      if (o === 2) return { color: '#bae6fd', weight: 1.3, opacity: 0.9 };
      if (o === 3) return { color: '#7dd3fc', weight: 1.8, opacity: 0.95 };
      if (o === 4) return { color: '#38bdf8', weight: 2.4, opacity: 1 };
      if (o === 5) return { color: '#0284c7', weight: 3.1, opacity: 1 };
      return { color: '#1e3a8a', weight: 4.0, opacity: 1 };
    };

    L.geoJSON(corrientes, {
      style: (f) => strahlerStyle(f.properties?.ORDER_1),
      onEachFeature: (f, layer) => {
        const p = f.properties || {};
        layer.bindPopup('<b>Corriente 1:50,000</b><br>' +
                        '<b>Orden Strahler:</b> ' + (p.ORDER_1 ?? 'N/D') + '<br>' +
                        '<b>Condición:</b> ' + (p.CONDICION || 'N/D') + '<br>' +
                        '<b>Subcuenca:</b> ' + (p.CVE_SUBC || 'N/D'));
      }
    }).addTo(map);

    const legend = L.control({ position: 'bottomright' });
    legend.onAdd = () => {
      const div = L.DomUtil.create('div', 'legend');
      div.innerHTML = '<strong>Red Hidrográfica 1:50,000 (SIATL)</strong><br/>Orden de escorrentía (Strahler):' +
        [1, 2, 3, 4, 5, 6].map((o) => {
          const s = strahlerStyle(o);
          return '<div class="row"><span class="line-sample" style="border-top:' + s.weight + 'px solid ' + s.color + '"></span><span>Orden ' + (o === 6 ? '6+' : o) + '</span></div>';
        }).join('');
      return div;
    };
    legend.addTo(map);
  </script>
</body>
</html>`;

    fs.writeFileSync(OUT_HTML, html, 'utf-8');
    console.log(`\nPrevisualización lista. Ábrela en tu navegador con:\n  start ${OUT_HTML}`);
  } finally {
    server.close();
  }
}

main().catch(console.error);