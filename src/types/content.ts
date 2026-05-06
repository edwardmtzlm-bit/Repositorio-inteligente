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

export type ProcessingMode = 'single-topic' | 'auto-separate';

export interface ProcessingDraftGroup {
  id: string;
  imageUrls: string[];
  coverImageUrl: string;
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
