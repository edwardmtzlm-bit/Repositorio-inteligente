export interface TagOption {
  id: string | null;
  nombre: string;
  tipo: 'manual' | 'ia';
  frecuencia: number;
  exists: boolean;
  source: 'existing' | 'ai-suggested' | 'manual-created';
  bloque: string | null;
}

export interface TagCatalogBlock {
  id: string;
  nombre: string;
  tags: string[];
}

export interface ContentListItem {
  id: string;
  imagen_url: string;
  imagenes_urls: string[];
  fuente_url: string | null;
  notas: string;
  titulo: string;
  resumen: string;
  resumen_largo: string;
  texto_original: string;
  texto_traducido: string;
  fecha: string;
  docx_url: string;
  tags: TagOption[];
}

export interface ContentAudioNote {
  fileName: string;
  originalName: string;
  fileUrl: string;
  mimeType: string;
  uploadedAt: string;
  transcription: string | null;
  transcribedAt: string | null;
}

export interface ContentVideoNote {
  fileName: string;
  originalName: string;
  fileUrl: string;
  mimeType: string;
  uploadedAt: string;
}

export interface RepositoryAssistantResponse {
  answer: string;
  matchedContentIds: string[];
  candidateCount: number;
  reviewedItems: RepositoryAssistantMatch[];
  groups?: RepositoryAssistantGroup[];
}

export interface RepositoryAssistantMatch {
  id: string;
  title: string;
  summary: string;
  reason?: string;
}

export interface RepositoryAssistantGroup {
  type: 'duplicate-pair';
  title: string;
  description?: string;
  items: RepositoryAssistantMatch[];
}

export interface ImageFingerprint {
  imageUrl: string;
  originalName?: string;
  sha256?: string;
  perceptualHash?: string | null;
  ocrText?: string;
}

export type ProcessingMode = 'single-topic' | 'auto-separate';

export interface ProcessingDraftGroup {
  id: string;
  imageUrls: string[];
  imageFingerprints?: ImageFingerprint[];
  coverImageUrl: string;
  sourceInputType?: 'images' | 'audio' | 'video' | 'text';
  sourceAudioName?: string;
  sourceAudioFile?: File | null;
  sourceVideoName?: string;
  sourceVideoFile?: File | null;
  sourceUrl: string;
  customTitle: string;
  originalText: string;
  translatedText: string;
  detectedLanguage: 'es' | 'en';
  title: string;
  summary: string;
  longSummary: string;
  docxUrl: string;
  suggestedTags: TagOption[];
  existingTags: TagOption[];
  catalogBlocks: TagCatalogBlock[];
  sourceImageCount: number;
}

export interface ProcessingResponse {
  modeApplied: ProcessingMode;
  totalImages: number;
  groups: ProcessingDraftGroup[];
}

export interface SaveContentPayload {
  imageUrl: string;
  imageUrls: string[];
  imageFingerprints?: ImageFingerprint[];
  sourceUrl: string;
  notes: string;
  originalText: string;
  translatedText: string;
  title: string;
  summary: string;
  longSummary: string;
  docxUrl: string;
  selectedTags: Array<Pick<TagOption, 'id' | 'nombre' | 'tipo'>>;
}
