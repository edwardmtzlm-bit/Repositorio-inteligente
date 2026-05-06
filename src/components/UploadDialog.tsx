import { Camera, ImagePlus, Layers3, Loader2, ScanSearch, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { processImages } from '../lib/api';
import type { ProcessingMode, ProcessingResponse } from '../types/content';

interface UploadDialogProps {
  open: boolean;
  onClose: () => void;
  onProcessed: (response: ProcessingResponse) => void;
}

export function UploadDialog({ open, onClose, onProcessed }: UploadDialogProps) {
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [customTitle, setCustomTitle] = useState('');
  const [supplementalText, setSupplementalText] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [mode, setMode] = useState<ProcessingMode>('single-topic');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const maxImages = mode === 'single-topic' ? 15 : 10;

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setSelectedFiles([]);
      setCustomTitle('');
      setSupplementalText('');
      setSourceUrl('');
      setMode('single-topic');
      setLoading(false);
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    setSelectedFiles((current) => {
      if (current.length <= maxImages) {
        return current;
      }

      setError(
        mode === 'single-topic'
          ? `Máximo ${maxImages} imágenes en "Un solo tema".`
          : `Máximo ${maxImages} imágenes en "Separar por tema".`,
      );

      return current.slice(0, maxImages);
    });
  }, [maxImages, mode]);

  const previews = useMemo(
    () =>
      selectedFiles.map((file) => ({
        name: file.name,
        url: URL.createObjectURL(file),
      })),
    [selectedFiles],
  );

  useEffect(() => {
    return () => {
      previews.forEach((preview) => URL.revokeObjectURL(preview.url));
    };
  }, [previews]);

  if (!open) {
    return null;
  }

  const onSelectFiles = (files?: FileList | null) => {
    if (!files || files.length === 0) {
      return;
    }

    setError(null);
    setSelectedFiles((current) => {
      const nextFiles = [...current, ...Array.from(files)];

      if (nextFiles.length <= maxImages) {
        return nextFiles;
      }

      setError(
        mode === 'single-topic'
          ? `Máximo ${maxImages} imágenes en "Un solo tema".`
          : `Máximo ${maxImages} imágenes en "Separar por tema".`,
      );

      return nextFiles.slice(0, maxImages);
    });
  };

  const removeFile = (indexToRemove: number) => {
    setSelectedFiles((current) => current.filter((_, index) => index !== indexToRemove));
  };

  const handleProcess = async () => {
    if (selectedFiles.length === 0 && !supplementalText.trim()) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await processImages(selectedFiles, mode, supplementalText, sourceUrl, customTitle);
      const normalizedResponse: ProcessingResponse = {
        modeApplied: response.modeApplied ?? mode,
        totalImages: typeof response.totalImages === 'number' ? response.totalImages : selectedFiles.length,
        groups: (response.groups ?? []).map((group, index) => {
          const detectedLanguage = group.detectedLanguage === 'en' ? 'en' : 'es';

          return {
            id: group.id || `group-${index + 1}`,
            imageUrls: Array.isArray(group.imageUrls) ? group.imageUrls : [],
            coverImageUrl: group.coverImageUrl || group.imageUrls?.[0] || '',
            sourceUrl: group.sourceUrl || sourceUrl,
            customTitle: group.customTitle || customTitle,
            originalText: group.originalText || '',
            translatedText: (detectedLanguage === 'en' ? group.translatedText : group.originalText) || '',
            detectedLanguage,
            title: group.title || customTitle || `Contenido ${index + 1}`,
            summary: group.summary || '',
            longSummary: group.longSummary || group.summary || '',
            docxUrl: group.docxUrl || '',
            suggestedTags: Array.isArray(group.suggestedTags) ? group.suggestedTags : [],
            existingTags: Array.isArray(group.existingTags) ? group.existingTags : [],
            catalogBlocks: Array.isArray(group.catalogBlocks) ? group.catalogBlocks : [],
            sourceImageCount:
              typeof group.sourceImageCount === 'number'
                ? group.sourceImageCount
                : Array.isArray(group.imageUrls)
                  ? group.imageUrls.length
                  : 0,
          };
        }),
      };

      onProcessed(normalizedResponse);
      onClose();
    } catch (processError) {
      setError(processError instanceof Error ? processError.message : 'No fue posible procesar el contenido');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <button className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex h-full items-center justify-center p-4">
        <div className="flex h-[min(920px,calc(100vh-2rem))] w-full max-w-4xl flex-col overflow-hidden rounded-[2rem] bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-600">Carga múltiple</p>
            <h2 className="text-2xl font-semibold text-slate-950">Nuevo contenido</h2>
          </div>

          <button onClick={onClose} className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-950">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid flex-1 gap-4 overflow-y-auto p-6 lg:grid-cols-[1.1fr_1fr]">
          <div className="space-y-4">
            <div className="rounded-[1.5rem] border border-slate-200 p-4">
              <div className="mb-4">
                <p className="text-sm font-semibold text-slate-800">Título inicial</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">Puedes asignar manualmente un nombre desde este paso. Luego podrás ajustarlo otra vez en la confirmación o en el detalle.</p>
              </div>
              <input
                value={customTitle}
                onChange={(event) => setCustomTitle(event.target.value)}
                placeholder="Ej. Principios de Estrategia de Michael Porter"
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-950"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <button
                onClick={() => galleryInputRef.current?.click()}
                className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-6 text-left transition hover:border-slate-950 hover:bg-white"
              >
                <ImagePlus className="mb-5 h-8 w-8 text-slate-700" />
                <h3 className="text-lg font-semibold text-slate-950">Galería</h3>
                <p className="mt-2 text-sm text-slate-500">Selecciona una o varias imágenes del dispositivo.</p>
              </button>

              <button
                onClick={() => cameraInputRef.current?.click()}
                className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-6 text-left transition hover:border-slate-950 hover:bg-white"
              >
                <Camera className="mb-5 h-8 w-8 text-slate-700" />
                <h3 className="text-lg font-semibold text-slate-950">Cámara</h3>
                <p className="mt-2 text-sm text-slate-500">Toma una foto. Luego puedes agregar más desde galería si hace falta.</p>
              </button>
            </div>

            <input
              ref={galleryInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(event) => onSelectFiles(event.target.files)}
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(event) => onSelectFiles(event.target.files)}
            />

            <div className="rounded-[1.5rem] border border-slate-200 p-4">
              <p className="mb-3 text-sm font-semibold text-slate-800">Modo de agrupación</p>
              <div className="grid gap-3">
                <button
                  onClick={() => setMode('single-topic')}
                  className={`rounded-2xl border p-4 text-left transition ${mode === 'single-topic' ? 'border-amber-500 bg-amber-50' : 'border-slate-200'}`}
                >
                  <div className="flex items-center gap-3">
                    <Layers3 className="h-5 w-5 text-slate-700" />
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Un solo tema</p>
                      <p className="text-xs text-slate-500">Combina todas las imágenes en un solo contenido y un solo Word.</p>
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => setMode('auto-separate')}
                  className={`rounded-2xl border p-4 text-left transition ${mode === 'auto-separate' ? 'border-amber-500 bg-amber-50' : 'border-slate-200'}`}
                >
                  <div className="flex items-center gap-3">
                    <ScanSearch className="h-5 w-5 text-slate-700" />
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Separar por tema</p>
                      <p className="text-xs text-slate-500">Analiza similitud entre imágenes y crea grupos temáticos automáticamente.</p>
                    </div>
                  </div>
                </button>
              </div>
              <p className="mt-3 text-xs leading-5 text-slate-500">
                En `Un solo tema` puedes cargar hasta 15 imágenes. En `Separar por tema` hasta 10. Más imágenes implican más tiempo de procesamiento.
              </p>
            </div>

            <div className="rounded-[1.5rem] border border-slate-200 p-4">
              <div className="mb-4">
                <p className="text-sm font-semibold text-slate-800">Fuente opcional</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">Si el contenido viene de un artículo o publicación, pega aquí el link para guardarlo como fuente.</p>
              </div>
              <input
                value={sourceUrl}
                onChange={(event) => setSourceUrl(event.target.value)}
                placeholder="https://..."
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-950"
              />
            </div>

            <div className="rounded-[1.5rem] border border-slate-200 p-4">
              <div className="mb-3">
                <p className="text-sm font-semibold text-slate-800">Texto complementario o solo texto</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Puedes pegar una transcripción, notas o contexto adicional. También puedes procesar solo texto sin subir imágenes.
                </p>
              </div>
              <textarea
                value={supplementalText}
                onChange={(event) => setSupplementalText(event.target.value)}
                rows={8}
                placeholder="Pega aquí un texto largo, transcripción o contexto adicional..."
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-950"
              />
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-800">Imágenes seleccionadas</p>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                  {selectedFiles.length} / {maxImages}
                </span>
              </div>

              {selectedFiles.length === 0 ? (
                <p className="text-sm text-slate-500">Todavía no has agregado imágenes. Puedes continuar solo con texto si quieres.</p>
              ) : (
                <div className="grid max-h-[360px] gap-3 overflow-y-auto sm:grid-cols-2">
                  {previews.map((preview, index) => (
                    <div key={`${preview.name}-${index}`} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                      <img src={preview.url} alt={preview.name} className="h-32 w-full object-cover" />
                      <div className="flex items-center justify-between gap-2 p-3">
                        <p className="line-clamp-1 text-xs text-slate-500">{preview.name}</p>
                        <button onClick={() => removeFile(index)} className="text-xs font-semibold text-red-600">
                          Quitar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {error && <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

            <button
              onClick={handleProcess}
              disabled={loading || (selectedFiles.length === 0 && !supplementalText.trim())}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:bg-slate-300"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
              {loading ? 'Procesando contenido...' : 'Procesar contenido'}
            </button>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
