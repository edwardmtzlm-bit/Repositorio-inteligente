import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { slugify } from '../utils/slugify';

const documentBucket = 'documentos';

export interface ContentAudioNote {
  fileName: string;
  originalName: string;
  fileUrl: string;
  mimeType: string;
  uploadedAt: string;
  transcription: string | null;
  transcribedAt: string | null;
}

function getAudioFolder(contentId: string) {
  return `audio-notes/${contentId}`;
}

function getManifestPath(contentId: string) {
  return `${getAudioFolder(contentId)}/index.json`;
}

function getAudioFilePath(contentId: string, fileName: string) {
  return `${getAudioFolder(contentId)}/${fileName}`;
}

function buildPublicUrl(filePath: string) {
  return supabaseAdmin.storage.from(documentBucket).getPublicUrl(filePath).data.publicUrl;
}

async function readManifest(contentId: string): Promise<ContentAudioNote[]> {
  const manifestPath = getManifestPath(contentId);
  const { data, error } = await supabaseAdmin.storage.from(documentBucket).download(manifestPath);

  if (error) {
    if (error.message.toLowerCase().includes('not found') || error.message.toLowerCase().includes('404')) {
      return [];
    }

    throw new Error(`No fue posible cargar el manifiesto de audios: ${error.message}`);
  }

  const raw = await data.text();
  const parsed = JSON.parse(raw) as ContentAudioNote[];

  return parsed
    .filter((item) => item.fileName && item.mimeType && item.uploadedAt)
    .map((item) => ({
      ...item,
      fileUrl: buildPublicUrl(getAudioFilePath(contentId, item.fileName)),
      transcription: item.transcription || null,
      transcribedAt: item.transcribedAt || null,
    }))
    .sort((left, right) => new Date(right.uploadedAt).getTime() - new Date(left.uploadedAt).getTime());
}

async function writeManifest(contentId: string, notes: ContentAudioNote[]) {
  const manifestPath = getManifestPath(contentId);
  const payload = Buffer.from(JSON.stringify(notes, null, 2), 'utf-8');

  const { error } = await supabaseAdmin.storage.from(documentBucket).upload(manifestPath, payload, {
    contentType: 'application/json',
    upsert: true,
  });

  if (error) {
    throw new Error(`No fue posible guardar el manifiesto de audios: ${error.message}`);
  }
}

export async function listContentAudioNotes(contentId: string) {
  return readManifest(contentId);
}

export async function uploadContentAudioNote(contentId: string, file: Buffer, mimeType: string, originalName: string) {
  const extension = originalName.split('.').pop() || 'm4a';
  const baseName = slugify(originalName.replace(/\.[^.]+$/, '')) || 'audio';
  const fileName = `${baseName}-${randomUUID()}.${extension}`;
  const filePath = getAudioFilePath(contentId, fileName);

  const { error } = await supabaseAdmin.storage.from(documentBucket).upload(filePath, file, {
    contentType: mimeType,
    upsert: false,
  });

  if (error) {
    throw new Error(`No fue posible subir el audio: ${error.message}`);
  }

  const notes = await readManifest(contentId);
  const nextNote: ContentAudioNote = {
    fileName,
    originalName,
    fileUrl: buildPublicUrl(filePath),
    mimeType,
    uploadedAt: new Date().toISOString(),
    transcription: null,
    transcribedAt: null,
  };

  await writeManifest(contentId, [nextNote, ...notes]);

  return listContentAudioNotes(contentId);
}

export async function deleteContentAudioNote(contentId: string, fileName: string) {
  const filePath = getAudioFilePath(contentId, fileName);

  const { error } = await supabaseAdmin.storage.from(documentBucket).remove([filePath]);

  if (error) {
    throw new Error(`No fue posible eliminar el audio: ${error.message}`);
  }

  const notes = await readManifest(contentId);
  const remainingNotes = notes.filter((note) => note.fileName !== fileName);
  await writeManifest(contentId, remainingNotes);

  return remainingNotes;
}

export async function updateAudioTranscription(
  contentId: string,
  fileName: string,
  transcription: string,
) {
  const notes = await readManifest(contentId);
  const updatedNotes = notes.map((note) =>
    note.fileName === fileName
      ? {
          ...note,
          transcription,
          transcribedAt: new Date().toISOString(),
        }
      : note,
  );

  await writeManifest(contentId, updatedNotes);

  return updatedNotes;
}

export async function downloadContentAudioNote(contentId: string, fileName: string) {
  const filePath = getAudioFilePath(contentId, fileName);
  const { data, error } = await supabaseAdmin.storage.from(documentBucket).download(filePath);

  if (error || !data) {
    throw new Error(`No fue posible descargar el audio para transcribir: ${error?.message}`);
  }

  return Buffer.from(await data.arrayBuffer());
}

export async function removeAllContentAudioNotes(contentId: string) {
  const notes = await readManifest(contentId);
  const paths = notes.map((note) => getAudioFilePath(contentId, note.fileName));
  const manifestPath = getManifestPath(contentId);
  const targets = [...paths, manifestPath];

  if (targets.length === 0) {
    return;
  }

  const { error } = await supabaseAdmin.storage.from(documentBucket).remove(targets);

  if (error) {
    throw new Error(`No fue posible limpiar audios del contenido eliminado: ${error.message}`);
  }
}
