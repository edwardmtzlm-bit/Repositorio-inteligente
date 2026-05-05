import { BookOpenText, PencilLine, Plus, RefreshCw, Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { TagOption } from '../types/content';

interface SearchToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  availableTags: TagOption[];
  selectedTags: string[];
  onToggleTag: (tagName: string) => void;
  onCreateNew: () => void;
  libraryDocxUrl: string;
  onSyncLibraryDocx: () => Promise<void>;
  onRegenerateExistingDocuments: () => Promise<void>;
  onDeleteTag: (tag: TagOption) => Promise<void>;
}

export function SearchToolbar({
  search,
  onSearchChange,
  availableTags,
  selectedTags,
  onToggleTag,
  onCreateNew,
  libraryDocxUrl,
  onSyncLibraryDocx,
  onRegenerateExistingDocuments,
  onDeleteTag,
}: SearchToolbarProps) {
  const [isManagingTags, setIsManagingTags] = useState(false);
  const [deletingTagId, setDeletingTagId] = useState<string | null>(null);
  const sortedTags = useMemo(
    () =>
      [...availableTags].sort((left, right) => {
        const frequencyDiff = (right.frecuencia ?? 0) - (left.frecuencia ?? 0);
        if (frequencyDiff !== 0) {
          return frequencyDiff;
        }

        return left.nombre.localeCompare(right.nombre, 'es');
      }),
    [availableTags],
  );

  return (
    <section className="rounded-[2rem] border border-black/5 bg-white/85 p-5 shadow-[0_24px_80px_-40px_rgba(15,23,42,0.35)] backdrop-blur">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Buscar por título, resumen o contenido"
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm text-slate-800 outline-none transition focus:border-slate-900 focus:bg-white"
          />
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            onClick={() => setIsManagingTags((current) => !current)}
            className={`inline-flex items-center justify-center gap-2 rounded-2xl border px-5 py-3 text-sm font-semibold transition ${
              isManagingTags
                ? 'border-amber-500 bg-amber-50 text-amber-900'
                : 'border-slate-200 bg-white text-slate-800 hover:border-slate-950'
            }`}
          >
            <PencilLine className="h-4 w-4" />
            {isManagingTags ? 'Terminar edición' : 'Editar tags'}
          </button>
          <button
            onClick={() => void onSyncLibraryDocx()}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-800 transition hover:border-slate-950"
          >
            <RefreshCw className="h-4 w-4" />
            Sincronizar existentes
          </button>
          <button
            onClick={() => void onRegenerateExistingDocuments()}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-800 transition hover:border-slate-950"
          >
            <RefreshCw className="h-4 w-4" />
            Reparar documentos
          </button>
          <a
            href={libraryDocxUrl || undefined}
            target="_blank"
            rel="noreferrer"
            className={`inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold transition ${
              libraryDocxUrl
                ? 'border border-slate-200 bg-white text-slate-800 hover:border-slate-950'
                : 'pointer-events-none border border-slate-100 bg-slate-100 text-slate-400'
            }`}
          >
            <BookOpenText className="h-4 w-4" />
            Word general
          </a>
          <button
            onClick={onCreateNew}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#b791d0] px-5 py-3 text-sm font-semibold text-[#2d0140] transition hover:bg-[#a97dc8]"
          >
            <Plus className="h-4 w-4" />
            + Nuevo contenido
          </button>
        </div>
      </div>

      <div className="mt-4 rounded-[1.6rem] border border-slate-200/80 bg-slate-50/80 p-3">
        <div className="mb-3 flex items-center justify-between gap-3 px-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Tags</p>
          <p className="text-xs text-slate-400">Más usadas primero</p>
        </div>

        <div className="max-h-[10.5rem] overflow-y-auto overscroll-contain pr-1">
          <div className="flex flex-wrap gap-2">
            {sortedTags.map((tag) => {
              const active = selectedTags.includes(tag.nombre);
              return (
                <div
                  key={tag.nombre}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    active
                      ? 'border-amber-500 bg-amber-100 text-amber-900'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-400'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <button onClick={() => onToggleTag(tag.nombre)}>
                      {tag.nombre}
                      <span className="ml-1 text-[11px] text-slate-400">({tag.frecuencia ?? 0})</span>
                    </button>
                    {isManagingTags && tag.id && (
                      <button
                        onClick={async () => {
                          const confirmed = window.confirm(`¿Eliminar el tag "${tag.nombre}"? Se quitará de los contenidos donde esté asociado.`);
                          if (!confirmed) {
                            return;
                          }

                          setDeletingTagId(tag.id);
                          try {
                            await onDeleteTag(tag);
                          } finally {
                            setDeletingTagId(null);
                          }
                        }}
                        disabled={deletingTagId === tag.id}
                        className="rounded-full p-0.5 text-red-500 transition hover:bg-red-50 disabled:text-slate-300"
                        title={`Eliminar ${tag.nombre}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
