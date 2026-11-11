import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';
import shp from 'shpjs';
import * as turf from '@turf/turf';

const parseShapefile = typeof shp === 'function' ? shp : shp.default;

// Configuramos tolerancias: 0.001 para capas pequeñas, 0.008 para capas masivas
const layersConfig = [
  { id: 'aicas', shp: 'public/layers/AICAS/AICAS-2015-SHP/aicas15gw.shp', tolerance: 0.001 },
  { id: 'advc', shp: 'public/layers/ANPS/ADVC/649_ADVC_VIGENTES_OCTUBRE_2026.shp', tolerance: 0.001 },
  { id: 'anp_estatal', shp: 'public/layers/ANPS/ANPS-Estatales/SHP/anpest25gw.shp', tolerance: 0.001 },
  { id: 'anp_federal', shp: 'public/layers/ANPS/ANPS-Federales/232-ANP_ITRF08_19162026.shp', tolerance: 0.001 },
  { id: 'ramsar', shp: 'public/layers/Ramsar/SITIOS_RAMSAR.shp', tolerance: 0.001 },
  { id: 'rhp', shp: 'public/layers/RHP/RHP-2002_SHP/rhpri4mgw.shp', tolerance: 0.001 },
  { id: 'rtp', shp: 'public/layers/RTP/SHP/rtp1mgw.shp', tolerance: 0.001 },
  
  { id: 'cuencas_2007', shp: 'public/layers/Cuencas y subcuencas/Cuencas 2007/SHP/cue250k_07gw.shp', tolerance: 0.002 },
  { id: 'cuencas_cna', shp: 'public/layers/Cuencas y subcuencas/Cuencas CNA/SHP/cue250kgw.shp', tolerance: 0.002 },
  { id: 'cuencas_ig', shp: 'public/layers/Cuencas y subcuencas/Cuencas IG/SHP/cuenc4mgw.shp', tolerance: 0.002 },
  { id: 'subcuencas_conabio', shp: 'public/layers/Cuencas y subcuencas/Subcuencas CONABIO/SHP/subcu1mgw.shp', tolerance: 0.002 },
  
  { id: 'climas', shp: 'public/layers/Unidad climaticas/unidadesClimaticas.shp', tolerance: 0.003 },
  
  // CAPAS MASIVAS - Mayor tolerancia para forzar que bajen de 100MB
  { id: 'edafologia', shp: 'public/layers/Edafologia/cdv_edaf_esc_250k_serie II_cont_nac.shp', tolerance: 0.008 },
  { id: 'usv_serie_1', shp: 'public/layers/Uso de suelo y vegetacion/Serie I/USyV_S_I_SHP/usv250kcs1agw.shp', tolerance: 0.008 },
  { id: 'usv_serie_2', shp: 'public/layers/Uso de suelo y vegetacion/Serie II/USyV_S_II_SHP/usv250ks2gw.shp', tolerance: 0.008 },
  { id: 'usv_serie_3', shp: 'public/layers/Uso de suelo y vegetacion/Serie III/USyV_S_III_SHP/usv250ks3gw.shp', tolerance: 0.008 },
  { id: 'usv_serie_4', shp: 'public/layers/Uso de suelo y vegetacion/Serie IV/USyV_S_IV_SHP/usv250ks4gw.shp', tolerance: 0.008 },
  { id: 'usv_serie_5', shp: 'public/layers/Uso de suelo y vegetacion/Serie V/USyV_S_V_SHP/usv250s5ugw.shp', tolerance: 0.008 },
  { id: 'usv_serie_6', shp: 'public/layers/Uso de suelo y vegetacion/Serie VI/USyV_S_VI_SHP/usv250s6gw.shp', tolerance: 0.008 },
  { id: 'usv_serie_7', shp: 'public/layers/Uso de suelo y vegetacion/Serie VII/USyV_S_VII_SHP/usv250s7gw.shp', tolerance: 0.008 }
];

// Escritura por fragmentos para evitar "Invalid string length" en RAM
function writeGeoJsonChunked(filePath, geojson) {
  const fd = fs.openSync(filePath, 'w');
  fs.writeSync(fd, '{"type":"FeatureCollection","features":[\n');
  
  for (let i = 0; i < geojson.features.length; i++) {
    const featureStr = JSON.stringify(geojson.features[i]);
    fs.writeSync(fd, featureStr);
    if (i < geojson.features.length - 1) {
      fs.writeSync(fd, ',\n');
    }
  }
  
  fs.writeSync(fd, '\n]}');
  fs.closeSync(fd);
}

async function processLayers() {
  const outputDir = path.resolve('public/layers/geojson');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  console.log('Iniciando procesamiento de capas masivas con Stream Chunking...\n');

  for (const layer of layersConfig) {
    const shpPath = path.resolve(layer.shp);
    if (!fs.existsSync(shpPath)) {
      console.warn(`[OMITIDO] Archivo no encontrado: ${layer.shp}`);
      continue;
    }

    try {
      const dir = path.dirname(shpPath);
      const baseName = path.basename(shpPath, path.extname(shpPath)).toLowerCase();
      const dirFiles = fs.readdirSync(dir);
      const companions = dirFiles.filter((file) => file.toLowerCase().startsWith(baseName));

      const zip = new JSZip();
      for (const file of companions) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isFile()) zip.file(file, fs.readFileSync(fullPath));
      }

      const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
      let geojson = await parseShapefile(zipBuffer);
      if (Array.isArray(geojson)) geojson = geojson[0];

      try {
        console.log(`Simplificando ${layer.id} (Tolerancia: ${layer.tolerance})...`);
        geojson = turf.simplify(geojson, { tolerance: layer.tolerance, highQuality: false, mutate: true });
      } catch (simplifyErr) {
        console.warn(`[WARN] Falló simplificación de ${layer.id}:`, simplifyErr.message);
      }

      const outFile = path.join(outputDir, `${layer.id}.geojson`);
      // Evitamos JSON.stringify directo para prevenir colapso de RAM
      writeGeoJsonChunked(outFile, geojson);
      
      const sizeMB = (fs.statSync(outFile).size / 1048576).toFixed(2);
      console.log(`[OK] Capa lista: ${layer.id}.geojson (${sizeMB} MB)\n`);
    } catch (err) {
      console.error(`[ERROR] Procesando ${layer.id}:`, err.message, '\n');
    }
  }
  
  console.log('Procesamiento completado con éxito.');
}

processLayers();