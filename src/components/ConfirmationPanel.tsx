import { Download, FilePlus2, FileText, Loader2, Mic, Save, Video, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { saveContent, uploadContentAudio, uploadContentVideo, uploadExtraImages } from '../lib/api';
import { formatTextForReading } from '../lib/documentTextFormatter';
import type { ProcessingDraftGroup, ProcessingResponse, SaveContentPayload, TagOption } from '../types/content';

interface EditableGroup extends ProcessingDraftGroup {
  selectedTagNames: string[];
  notes: string;
}

interface ConfirmationPanelProps {
  data: ProcessingResponse | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function ConfirmationPanel({ data, open, onClose, onSaved }: ConfirmationPanelProps) {
  const [groups, setGroups] = useState<EditableGroup[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadingGroupId, setUploadingGroupId] = useState<string | null>(null);
  const extraImageInputRef = useRef<HTMLInputElement>(null);
  const [pendingGroupId, setPendingGroupId] = useState<string | null>(null);

  useEffect(() => {
    setGroups(
      (data?.groups ?? []).map((group) => ({
        ...group,
        selectedTagNames: group.suggestedTags.map((tag) => tag.nombre),
        notes: '',
      })),
    );
    setError(null);
  }, [data]);

  const groupTags = useMemo(
    () =>
      groups.map((group) =>
        [
          ...group.catalogBlocks.flatMap((block) =>
            block.tags.map((tagName) => {
              const existingMatch = [...group.suggestedTags, ...group.existingTags].find(
                (tag) => tag.nombre.toLowerCase() === tagName.toLowerCase(),
              );

              return (
                existingMatch || {
                  id: null,
                  nombre: tagName,
                  tipo: 'manual' as const,
                  frecuencia: 0,
                  exists: false,
                  source: 'manual-created' as const,
                  bloque: block.nombre,
                }
              );
            }),
          ),
          ...group.suggestedTags,
        ].reduce<TagOption[]>((acc, tag) => {
          if (!acc.some((current) => current.nombre.toLowerCase() === tag.nombre.toLowerCase())) {
            acc.push(tag);
          }
          return acc;
        }, []),
      ),
    [groups],
  );

  if (!open || !data) {
    return null;
  }

  const normalizeComparableText = (text: string) => text.replace(/\s+/g, ' ').trim();
  const renderFormattedBlocks = (text: string, variant: 'document' | 'plain') => {
    const blocks = formatTextForReading(text);

    return (
      <div
        className={
          variant === 'document'
            ? 'max-h-72 overflow-y-auto rounded-[1.5rem] bg-[linear-gradient(180deg,_#fffdf8_0%,_#ffffff_100%)] px-5 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] ring-1 ring-slate-200/80'
            : 'max-h-72 overflow-y-auto rounded-[1.5rem] bg-slate-50 px-5 py-5 ring-1 ring-slate-200/80'
        }
      >
        <div
          className={
            variant === 'document'
              ? 'mx-auto max-w-2xl space-y-4 text-[16px] leading-8 text-slate-700 [font-family:Georgia,_Times_New_Roman,_serif]'
              : 'mx-auto max-w-2xl space-y-3 text-sm leading-7 text-slate-700'
          }
        >
          {blocks.map((block, index) => {
            if (block.type === 'paragraph') {
              return (
                <p
                  key={`${variant}-paragraph-${index}`}
                  className={variant === 'document' ? 'text-justify indent-6 first:indent-0' : 'whitespace-pre-wrap'}
                >
                  {block.text}
                </p>
              );
            }

            if (block.type === 'bullet-list') {
              return (
                <ul
                  key={`${variant}-bullets-${index}`}
                  className={variant === 'document' ? 'space-y-2 pl-6 text-justify marker:text-slate-500' : 'space-y-2 pl-6 marker:text-slate-500'}
                >
                  {block.items.map((item, itemIndex) => (
                    <li key={`${variant}-bullet-${index}-${itemIndex}`}>{item}</li>
                  ))}
                </ul>
              );
            }

            return (
              <ol
                key={`${variant}-numbers-${index}`}
                className={variant === 'document' ? 'space-y-2 pl-6 text-justify marker:font-semibold marker:text-slate-500' : 'space-y-2 pl-6 marker:font-semibold marker:text-slate-500'}
              >
                {block.items.map((item, itemIndex) => (
                  <li key={`${variant}-number-${index}-${itemIndex}`}>{item}</li>
                ))}
              </ol>
            );
          })}
        </div>
      </div>
    );
  };

  const updateGroup = (groupId: string, updater: (group: EditableGroup) => EditableGroup) => {
    setGroups((current) => current.map((group) => (group.id === groupId ? updater(group) : group)));
  };

  const handleOpenExtraImagePicker = (groupId: string) => {
    setPendingGroupId(groupId);
    extraImageInputRef.current?.click();
  };

  const handleExtraImagesSelected = async (files?: FileList | null) => {
    if (!files || files.length === 0 || !pendingGroupId) {
      return;
    }

    const selectedFiles = Array.from(files);
    setUploadingGroupId(pendingGroupId);
    setError(null);

    try {
      const { urls, images } = await uploadExtraImages(selectedFiles);
      updateGroup(pendingGroupId, (current) => ({
        ...current,
        imageUrls: [...current.imageUrls, ...urls],
        imageFingerprints: [...(current.imageFingerprints || []), ...(images || urls.map((imageUrl) => ({ imageUrl })))],
        coverImageUrl: current.coverImageUrl || urls[0] || '',
        sourceImageCount: current.sourceImageCount + urls.length,
      }));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'No fue posible agregar imágenes extra');
    } finally {
      setUploadingGroupId(null);
      setPendingGroupId(null);
      if (extraImageInputRef.current) {
        extraImageInputRef.current.value = '';
      }
    }
  };

  const handleSaveAll = async () => {
    setSaving(true);
    setError(null);

    try {
      for (const group of groups) {
        const allTags = groupTags[groups.findIndex((current) => current.id === group.id)] ?? [];
        const selectedTags = group.selectedTagNames.map((tagName) => {
          const match = allTags.find((tag) => tag.nombre === tagName);
          return {
            id: match?.id ?? null,
            nombre: tagName,
            tipo: match?.tipo ?? 'manual',
          };
        });

        const payload: SaveContentPayload = {
          imageUrl: group.coverImageUrl,
          imageUrls: group.imageUrls,
          imageFingerprints: group.imageFingerprints,
          sourceUrl: group.sourceUrl,
          notes: group.notes,
          originalText: group.originalText,
          translatedText: group.translatedText,
          title: group.title,
          summary: group.summary,
          longSummary: group.longSummary,
          docxUrl: group.docxUrl,
          selectedTags,
        };

        const savedContent = await saveContent(payload);

        if (group.sourceInputType === 'audio' && group.sourceAudioFile) {
          await uploadContentAudio(savedContent.id, group.sourceAudioFile);
        }

        if (group.sourceInputType === 'video' && group.sourceVideoFile) {
          await uploadContentVideo(savedContent.id, group.sourceVideoFile);
        }
      }

      onSaved();
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'No fue posible guardar los contenidos');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/55 backdrop-blur-sm">
      <div className="mx-auto min-h-screen max-w-7xl px-4 py-8">
        <div className="rounded-[2rem] bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-600">Confirmación</p>
              <h2 className="text-2xl font-semibold text-slate-950">
                Revisar grupos detectados ({groups.length}) de {data.totalImages} imagen{data.totalImages === 1 ? '' : 'es'}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Modo aplicado: {data.modeApplied === 'single-topic' ? 'Un solo tema' : 'Separar por tema'}
              </p>
            </div>

            <button onClick={onClose} className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-950">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="space-y-6 p-6">
            <input
              ref={extraImageInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(event) => void handleExtraImagesSelected(event.target.files)}
            />

            {groups.map((group, index) => {
              const allTags = groupTags[index] ?? [];
              const groupedTags = group.catalogBlocks
                .map((block) => ({
                  nombre: block.nombre,
                  tags: allTags.filter((tag) => tag.bloque === block.nombre),
                }))
                .filter((block) => block.tags.length > 0);
              const uncategorizedTags = allTags.filter(
                (tag) => !tag.bloque || !group.catalogBlocks.some((block) => block.nombre === tag.bloque),
              );
              const translationWasApplied =
                group.detectedLanguage === 'en' &&
                normalizeComparableText(group.translatedText) !== normalizeComparableText(group.originalText);

              return (
                <section key={group.id} className="rounded-[1.75rem] border border-slate-200 p-5">
                  <div className="mb-5 flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-600">Grupo {index + 1}</p>
                      <p className="mt-2 text-sm text-slate-500">{group.sourceImageCount} imagen{group.sourceImageCount === 1 ? '' : 'es'} agrupadas</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        onClick={() => handleOpenExtraImagePicker(group.id)}
                        disabled={uploadingGroupId === group.id}
                        className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-950 disabled:opacity-60"
                      >
                        {uploadingGroupId === group.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <FilePlus2 className="h-4 w-4" />}
                        {uploadingGroupId === group.id ? 'Subiendo...' : 'Agregar imágenes'}
                      </button>
                      <a
                        href={group.docxUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-950"
                      >
                        <Download className="h-4 w-4" />
                        Descargar Word
                      </a>
                    </div>
                  </div>

                  <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
                    <div className="space-y-4">
                      {group.imageUrls.length > 0 ? (
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                          {group.imageUrls.map((imageUrl, imageIndex) => (
                            <img key={`${group.id}-${imageIndex}`} src={imageUrl} alt={`Grupo ${index + 1} imagen ${imageIndex + 1}`} className="h-32 w-full rounded-2xl object-cover" />
                          ))}
                          <button
                            onClick={() => handleOpenExtraImagePicker(group.id)}
                            disabled={uploadingGroupId === group.id}
                            className="flex h-32 w-full flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 text-slate-600 transition hover:border-slate-950 disabled:opacity-60"
                          >
                            {uploadingGroupId === group.id ? <Loader2 className="mb-2 h-5 w-5 animate-spin" /> : <FilePlus2 className="mb-2 h-5 w-5" />}
                            <span className="text-sm font-semibold">Agregar imágenes</span>
                            <span className="mt-1 px-3 text-center text-[11px] text-slate-500">Súbelas manualmente para incluirlas en este documento</span>
                          </button>
                        </div>
                      ) : group.sourceInputType === 'audio' && group.sourceAudioName ? (
                        <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5 text-slate-600">
                          <div className="flex items-center gap-3">
                            <div className="rounded-2xl bg-white p-3 ring-1 ring-slate-200">
                              <Mic className="h-5 w-5 text-slate-700" />
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-slate-900">{group.sourceAudioName}</p>
                              <p className="text-xs text-slate-500">Contenido generado desde audio. El archivo se adjuntará al artículo al guardar.</p>
                            </div>
                          </div>
                        </div>
                      ) : group.sourceInputType === 'video' && group.sourceVideoName ? (
                        <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5 text-slate-600">
                          <div className="flex items-center gap-3">
                            <div className="rounded-2xl bg-white p-3 ring-1 ring-slate-200">
                              <Video className="h-5 w-5 text-slate-700" />
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-slate-900">{group.sourceVideoName}</p>
                              <p className="text-xs text-slate-500">Contenido generado desde video. El archivo se adjuntará al artículo al guardar.</p>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="flex h-32 items-center justify-center rounded-[1.5rem] border border-dashed border-slate-300 bg-slate-50 text-slate-500">
                            <div className="flex items-center gap-2 text-sm font-medium">
                              <FileText className="h-4 w-4" />
                              Contenido basado solo en texto
                            </div>
                          </div>
                          <button
                            onClick={() => handleOpenExtraImagePicker(group.id)}
                            disabled={uploadingGroupId === group.id}
                            className="flex h-32 w-full flex-col items-center justify-center rounded-[1.5rem] border border-dashed border-slate-300 bg-slate-50 text-slate-600 transition hover:border-slate-950 disabled:opacity-60"
                          >
                            {uploadingGroupId === group.id ? <Loader2 className="mb-2 h-5 w-5 animate-spin" /> : <FilePlus2 className="mb-2 h-5 w-5" />}
                            <span className="text-sm font-semibold">Agregar imágenes</span>
                            <span className="mt-1 px-3 text-center text-[11px] text-slate-500">Súbelas manualmente para incluirlas en este documento</span>
                          </button>
                        </div>
                      )}

                      <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Idioma detectado</p>
                        <p className="mt-2 text-sm font-medium text-slate-800">{group.detectedLanguage === 'en' ? 'Inglés' : 'Español / mixto'}</p>
                      </div>
                    </div>

                    <div className="space-y-5">
                      <label className="block">
                        <span className="mb-2 block text-sm font-semibold text-slate-700">Título</span>
                        <input
                          value={group.title}
                          onChange={(event) => updateGroup(group.id, (current) => ({ ...current, title: event.target.value }))}
                          className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-950"
                        />
                      </label>

                      <label className="block">
                        <span className="mb-2 block text-sm font-semibold text-slate-700">Resumen</span>
                        <textarea
                          value={group.summary}
                          onChange={(event) => updateGroup(group.id, (current) => ({ ...current, summary: event.target.value }))}
                          rows={4}
                          className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-950"
                        />
                      </label>

                      <label className="block">
                        <span className="mb-2 block text-sm font-semibold text-slate-700">Fuente</span>
                        <input
                          value={group.sourceUrl}
                          onChange={(event) => updateGroup(group.id, (current) => ({ ...current, sourceUrl: event.target.value }))}
                          placeholder="https://..."
                          className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-950"
                        />
                      </label>

                      <label className="block">
                        <span className="mb-2 block text-sm font-semibold text-slate-700">Notas iniciales</span>
                        <textarea
                          value={group.notes}
                          onChange={(event) => updateGroup(group.id, (current) => ({ ...current, notes: event.target.value }))}
                          rows={3}
                          placeholder="Comentarios o notas para este contenido..."
                          className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-950"
                        />
                      </label>

                      <div className="grid gap-4 xl:grid-cols-2">
                        <section className="rounded-[1.5rem] border border-slate-200 p-4">
                          <p className="mb-3 text-sm font-semibold text-slate-800">Texto extraído</p>
                          {renderFormattedBlocks(group.originalText, 'plain')}
                        </section>

                        <section className="rounded-[1.5rem] border border-slate-200 p-4">
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <p className="text-sm font-semibold text-slate-800">
                              {translationWasApplied ? 'Texto traducido' : 'Texto final en español'}
                            </p>
                            {!translationWasApplied && (
                              <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                                Sin traducción
                              </span>
                            )}
                          </div>
                          {renderFormattedBlocks(group.translatedText, 'document')}
                        </section>
                      </div>

                      <section className="rounded-[1.5rem] border border-slate-200 p-4">
                        <p className="mb-4 text-sm font-semibold text-slate-800">Tags</p>
                        <div className="space-y-4">
                          {groupedTags.map((block) => (
                            <div key={`${group.id}-${block.nombre}`}>
                              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{block.nombre}</p>
                              <div className="flex flex-wrap gap-2">
                                {block.tags.map((tag) => {
                                  const active = group.selectedTagNames.includes(tag.nombre);
                                  const isSuggested = group.suggestedTags.some((suggestedTag) => suggestedTag.nombre === tag.nombre);
                                  return (
                                    <label
                                      key={`${group.id}-${block.nombre}-${tag.nombre}`}
                                      className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-2 text-sm transition ${
                                        active ? 'border-amber-500 bg-amber-100 text-amber-950' : 'border-slate-200 bg-white text-slate-600'
                                      }`}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={active}
                                        onChange={() =>
                                          updateGroup(group.id, (current) => ({
                                            ...current,
                                            selectedTagNames: current.selectedTagNames.includes(tag.nombre)
                                              ? current.selectedTagNames.filter((name) => name !== tag.nombre)
                                              : [...current.selectedTagNames, tag.nombre],
                                          }))
                                        }
                                        className="hidden"
                                      />
                                      <span>{tag.nombre}</span>
                                      {isSuggested && <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700">IA</span>}
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          ))}

                          {uncategorizedTags.length > 0 && (
                            <div>
                              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Fuera del catalogo</p>
                              <div className="flex flex-wrap gap-2">
                                {uncategorizedTags.map((tag) => {
                                  const active = group.selectedTagNames.includes(tag.nombre);
                                  return (
                                    <label
                                      key={`${group.id}-other-${tag.nombre}`}
                                      className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-2 text-sm transition ${
                                        active ? 'border-amber-500 bg-amber-100 text-amber-950' : 'border-slate-200 bg-white text-slate-600'
                                      }`}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={active}
                                        onChange={() =>
                                          updateGroup(group.id, (current) => ({
                                            ...current,
                                            selectedTagNames: current.selectedTagNames.includes(tag.nombre)
                                              ? current.selectedTagNames.filter((name) => name !== tag.nombre)
                                              : [...current.selectedTagNames, tag.nombre],
                                          }))
                                        }
                                        className="hidden"
                                      />
                                      <span>{tag.nombre}</span>
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>

                        <p className="mt-4 text-xs leading-6 text-slate-500">
                          Para agregar nuevas etiquetas al sistema, usa el submenu <span className="font-semibold text-slate-700">Editar catalogo</span> desde la vista principal.
                        </p>
                      </section>
                    </div>
                  </div>
                </section>
              );
            })}

            {error && <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                onClick={onClose}
                className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-950"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveAll}
                disabled={saving || groups.length === 0}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:bg-slate-300"
              >
                <Save className="h-4 w-4" />
                {saving ? 'Guardando grupos...' : `Guardar ${groups.length} contenido${groups.length === 1 ? '' : 's'}`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
