import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from '../lib/supabaseAdmin';

const catalogBucket = 'documentos';
const catalogPath = 'config/tag-catalog.json';

export interface TagCatalogBlock {
  id: string;
  nombre: string;
  tags: string[];
}

const defaultCatalog: TagCatalogBlock[] = [
  {
    id: 'politica-eeuu-gobierno',
    nombre: 'Politica de EE. UU. y Gobierno',
    tags: [
      'Administracion Trump',
      'Donald Trump',
      'Casa Blanca',
      'Poder Ejecutivo',
      'Politica Estadounidense',
      'Comunicacion presidencial',
      'Controversias Presidenciales',
      'Elecciones presidenciales',
      'Medidas Electorales',
      'Resurgimiento Politico',
    ],
  },
  {
    id: 'estrategia-gestion-empresarial',
    nombre: 'Estrategia y Gestion Empresarial',
    tags: [
      'Estrategia de Negocios',
      'Estrategia empresarial',
      'Gestion empresarial',
      'Michael Porter',
      'Ventaja competitiva',
      'Errores Estrategicos',
      'Fracaso estrategico',
      'Diversificacion',
      'Liderazgo',
      'Directores Financieros',
    ],
  },
  {
    id: 'tecnologia-seguridad-digital',
    nombre: 'Tecnologia y Seguridad Digital',
    tags: [
      'Ciberseguridad',
      'Arresto Digital',
      'Desinformacion',
      'Estafas Digitales',
      'Fraude Online',
      'Guerra digital',
      'Responsabilidad Tecnologica',
      'Responsabilidad Digital',
      'Litigios Tecnologicos',
    ],
  },
  {
    id: 'industria-alimentaria',
    nombre: 'Industria Alimentaria',
    tags: [
      'Alimentos Envasados',
      'Grandes Empresas Alimentarias',
      'Startups Alimentarias',
      'Innovacion Alimentaria',
      "Domino's Pizza",
      'Mercado de Pizza',
    ],
  },
  {
    id: 'salud-medicina',
    nombre: 'Salud y Medicina',
    tags: [
      'Salud Digital',
      'Telemedicina',
      'Recetas Medicas',
      'Supervision Medica',
      'Salud Mental Adolescente',
      'Regulacion Sanitaria',
    ],
  },
  {
    id: 'finanzas-pagos',
    nombre: 'Finanzas y Pagos',
    tags: [
      'Fintech',
      'Pagos Digitales',
      'Mercado Pago',
      'Tap to Pay',
      'Analisis Financiero',
      'Impuesto a la Riqueza',
    ],
  },
  {
    id: 'marketing-marca',
    nombre: 'Marketing y Marca',
    tags: [
      'Marca',
      'Marketing',
      'Gestion de marca',
      'Estrategia de Marca',
      'Posicionamiento de mercado',
      'Identidad',
    ],
  },
  {
    id: 'relaciones-geopolitica',
    nombre: 'Relaciones Internacionales y Geopolitica',
    tags: [
      'Controversia Internacional',
      'Derecho Internacional',
      'Politica Exterior EE.UU.',
      'Conflicto en Iran',
      'Groenlandia',
      'Mexico',
      'India',
      'Guerra Comercial',
    ],
  },
  {
    id: 'inteligencia-artificial',
    nombre: 'Inteligencia Artificial',
    tags: ['Automatizacion', 'OpenAI', 'Sora', 'Productos asociados'],
  },
  {
    id: 'retail-consumo',
    nombre: 'Retail y Consumo',
    tags: ['Venta al por Menor', 'Tendencias de Consumo', 'Ropa Deportiva', 'Lululemon'],
  },
];

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

function sanitizeBlocks(blocks: TagCatalogBlock[]) {
  const seenBlockNames = new Set<string>();

  return blocks
    .map((block) => {
      const normalizedBlockName = normalizeName(block.nombre);
      const uniqueTags = Array.from(
        new Map(
          (block.tags || [])
            .map((tag) => normalizeName(tag))
            .filter(Boolean)
            .map((tag) => [tag.toLowerCase(), tag]),
        ).values(),
      );

      return {
        id: block.id?.trim() || randomUUID(),
        nombre: normalizedBlockName,
        tags: uniqueTags,
      };
    })
    .filter((block) => {
      if (!block.nombre || block.tags.length === 0) {
        return false;
      }

      const key = block.nombre.toLowerCase();
      if (seenBlockNames.has(key)) {
        return false;
      }

      seenBlockNames.add(key);
      return true;
    });
}

async function downloadStoredCatalog() {
  const { data, error } = await supabaseAdmin.storage.from(catalogBucket).download(catalogPath);

  if (error) {
    if (error.message?.toLowerCase().includes('not found') || error.message?.toLowerCase().includes('object not found')) {
      return null;
    }

    throw new Error(`No fue posible cargar el catalogo de tags: ${error.message}`);
  }

  const rawText = await data.text();

  if (!rawText.trim()) {
    return null;
  }

  const parsed = JSON.parse(rawText) as { blocks?: TagCatalogBlock[] } | TagCatalogBlock[];
  return Array.isArray(parsed) ? parsed : parsed.blocks || null;
}

export async function getTagCatalog() {
  try {
    const storedBlocks = await downloadStoredCatalog();
    return sanitizeBlocks(storedBlocks ?? defaultCatalog);
  } catch (error) {
    console.error('Fallo al cargar catalogo remoto de tags; usando catalogo por defecto.', error);
    return sanitizeBlocks(defaultCatalog);
  }
}

export async function saveTagCatalog(blocks: TagCatalogBlock[]) {
  const sanitizedBlocks = sanitizeBlocks(blocks);
  const payload = Buffer.from(
    JSON.stringify(
      {
        updatedAt: new Date().toISOString(),
        blocks: sanitizedBlocks,
      },
      null,
      2,
    ),
    'utf-8',
  );

  const { error } = await supabaseAdmin.storage.from(catalogBucket).upload(catalogPath, payload, {
    contentType: 'application/json',
    upsert: true,
  });

  if (error) {
    throw new Error(`No fue posible guardar el catalogo de tags: ${error.message}`);
  }

  return sanitizedBlocks;
}

export async function getRelevantCatalogBlocks(tagNames: string[]) {
  const catalog = await getTagCatalog();
  const normalizedTags = new Set(tagNames.map((tag) => tag.toLowerCase()));

  return catalog.filter((block) => block.tags.some((tag) => normalizedTags.has(tag.toLowerCase())));
}

export async function getCatalogTagBlockLookup() {
  const catalog = await getTagCatalog();
  const tagToBlock = new Map<string, string>();

  for (const block of catalog) {
    for (const tag of block.tags) {
      tagToBlock.set(tag.toLowerCase(), block.nombre);
    }
  }

  return {
    catalog,
    tagToBlock,
  };
}
