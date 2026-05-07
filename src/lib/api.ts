import type { ContentAudioNote, ContentListItem, ContentVideoNote, ProcessingMode, ProcessingResponse, RepositoryAssistantResponse, SaveContentPayload, TagCatalogBlock, TagOption } from '../types/content';

const CONFIGURED_API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/$/, '');

function shouldUseLocalApi() {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
}

function apiUrl(path: string) {
  const API_BASE_URL = shouldUseLocalApi() ? '' : CONFIGURED_API_BASE_URL;
  return API_BASE_URL ? `${API_BASE_URL}${path}` : path;
}

function configuredApiUrl(path: string) {
  return CONFIGURED_API_BASE_URL ? `${CONFIGURED_API_BASE_URL}${path}` : path;
}

async function fetchWithFallback(path: string, init?: RequestInit, allowRemoteFallback = true) {
  const primaryUrl = apiUrl(path);

  try {
    return await fetch(primaryUrl, init);
  } catch (error) {
    const canRetryRemotely =
      allowRemoteFallback &&
      shouldUseLocalApi() &&
      !!CONFIGURED_API_BASE_URL &&
      primaryUrl !== configuredApiUrl(path);

    if (!canRetryRemotely) {
      throw error;
    }

    return fetch(configuredApiUrl(path), init);
  }
}

async function parseJson<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type') || '';

  if (!response.ok) {
    if (contentType.includes('application/json')) {
      const errorBody = await response.json().catch(() => null);
      throw new Error(errorBody?.error || 'Error inesperado en la API');
    }

    const errorText = await response.text().catch(() => '');

    if (errorText.toLowerCase().includes('<!doctype') || errorText.toLowerCase().includes('<html')) {
      throw new Error('La API devolvió una página HTML en lugar de JSON. Revisa que el backend correcto esté corriendo y actualizado.');
    }

    throw new Error(errorText.trim() || 'Error inesperado en la API');
  }

  if (!contentType.includes('application/json')) {
    throw new Error('La API devolvió una respuesta HTML en lugar de JSON. Revisa que el backend correcto esté corriendo y actualizado.');
  }

  return response.json() as Promise<T>;
}

export async function fetchContents(search = '', tags: string[] = []) {
  const params = new URLSearchParams();

  if (search.trim()) {
    params.set('q', search.trim());
  }

  if (tags.length > 0) {
    params.set('tags', tags.join(','));
  }

  const response = await fetchWithFallback(`/api/contents?${params.toString()}`, {
    cache: 'no-store',
  });
  return parseJson<ContentListItem[]>(response);
}

export async function fetchTags() {
  const response = await fetchWithFallback('/api/tags', {
    cache: 'no-store',
  });
  return parseJson<TagOption[]>(response);
}

export async function fetchTagCatalog() {
  const response = await fetchWithFallback('/api/tag-catalog', {
    cache: 'no-store',
  });
  return parseJson<{ blocks: TagCatalogBlock[] }>(response);
}

export async function updateTagCatalog(blocks: TagCatalogBlock[]) {
  const response = await fetchWithFallback('/api/tag-catalog', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ blocks }),
  });

  return parseJson<{ blocks: TagCatalogBlock[] }>(response);
}

export async function deleteTag(tagId: string) {
  const response = await fetchWithFallback(`/api/tags/${tagId}`, {
    method: 'DELETE',
  });

  return parseJson<{ id: string; nombre: string }>(response);
}

export async function fetchLibraryDocxUrl() {
  const response = await fetchWithFallback('/api/library-docx', {
    cache: 'no-store',
  });
  return parseJson<{ url: string }>(response);
}

export async function syncLibraryDocx() {
  const response = await fetchWithFallback('/api/library-docx/sync', {
    method: 'POST',
  });

  return parseJson<{ url: string; count: number; appendedCount: number; skippedCount: number }>(response);
}

export async function regenerateExistingDocuments() {
  const response = await fetchWithFallback('/api/library-docx/regenerate', {
    method: 'POST',
  });

  return parseJson<{ url: string; count: number }>(response);
}

