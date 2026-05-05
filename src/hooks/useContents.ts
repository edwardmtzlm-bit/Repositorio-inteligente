import { useEffect, useState } from 'react';
import { deleteContent, deleteTag, fetchContents, fetchLibraryDocxUrl, fetchTags, regenerateExistingDocuments, syncLibraryDocx } from '../lib/api';
import type { ContentListItem, TagOption } from '../types/content';

export function useContents(search: string, selectedTags: string[]) {
  const [items, setItems] = useState<ContentListItem[]>([]);
  const [tags, setTags] = useState<TagOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [libraryDocxUrl, setLibraryDocxUrl] = useState('');

  const loadContents = async () => {
    setLoading(true);
    setError(null);

    try {
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
  }, [search, selectedTags.join('|')]);

  useEffect(() => {
    loadTags();
    loadLibraryDocx();
  }, []);

  return {
    items,
    tags,
    loading,
    error,
    refresh: async () => {
      await Promise.all([loadContents(), loadTags(), loadLibraryDocx()]);
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
    deleteTag: async (tagId: string, tagName: string) => {
      await deleteTag(tagId);
      setTags((current) => current.filter((tag) => tag.id !== tagId));
      setItems((current) =>
        current.map((item) => ({
          ...item,
          tags: item.tags.filter((tag) => tag.nombre !== tagName),
        })),
      );
    },
    deleteContent: async (contentId: string) => {
      const result = await deleteContent(contentId);
      setItems((current) => current.filter((item) => item.id !== contentId));
      setLibraryDocxUrl(result.libraryDocxUrl);
      await Promise.all([loadContents(), loadTags(), loadLibraryDocx()]);
    },
  };
}
