import { createHash } from 'node:crypto';
import { google } from 'googleapis';
import type { SaveContentInput } from './contentService';
import { formatTextForDocument, renderBlocksAsPlainText } from './documentFormatterService';

const generalGoogleDocId = process.env.GENERAL_GOOGLE_DOC_ID;
const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const serviceAccountPrivateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n');

function getDocsClient() {
  if (!generalGoogleDocId || !serviceAccountEmail || !serviceAccountPrivateKey) {
    throw new Error('Faltan credenciales de Google Docs para actualizar el documento general.');
  }

  const auth = new google.auth.JWT({
    email: serviceAccountEmail,
    key: serviceAccountPrivateKey,
    scopes: ['https://www.googleapis.com/auth/documents', 'https://www.googleapis.com/auth/drive'],
  });

  return google.docs({ version: 'v1', auth });
}

export function getGeneralGoogleDocUrl() {
  if (!generalGoogleDocId) {
    return '';
  }

  return `https://docs.google.com/document/d/${generalGoogleDocId}/edit`;
}

function buildEntryText(input: {
  title: string;
  summary: string;
  longSummary?: string;
  translatedText: string;
  tags: string[];
  articleDate: string;
  syncId: string;
  sourceUrl?: string;
  notes?: string;
}) {
  const summaryText = renderBlocksAsPlainText(formatTextForDocument(input.longSummary || input.summary));
  const notesText = input.notes ? renderBlocksAsPlainText(formatTextForDocument(input.notes)) : '';

  return (
    `\n${input.title}\n\n` +
    `Resumen\n${summaryText}\n\n` +
    `Tags: ${input.tags.join(', ')}\n` +
    `Fecha del artículo: ${input.articleDate}\n\n` +
    `${notesText ? `Notas\n${notesText}\n\n` : ''}` +
    `${input.sourceUrl ? `Fuente: ${input.sourceUrl}\n\n` : ''}` +
    `[SYNC_ID:${input.syncId}]\n`
  );
}

function buildSyncId(input: { title: string; summary: string; translatedText: string; stableId?: string }) {
  if (input.stableId) {
    return input.stableId;
  }

  return createHash('sha256')
    .update(`${input.title}::${input.summary}::${input.translatedText}`)
    .digest('hex')
    .slice(0, 24);
}

async function getDocumentState() {
  const docs = getDocsClient();
  const document = await docs.documents.get({
    documentId: generalGoogleDocId,
  });

  const content = document.data.body?.content ?? [];
  const endIndex = Math.max((content.at(-1)?.endIndex ?? 2) - 1, 1);
  const textContent = content
    .flatMap((item) => item.paragraph?.elements ?? [])
    .map((element) => element.textRun?.content ?? '')
    .join('')
    .trim();

  if (!textContent) {
    await docs.documents.batchUpdate({
      documentId: generalGoogleDocId,
      requestBody: {
        requests: [
          {
            insertText: {
              location: { index: 1 },
              text: 'Base general\n\n',
            },
          },
          {
            updateParagraphStyle: {
              range: {
                startIndex: 1,
                endIndex: 14,
              },
              paragraphStyle: {
                namedStyleType: 'TITLE',
              },
              fields: 'namedStyleType',
            },
          },
        ],
      },
    });

    return { docs, empty: true, textContent: 'Base general' };
  }

  return { docs, empty: textContent === 'Base general', textContent };
}

async function resetGeneralGoogleDoc() {
  const docs = getDocsClient();
  const document = await docs.documents.get({
    documentId: generalGoogleDocId,
  });

  const endIndex = Math.max((document.data.body?.content?.at(-1)?.endIndex ?? 2) - 1, 1);
  const requests: any[] = [];

  if (endIndex > 1) {
    requests.push({
      deleteContentRange: {
        range: {
          startIndex: 1,
          endIndex,
        },
      },
    });
  }

  requests.push(
    {
      insertText: {
        location: { index: 1 },
        text: 'Base general\n\n',
      },
    },
    {
      updateParagraphStyle: {
        range: {
          startIndex: 1,
          endIndex: 14,
        },
        paragraphStyle: {
          namedStyleType: 'TITLE',
        },
        fields: 'namedStyleType',
      },
    },
  );

  await docs.documents.batchUpdate({
    documentId: generalGoogleDocId,
    requestBody: { requests },
  });
}

