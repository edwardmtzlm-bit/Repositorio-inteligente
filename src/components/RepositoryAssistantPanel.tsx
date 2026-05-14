import { Bot, Image, Loader2, RotateCcw, Send, Sparkles, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { queryRepositoryAssistant, queryRepositoryByImage } from '../lib/api';
import type { RepositoryAssistantMatch, RepositoryAssistantResponse } from '../types/content';

interface RepositoryAssistantPanelProps {
  open: boolean;
  onClose: () => void;
  onResults: (result: RepositoryAssistantResponse | null) => void;
  matchedItems: RepositoryAssistantMatch[];
  onOpenItem: (itemId: string) => void;
  onRevealItem: (itemId: string) => void;
  onToggleFilter: () => void;
  filterActive: boolean;
}

export function RepositoryAssistantPanel({
  open,
  onClose,
  onResults,
  matchedItems,
  onOpenItem,
  onRevealItem,
  onToggleFilter,
  filterActive,
}: RepositoryAssistantPanelProps) {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<RepositoryAssistantResponse | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const resetAssistant = () => {
    setQuestion('');
    setError(null);
    setResponse(null);
    onResults(null);
  };

  if (!open) {
    return null;
  }

  const handleSubmit = async () => {
    if (!question.trim()) {
      return;
    }

    setLoading(true);
    setError(null);
    setResponse(null);
    onResults(null);

    try {
      const result = await queryRepositoryAssistant(question.trim());
      setResponse(result);
      onResults(result);
    } catch (queryError) {
      const message = queryError instanceof Error ? queryError.message : 'No fue posible consultar el repositorio.';
      setError(message);
      onResults(null);
    } finally {
      setLoading(false);
    }
  };

  const handleImageSearch = async (files?: FileList | null) => {
    const file = files?.[0];

    if (!file) {
      return;
    }

    setImageLoading(true);
    setError(null);
    setResponse(null);
    onResults(null);

    try {
      const result = await queryRepositoryByImage(file);
      setResponse(result);
      onResults(result);
    } catch (queryError) {
      const message = queryError instanceof Error ? queryError.message : 'No fue posible buscar por imagen.';
      setError(message);
      onResults(null);
    } finally {
      setImageLoading(false);
      if (imageInputRef.current) {
        imageInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-[28rem] border-l border-slate-200 bg-white shadow-[-24px_0_80px_-40px_rgba(15,23,42,0.35)]">
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-600">Asistente</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-950">Consultar repositorio</h2>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-950">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <section className="rounded-[1.5rem] border border-slate-200 bg-slate-50/80 p-4">
            <div className="mb-3 flex items-center gap-2 text-slate-800">
              <Bot className="h-4 w-4" />
              <p className="text-sm font-semibold">Pregúntale por temas, autores, empresas o enfoques</p>
            </div>
            <textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              rows={5}
              placeholder='Ejemplo: "¿Tengo algún artículo sobre fintech y pagos digitales?"'
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-950"
            />
            <button
              onClick={() => void handleSubmit()}
              disabled={loading || !question.trim()}
              className="mt-3 inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:bg-slate-300"
            >
              {loading ? (
                <video src="/hermes.mp4" autoPlay muted loop playsInline className="h-8 w-8 rounded-lg object-contain" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {loading ? 'Hermes buscando...' : 'Consultar'}
            </button>
            <button
              onClick={resetAssistant}
              disabled={loading || imageLoading || (!question.trim() && !response && !error)}
              className="mt-3 ml-2 inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-950 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RotateCcw className="h-4 w-4" />
              Limpiar
            </button>
          </section>

          <section className="rounded-[1.5rem] border border-slate-200 bg-white p-4">
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => void handleImageSearch(event.target.files)}
            />
            <div className="mb-3 flex items-center gap-2 text-slate-800">
              <Image className="h-4 w-4" />
              <p className="text-sm font-semibold">Buscar si una imagen ya existe</p>
            </div>
            <button
              onClick={() => imageInputRef.current?.click()}
              disabled={loading || imageLoading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-950 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {imageLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Image className="h-4 w-4" />}
              {imageLoading ? 'Buscando imagen...' : 'Seleccionar imagen'}
            </button>
          </section>

          {error && <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

          {response && (
            <section className="rounded-[1.5rem] border border-slate-200 p-4">
              <div className="mb-3 flex items-center gap-2 text-slate-900">
                <Sparkles className="h-4 w-4 text-amber-600" />
                <p className="text-sm font-semibold">Respuesta</p>
              </div>
              <p className="text-sm leading-7 text-slate-700">{response.answer}</p>
              <p className="mt-4 text-xs text-slate-500">
                Se revisaron {response.candidateCount} artículos del repositorio y {response.matchedContentIds.length} coincidió/coincidieron con suficiente claridad para resaltarse.
              </p>

              {matchedItems.length > 0 && (
                <div className="mt-5 space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Artículos encontrados</p>
                  <button
                    onClick={onToggleFilter}
                    className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${
                      filterActive
                        ? 'bg-amber-100 text-amber-900'
                        : 'border border-slate-200 bg-white text-slate-700 hover:border-slate-950'
                    }`}
                  >
                    {filterActive ? 'Quitar filtro en pantalla' : 'Filtrar en pantalla'}
                  </button>
                  {matchedItems.map((item) => (
                    <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
                      <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                      <p className="mt-1 line-clamp-3 text-sm leading-6 text-slate-600">{item.summary}</p>
                      {item.reason && <p className="mt-2 text-xs leading-5 text-amber-700">{item.reason}</p>}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          onClick={() => onRevealItem(item.id)}
                          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-950"
                        >
                          Ver en pantalla
                        </button>
                        <button
                          onClick={() => onOpenItem(item.id)}
                          className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
                        >
                          Abrir artículo
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!!response.groups?.length && (
                <div className="mt-5 space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Posibles duplicados</p>
                  {response.groups.map((group) => (
                    <div key={`${group.type}-${group.title}`} className="rounded-2xl border border-slate-200 bg-white p-3">
                      <p className="text-sm font-semibold text-slate-900">{group.title}</p>
                      {group.description && <p className="mt-1 text-xs text-slate-500">{group.description}</p>}
                      <div className="mt-3 space-y-3">
                        {group.items.map((item) => (
                          <div key={`${group.title}-${item.id}`} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
                            <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                            <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-600">{item.summary}</p>
                            {item.reason && <p className="mt-2 text-xs leading-5 text-amber-700">{item.reason}</p>}
                            <div className="mt-3 flex flex-wrap gap-2">
                              <button
                                onClick={() => onRevealItem(item.id)}
                                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-950"
                              >
                                Ver en pantalla
                              </button>
                              <button
                                onClick={() => onOpenItem(item.id)}
                                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-950"
                              >
                                Abrir artículo
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {response.reviewedItems.length > matchedItems.length && (
                <div className="mt-5 space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Candidatos revisados</p>
                  {response.reviewedItems
                    .filter((item) => !response.matchedContentIds.includes(item.id))
                    .map((item) => (
                      <div key={`reviewed-${item.id}`} className="rounded-2xl border border-slate-200 bg-white p-3">
                        <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                        <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-600">{item.summary}</p>
                        {item.reason && <p className="mt-2 text-xs leading-5 text-amber-700">{item.reason}</p>}
                        <button
                          onClick={() => onOpenItem(item.id)}
                          className="mt-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-950"
                        >
                          Abrir artículo
                        </button>
                      </div>
                    ))}
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
