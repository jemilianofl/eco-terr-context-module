import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';
import shp from 'shpjs';
import * as turf from '@turf/turf';

// Soporte para importación tanto en CJS como en ESM de shpjs
const parseShapefile = typeof shp === 'function' ? shp : shp.default;

const layersConfig = [
  {
    id: 'aicas',
    shp: 'public/layers/AICAS/AICAS-2015-SHP/aicas15gw.shp',
  },
  {
    id: 'advc',
    shp: 'public/layers/ANPS/ADVC/649_ADVC_VIGENTES_OCTUBRE_2026.shp',
  },
  {
    id: 'anp_estatal',
    shp: 'public/layers/ANPS/ANPS-Estatales/SHP/anpest25gw.shp',
  },
  {
    id: 'anp_federal',
    shp: 'public/layers/ANPS/ANPS-Federales/232-ANP_ITRF08_19162026.shp',
  },
  {
    id: 'ramsar',
    shp: 'public/layers/Ramsar/SITIOS_RAMSAR.shp',
  },
  {
    id: 'rhp',
    shp: 'public/layers/RHP/RHP-2002_SHP/rhpri4mgw.shp',
  },
  {
    id: 'rtp',
    shp: 'public/layers/RTP/SHP/rtp1mgw.shp',
  },
];

async function processLayers() {
  const outputDir = path.resolve('public/layers/geojson');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log('Iniciando procesamiento de capas ecológicas oficiales...\n');

  for (const layer of layersConfig) {
    const shpPath = path.resolve(layer.shp);
    if (!fs.existsSync(shpPath)) {
      console.warn(`[OMITIDO] Archivo no encontrado: ${layer.shp}`);
      continue;
    }

    try {
      const dir = path.dirname(shpPath);
      const baseName = path.basename(shpPath, path.extname(shpPath)).toLowerCase();

      // Buscar todos los archivos complementarios (.dbf, .prj, .cpg, .shx) sin importar mayúsculas/minúsculas
      const dirFiles = fs.readdirSync(dir);
      const companions = dirFiles.filter((file) =>
        file.toLowerCase().startsWith(baseName)
      );

      // Empaquetar los binarios en un zip virtual en memoria
      const zip = new JSZip();
      for (const file of companions) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isFile()) {
          zip.file(file, fs.readFileSync(fullPath));
        }
      }

      const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

      // shpjs descomprime, lee atributos de dbf y reproyecta las coordenadas a EPSG:4326 usando el .prj
      let geojson = await parseShapefile(zipBuffer);
      if (Array.isArray(geojson)) {
        geojson = geojson[0];
      }

      // Simplificar geometrías complejas para optimizar el peso en memoria/red
      try {
        geojson = turf.simplify(geojson, { tolerance: 0.001, highQuality: false, mutate: true });
      } catch (simplifyErr) {
        console.warn(`[WARN] No se pudo simplificar ${layer.id}, guardando formato original:`, simplifyErr.message);
      }

      const outFile = path.join(outputDir, `${layer.id}.geojson`);
      fs.writeFileSync(outFile, JSON.stringify(geojson));
      const sizeMB = (fs.statSync(outFile).size / (1024 * 1024)).toFixed(2);
      console.log(`[OK] Capa convertida: ${layer.id}.geojson (${sizeMB} MB)`);
    } catch (err) {
      console.error(`[ERROR] Procesando ${layer.id}:`, err.message);
    }
  }

  console.log('\nProcesamiento finalizado. Archivos disponibles en public/layers/geojson/');
}

processLayers();