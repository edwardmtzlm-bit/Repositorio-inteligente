import { useEffect, useState } from 'react';
import { deleteContent, fetchContents, fetchLibraryDocxUrl, fetchTagCatalog, fetchTags, regenerateExistingDocuments, syncLibraryDocx, updateTagCatalog } from '../lib/api';
import type { ContentListItem, TagCatalogBlock, TagOption } from '../types/content';

export function useContents(search: string, selectedBlocks: string[]) {
  const [items, setItems] = useState<ContentListItem[]>([]);
  const [tags, setTags] = useState<TagOption[]>([]);
  const [tagCatalog, setTagCatalog] = useState<TagCatalogBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [libraryDocxUrl, setLibraryDocxUrl] = useState('');

  const loadContents = async () => {
    setLoading(true);
    setError(null);

    try {
      const selectedTags = selectedBlocks.length
        ? Array.from(
            new Set(
              tagCatalog
                .filter((block) => selectedBlocks.includes(block.nombre))
                .flatMap((block) => block.tags),
            ),
          )
        : [];

      const data = await fetchContents(search, selectedTags);
      setItems(data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No fue posible cargar contenidos');
    } finally {
      setLoading(false);
    }
  };

  const loadTags = async () => {
    try {
      const data = await fetchTags();
      setTags(data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No fue posible cargar tags');
    }
  };

  const loadTagCatalog = async () => {
    try {
      const data = await fetchTagCatalog();
      setTagCatalog(data.blocks);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No fue posible cargar el catalogo de tags');
    }
  };

  const loadLibraryDocx = async () => {
    try {
      const data = await fetchLibraryDocxUrl();
      setLibraryDocxUrl(data.url);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No fue posible cargar el Word general');
    }
  };

  useEffect(() => {
    loadContents();
  }, [search, selectedBlocks.join('|'), tagCatalog.map((block) => `${block.nombre}:${block.tags.join('|')}`).join('||')]);

  useEffect(() => {
    loadTags();
    loadTagCatalog();
    loadLibraryDocx();
  }, []);

  return {
    items,
    tags,
    tagCatalog,
    loading,
    error,
    refresh: async () => {
      await Promise.all([loadContents(), loadTags(), loadTagCatalog(), loadLibraryDocx()]);
    },
    libraryDocxUrl,
    syncLibraryDocx: async () => {
      await syncLibraryDocx();
      await loadLibraryDocx();
    },
    regenerateExistingDocuments: async () => {
      await regenerateExistingDocuments();
      await Promise.all([loadContents(), loadLibraryDocx()]);
    },
    deleteContent: async (contentId: string) => {
      const result = await deleteContent(contentId);
      setItems((current) => current.filter((item) => item.id !== contentId));
      setLibraryDocxUrl(result.libraryDocxUrl);
      await Promise.all([loadContents(), loadTags(), loadLibraryDocx()]);
    },
    saveTagCatalog: async (blocks: TagCatalogBlock[]) => {
      const result = await updateTagCatalog(blocks);
      setTagCatalog(result.blocks);
      return result.blocks;
    },
  };
}
