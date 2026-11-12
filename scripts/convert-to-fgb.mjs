import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// 1. Limpiar variables de entorno contaminadas por PostgreSQL
const cleanEnv = { ...process.env };

if (cleanEnv.PROJ_LIB && cleanEnv.PROJ_LIB.includes('PostgreSQL')) {
  delete cleanEnv.PROJ_LIB;
}
if (cleanEnv.PROJ_DATA && cleanEnv.PROJ_DATA.includes('PostgreSQL')) {
  delete cleanEnv.PROJ_DATA;
}

// 2. Localizar el proj.db legítimo de GDAL / QGIS / OSGeo4W
try {
  const ogrWhere = execSync('where ogr2ogr', { encoding: 'utf-8' });
  const ogrFirstPath = ogrWhere.split(/\r?\n/)[0].trim();
  const ogrDir = path.dirname(ogrFirstPath);

  const candidateDirs = [
    path.resolve(ogrDir, '../share/proj'),
    path.resolve(ogrDir, 'share/proj'),
    path.resolve(ogrDir, '../Resources/proj'),
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
      console.log(`[INFO] Usando PROJ legítimo desde: ${dir}`);
      break;
    }
  }
} catch {
  // Si no encuentra 'where', el proceso continuará con las variables limpias
}

const layers = [
  // Capas Ecológicas
  { id: 'aicas', shp: 'public/layers/AICAS/AICAS-2015-SHP/aicas15gw.shp' },
  { id: 'advc', shp: 'public/layers/ANPS/ADVC/649_ADVC_VIGENTES_OCTUBRE_2026.shp' },
  { id: 'anp_estatal', shp: 'public/layers/ANPS/ANPS-Estatales/SHP/anpest25gw.shp' },
  { id: 'anp_federal', shp: 'public/layers/ANPS/ANPS-Federales/232-ANP_ITRF08_19162026.shp' },
  { id: 'ramsar', shp: 'public/layers/Ramsar/SITIOS_RAMSAR.shp' },
  { id: 'rhp', shp: 'public/layers/RHP/RHP-2002_SHP/rhpri4mgw.shp' },
  { id: 'rtp', shp: 'public/layers/RTP/SHP/rtp1mgw.shp' },
  
  // Cuencas y Clima
  { id: 'cuencas_2007', shp: 'public/layers/Cuencas y subcuencas/Cuencas 2007/SHP/cue250k_07gw.shp' },
  { id: 'cuencas_cna', shp: 'public/layers/Cuencas y subcuencas/Cuencas CNA/SHP/cue250kgw.shp' },
  { id: 'cuencas_ig', shp: 'public/layers/Cuencas y subcuencas/Cuencas IG/SHP/cuenc4mgw.shp' },
  { id: 'subcuencas_conabio', shp: 'public/layers/Cuencas y subcuencas/Subcuencas CONABIO/SHP/subcu1mgw.shp' },
  { id: 'climas', shp: 'public/layers/Unidad climaticas/unidadesClimaticas.shp' },

  // Capas Masivas
  { id: 'edafologia', shp: 'public/layers/Edafologia/cdv_edaf_esc_250k_serie II_cont_nac.shp' },
  { id: 'usv_serie_1', shp: 'public/layers/Uso de suelo y vegetacion/Serie I/USyV_S_I_SHP/usv250kcs1agw.shp' },
  { id: 'usv_serie_2', shp: 'public/layers/Uso de suelo y vegetacion/Serie II/USyV_S_II_SHP/usv250ks2gw.shp' },
  { id: 'usv_serie_3', shp: 'public/layers/Uso de suelo y vegetacion/Serie III/USyV_S_III_SHP/usv250ks3gw.shp' },
  { id: 'usv_serie_4', shp: 'public/layers/Uso de suelo y vegetacion/Serie IV/USyV_S_IV_SHP/usv250ks4gw.shp' },
  { id: 'usv_serie_5', shp: 'public/layers/Uso de suelo y vegetacion/Serie V/USyV_S_V_SHP/usv250s5ugw.shp' },
  { id: 'usv_serie_6', shp: 'public/layers/Uso de suelo y vegetacion/Serie VI/USyV_S_VI_SHP/usv250s6gw.shp' },
  { id: 'usv_serie_7', shp: 'public/layers/Uso de suelo y vegetacion/Serie VII/USyV_S_VII_SHP/usv250s7gw.shp' }
];

const outDir = path.resolve('public/layers/fgb');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

for (const layer of layers) {
  const shpPath = path.resolve(layer.shp);
  if (!fs.existsSync(shpPath)) {
    console.warn(`[OMITIDO] Archivo no encontrado: ${layer.shp}`);
    continue;
  }

  const outFile = path.join(outDir, `${layer.id}.fgb`);
  console.log(`Convirtiendo ${layer.id} con 100% de calidad y creando índice espacial...`);

  const cmd = `ogr2ogr -f FlatGeobuf "${outFile}" "${shpPath}" -t_srs EPSG:4326 -lco SPATIAL_INDEX=YES`;
  
  try {
    execSync(cmd, { stdio: 'inherit', env: cleanEnv });
    const sizeMB = (fs.statSync(outFile).size / (1024 * 1024)).toFixed(2);
    console.log(`[OK] Generado: ${layer.id}.fgb (${sizeMB} MB)\n`);
  } catch (error) {
    console.error(`[ERROR] en ${layer.id}:`, error.message);
  }
}