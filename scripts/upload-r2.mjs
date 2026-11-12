import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import fs from 'fs';
import path from 'path';

// Cargar variables del .env si no están presentes en process.env
const envPath = path.resolve('.env');
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, 'utf-8');
  envConfig.split('\n').forEach((line) => {
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
  console.error('[ERROR] Faltan variables en el archivo .env (ENDPOINT_S3_CLIENT, ACCESS_KEY_ID_S3, SECRET_ACCESS_KEY_S3).');
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

// Los 6 archivos que rebasaron el límite web de 300 MB
const largeFiles = [
  'usv_serie_2.fgb',
  'usv_serie_3.fgb',
  'usv_serie_4.fgb',
  'usv_serie_5.fgb',
  'usv_serie_6.fgb',
  'usv_serie_7.fgb'
];

async function uploadLargeFiles() {
  console.log(`Conectado al bucket: ${BUCKET_NAME}`);
  console.log('Iniciando subida Multipart (fragmentos de 20 MB)...\n');

  for (const fileName of largeFiles) {
    const filePath = path.resolve('public/layers/fgb', fileName);
    if (!fs.existsSync(filePath)) {
      console.warn(`[OMITIDO] Archivo no encontrado: ${fileName}`);
      continue;
    }

    const sizeMB = (fs.statSync(filePath).size / (1024 * 1024)).toFixed(2);
    console.log(`Subiendo ${fileName} (${sizeMB} MB)...`);

    const fileStream = fs.createReadStream(filePath);

    const parallelUpload = new Upload({
      client: s3,
      params: {
        Bucket: BUCKET_NAME,
        Key: `fgb/${fileName}`,
        Body: fileStream,
      },
      partSize: 20 * 1024 * 1024, // Fragmentos de 20 MB
      queueSize: 4,               // 4 hilos en paralelo
    });

    parallelUpload.on('httpUploadProgress', (progress) => {
      if (progress.loaded && progress.total) {
        const percent = ((progress.loaded / progress.total) * 100).toFixed(1);
        process.stdout.write(`\rProgreso de ${fileName}: ${percent}%`);
      }
    });

    await parallelUpload.done();
    console.log(`\n[OK] ${fileName} subido exitosamente.\n`);
  }

  console.log('¡Todas las capas masivas se han subido a Cloudflare R2!');
}

uploadLargeFiles().catch(console.error);