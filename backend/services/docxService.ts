import { AlignmentType, Document, LevelFormat, Packer, Paragraph, TextRun } from 'docx';
import { formatTextForDocument, type FormattedBlock } from './documentFormatterService';

export interface DocxPayload {
  title: string;
  summary: string;
  translatedText: string;
  tags: string[];
  date: string;
  sourceUrl?: string;
  notes?: string;
}

export interface AggregateDocxEntry {
  title: string;
  summary: string;
  translatedText: string;
  tags: string[];
  date: string;
  sourceUrl?: string;
  notes?: string;
}

function createDocument(children: Paragraph[]) {
  return new Document({
    numbering: {
      config: [
        {
          reference: 'knowledge-numbering',
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: '%1.',
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: {
                  indent: { left: 720, hanging: 260 },
                },
              },
            },
          ],
        },
      ],
    },
    sections: [
      {
        children,
      },
    ],
  });
}

function renderBlocks(blocks: FormattedBlock[], fontSize = 24) {
  return blocks.flatMap((block) => {
    if (block.type === 'paragraph') {
      return [
        new Paragraph({
          spacing: { after: 180 },
          children: [new TextRun({ text: block.text, size: fontSize })],
        }),
      ];
    }

    if (block.type === 'bullet-list') {
      return block.items.map(
        (item) =>
          new Paragraph({
            bullet: { level: 0 },
            spacing: { after: 100 },
            children: [new TextRun({ text: item, size: fontSize })],
          }),
      );
    }

    return block.items.map(
      (item) =>
        new Paragraph({
          numbering: {
            reference: 'knowledge-numbering',
            level: 0,
          },
          spacing: { after: 100 },
          children: [new TextRun({ text: item, size: fontSize })],
        }),
    );
  });
}

function renderSection(title: string, text: string, fontSize = 24) {
  return [
    new Paragraph({
      spacing: { before: 220, after: 180 },
      children: [new TextRun({ text: title, bold: true, size: fontSize + 2 })],
    }),
    ...renderBlocks(formatTextForDocument(text), fontSize),
  ];
}

export async function generateDocxBuffer(payload: DocxPayload) {
  const divider = new Paragraph({
    children: [
      new TextRun({
        text: '────────────────────────',
      }),
    ],
  });

  const children = [
    new Paragraph({
      spacing: { after: 240 },
      children: [new TextRun({ text: payload.title, bold: true, size: 34 })],
    }),
    ...renderSection('Resumen', payload.summary),
    ...(payload.notes ? renderSection('Notas', payload.notes, 22) : []),
    ...(payload.sourceUrl
      ? [
          new Paragraph({
            spacing: { after: 200 },
            children: [new TextRun({ text: `Fuente: ${payload.sourceUrl}`, size: 22 })],
          }),
        ]
      : []),
    divider,
    new Paragraph({
      spacing: { after: 180, before: 240 },
      children: [new TextRun({ text: `Tags: ${payload.tags.join(', ')}`, size: 22 })],
    }),
    new Paragraph({
      children: [new TextRun({ text: `Fecha: ${payload.date}`, size: 22 })],
    }),
  ];

  return Packer.toBuffer(createDocument(children));
}

export async function generateAggregateDocxBuffer(entries: AggregateDocxEntry[]) {
  const children = [
    new Paragraph({
      spacing: { after: 240 },
      children: [new TextRun({ text: 'Repositorio General de Conocimiento', bold: true, size: 38 })],
    }),
    new Paragraph({
      spacing: { after: 360 },
      children: [new TextRun({ text: `Última actualización: ${new Date().toLocaleString('es-MX')}`, size: 22 })],
    }),
  ];

  entries.forEach((entry, index) => {
    children.push(
      new Paragraph({
        spacing: { before: 280, after: 120 },
        children: [new TextRun({ text: `${index + 1}. ${entry.title}`, bold: true, size: 30 })],
      }),
      ...renderSection('Resumen', entry.summary, 22),
      new Paragraph({
        spacing: { after: 180 },
        children: [new TextRun({ text: `Tags: ${entry.tags.join(', ')}`, size: 20 })],
      }),
      new Paragraph({
        spacing: { after: 180 },
        children: [new TextRun({ text: `Fecha: ${entry.date}`, size: 20 })],
      }),
      ...(entry.notes ? renderSection('Notas', entry.notes, 20) : []),
      ...(entry.sourceUrl
        ? [
            new Paragraph({
              spacing: { after: 180 },
              children: [new TextRun({ text: `Fuente: ${entry.sourceUrl}`, size: 20 })],
            }),
          ]
        : []),
    );
  });

  return Packer.toBuffer(createDocument(children));
}
