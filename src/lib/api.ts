import type { ContentListItem, ProcessingMode, ProcessingResponse, RepositoryAssistantResponse, SaveContentPayload, TagCatalogBlock, TagOption } from '../types/content';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/$/, '');

function apiUrl(path: string) {
  return API_BASE_URL ? `${API_BASE_URL}${path}` : path;
}

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new Error(errorBody?.error || 'Error inesperado en la API');
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

  const response = await fetch(apiUrl(`/api/contents?${params.toString()}`), {
    cache: 'no-store',
  });
  return parseJson<ContentListItem[]>(response);
}

export async function fetchTags() {
  const response = await fetch(apiUrl('/api/tags'), {
    cache: 'no-store',
  });
  return parseJson<TagOption[]>(response);
}

export async function fetchTagCatalog() {
  const response = await fetch(apiUrl('/api/tag-catalog'), {
    cache: 'no-store',
  });
  return parseJson<{ blocks: TagCatalogBlock[] }>(response);
}

export async function updateTagCatalog(blocks: TagCatalogBlock[]) {
  const response = await fetch(apiUrl('/api/tag-catalog'), {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ blocks }),
  });

  return parseJson<{ blocks: TagCatalogBlock[] }>(response);
}

export async function deleteTag(tagId: string) {
  const response = await fetch(apiUrl(`/api/tags/${tagId}`), {
    method: 'DELETE',
  });

  return parseJson<{ id: string; nombre: string }>(response);
}

export async function fetchLibraryDocxUrl() {
  const response = await fetch(apiUrl('/api/library-docx'), {
    cache: 'no-store',
  });
  return parseJson<{ url: string }>(response);
}

export async function syncLibraryDocx() {
  const response = await fetch(apiUrl('/api/library-docx/sync'), {
    method: 'POST',
  });

  return parseJson<{ url: string; count: number; appendedCount: number; skippedCount: number }>(response);
}

export async function regenerateExistingDocuments() {
  const response = await fetch(apiUrl('/api/library-docx/regenerate'), {
    method: 'POST',
  });

  return parseJson<{ url: string; count: number }>(response);
}

export async function processImages(files: File[], mode: ProcessingMode, supplementalText = '', sourceUrl = '', customTitle = '') {
  const formData = new FormData();
  files.forEach((file) => formData.append('images', file));
  formData.append('mode', mode);
  formData.append('supplementalText', supplementalText);
  formData.append('sourceUrl', sourceUrl);
  formData.append('customTitle', customTitle);

  const response = await fetch(apiUrl('/api/process-image'), {
    method: 'POST',
    body: formData,
  });

  return parseJson<ProcessingResponse>(response);
}

export async function saveContent(payload: SaveContentPayload) {
  const response = await fetch(apiUrl('/api/contents'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return parseJson<{ id: string }>(response);
}

export async function enrichContent(contentId: string, supplementalText: string) {
  const response = await fetch(apiUrl(`/api/contents/${contentId}/enrich`), {
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
  const response = await fetch(apiUrl(`/api/contents/${contentId}/metadata`), {
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

  const response = await fetch(apiUrl('/api/process-image/upload'), {
    method: 'POST',
    body: formData,
  });

  return parseJson<{ urls: string[] }>(response);
}

export async function appendContentImages(contentId: string, imageUrls: string[]) {
  const response = await fetch(apiUrl(`/api/contents/${contentId}/images`), {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ imageUrls }),
  });

  return parseJson<ContentListItem>(response);
}

export async function deleteContent(contentId: string) {
  const response = await fetch(apiUrl(`/api/contents/${contentId}`), {
    method: 'DELETE',
    cache: 'no-store',
  });

  return parseJson<{ id: string; libraryDocxUrl: string }>(response);
}

export async function queryRepositoryAssistant(question: string) {
  const response = await fetch(apiUrl('/api/assistant/query'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ question }),
  });

  return parseJson<RepositoryAssistantResponse>(response);
}
