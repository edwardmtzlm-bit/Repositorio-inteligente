import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { slugify } from '../utils/slugify';

const documentBucket = 'documentos';

export interface ContentVideoNote {
  fileName: string;
  originalName: string;
  fileUrl: string;
  mimeType: string;
  uploadedAt: string;
}

function getVideoFolder(contentId: string) {
  return `video-notes/${contentId}`;
}

function getManifestPath(contentId: string) {
  return `${getVideoFolder(contentId)}/index.json`;
}

function getVideoFilePath(contentId: string, fileName: string) {
  return `${getVideoFolder(contentId)}/${fileName}`;
}

function buildPublicUrl(filePath: string) {
  return supabaseAdmin.storage.from(documentBucket).getPublicUrl(filePath).data.publicUrl;
}

async function readManifest(contentId: string): Promise<ContentVideoNote[]> {
  const manifestPath = getManifestPath(contentId);
  const { data, error } = await supabaseAdmin.storage.from(documentBucket).download(manifestPath);

  if (error) {
    if (error.message.toLowerCase().includes('not found') || error.message.toLowerCase().includes('404')) {
      return [];
    }

    throw new Error(`No fue posible cargar el manifiesto de videos: ${error.message}`);
  }

  const raw = await data.text();
  const parsed = JSON.parse(raw) as ContentVideoNote[];

  return parsed
    .filter((item) => item.fileName && item.mimeType && item.uploadedAt)
    .map((item) => ({
      ...item,
      fileUrl: buildPublicUrl(getVideoFilePath(contentId, item.fileName)),
    }))
    .sort((left, right) => new Date(right.uploadedAt).getTime() - new Date(left.uploadedAt).getTime());
}

async function writeManifest(contentId: string, notes: ContentVideoNote[]) {
  const manifestPath = getManifestPath(contentId);
  const payload = Buffer.from(JSON.stringify(notes, null, 2), 'utf-8');

  const { error } = await supabaseAdmin.storage.from(documentBucket).upload(manifestPath, payload, {
    contentType: 'application/json',
    upsert: true,
  });

  if (error) {
    throw new Error(`No fue posible guardar el manifiesto de videos: ${error.message}`);
  }
}

export async function listContentVideoNotes(contentId: string) {
  return readManifest(contentId);
}

export async function uploadContentVideoNote(contentId: string, file: Buffer, mimeType: string, originalName: string) {
  const extension = originalName.split('.').pop() || 'mp4';
  const baseName = slugify(originalName.replace(/\.[^.]+$/, '')) || 'video';
  const fileName = `${baseName}-${randomUUID()}.${extension}`;
  const filePath = getVideoFilePath(contentId, fileName);

  const { error } = await supabaseAdmin.storage.from(documentBucket).upload(filePath, file, {
    contentType: mimeType,
    upsert: false,
  });

  if (error) {
    throw new Error(`No fue posible subir el video: ${error.message}`);
  }

  const notes = await readManifest(contentId);
  const nextNote: ContentVideoNote = {
    fileName,
    originalName,
    fileUrl: buildPublicUrl(filePath),
    mimeType,
    uploadedAt: new Date().toISOString(),
  };

  await writeManifest(contentId, [nextNote, ...notes]);

  return listContentVideoNotes(contentId);
}

export async function deleteContentVideoNote(contentId: string, fileName: string) {
  const filePath = getVideoFilePath(contentId, fileName);

  const { error } = await supabaseAdmin.storage.from(documentBucket).remove([filePath]);

  if (error) {
    throw new Error(`No fue posible eliminar el video: ${error.message}`);
  }

  const notes = await readManifest(contentId);
  const remainingNotes = notes.filter((note) => note.fileName !== fileName);
  await writeManifest(contentId, remainingNotes);

  return remainingNotes;
}

export async function removeAllContentVideoNotes(contentId: string) {
  const notes = await readManifest(contentId);
  const paths = notes.map((note) => getVideoFilePath(contentId, note.fileName));
  const manifestPath = getManifestPath(contentId);
  const targets = [...paths, manifestPath];

  if (targets.length === 0) {
    return;
  }

  const { error } = await supabaseAdmin.storage.from(documentBucket).remove(targets);

  if (error) {
    throw new Error(`No fue posible limpiar videos del contenido eliminado: ${error.message}`);
  }
}
