import { Download, FileText, Tag } from 'lucide-react';
import type { ContentListItem } from '../types/content';

interface ContentCardProps {
  item: ContentListItem;
  onOpen: () => void;
}

export function ContentCard({ item, onOpen }: ContentCardProps) {
  return (
    <article
      onClick={onOpen}
      className="group overflow-hidden rounded-[2rem] border border-black/5 bg-white shadow-[0_32px_120px_-48px_rgba(15,23,42,0.45)] transition hover:-translate-y-1 hover:shadow-[0_40px_120px_-48px_rgba(15,23,42,0.55)]"
    >
      <div className="aspect-[4/3] overflow-hidden bg-slate-100">
        {item.imagen_url ? (
          <img src={item.imagen_url} alt={item.titulo} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_top,_#fff7ed,_#e2e8f0)] text-slate-500">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <FileText className="h-5 w-5" />
              Solo texto
            </div>
          </div>
        )}
      </div>

      <div className="space-y-4 p-5">
        <div className="flex flex-wrap gap-2">
          {item.tags.slice(0, 4).map((tag) => (
            <span key={tag.nombre} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
              <Tag className="h-3 w-3" />
              {tag.nombre}
            </span>
          ))}
        </div>

        <div>
          <h3 className="text-lg font-semibold text-slate-950">{item.titulo}</h3>
          <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">{item.resumen}</p>
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 pt-4">
          <span className="text-xs text-slate-400">{new Date(item.fecha).toLocaleDateString()}</span>
          <div className="flex items-center gap-2">
            {item.imagenes_urls.length > 1 && <span className="text-[11px] font-semibold text-slate-400">{item.imagenes_urls.length} imgs</span>}
            <a
              href={item.docx_url}
              onClick={(event) => event.stopPropagation()}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-900 hover:text-slate-950"
            >
              <Download className="h-3.5 w-3.5" />
              Descargar Word
            </a>
          </div>
        </div>
      </div>
    </article>
  );
}
