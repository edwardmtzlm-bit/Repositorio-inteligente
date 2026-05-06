import { Plus, Save, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { TagCatalogBlock } from '../types/content';

interface TagCatalogDialogProps {
  open: boolean;
  blocks: TagCatalogBlock[];
  onClose: () => void;
  onSave: (blocks: TagCatalogBlock[]) => Promise<void>;
}

export function TagCatalogDialog({ open, blocks, onClose, onSave }: TagCatalogDialogProps) {
  const [draftBlocks, setDraftBlocks] = useState<TagCatalogBlock[]>([]);
  const [newBlockName, setNewBlockName] = useState('');
  const [tagInputs, setTagInputs] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraftBlocks(blocks);
    setError(null);
    setNewBlockName('');
    setTagInputs({});
  }, [blocks, open]);

  if (!open) {
    return null;
  }

  const updateBlock = (blockId: string, updater: (block: TagCatalogBlock) => TagCatalogBlock) => {
    setDraftBlocks((current) => current.map((block) => (block.id === blockId ? updater(block) : block)));
  };

  const handleAddBlock = () => {
    const trimmed = newBlockName.trim();
    if (!trimmed) {
      return;
    }

    setDraftBlocks((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        nombre: trimmed,
        tags: [],
      },
    ]);
    setNewBlockName('');
  };

  const handleAddTag = (blockId: string) => {
    const value = (tagInputs[blockId] || '').trim();
    if (!value) {
      return;
    }

    updateBlock(blockId, (block) => ({
      ...block,
      tags: block.tags.some((tag) => tag.toLowerCase() === value.toLowerCase()) ? block.tags : [...block.tags, value],
    }));

    setTagInputs((current) => ({ ...current, [blockId]: '' }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      await onSave(draftBlocks);
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'No fue posible guardar el catalogo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/55 backdrop-blur-sm">
      <div className="mx-auto min-h-screen max-w-5xl px-4 py-8">
        <div className="rounded-[2rem] bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-600">Catalogo</p>
              <h2 className="text-2xl font-semibold text-slate-950">Bloques y etiquetas autorizadas</h2>
              <p className="mt-1 text-sm text-slate-500">La IA solo sugerira etiquetas de este catalogo. El preview inicial no mostrara este submenu.</p>
            </div>

            <button onClick={onClose} className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-950">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="space-y-6 p-6">
            <section className="rounded-[1.5rem] border border-slate-200 bg-slate-50/70 p-4">
              <p className="mb-3 text-sm font-semibold text-slate-800">Agregar bloque</p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <input
                  value={newBlockName}
                  onChange={(event) => setNewBlockName(event.target.value)}
                  placeholder="Nombre del bloque"
                  className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-950"
                />
                <button
                  onClick={handleAddBlock}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-950"
                >
                  <Plus className="h-4 w-4" />
                  Agregar bloque
                </button>
              </div>
            </section>

            <div className="grid gap-4">
              {draftBlocks.map((block) => (
                <section key={block.id} className="rounded-[1.5rem] border border-slate-200 p-4">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <input
                      value={block.nombre}
                      onChange={(event) => updateBlock(block.id, (current) => ({ ...current, nombre: event.target.value }))}
                      className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-slate-950"
                    />
                    <button
                      onClick={() => setDraftBlocks((current) => current.filter((currentBlock) => currentBlock.id !== block.id))}
                      className="inline-flex items-center justify-center rounded-2xl border border-red-200 px-3 py-3 text-red-600 transition hover:bg-red-50"
                      title={`Eliminar bloque ${block.nombre}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="mb-4 flex flex-wrap gap-2">
                    {block.tags.map((tag) => (
                      <div key={`${block.id}-${tag}`} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                        <span>{tag}</span>
                        <button
                          onClick={() =>
                            updateBlock(block.id, (current) => ({
                              ...current,
                              tags: current.tags.filter((currentTag) => currentTag !== tag),
                            }))
                          }
                          className="rounded-full p-0.5 text-red-500 transition hover:bg-red-50"
                          title={`Eliminar etiqueta ${tag}`}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row">
                    <input
                      value={tagInputs[block.id] || ''}
                      onChange={(event) => setTagInputs((current) => ({ ...current, [block.id]: event.target.value }))}
                      placeholder="Agregar etiqueta al bloque"
                      className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-950"
                    />
                    <button
                      onClick={() => handleAddTag(block.id)}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-950"
                    >
                      <Plus className="h-4 w-4" />
                      Agregar etiqueta
                    </button>
                  </div>
                </section>
              ))}
            </div>

            {error && <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                onClick={onClose}
                className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-950"
              >
                Cancelar
              </button>
              <button
                onClick={() => void handleSave()}
                disabled={saving}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:bg-slate-300"
              >
                <Save className="h-4 w-4" />
                {saving ? 'Guardando...' : 'Guardar catalogo'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
