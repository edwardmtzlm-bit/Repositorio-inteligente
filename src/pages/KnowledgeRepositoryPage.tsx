import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { ConfirmationPanel } from '../components/ConfirmationPanel';
import { ContentCard } from '../components/ContentCard';
import { ContentDetailDialog } from '../components/ContentDetailDialog';
import { SearchToolbar } from '../components/SearchToolbar';
import { TagCatalogDialog } from '../components/TagCatalogDialog';
import { UploadDialog } from '../components/UploadDialog';
import { useContents } from '../hooks/useContents';
import type { ContentListItem, ProcessingResponse } from '../types/content';

export function KnowledgeRepositoryPage() {
  const [search, setSearch] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ContentListItem | null>(null);
  const [processingResponse, setProcessingResponse] = useState<ProcessingResponse | null>(null);
  const { items, tags, tagCatalog, loading, error, refresh, libraryDocxUrl, syncLibraryDocx, regenerateExistingDocuments, deleteContent, saveTagCatalog } = useContents(search, selectedTags);

  const toggleFilterTag = (tagName: string) => {
    setSelectedTags((current) =>
      current.includes(tagName) ? current.filter((tag) => tag !== tagName) : [...current, tagName],
    );
  };

  return (
    <div
      translate="no"
      className="notranslate min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(245,158,11,0.22),_transparent_28%),linear-gradient(180deg,_#f8fafc_0%,_#fff7ed_100%)] text-slate-950"
    >
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-8 rounded-[2.5rem] bg-[#2d0140] px-6 py-10 text-white shadow-[0_40px_120px_-48px_rgba(45,1,64,0.75)]">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-300">Repositorio inteligente</p>
          <div className="mt-4 max-w-3xl">
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
              Banco de imágenes, artículos y ligas relevantes para HM.
            </h1>
            <p className="mt-4 text-base leading-7 text-slate-300">
              Busca por texto o tags.
            </p>
          </div>
        </header>

        <SearchToolbar
          search={search}
          onSearchChange={setSearch}
          availableTags={tags}
          selectedTags={selectedTags}
          onToggleTag={toggleFilterTag}
          onOpenCatalog={() => setCatalogOpen(true)}
          onCreateNew={() => setUploadOpen(true)}
          libraryDocxUrl={libraryDocxUrl}
          onSyncLibraryDocx={syncLibraryDocx}
          onRegenerateExistingDocuments={regenerateExistingDocuments}
        />

        {error && <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

        <section className="mt-8">
          {loading ? (
            <div className="flex min-h-[240px] items-center justify-center rounded-[2rem] border border-black/5 bg-white/70">
              <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white/75 px-6 py-16 text-center">
              <h2 className="text-xl font-semibold text-slate-900">No hay resultados</h2>
              <p className="mt-3 text-sm text-slate-500">Ajusta los filtros o sube un nuevo contenido para iniciar el repositorio.</p>
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {items.map((item) => (
                <ContentCard key={item.id} item={item} onOpen={() => setSelectedItem(item)} />
              ))}
            </div>
          )}
        </section>
      </div>

      <UploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onProcessed={(response) => {
          setProcessingResponse(response);
          setConfirmationOpen(true);
        }}
      />

      <ConfirmationPanel
        open={confirmationOpen}
        data={processingResponse}
        onClose={() => {
          setConfirmationOpen(false);
          setProcessingResponse(null);
        }}
        onSaved={refresh}
      />

      <TagCatalogDialog
        open={catalogOpen}
        blocks={tagCatalog}
        onClose={() => setCatalogOpen(false)}
        onSave={async (blocks) => {
          await saveTagCatalog(blocks);
          await refresh();
        }}
      />

      <ContentDetailDialog
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
        onUpdated={(updatedItem) => {
          setSelectedItem(updatedItem);
          void refresh();
        }}
        onDeleted={async (itemId) => {
          await deleteContent(itemId);
          setSelectedItem((current) => (current?.id === itemId ? null : current));
          await refresh();
        }}
      />
    </div>
  );
}
