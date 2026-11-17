import { execSync } from 'child_process';
import { deserialize } from 'flatgeobuf/lib/mjs/geojson.js';
import { Readable } from 'stream';
import fs from 'fs';
import path from 'path';

const BASE_DIR = path.resolve('public/layers/siatl_50k');
const EXTRACT_DIR = path.join(BASE_DIR, 'shp');
const FGB_OUT_DIR = path.resolve('public/layers/fgb');
const AUDIT_FILE = path.join(BASE_DIR, 'audit-report.json');

fs.mkdirSync(FGB_OUT_DIR, { recursive: true });

// Limpiar residuos temporales (.gpkg / .vrt)
for (const entry of fs.readdirSync(BASE_DIR)) {
  if (entry.endsWith('.gpkg') || entry.endsWith('.vrt')) {
    fs.unlinkSync(path.join(BASE_DIR, entry));
  }
}

// 1. Limpiar variables PROJ de PostgreSQL y fijar codificación CP850 para acentos de INEGI
const cleanEnv = {
  ...process.env,
  SHAPE_ENCODING: 'CP850',
};
if (cleanEnv.PROJ_LIB?.includes('PostgreSQL')) delete cleanEnv.PROJ_LIB;
if (cleanEnv.PROJ_DATA?.includes('PostgreSQL')) delete cleanEnv.PROJ_DATA;

try {
  const ogrFirstPath = execSync('where ogr2ogr', { encoding: 'utf-8' }).split(/\r?\n/)[0].trim();
  const ogrDir = path.dirname(ogrFirstPath);
  const candidateDirs = [
    path.resolve(ogrDir, '../share/proj'),
    path.resolve(ogrDir, 'share/proj'),
    'C:\\OSGeo4W\\share\\proj',
    'C:\\Program Files\\QGIS 3.34\\share\\proj',
    'C:\\Program Files\\QGIS 3.36\\share\\proj',
    'C:\\Program Files\\QGIS 3.38\\share\\proj',
    'C:\\Program Files\\QGIS 3.40\\share\\proj',
  ];
  for (const dir of candidateDirs) {
    if (fs.existsSync(path.join(dir, 'proj.db'))) {
      cleanEnv.PROJ_LIB = dir;
      cleanEnv.PROJ_DATA = dir;
      break;
    }
  }
} catch {
  // Continuar con entorno limpio
}

function getShapefileGeometryCategory(shpPath) {
  const fd = fs.openSync(shpPath, 'r');
  try {
    const header = Buffer.alloc(36);
    const bytesRead = fs.readSync(fd, header, 0, 36, 0);
    if (bytesRead < 36) return 'UNKNOWN';
    const shapeType = header.readInt32LE(32);
    if (shapeType === 3 || shapeType === 13 || shapeType === 23) return 'LINE';
    if (shapeType === 5 || shapeType === 15 || shapeType === 25) return 'POLYGON';
    if (shapeType === 1 || shapeType === 11 || shapeType === 21 || shapeType === 8) return 'POINT';
    return `OTHER_${shapeType}`;
  } finally {
    fs.closeSync(fd);
  }
}

function classifyExtractedShapefiles() {
  const corrientesShps = [];
  const subcuencasShps = [];
  const cuerposAguaShps = [];

  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.toLowerCase().endsWith('.shp')) {
        const geom = getShapefileGeometryCategory(full);
        if (geom === 'LINE') {
          corrientesShps.push(full);
        } else if (geom === 'POLYGON') {
          if (entry.name.toLowerCase().endsWith('_ha.shp')) {
            cuerposAguaShps.push(full);
          } else {
            subcuencasShps.push(full);
          }
        }
      }
    }
  }

  walk(EXTRACT_DIR);

  corrientesShps.sort();
  subcuencasShps.sort();
  cuerposAguaShps.sort();

  console.log(
    `Shapefiles clasificados -> Corrientes: ${corrientesShps.length} | Subcuencas: ${subcuencasShps.length} | Cuerpos de agua: ${cuerposAguaShps.length}`
  );

  return { corrientesShps, subcuencasShps, cuerposAguaShps };
}

function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function countFgbFeatures(fgbPath) {
  let count = 0;
  const nodeStream = fs.createReadStream(fgbPath);
  const webStream = Readable.toWeb(nodeStream);
  for await (const _feat of deserialize(webStream)) {
    count++;
  }
  return count;
}

