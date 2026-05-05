import { Download, ExternalLink, FilePlus2, FileText, Images, Loader2, Save, Sparkles, Tag, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { appendContentImages, enrichContent, updateContentMetadata, uploadExtraImages } from '../lib/api';
import { formatTextForReading } from '../lib/documentTextFormatter';
import type { ContentListItem } from '../types/content';

interface ContentDetailDialogProps {
  item: ContentListItem | null;
  onClose: () => void;
  onUpdated: (item: ContentListItem) => void;
  onDeleted: (itemId: string) => Promise<void>;
}

export function ContentDetailDialog({ item, onClose, onUpdated, onDeleted }: ContentDetailDialogProps) {
  const [supplementalText, setSupplementalText] = useState('');
  const [titleDraft, setTitleDraft] = useState('');
  const [notesDraft, setNotesDraft] = useState('');
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [savingMetadata, setSavingMetadata] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const inventorySectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!item) {
      return;
    }

    setSupplementalText('');
    setTitleDraft(item.titulo);
    setNotesDraft(item.notas || '');
    setSelectedImageUrl(null);
    setError(null);
  }, [item]);

  if (!item) {
    return null;
  }

  const translatedBlocks = formatTextForReading(item.texto_traducido);
  const originalBlocks = formatTextForReading(item.texto_original);
  const originalMatchesTranslated = item.texto_original.trim() === item.texto_traducido.trim();

  const inventoryImages = item.imagenes_urls?.length ? item.imagenes_urls : item.imagen_url ? [item.imagen_url] : [];
  const hasImageSource = inventoryImages.length > 0;

  const renderFormattedBlocks = (
    blocks: ReturnType<typeof formatTextForReading>,
    variant: 'document' | 'plain' = 'plain',
  ) => (
    <div
      className={
        variant === 'document'
          ? 'max-h-[60vh] overflow-y-auto rounded-[1.5rem] bg-[linear-gradient(180deg,_#fffdf8_0%,_#ffffff_100%)] px-6 py-7 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] ring-1 ring-slate-200/80 sm:px-10'
          : 'max-h-[44vh] overflow-y-auto rounded-[1.5rem] bg-slate-50 px-6 py-6 ring-1 ring-slate-200/80'
      }
    >
      <div
        className={
          variant === 'document'
            ? 'mx-auto max-w-3xl space-y-5 text-[18px] leading-9 text-slate-700 [font-family:Georgia,_Times_New_Roman,_serif]'
            : 'mx-auto max-w-3xl space-y-4 text-[15px] leading-8 text-slate-700'
        }
      >
        {blocks.map((block, index) => {
          if (block.type === 'paragraph') {
            return (
              <p
                key={`${variant}-paragraph-${index}`}
                className={variant === 'document' ? 'text-justify indent-8 first:indent-0' : 'whitespace-pre-wrap'}
              >
                {block.text}
              </p>
            );
          }

          if (block.type === 'bullet-list') {
            return (
              <ul
                key={`${variant}-bullets-${index}`}
                className={variant === 'document' ? 'space-y-3 pl-6 text-justify marker:text-slate-500' : 'space-y-2 pl-6 marker:text-slate-500'}
              >
                {block.items.map((listItem, listIndex) => (
                  <li key={`${variant}-bullet-${index}-${listIndex}`}>{listItem}</li>
                ))}
              </ul>
            );
          }

          return (
            <ol
              key={`${variant}-numbered-${index}`}
              className={
                variant === 'document'
                  ? 'space-y-3 pl-6 text-justify marker:font-semibold marker:text-slate-500'
                  : 'space-y-2 pl-6 marker:font-semibold marker:text-slate-500'
              }
            >
              {block.items.map((listItem, listIndex) => (
                <li key={`${variant}-number-${index}-${listIndex}`}>{listItem}</li>
              ))}
            </ol>
          );
        })}
      </div>
    </div>
  );

  const handleSourceClick = () => {
    if (item.fuente_url) {
      window.open(item.fuente_url, '_blank', 'noopener,noreferrer');
      return;
    }

    inventorySectionRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  };

  const handleEnrich = async () => {
    if (!supplementalText.trim()) {
      setError('Ingresa texto complementario para actualizar el contenido.');
      return;
    }

    setUpdating(true);
    setError(null);

    try {
      const updatedContent = await enrichContent(item.id, supplementalText);
      setSupplementalText('');
      onUpdated(updatedContent);
    } catch (enrichError) {
      setError(enrichError instanceof Error ? enrichError.message : 'No fue posible complementar el contenido');
    } finally {
      setUpdating(false);
    }
  };

  const handleSaveMetadata = async () => {
    setSavingMetadata(true);
    setError(null);

    try {
      const updatedContent = await updateContentMetadata(item.id, {
        title: titleDraft,
        sourceUrl: item.fuente_url || '',
        notes: notesDraft,
      });
      onUpdated(updatedContent);
    } catch (metadataError) {
      setError(metadataError instanceof Error ? metadataError.message : 'No fue posible guardar fuente o notas');
    } finally {
      setSavingMetadata(false);
    }
  };

  const handleExtraImagesSelected = async (files?: FileList | null) => {
    if (!files || files.length === 0) {
      return;
    }

    setUploadingImages(true);
    setError(null);

    try {
      const { urls } = await uploadExtraImages(Array.from(files));
      const updatedContent = await appendContentImages(item.id, urls);
      onUpdated(updatedContent);
    } catch (imageError) {
      setError(imageError instanceof Error ? imageError.message : 'No fue posible agregar imágenes al inventario');
    } finally {
      setUploadingImages(false);
      if (imageInputRef.current) {
        imageInputRef.current.value = '';
      }
    }
  };

  const handleDelete = async () => {
    const shouldDelete = window.confirm(`¿Eliminar "${item.titulo}"?\n\nEsto también lo quitará del doc general.`);

    if (!shouldDelete) {
      return;
    }

    setDeleting(true);
    setError(null);

    try {
      await onDeleted(item.id);
      window.alert('Artículo eliminado correctamente.');
      onClose();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'No fue posible eliminar el contenido');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-slate-950/55 backdrop-blur-sm">
      <div className="mx-auto flex min-h-screen max-w-6xl items-center px-4 py-8">
        <div className="w-full overflow-hidden rounded-[2rem] bg-white shadow-2xl">
          <div className="flex items-start justify-between border-b border-slate-100 p-6">
            <div className="min-w-0 flex-1 pr-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-600">Detalle</p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <input
                  value={titleDraft}
                  onChange={(event) => setTitleDraft(event.target.value)}
                  className="min-w-[260px] flex-1 border-none p-0 text-3xl font-semibold text-slate-950 outline-none"
                />
                <button
                  onClick={handleSaveMetadata}
                  disabled={savingMetadata}
                  className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-950 disabled:opacity-60"
                >
                  <Save className="h-4 w-4" />
                  {savingMetadata ? 'Guardando...' : 'Guardar título'}
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => void handleDelete()}
                disabled={deleting}
                className="inline-flex items-center gap-2 rounded-full border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:border-red-500 hover:bg-red-50 disabled:opacity-60"
              >
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {deleting ? 'Eliminando...' : 'Eliminar artículo'}
              </button>
              <a
                href={item.docx_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white"
              >
                <Download className="h-4 w-4" />
                Descargar Word
              </a>
              <button onClick={onClose} className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-950">
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="space-y-5 p-6">
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(event) => void handleExtraImagesSelected(event.target.files)}
            />

            <div className="flex flex-wrap items-center gap-3">
              {(item.fuente_url || hasImageSource) && (
                <button
                  onClick={handleSourceClick}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-950"
                >
                  <ExternalLink className="h-4 w-4" />
                  Fuente
                </button>
              )}
              {item.tags.map((tag) => (
                <span key={tag.nombre} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">
                  <Tag className="h-3 w-3" />
                  {tag.nombre}
                </span>
              ))}
            </div>

            <section className="rounded-[1.5rem] bg-slate-50 p-6">
              <p className="text-sm font-semibold text-slate-800">Resumen</p>
              <p className="mt-3 whitespace-pre-wrap text-[15px] leading-8 text-slate-700">{item.resumen}</p>
            </section>

            <section className="rounded-[1.5rem] border border-slate-200 p-6">
              <p className="text-sm font-semibold text-slate-800">Notas y comentarios</p>
              <textarea
                value={notesDraft}
                onChange={(event) => setNotesDraft(event.target.value)}
                rows={5}
                placeholder="Agrega aquí comentarios, contexto o apuntes personales para este contenido..."
                className="mt-3 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-950"
              />
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                  onClick={handleSaveMetadata}
                  disabled={savingMetadata}
                  className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:bg-slate-300"
                >
                  <Save className="h-4 w-4" />
                  {savingMetadata ? 'Guardando...' : 'Guardar título y notas'}
                </button>
                <span className="text-xs text-slate-500">Este cambio actualiza el Word individual y el Google Doc general.</span>
              </div>
            </section>

            <section className="rounded-[1.5rem] border border-slate-200 p-6">
              <p className="mb-3 text-base font-semibold text-slate-900">Texto traducido</p>
              {renderFormattedBlocks(translatedBlocks, 'document')}
            </section>

            <section className="rounded-[1.5rem] border border-slate-200 p-6">
              <p className="mb-3 text-base font-semibold text-slate-900">Texto original</p>
              {renderFormattedBlocks(originalBlocks, originalMatchesTranslated ? 'document' : 'plain')}
            </section>

            {inventoryImages.length > 0 && (
              <section ref={inventorySectionRef} className="rounded-[1.5rem] border border-slate-200 p-6">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Images className="h-4 w-4 text-slate-500" />
                    <p className="text-sm font-semibold text-slate-800">Inventario de imágenes</p>
                    <span className="text-xs text-slate-400">{inventoryImages.length}</span>
                  </div>
                  <button
                    onClick={() => imageInputRef.current?.click()}
                    disabled={uploadingImages}
                    className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-950 disabled:opacity-60"
                  >
                    {uploadingImages ? <Loader2 className="h-4 w-4 animate-spin" /> : <FilePlus2 className="h-4 w-4" />}
                    {uploadingImages ? 'Subiendo...' : 'Agregar imágenes'}
                  </button>
                </div>
                <div className="flex gap-4 overflow-x-auto pb-4">
                  {inventoryImages.map((imageUrl, index) => (
                    <button
                      key={`${item.id}-${index}`}
                      onClick={() => setSelectedImageUrl(imageUrl)}
                      className="min-w-[280px] overflow-hidden rounded-[1.5rem] border border-slate-200 bg-slate-50 text-left transition hover:border-slate-950"
                    >
                      <img src={imageUrl} alt={`${item.titulo} ${index + 1}`} className="h-56 w-full object-cover" />
                      <div className="px-4 py-3 text-xs font-semibold text-slate-500">Imagen {index + 1}</div>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {inventoryImages.length === 0 && (
              <section ref={inventorySectionRef} className="rounded-[1.5rem] border border-dashed border-slate-300 bg-slate-50 p-6 text-slate-500">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <FileText className="h-4 w-4" />
                    Este contenido no tiene imágenes guardadas, solo texto.
                  </div>
                  <button
                    onClick={() => imageInputRef.current?.click()}
                    disabled={uploadingImages}
                    className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-950 disabled:opacity-60"
                  >
                    {uploadingImages ? <Loader2 className="h-4 w-4 animate-spin" /> : <FilePlus2 className="h-4 w-4" />}
                    {uploadingImages ? 'Subiendo...' : 'Agregar imágenes'}
                  </button>
                </div>
              </section>
            )}

            <section className="rounded-[1.5rem] border border-slate-200 p-6">
              <p className="mb-2 text-sm font-semibold text-slate-800">Agregar texto complementario</p>
              <p className="mb-3 text-xs leading-5 text-slate-500">Este texto se combinará con el contenido actual para regenerar título, resumen, tags y Word individual.</p>
              <textarea
                value={supplementalText}
                onChange={(event) => setSupplementalText(event.target.value)}
                rows={7}
                placeholder="Pega aquí texto adicional para complementar este contenido..."
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-950"
              />
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                  onClick={handleEnrich}
                  disabled={updating}
                  className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:bg-slate-300"
                >
                  <Sparkles className="h-4 w-4" />
                  {updating ? 'Reprocesando...' : 'Agregar y reprocesar'}
                </button>
                <span className="text-xs text-slate-500">{new Date(item.fecha).toLocaleString()}</span>
              </div>
              {error && <p className="mt-3 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
            </section>
          </div>
        </div>
      </div>

      {selectedImageUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 px-4 py-8" onClick={() => setSelectedImageUrl(null)}>
          <button
            onClick={() => setSelectedImageUrl(null)}
            className="absolute right-6 top-6 rounded-full bg-white/10 p-3 text-white transition hover:bg-white/20"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={selectedImageUrl}
            alt="Vista ampliada"
            className="max-h-full max-w-full rounded-[1.5rem] object-contain shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
