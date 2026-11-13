import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { deserialize } from 'flatgeobuf/lib/mjs/geojson.js';
import { Readable } from 'stream';
import fs from 'fs';
import path from 'path';

// 1. Cargar variables de .env
const envPath = path.resolve('.env');
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, 'utf-8');
  envConfig.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...values] = trimmed.split('=');
      const val = values.join('=').trim().replace(/^["']|["']$/g, '');
      if (key && val) process.env[key.trim()] = val;
    }
  });
}

const ENDPOINT = process.env.ENDPOINT_S3_CLIENT?.trim();
const ACCESS_KEY_ID = process.env.ACCESS_KEY_ID_S3?.trim();
const SECRET_ACCESS_KEY = process.env.SECRET_ACCESS_KEY_S3?.trim();
const BUCKET_NAME = 'profepa-capas-sig';

if (!ENDPOINT || !ACCESS_KEY_ID || !SECRET_ACCESS_KEY) {
  console.error('[ERROR] Faltan credenciales S3 en .env');
  process.exit(1);
}

const s3 = new S3Client({
  region: 'auto',
  endpoint: ENDPOINT,
  credentials: {
    accessKeyId: ACCESS_KEY_ID,
    secretAccessKey: SECRET_ACCESS_KEY,
  },
});

const shouldUpload = process.argv.includes('--upload');

async function inspectLocalFgb(fileName) {
  const filePath = path.resolve('public/layers/fgb', fileName);
  if (!fs.existsSync(filePath)) return;

  console.log(`\n--- Muestra de ${fileName} ---`);
  const nodeStream = fs.createReadStream(filePath);
  const webStream = Readable.toWeb(nodeStream);

  let count = 0;
  for await (const feature of deserialize(webStream)) {
    if (count === 0) {
      const coords = JSON.stringify(feature.geometry?.coordinates).slice(0, 100);
      console.log('Coordenadas ejemplo:', coords, '...');
    }
    console.log(`Registro ${count + 1}:`, feature.properties);
    count++;
    if (count >= 3) break;
  }
  nodeStream.destroy();
}

async function main() {
  const localDir = path.resolve('public/layers/fgb');
  const localFiles = fs.readdirSync(localDir).filter((f) => f.endsWith('.fgb')).sort();

  // Consultar objetos en la raíz del bucket R2
  const listed = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET_NAME }));
  const r2Map = new Map();
  for (const obj of listed.Contents || []) {
    if (obj.Key) r2Map.set(obj.Key, obj.Size || 0);
  }

  const missingFiles = [];
  const table = localFiles.map((file) => {
    const localBytes = fs.statSync(path.join(localDir, file)).size;
    const localMB = `${(localBytes / 1048576).toFixed(2)} MB`;
    const inRoot = r2Map.has(file);
    const inSubfolder = r2Map.has(`fgb/${file}`);

    let estado = 'FALTA EN R2';
    if (inRoot) {
      estado = `OK en raíz (${(r2Map.get(file) / 1048576).toFixed(2)} MB)`;
    } else if (inSubfolder) {
      estado = 'EN SUBCARPETA fgb/ (mover a raíz)';
    } else {
      missingFiles.push(file);
    }

    return { Archivo: file, Local: localMB, Estado_R2: estado };
  });

  console.table(table);

  // Inspeccionar atributos de climas y edafología
  await inspectLocalFgb('climas.fgb');
  await inspectLocalFgb('edafologia.fgb');

  if (!shouldUpload) {
    if (missingFiles.length > 0) {
      console.log(`\nFaltan ${missingFiles.length} archivo(s) por subir: ${missingFiles.join(', ')}`);
      console.log('Ejecuta: node sync-r2.mjs --upload   para subirlos automáticamente a la raíz de R2.');
    } else {
      console.log('\nTodos los archivos .fgb ya están en la raíz de R2.');
    }
    return;
  }

  // Subir archivos faltantes en multipart
  for (const fileName of missingFiles) {
    const filePath = path.join(localDir, fileName);
    const sizeMB = (fs.statSync(filePath).size / 1048576).toFixed(2);
    console.log(`\nSubiendo ${fileName} (${sizeMB} MB) a la raíz de ${BUCKET_NAME}...`);

    const upload = new Upload({
      client: s3,
      params: {
        Bucket: BUCKET_NAME,
        Key: fileName,
        Body: fs.createReadStream(filePath),
        ContentType: 'application/octet-stream',
      },
      partSize: 20 * 1024 * 1024,
      queueSize: 4,
    });

    upload.on('httpUploadProgress', (p) => {
      if (p.loaded && p.total) {
        process.stdout.write(`\rProgreso: ${((p.loaded / p.total) * 100).toFixed(1)}%`);
      }
    });

    await upload.done();
    console.log(`\n[OK] ${fileName} subido.`);
  }
}

main().catch(console.error);