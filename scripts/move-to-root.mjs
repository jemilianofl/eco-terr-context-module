import { S3Client, CopyObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs';
import path from 'path';

// Cargar .env
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

const s3 = new S3Client({
  region: 'auto',
  endpoint: process.env.ENDPOINT_S3_CLIENT?.trim(),
  credentials: {
    accessKeyId: process.env.ACCESS_KEY_ID_S3?.trim(),
    secretAccessKey: process.env.SECRET_ACCESS_KEY_S3?.trim(),
  },
});

const BUCKET_NAME = 'profepa-capas-sig';
const filesToMove = [
  'usv_serie_2.fgb',
  'usv_serie_3.fgb',
  'usv_serie_4.fgb',
  'usv_serie_5.fgb',
  'usv_serie_6.fgb',
  'usv_serie_7.fgb'
];

async function moveToRoot() {
  console.log('Moviendo capas de fgb/ a la raíz del bucket...\n');

  for (const file of filesToMove) {
    // 1. Copiar a la raíz (operación interna en servidores de Cloudflare)
    await s3.send(new CopyObjectCommand({
      Bucket: BUCKET_NAME,
      CopySource: `${BUCKET_NAME}/fgb/${file}`,
      Key: file,
    }));

    // 2. Borrar el que estaba dentro de fgb/
    await s3.send(new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: `fgb/${file}`,
    }));

    console.log(`[OK] Movido a la raíz: ${file}`);
  }

  console.log('\n¡Estructura homologada en la raíz del bucket!');
}

moveToRoot().catch(console.error);