export async function processImages(
  files: File[],
  mode: ProcessingMode,
  supplementalText = '',
  sourceUrl = '',
  customTitle = '',
  audioFile?: File | null,
  videoFile?: File | null,
) {
  const formData = new FormData();
  files.forEach((file) => formData.append('images', file));
  if (audioFile) {
    formData.append('audio', audioFile);
  }
  if (videoFile) {
    formData.append('video', videoFile);
  }
  formData.append('mode', mode);
  formData.append('supplementalText', supplementalText);
  formData.append('sourceUrl', sourceUrl);
  formData.append('customTitle', customTitle);

  let response: Response;

  try {
    response = await fetchWithFallback(
      '/api/process-image',
      {
        method: 'POST',
        body: formData,
      },
      !audioFile && !videoFile,
    );
  } catch (error) {
    if (audioFile || videoFile) {
      throw new Error(
        `Para procesar ${audioFile ? 'audio' : 'video'} como contenido nuevo necesitas el backend local corriendo con esta función actualizada, o primero desplegar este cambio en Render.`,
      );
    }

    throw error;
  }

  return parseJson<ProcessingResponse>(response);
}

export async function saveContent(payload: SaveContentPayload) {
  const response = await fetchWithFallback('/api/contents', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return parseJson<{ id: string }>(response);
}

export async function enrichContent(contentId: string, supplementalText: string) {
  const response = await fetchWithFallback(`/api/contents/${contentId}/enrich`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ supplementalText }),
  });

  return parseJson<ContentListItem>(response);
}

export async function updateContentMetadata(
  contentId: string,
  payload: { title: string; sourceUrl: string; notes: string },
) {
  const response = await fetchWithFallback(`/api/contents/${contentId}/metadata`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return parseJson<ContentListItem>(response);
}

export async function uploadExtraImages(files: File[]) {
  const formData = new FormData();
  files.forEach((file) => formData.append('images', file));

  const response = await fetchWithFallback('/api/process-image/upload', {
    method: 'POST',
    body: formData,
  });

  return parseJson<{ urls: string[] }>(response);
}

export async function appendContentImages(contentId: string, imageUrls: string[]) {
  const response = await fetchWithFallback(`/api/contents/${contentId}/images`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ imageUrls }),
  });

  return parseJson<ContentListItem>(response);
}

export async function deleteContent(contentId: string) {
  const response = await fetchWithFallback(`/api/contents/${contentId}`, {
    method: 'DELETE',
    cache: 'no-store',
  });

  return parseJson<{ id: string; libraryDocxUrl: string }>(response);
}

export async function queryRepositoryAssistant(question: string) {
  const response = await fetchWithFallback('/api/assistant/query', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ question }),
  });

  return parseJson<RepositoryAssistantResponse>(response);
}

export async function fetchContentAudioNotes(contentId: string) {
  const response = await fetchWithFallback(`/api/contents/${contentId}/audio`, {
    cache: 'no-store',
  });

  return parseJson<{ notes: ContentAudioNote[] }>(response);
}

export async function uploadContentAudio(contentId: string, file: File) {
  const formData = new FormData();
  formData.append('audio', file);

  const response = await fetchWithFallback(`/api/contents/${contentId}/audio`, {
    method: 'POST',
    body: formData,
  });

  return parseJson<{ notes: ContentAudioNote[] }>(response);
}

export async function transcribeContentAudio(contentId: string, fileName: string) {
  const response = await fetchWithFallback(`/api/contents/${contentId}/audio/${encodeURIComponent(fileName)}/transcribe`, {
    method: 'POST',
  });

  return parseJson<{ notes: ContentAudioNote[] }>(response);
}

export async function deleteContentAudio(contentId: string, fileName: string) {
  const response = await fetchWithFallback(`/api/contents/${contentId}/audio/${encodeURIComponent(fileName)}`, {
    method: 'DELETE',
  });

  return parseJson<{ notes: ContentAudioNote[] }>(response);
}

export async function fetchContentVideoNotes(contentId: string) {
  const response = await fetchWithFallback(`/api/contents/${contentId}/video`, {
    cache: 'no-store',
  });

  return parseJson<{ notes: ContentVideoNote[] }>(response);
}

export async function uploadContentVideo(contentId: string, file: File) {
  const formData = new FormData();
  formData.append('video', file);

  const response = await fetchWithFallback(`/api/contents/${contentId}/video`, {
    method: 'POST',
    body: formData,
  });

  return parseJson<{ notes: ContentVideoNote[] }>(response);
}

export async function deleteContentVideo(contentId: string, fileName: string) {
  const response = await fetchWithFallback(`/api/contents/${contentId}/video/${encodeURIComponent(fileName)}`, {
    method: 'DELETE',
  });

  return parseJson<{ notes: ContentVideoNote[] }>(response);
}