export async function appendContentToGeneralGoogleDoc(
  input: SaveContentInput,
  options?: { articleDate?: string; syncId?: string },
) {
  const syncId = buildSyncId({
    title: input.title,
    summary: input.summary,
    translatedText: input.translatedText,
    stableId: options?.syncId,
  });
  const { docs, empty, textContent } = await getDocumentState();

  if (textContent.includes(`[SYNC_ID:${syncId}]`)) {
    return { appended: false, syncId };
  }

  const document = await docs.documents.get({ documentId: generalGoogleDocId });

  const endIndex = Math.max((document.data.body?.content?.at(-1)?.endIndex ?? 2) - 1, 1);
  const text = buildEntryText({
    title: input.title,
    summary: input.summary,
    longSummary: input.longSummary,
    translatedText: input.translatedText,
    tags: input.selectedTags.map((tag) => tag.nombre),
    articleDate: options?.articleDate || new Date().toLocaleDateString('es-MX'),
    syncId,
    sourceUrl: input.sourceUrl,
    notes: input.notes,
  });
  const textInsertIndex = empty ? endIndex : endIndex + 1;
  const titleStartIndex = textInsertIndex + 1;
  const markerText = `[SYNC_ID:${syncId}]`;
  const markerStartIndex = textInsertIndex + text.lastIndexOf(markerText);

  await docs.documents.batchUpdate({
    documentId: generalGoogleDocId,
    requestBody: {
      requests: [
        ...(!empty
          ? [
              {
                insertPageBreak: {
                  location: { index: endIndex },
                },
              },
            ]
          : []),
        {
          insertText: {
            location: { index: textInsertIndex },
            text,
          },
        },
        {
          updateParagraphStyle: {
            range: {
              startIndex: titleStartIndex,
              endIndex: titleStartIndex + input.title.length,
            },
            paragraphStyle: {
              namedStyleType: 'HEADING_1',
            },
            fields: 'namedStyleType',
          },
        },
        ...(input.docxUrl
          ? [
              {
                updateTextStyle: {
                  range: {
                    startIndex: titleStartIndex,
                    endIndex: titleStartIndex + input.title.length,
                  },
                  textStyle: {
                    link: {
                      url: input.docxUrl,
                    },
                  },
                  fields: 'link',
                },
              },
            ]
          : []),
        {
          updateTextStyle: {
            range: {
              startIndex: markerStartIndex,
              endIndex: markerStartIndex + markerText.length,
            },
            textStyle: {
              foregroundColor: {
                color: {
                  rgbColor: {
                    red: 1,
                    green: 1,
                    blue: 1,
                  },
                },
              },
              fontSize: {
                magnitude: 1,
                unit: 'PT',
              },
            },
            fields: 'foregroundColor,fontSize',
          },
        },
      ],
    },
  });

  return { appended: true, syncId };
}

export async function syncContentsToGeneralGoogleDoc(
  items: Array<{ title: string; summary: string; longSummary?: string; translatedText: string; tags: string[]; articleDate: string; sourceUrl?: string; notes?: string; docxUrl?: string; syncId?: string }>,
) {
  await resetGeneralGoogleDoc();
  let appendedCount = 0;
  let skippedCount = 0;

  for (const item of items) {
    const result = await appendContentToGeneralGoogleDoc(
      {
        imageUrl: '',
        imageUrls: [],
        sourceUrl: item.sourceUrl || '',
        notes: item.notes || '',
        originalText: '',
        docxUrl: item.docxUrl || '',
        translatedText: item.translatedText,
        title: item.title,
        summary: item.summary,
        longSummary: item.longSummary || item.summary,
        selectedTags: item.tags.map((tag) => ({ id: null, nombre: tag, tipo: 'manual' as const })),
      },
      {
        articleDate: item.articleDate,
        syncId: item.syncId,
      },
    );

    if (result.appended) {
      appendedCount += 1;
    } else {
      skippedCount += 1;
    }
  }

  return {
    appendedCount,
    skippedCount,
  };
}
