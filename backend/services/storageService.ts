import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { slugify } from '../utils/slugify';

const imageBucket = 'imagenes';
const documentBucket = 'documentos';

export async function uploadImage(file: Buffer, mimeType: string, originalName: string) {
  const extension = originalName.split('.').pop() || 'jpg';
  const fileName = `${randomUUID()}.${extension}`;
  const filePath = `contenidos/${fileName}`;

  const { error } = await supabaseAdmin.storage.from(imageBucket).upload(filePath, file, {
    contentType: mimeType,
    upsert: false,
  });

  if (error) {
    throw new Error(`No fue posible subir la imagen: ${error.message}`);
  }

  return supabaseAdmin.storage.from(imageBucket).getPublicUrl(filePath).data.publicUrl;
}

export async function uploadDocx(buffer: Buffer, title: string) {
  const fileName = `${slugify(title) || randomUUID()}-${randomUUID()}.docx`;
  const filePath = `documentos/${fileName}`;

  const { error } = await supabaseAdmin.storage.from(documentBucket).upload(filePath, buffer, {
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    upsert: false,
  });

  if (error) {
    throw new Error(`No fue posible subir el archivo Word: ${error.message}`);
  }

  return supabaseAdmin.storage.from(documentBucket).getPublicUrl(filePath).data.publicUrl;
}