async function mergeViaVrtToFlatGeobuf({ shpList, layerName, outputFgbName, selectFields = null }) {
  if (shpList.length === 0) return { featureCount: 0, sizeMB: '0.00' };

  const vrtPath = path.join(BASE_DIR, `${layerName}.vrt`);
  const finalFgb = path.join(FGB_OUT_DIR, outputFgbName);

  if (fs.existsSync(vrtPath)) fs.unlinkSync(vrtPath);
  if (fs.existsSync(finalFgb)) fs.unlinkSync(finalFgb);

  const vrtLayersXml = shpList
    .map((shpPath) => {
      const srcName = path.basename(shpPath, '.shp');
      const normalizedPath = shpPath.replace(/\\/g, '/');
      return `    <OGRVRTLayer name="${escapeXml(srcName)}">\n      <SrcDataSource>${escapeXml(normalizedPath)}</SrcDataSource>\n    </OGRVRTLayer>`;
    })
    .join('\n');

  const vrtContent = `<OGRVRTDataSource>\n  <OGRVRTUnionLayer name="${layerName}">\n    <FieldStrategy>Union</FieldStrategy>\n${vrtLayersXml}\n  </OGRVRTUnionLayer>\n</OGRVRTDataSource>\n`;
  fs.writeFileSync(vrtPath, vrtContent, 'utf-8');

  const selectArg = selectFields ? `-select "${selectFields}"` : '';
  console.log(`\nGenerando ${outputFgbName} desde ${shpList.length} shapefiles (100% resolución)...`);

  const cmd = `ogr2ogr -f FlatGeobuf "${finalFgb}" "${vrtPath}" -t_srs EPSG:4326 -nlt PROMOTE_TO_MULTI ${selectArg} -lco SPATIAL_INDEX=YES -progress`;
  execSync(cmd, { stdio: 'inherit', env: cleanEnv });

  if (fs.existsSync(vrtPath)) fs.unlinkSync(vrtPath);

  const sizeMB = (fs.statSync(finalFgb).size / 1048576).toFixed(2);
  console.log(`Verificando geometrías en ${outputFgbName}...`);
  const featureCount = await countFgbFeatures(finalFgb);

  console.log(`[OK] ${outputFgbName} -> ${featureCount.toLocaleString('es-MX')} geometrías (${sizeMB} MB)`);
  return { featureCount, sizeMB };
}

async function main() {
  const { corrientesShps, subcuencasShps, cuerposAguaShps } = classifyExtractedShapefiles();

  // 1. Subcuencas 1:50,000 (976 polígonos)
  const subcuencasStats = await mergeViaVrtToFlatGeobuf({
    shpList: subcuencasShps,
    layerName: 'subcuencas',
    outputFgbName: 'subcuencas_50k.fgb',
  });

  // 2. Cuerpos de agua 1:50,000 (959 capas)
  const cuerposAguaStats = await mergeViaVrtToFlatGeobuf({
    shpList: cuerposAguaShps,
    layerName: 'cuerpos_agua',
    outputFgbName: 'cuerpos_agua_50k.fgb',
  });

  // 3. Red Hidrográfica 1:50,000 (100% de vértices originales, atributos hidrológicos)
  const corrientesStats = await mergeViaVrtToFlatGeobuf({
    shpList: corrientesShps,
    layerName: 'corrientes',
    outputFgbName: 'red_hidrografica_50k.fgb',
    selectFields: 'CVE_SUBC,ENTIDAD,CONDICION,ORDER_1,LEVEL_1,LENGTHM,ARBSUM_1,PATHL_1',
  });

  const isComplete =
    subcuencasShps.length === 976 &&
    corrientesShps.length === 976 &&
    subcuencasStats.featureCount === 976 &&
    corrientesStats.featureCount > 0;

  const auditReport = {
    fechaAuditoria: new Date().toISOString(),
    completoAl100: isComplete,
    shapefilesSubcuencas: subcuencasShps.length,
    shapefilesCorrientes: corrientesShps.length,
    shapefilesCuerposAgua: cuerposAguaShps.length,
    poligonosSubcuencasFgb: subcuencasStats.featureCount,
    tamanoSubcuencasMB: subcuencasStats.sizeMB,
    tramosCorrientesFgb: corrientesStats.featureCount,
    tamanoCorrientesMB: corrientesStats.sizeMB,
    poligonosCuerposAguaFgb: cuerposAguaStats.featureCount,
    tamanoCuerposAguaMB: cuerposAguaStats.sizeMB,
  };

  fs.writeFileSync(AUDIT_FILE, JSON.stringify(auditReport, null, 2));

  console.log('\n================ AUDITORÍA DE COMPLETITUD SIATL ================');
  console.log(`Subcuencas 1:50k             : ${subcuencasShps.length}/976 -> ${subcuencasStats.featureCount} polígonos (${subcuencasStats.sizeMB} MB)`);
  console.log(`Cuerpos de agua 1:50k        : ${cuerposAguaShps.length} -> ${cuerposAguaStats.featureCount.toLocaleString('es-MX')} polígonos (${cuerposAguaStats.sizeMB} MB)`);
  console.log(`Corrientes 1:50k (Strahler)  : ${corrientesShps.length}/976 -> ${corrientesStats.featureCount.toLocaleString('es-MX')} tramos (${corrientesStats.sizeMB} MB)`);
  console.log(`Estado final                 : ${isComplete ? 'COMPLETO AL 100%' : 'REVISAR REPORTE EN audit-report.json'}`);
  console.log('================================================================\n');
}

main().catch(console.error);