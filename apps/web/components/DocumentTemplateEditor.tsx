'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  currentQuarterInManila,
  reportTemplateDraftResponseSchema,
  reportTemplateDocumentSchema,
  type ReportTemplateDocument,
} from '@harvestgo/shared';
import { ApiRequestError, apiFetch, apiFetchBlob } from '@/lib/api';
import { Dialog, inputClass, primaryButton, secondaryButton } from './Dialog';

type TemplatePage = ReportTemplateDocument['pages'][number];
type TemplateElement = TemplatePage['elements'][number];
type ElementType = TemplateElement['type'];
type FlowElement = Exclude<TemplateElement, { type: 'page_break' }>;
type StyledElement = Extract<TemplateElement, { type: 'report_title' | 'section_heading' | 'paragraph' | 'static_label' | 'dynamic_field' | 'signature' | 'page_number' }>;
type TableElement = Extract<TemplateElement, { type: 'table' }>;
type TableBinding = TableElement['binding'];
type TableField = TableElement['columns'][number]['field'];

const tableFields: Record<TableBinding, TableField[]> = {
  'report.services': ['serviceType', 'activities', 'titles', 'male', 'female'],
  'report.participantTypes': ['name'],
  'report.yield': ['category', 'crop', 'kg', 'pcs'],
  'report.cost': ['category', 'label', 'amount'],
  'report.sales': ['category', 'label', 'amount'],
  'report.income': ['category', 'label', 'amount'],
  'report.issues': ['date', 'problem', 'actionTaken', 'recommendation'],
};

const elementTypes: { value: ElementType; label: string }[] = [
  { value: 'report_title', label: 'Report title' },
  { value: 'section_heading', label: 'Section heading' },
  { value: 'paragraph', label: 'Paragraph' },
  { value: 'static_label', label: 'Static label' },
  { value: 'dynamic_field', label: 'Dynamic field' },
  { value: 'table', label: 'Data table' },
  { value: 'photo_group', label: 'Photo group' },
  { value: 'photo', label: 'Single photo' },
  { value: 'logo', label: 'Logo' },
  { value: 'signature', label: 'Signature block' },
  { value: 'divider', label: 'Divider' },
  { value: 'page_number', label: 'Page number' },
  { value: 'page_break', label: 'Page break' },
];

const dynamicBindings = [
  'report.year', 'report.quarter', 'report.period.from', 'report.period.to', 'report.generatedOn',
  'farm.name', 'farm.shortName', 'signature.name',
] as const;

const fieldClass = `${inputClass} text-sm`;
let generatedId = 0;
const id = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(++generatedId).toString(36)}`;

function blankPage(pageId = 'page-1', name = 'Page 1') {
  return {
    id: pageId,
    name,
    settings: { size: 'letter' as const, orientation: 'portrait' as const, margins: { top: 16, right: 14, bottom: 16, left: 14 } },
    layout: { mode: 'flow' as const, columns: 1, gapMm: 5 },
    backgroundColor: null,
    border: { enabled: false, color: '#333333', widthMm: 0.5 },
    header: { enabled: false, lines: [], alignment: 'left' as const, showLogo: false, showPageNumber: false },
    footer: { enabled: false, lines: [], alignment: 'center' as const, showLogo: false, showPageNumber: true },
    elements: [],
  };
}

function blankDocument(): ReportTemplateDocument {
  return reportTemplateDocumentSchema.parse({
    schemaVersion: 2,
    name: 'Flexible farm report',
    farm: { name: 'Kabutihan Farm', shortName: 'Kabutihan' },
    logoPath: null,
    pages: [blankPage()],
  });
}

function starterDocument(): ReportTemplateDocument {
  return reportTemplateDocumentSchema.parse({
    schemaVersion: 2,
    name: 'Quarterly Farm Report',
    farm: { name: 'Kabutihan Farm', shortName: 'Kabutihan' },
    logoPath: null,
    pages: [
      {
        ...blankPage('overview', 'Overview'),
        header: { enabled: true, lines: ['Quarterly Accomplishment Report'], alignment: 'center', showLogo: false, showPageNumber: false },
        footer: { enabled: true, lines: ['Farm report'], alignment: 'right', showLogo: false, showPageNumber: true },
        elements: [
          { id: 'report-title', type: 'report_title', text: 'Quarterly Accomplishment Report', placement: { mode: 'flow', column: 0, columnSpan: 1 }, fontSizePt: 20, bold: true, alignment: 'center' },
          { id: 'period', type: 'dynamic_field', binding: 'report.year', prefix: 'Year: ', suffix: '', placement: { mode: 'flow', column: 0, columnSpan: 1 }, fontSizePt: 11 },
          { id: 'services-heading', type: 'section_heading', text: 'Services and Participants', placement: { mode: 'flow', column: 0, columnSpan: 1 }, fontSizePt: 14, bold: true },
          {
            id: 'services-table', type: 'table', binding: 'report.services',
            columns: [
              { field: 'serviceType', label: 'Service', widthPercent: 30, alignment: 'left', visible: true },
              { field: 'activities', label: 'Activities', widthPercent: 18, alignment: 'right', visible: true },
              { field: 'male', label: 'Male', widthPercent: 16, alignment: 'right', visible: true },
              { field: 'female', label: 'Female', widthPercent: 16, alignment: 'right', visible: true },
              { field: 'titles', label: 'Activities conducted', widthPercent: 20, alignment: 'left', visible: true },
            ],
            placement: { mode: 'flow', column: 0, columnSpan: 1 }, fontSizePt: 9,
            headerBackground: '#E4EFE4', headerColor: '#000000', repeatHeader: true,
            rowBehavior: 'keep-together', emptyText: 'No services recorded.',
          },
          { id: 'yield-heading', type: 'section_heading', text: 'Production', placement: { mode: 'flow', column: 0, columnSpan: 1 }, fontSizePt: 14, bold: true },
          {
            id: 'yield-table', type: 'table', binding: 'report.yield',
            columns: [
              { field: 'category', label: 'Category', widthPercent: 30, alignment: 'left', visible: true },
              { field: 'crop', label: 'Crop', widthPercent: 40, alignment: 'left', visible: true },
              { field: 'kg', label: 'Yield (kg)', widthPercent: 30, alignment: 'right', visible: true },
            ],
            placement: { mode: 'flow', column: 0, columnSpan: 1 }, fontSizePt: 9,
            headerBackground: '#E4EFE4', headerColor: '#000000', repeatHeader: true,
            rowBehavior: 'allow-split', emptyText: 'No production recorded.',
          },
        ],
      },
      {
        ...blankPage('documentation', 'Issues and Photos'),
        elements: [
          { id: 'issues-heading', type: 'section_heading', text: 'Issues and Actions', placement: { mode: 'flow', column: 0, columnSpan: 1 }, fontSizePt: 14, bold: true },
          {
            id: 'issues-table', type: 'table', binding: 'report.issues',
            columns: [
              { field: 'date', label: 'Date', widthPercent: 18, alignment: 'left', visible: true },
              { field: 'problem', label: 'Issue', widthPercent: 32, alignment: 'left', visible: true },
              { field: 'actionTaken', label: 'Action taken', widthPercent: 25, alignment: 'left', visible: true },
              { field: 'recommendation', label: 'Recommendation', widthPercent: 25, alignment: 'left', visible: true },
            ],
            placement: { mode: 'flow', column: 0, columnSpan: 1 }, fontSizePt: 9,
            headerBackground: '#E4EFE4', headerColor: '#000000', repeatHeader: true,
            rowBehavior: 'keep-together', emptyText: 'No issues recorded.',
          },
          {
            id: 'photos', type: 'photo_group', binding: 'report.photos', startIndex: 0,
            columns: 2, imageHeightMm: 70, fit: 'contain', alignment: 'center',
            showCaptions: true, maxPhotos: 6, continueAcrossPages: true,
            placement: { mode: 'flow', column: 0, columnSpan: 1 },
          },
        ],
      },
    ],
  });
}

function visibleText(element: TemplateElement): string {
  if ('text' in element) return element.text;
  if (element.type === 'dynamic_field') return element.binding.replaceAll('.', ' ');
  if (element.type === 'table') return `${element.binding.replace('report.', '')} table`;
  if (element.type === 'photo_group') return `Photos ${element.startIndex + 1}–${element.startIndex + element.maxPhotos}`;
  if (element.type === 'photo') return `Photo ${element.index + 1}`;
  if (element.type === 'logo') return 'Logo';
  if (element.type === 'signature') return 'Signature';
  if (element.type === 'divider') return 'Divider';
  if (element.type === 'page_number') return 'Page number';
  return 'Page break';
}

function hasTextStyle(element: TemplateElement): element is StyledElement {
  return ['report_title', 'section_heading', 'paragraph', 'static_label', 'dynamic_field', 'signature', 'page_number'].includes(element.type);
}

function textControl(element: TemplateElement): element is Extract<TemplateElement, { text: string }> {
  return 'text' in element;
}

function flowElement(element: TemplateElement): element is FlowElement {
  return element.type !== 'page_break';
}

export function DocumentTemplateEditor({
  initial,
  onSaved,
  onClose,
}: {
  initial?: ReportTemplateDocument;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [document, setDocument] = useState<ReportTemplateDocument | null>(initial ?? null);
  const [pageId, setPageId] = useState(initial?.pages[0]?.id ?? '');
  const [elementId, setElementId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ document: ReportTemplateDocument; updatedAt: string } | null>(null);
  const [draftLoading, setDraftLoading] = useState(true);
  const [draftLoadError, setDraftLoadError] = useState<string | null>(null);
  const [draftMessage, setDraftMessage] = useState<string | null>(null);
  const [year, setYear] = useState(currentQuarterInManila().year);
  const [quarter, setQuarter] = useState<number>(currentQuarterInManila().quarter);

  const selectedPage = document?.pages.find((page) => page.id === pageId) ?? document?.pages[0];
  const selectedElement = selectedPage?.elements.find((element) => element.id === elementId);
  const selectedFlowPlacement = selectedElement && selectedElement.type !== 'page_break' && selectedElement.placement.mode === 'flow'
    ? selectedElement.placement : null;
  const selectedPositionPlacement = selectedElement && selectedElement.type !== 'page_break' && selectedElement.placement.mode === 'positioned'
    ? selectedElement.placement : null;
  const validation = useMemo(() => document ? reportTemplateDocumentSchema.safeParse(document) : null, [document]);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  useEffect(() => {
    let cancelled = false;
    apiFetch<unknown>('/report-templates/draft')
      .then((raw) => {
        const parsed = reportTemplateDraftResponseSchema.safeParse(raw);
        if (!parsed.success) throw new Error('The saved draft response was invalid.');
        if (!cancelled) setDraft(parsed.data.draft);
      })
      .catch((err: unknown) => {
        if (!cancelled) setDraftLoadError(err instanceof Error ? err.message : 'Could not load the saved draft.');
      })
      .finally(() => {
        if (!cancelled) setDraftLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  function updateDocument(patch: Partial<ReportTemplateDocument>) {
    setDocument((current) => current ? { ...current, ...patch } : current);
    setIssues([]);
  }

  function updatePage(patch: Partial<TemplatePage>) {
    if (!document || !selectedPage) return;
    setDocument({
      ...document,
      pages: document.pages.map((page) => page.id === selectedPage.id ? { ...page, ...patch } : page),
    });
    setIssues([]);
  }

  function updateElement(patch: Partial<TemplateElement>) {
    if (!document || !selectedPage || !selectedElement) return;
    setDocument({
      ...document,
      pages: document.pages.map((page) => page.id === selectedPage.id
        ? { ...page, elements: page.elements.map((element) => element.id === selectedElement.id ? { ...element, ...patch } as TemplateElement : element) }
        : page),
    });
    setIssues([]);
  }

  function startFrom(template: ReportTemplateDocument) {
    setDocument(template);
    setPageId(template.pages[0]!.id);
    setElementId(null);
    setError(null);
    setIssues([]);
  }

  function addPage() {
    if (!document || document.pages.length >= 50) return;
    const newPage = blankPage(id('page'), `Page ${document.pages.length + 1}`);
    const parsed = reportTemplateDocumentSchema.parse({ ...document, pages: [...document.pages, newPage] });
    setDocument(parsed);
    setPageId(newPage.id);
    setElementId(null);
  }

  function removePage() {
    if (!document || !selectedPage || document.pages.length <= 1) return;
    const nextPages = document.pages.filter((page) => page.id !== selectedPage.id);
    setDocument({ ...document, pages: nextPages });
    setPageId(nextPages[0]!.id);
    setElementId(null);
  }

  function movePageById(targetId: string, direction: -1 | 1) {
    if (!document) return;
    const index = document.pages.findIndex((page) => page.id === targetId);
    const destination = index + direction;
    if (index < 0 || destination < 0 || destination >= document.pages.length) return;
    const pages = [...document.pages];
    [pages[index], pages[destination]] = [pages[destination]!, pages[index]!];
    setDocument({ ...document, pages });
    setPageId(targetId);
  }

  function addElement(type: ElementType) {
    if (!document || !selectedPage || selectedPage.elements.length >= 100) return;
    const base = { id: id(type.replaceAll('_', '-')) };
    const placement = { mode: 'flow' as const, column: 0, columnSpan: selectedPage.layout.columns };
    let element: unknown;
    switch (type) {
      case 'report_title':
      case 'section_heading':
      case 'paragraph':
      case 'static_label':
        element = { ...base, type, text: type === 'report_title' ? 'Report title' : type === 'section_heading' ? 'Section heading' : 'Enter text', placement };
        break;
      case 'dynamic_field':
        element = { ...base, type, binding: 'report.year', prefix: '', suffix: '', placement };
        break;
      case 'table':
        element = {
          ...base, type, binding: 'report.services', placement, fontSizePt: 9,
          columns: [{ field: 'serviceType', label: 'Service', widthPercent: 100, alignment: 'left', visible: true }],
          headerBackground: '#E4EFE4', headerColor: '#000000', repeatHeader: true,
          rowBehavior: 'keep-together', emptyText: 'No data recorded.',
        };
        break;
      case 'photo_group':
        element = {
          ...base, type, binding: 'report.photos', placement, startIndex: 0, columns: 2,
          imageHeightMm: 70, fit: 'contain', alignment: 'center', showCaptions: true,
          maxPhotos: 6, continueAcrossPages: true,
        };
        break;
      case 'photo':
        element = {
          ...base, type, binding: 'report.photos', placement, index: 0, widthPercent: 100,
          imageHeightMm: 70, fit: 'contain', alignment: 'center', showCaption: true,
        };
        break;
      case 'logo':
        element = { ...base, type, placement, widthPercent: 35, imageHeightMm: 25, fit: 'contain', alignment: 'center' };
        break;
      case 'signature':
        element = {
          ...base, type, placement, preparedByLabel: 'Prepared by:', name: '', position: '',
          dateLabel: 'Date:', dateMode: 'report_date',
        };
        break;
      case 'divider':
        element = { ...base, type, placement, color: '#333333', thicknessMm: 0.5 };
        break;
      case 'page_number':
        element = { ...base, type, placement, format: '{page} / {pages}' };
        break;
      case 'page_break':
        element = { ...base, type };
        break;
    }

    const pages = document.pages.map((page) => page.id === selectedPage.id
      ? { ...page, elements: [...page.elements, element] }
      : page);
    const parsed = reportTemplateDocumentSchema.parse({ ...document, pages });
    const added = parsed.pages.find((page) => page.id === selectedPage.id)!.elements.at(-1)!;
    setDocument(parsed);
    setElementId(added.id);
  }

  function removeElement() {
    if (!document || !selectedPage || !selectedElement) return;
    setDocument({
      ...document,
      pages: document.pages.map((page) => page.id === selectedPage.id
        ? { ...page, elements: page.elements.filter((element) => element.id !== selectedElement.id) }
        : page),
    });
    setElementId(null);
  }

  function moveElement(direction: -1 | 1) {
    if (!document || !selectedPage || !selectedElement) return;
    const index = selectedPage.elements.findIndex((element) => element.id === selectedElement.id);
    const destination = index + direction;
    if (destination < 0 || destination >= selectedPage.elements.length) return;
    const elements = [...selectedPage.elements];
    [elements[index], elements[destination]] = [elements[destination]!, elements[index]!];
    updatePage({ elements });
  }

  function setLayoutMode(mode: TemplatePage['layout']['mode']) {
    if (!selectedPage) return;
    const columns = mode === 'flow' ? 1 : selectedPage.layout.columns;
    const elements = mode !== 'hybrid'
      ? selectedPage.elements.map((element) => element.type === 'page_break' ? element : {
        ...element,
        placement: element.placement.mode === 'flow'
          ? {
            ...element.placement,
            column: mode === 'flow' ? 0 : Math.min(element.placement.column, columns - 1),
            columnSpan: mode === 'flow' ? 1 : Math.min(element.placement.columnSpan, columns - Math.min(element.placement.column, columns - 1)),
          }
          : { mode: 'flow' as const, column: 0, columnSpan: 1 },
      } as TemplateElement)
      : selectedPage.elements;
    updatePage({ layout: { ...selectedPage.layout, mode, columns }, elements });
  }

  function setColumns(columns: number) {
    if (!selectedPage) return;
    updatePage({
      layout: { ...selectedPage.layout, columns },
      elements: selectedPage.elements.map((element) => element.type === 'page_break' || element.placement.mode !== 'flow'
        ? element
        : {
          ...element,
          placement: {
            ...element.placement,
            column: Math.min(element.placement.column, columns - 1),
            columnSpan: Math.min(element.placement.columnSpan, columns - Math.min(element.placement.column, columns - 1)),
          },
        }),
    });
  }

  function setPlacementMode(mode: 'flow' | 'positioned') {
    if (!selectedElement || selectedElement.type === 'page_break') return;
    if (!document || !selectedPage) return;
    const placement: FlowElement['placement'] = mode === 'positioned'
      ? { mode, x: 5, y: 5, width: 90, height: 15 }
      : { mode, column: 0, columnSpan: selectedPage.layout.columns };
    setDocument({
      ...document,
      pages: document.pages.map((page) => page.id === selectedPage.id ? {
        ...page,
        layout: mode === 'positioned' ? { ...page.layout, mode: 'hybrid' } : page.layout,
        elements: page.elements.map((element) => element.id === selectedElement.id ? { ...element, placement } as TemplateElement : element),
      } : page),
    });
  }

  function changeTableBinding(binding: TableBinding) {
    if (!selectedElement || selectedElement.type !== 'table') return;
    const field = tableFields[binding][0]!;
    updateElement({
      binding,
      columns: [{ field, label: field, widthPercent: 100, alignment: 'left', visible: true }],
    });
  }

  function updateTableColumn(index: number, patch: Partial<TableElement['columns'][number]>) {
    if (!selectedElement || selectedElement.type !== 'table') return;
    updateElement({ columns: selectedElement.columns.map((column, i) => i === index ? { ...column, ...patch } : column) });
  }

  function addTableColumn() {
    if (!selectedElement || selectedElement.type !== 'table') return;
    const field = tableFields[selectedElement.binding].find((item) => !selectedElement.columns.some((column) => column.field === item));
    if (!field || selectedElement.columns.length >= 15) return;
    const equalWidth = Math.floor(100 / (selectedElement.columns.length + 1));
    updateElement({
      columns: [
        ...selectedElement.columns.map((column) => ({ ...column, widthPercent: equalWidth })),
        { field, label: field, widthPercent: 100 - equalWidth * selectedElement.columns.length, alignment: 'left', visible: true },
      ],
    });
  }

  function validationMessages(): string[] {
    if (!document) return ['Choose a starting point first.'];
    const parsed = reportTemplateDocumentSchema.safeParse(document);
    return parsed.success ? [] : parsed.error.issues.map((issue) => `${issue.path.join('.') || 'Template'}: ${issue.message}`);
  }

  async function save() {
    setError(null);
    const parsed = document ? reportTemplateDocumentSchema.safeParse(document) : null;
    if (!parsed?.success) {
      setIssues(validationMessages());
      setError('Fix the template validation issues before publishing.');
      return;
    }
    setBusy(true);
    try {
      await apiFetch('/report-templates/custom', { method: 'POST', json: parsed.data });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not publish the template.');
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft() {
    setError(null);
    const parsed = document ? reportTemplateDocumentSchema.safeParse(document) : null;
    if (!parsed?.success) {
      setIssues(validationMessages());
      setError('Fix the template validation issues before saving a draft.');
      return;
    }
    setBusy(true);
    try {
      const raw = await apiFetch<unknown>('/report-templates/draft', { method: 'POST', json: parsed.data });
      const saved = reportTemplateDraftResponseSchema.safeParse(raw);
      if (!saved.success || !saved.data.draft) throw new Error('The saved draft response was invalid.');
      setDraft(saved.data.draft);
      setDraftMessage('Draft saved. You can resume it later or publish it when ready.');
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : err instanceof Error ? err.message : 'Could not save the draft.');
    } finally {
      setBusy(false);
    }
  }

  async function discardDraft() {
    setError(null);
    setBusy(true);
    try {
      await apiFetch('/report-templates/draft', { method: 'DELETE' });
      setDraft(null);
      setDraftMessage('Saved draft discarded.');
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not discard the saved draft.');
    } finally {
      setBusy(false);
    }
  }

  async function preview() {
    setError(null);
    setPreviewUrl(null);
    const parsed = document ? reportTemplateDocumentSchema.safeParse(document) : null;
    if (!parsed?.success) {
      setIssues(validationMessages());
      setError('Fix the template validation issues before previewing.');
      return;
    }
    setBusy(true);
    try {
      const blob = await apiFetchBlob('/report-templates/preview', {
        method: 'POST',
        json: { document: parsed.data, year, quarter, photoIds: [] },
      });
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (err) {
      const layoutIssues = err instanceof ApiRequestError ? err.details?.layout : undefined;
      setIssues(layoutIssues ?? []);
      setError(err instanceof ApiRequestError ? err.message : 'Could not render the PDF preview.');
    } finally {
      setBusy(false);
    }
  }

  const elementPreview = selectedPage?.elements ?? [];
  const sizeAspectRatio = selectedPage
    ? (() => {
      const dimensions = selectedPage.settings.size === 'a4' ? [297, 210]
        : selectedPage.settings.size === 'letter' ? [279.4, 215.9] : [330.2, 215.9];
      const [width, height] = selectedPage.settings.orientation === 'landscape' ? dimensions : [dimensions[1], dimensions[0]];
      return `${width} / ${height}`;
    })()
    : '8.5 / 11';

  return (
    <Dialog title="Flexible report template editor" onClose={onClose} className="max-w-6xl">
      <div className="max-h-[82vh] overflow-y-auto pr-1">
        {!document ? (
          <div className="space-y-4">
            <p className="text-sm text-leaf-900/70">Choose a starting point. The official ATI report remains unchanged unless you separately edit and publish its settings.</p>
            {draftMessage && <p role="status" className="text-sm text-leaf-900/70">{draftMessage}</p>}
            {draftLoading && <p role="status" className="text-sm text-leaf-900/70">Checking for a saved draft…</p>}
            {draftLoadError && <p role="alert" className="text-sm text-red-800">{draftLoadError}</p>}
            {draft && <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-leaf-50 p-3"><p className="text-sm">Saved draft: {draft.document.name}</p><div className="flex gap-2"><button type="button" onClick={() => startFrom(draft.document)} className={primaryButton}>Resume saved draft</button><button type="button" onClick={() => void discardDraft()} disabled={busy} className={secondaryButton}>Discard draft</button></div></div>}
            <div className="grid gap-3 md:grid-cols-2">
              <button type="button" onClick={() => startFrom(blankDocument())} className="rounded-xl border-2 border-leaf-100 p-5 text-left hover:border-leaf-600">
                <span className="block font-semibold">Blank flexible report</span>
                <span className="mt-1 block text-sm text-leaf-900/70">Start with one empty page and add only the content you need.</span>
              </button>
              <button type="button" onClick={() => startFrom(starterDocument())} className="rounded-xl border-2 border-leaf-100 p-5 text-left hover:border-leaf-600">
                <span className="block font-semibold">Quarterly report starter</span>
                <span className="mt-1 block text-sm text-leaf-900/70">A flexible starter with services, production, issues, and a photo group.</span>
              </button>
            </div>
            <div className="flex justify-end"><button type="button" onClick={onClose} className={secondaryButton}>Cancel</button></div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-[minmax(13rem,0.8fr)_minmax(0,2fr)_minmax(17rem,1fr)]">
              <section className="space-y-3 rounded-xl border border-leaf-100 p-3" aria-label="Template pages">
                <div>
                  <label className="block text-sm font-semibold" htmlFor="document-name">Template name</label>
                  <input id="document-name" value={document.name} onChange={(event) => updateDocument({ name: event.target.value })} className={fieldClass} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="block text-xs font-medium">Farm name</label><input value={document.farm.name} onChange={(event) => updateDocument({ farm: { ...document.farm, name: event.target.value } })} className={fieldClass} /></div>
                  <div><label className="block text-xs font-medium">Short name</label><input value={document.farm.shortName} onChange={(event) => updateDocument({ farm: { ...document.farm, shortName: event.target.value } })} className={fieldClass} /></div>
                </div>
                <div><label className="block text-xs font-medium">Logo storage path</label><input value={document.logoPath ?? ''} onChange={(event) => updateDocument({ logoPath: event.target.value || null })} placeholder="Optional existing asset path" className={fieldClass} /></div>
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Pages</h3>
                  <button type="button" onClick={addPage} disabled={document.pages.length >= 50} className={secondaryButton}>Add page</button>
                </div>
                <ol className="space-y-1">
                  {document.pages.map((page, index) => (
                    <li key={page.id} className="flex gap-1">
                      <button type="button" onClick={() => { setPageId(page.id); setElementId(null); }} aria-current={page.id === selectedPage?.id ? 'page' : undefined} className={`min-w-0 flex-1 truncate rounded-lg px-2 py-2 text-left text-sm ${page.id === selectedPage?.id ? 'bg-leaf-100 font-semibold' : 'hover:bg-leaf-50'}`}>
                        {index + 1}. {page.name}
                      </button>
                      <button type="button" onClick={() => movePageById(page.id, -1)} disabled={index === 0} aria-label={`Move ${page.name} up`} className="rounded px-2 disabled:opacity-40">↑</button>
                      <button type="button" onClick={() => movePageById(page.id, 1)} disabled={index === document.pages.length - 1} aria-label={`Move ${page.name} down`} className="rounded px-2 disabled:opacity-40">↓</button>
                    </li>
                  ))}
                </ol>
                {selectedPage && (
                  <div className="grid grid-cols-2 gap-2 border-t border-leaf-100 pt-3">
                    <button type="button" onClick={() => { setPageId(selectedPage.id); removePage(); }} disabled={document.pages.length <= 1} className={secondaryButton}>Delete page</button>
                    <span className="self-center text-xs text-leaf-900/60">Rename above</span>
                  </div>
                )}
              </section>

              <section className="min-w-0 space-y-3 rounded-xl border border-leaf-100 bg-leaf-50/50 p-3" aria-label="Page preview">
                {selectedPage && (
                  <>
                    <div className="flex flex-wrap items-end justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <label className="block text-xs font-semibold">Page name</label>
                        <input value={selectedPage.name} onChange={(event) => updatePage({ name: event.target.value })} className={fieldClass} />
                      </div>
                      <div className="flex gap-2">
                        <select aria-label="Add element" defaultValue="" onChange={(event) => {
                          if (event.target.value) addElement(event.target.value as ElementType);
                          event.target.value = '';
                        }} className={fieldClass}>
                          <option value="" disabled>Add element…</option>
                          {elementTypes.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="overflow-auto rounded-lg bg-slate-200 p-3">
                      <div style={{ aspectRatio: sizeAspectRatio }} className="relative mx-auto w-full max-w-[34rem] overflow-hidden border border-slate-400 bg-white shadow" aria-label={`${selectedPage.name} canvas`}>
                        <div className="absolute inset-[8%]">
                          {elementPreview.map((element, index) => {
                            const positioned = flowElement(element) && element.placement.mode === 'positioned';
                            const place = flowElement(element) ? element.placement : null;
                            const style = positioned && place?.mode === 'positioned'
                              ? { position: 'absolute' as const, left: `${place.x}%`, top: `${place.y}%`, width: `${place.width}%`, height: `${place.height}%` }
                              : undefined;
                            return (
                              <button type="button" key={element.id} onClick={() => setElementId(element.id)} style={style} className={`block max-w-full truncate rounded border px-2 py-1 text-left text-xs ${element.id === elementId ? 'border-leaf-700 bg-leaf-100' : 'border-slate-200 bg-white/80'} ${positioned ? '' : 'mb-2 w-full'}`}>
                                {index + 1}. {visibleText(element)}
                              </button>
                            );
                          })}
                          {elementPreview.length === 0 && <p className="text-center text-sm text-slate-400">Add an element from the menu.</p>}
                        </div>
                      </div>
                    </div>
                    <p className="text-xs text-leaf-900/60">Canvas preview is a layout guide; use “Preview PDF” for the renderer’s actual output.</p>
                  </>
                )}
              </section>

              <section className="space-y-3 rounded-xl border border-leaf-100 p-3" aria-label="Page and element settings">
                {selectedPage && (
                  <>
                    <details open>
                      <summary className="cursor-pointer font-semibold">Page setup</summary>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <label className="text-xs">Paper<select value={selectedPage.settings.size} onChange={(event) => updatePage({ settings: { ...selectedPage.settings, size: event.target.value as TemplatePage['settings']['size'] } })} className={fieldClass}><option value="long">Long</option><option value="a4">A4</option><option value="letter">Letter</option></select></label>
                        <label className="text-xs">Orientation<select value={selectedPage.settings.orientation} onChange={(event) => updatePage({ settings: { ...selectedPage.settings, orientation: event.target.value as TemplatePage['settings']['orientation'] } })} className={fieldClass}><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></label>
                        <label className="col-span-2 text-xs">Layout mode<select value={selectedPage.layout.mode} onChange={(event) => setLayoutMode(event.target.value as TemplatePage['layout']['mode'])} className={fieldClass}><option value="flow">Flow</option><option value="columns">Columns</option><option value="hybrid">Hybrid (flow + positioned)</option></select></label>
                        <label className="text-xs">Columns<input type="number" min={1} max={4} disabled={selectedPage.layout.mode === 'flow'} value={selectedPage.layout.columns} onChange={(event) => setColumns(Math.max(1, Math.min(4, Number(event.target.value))))} className={fieldClass} /></label>
                        <label className="text-xs">Column gap (mm)<input type="number" min={0} max={30} value={selectedPage.layout.gapMm} onChange={(event) => updatePage({ layout: { ...selectedPage.layout, gapMm: Number(event.target.value) } })} className={fieldClass} /></label>
                        {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
                          <label key={side} className="text-xs">Margin {side} (mm)<input type="number" min={0} max={50} value={selectedPage.settings.margins[side]} onChange={(event) => updatePage({ settings: { ...selectedPage.settings, margins: { ...selectedPage.settings.margins, [side]: Number(event.target.value) } } })} className={fieldClass} /></label>
                        ))}
                        <label className="text-xs">Background<input type="text" placeholder="#FFFFFF" value={selectedPage.backgroundColor ?? ''} onChange={(event) => updatePage({ backgroundColor: event.target.value || null })} className={fieldClass} /></label>
                        <label className="text-xs">Border color<input value={selectedPage.border.color} onChange={(event) => updatePage({ border: { ...selectedPage.border, color: event.target.value } })} className={fieldClass} /></label>
                        <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={selectedPage.border.enabled} onChange={(event) => updatePage({ border: { ...selectedPage.border, enabled: event.target.checked } })} /> Page border <input aria-label="Border width in millimeters" type="number" min={0} max={5} value={selectedPage.border.widthMm} onChange={(event) => updatePage({ border: { ...selectedPage.border, widthMm: Number(event.target.value) } })} className={fieldClass} /></label>
                      </div>
                    </details>

                    <details>
                      <summary className="cursor-pointer font-semibold">Header and footer</summary>
                      {(['header', 'footer'] as const).map((region) => (
                        <fieldset key={region} className="mt-2 space-y-2 rounded-lg border border-leaf-100 p-2">
                          <legend className="px-1 text-sm font-semibold">{region === 'header' ? 'Header' : 'Footer'}</legend>
                          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selectedPage[region].enabled} onChange={(event) => updatePage({ [region]: { ...selectedPage[region], enabled: event.target.checked } })} /> Show {region}</label>
                          <textarea aria-label={`${region} lines`} rows={3} value={selectedPage[region].lines.join('\n')} onChange={(event) => updatePage({ [region]: { ...selectedPage[region], lines: event.target.value.split('\n').slice(0, 6) } })} className={fieldClass} />
                          <label className="text-xs">Alignment<select value={selectedPage[region].alignment} onChange={(event) => updatePage({ [region]: { ...selectedPage[region], alignment: event.target.value as TemplatePage[typeof region]['alignment'] } })} className={fieldClass}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
                          <div className="flex flex-wrap gap-3 text-xs">
                            <label className="flex items-center gap-1"><input type="checkbox" checked={selectedPage[region].showLogo} onChange={(event) => updatePage({ [region]: { ...selectedPage[region], showLogo: event.target.checked } })} /> Logo</label>
                            <label className="flex items-center gap-1"><input type="checkbox" checked={selectedPage[region].showPageNumber} onChange={(event) => updatePage({ [region]: { ...selectedPage[region], showPageNumber: event.target.checked } })} /> Page number</label>
                          </div>
                        </fieldset>
                      ))}
                    </details>

                    {selectedElement ? (
                      <details open>
                        <summary className="cursor-pointer font-semibold">Element: {visibleText(selectedElement)}</summary>
                        {selectedElement.type !== 'page_break' && (
                          <div className="mt-2 space-y-2">
                            <label className="block text-xs">Placement<select value={selectedElement.placement.mode} onChange={(event) => setPlacementMode(event.target.value as 'flow' | 'positioned')} className={fieldClass}><option value="flow">Document flow</option><option value="positioned">Positioned on page</option></select></label>
                            {selectedFlowPlacement ? (
                              <div className="grid grid-cols-2 gap-2">
                                <label className="text-xs">Column<input type="number" min={0} max={selectedPage.layout.columns - 1} value={selectedFlowPlacement.column} onChange={(event) => updateElement({ placement: { ...selectedFlowPlacement, column: Number(event.target.value) } })} className={fieldClass} /></label>
                                <label className="text-xs">Column span<input type="number" min={1} max={selectedPage.layout.columns} value={selectedFlowPlacement.columnSpan} onChange={(event) => updateElement({ placement: { ...selectedFlowPlacement, columnSpan: Number(event.target.value) } })} className={fieldClass} /></label>
                              </div>
                            ) : selectedPositionPlacement ? (
                              <div className="grid grid-cols-2 gap-2">
                                {(['x', 'y', 'width', 'height'] as const).map((key) => (
                                  <label key={key} className="text-xs">{key.toUpperCase()} (%)<input type="number" min={key === 'width' || key === 'height' ? 1 : 0} max={100} value={selectedPositionPlacement[key]} onChange={(event) => updateElement({ placement: { ...selectedPositionPlacement, [key]: Number(event.target.value) } })} className={fieldClass} /></label>
                                ))}
                              </div>
                            ) : null}
                            <label className="block text-xs">Break before<select value={selectedElement.breakBefore} onChange={(event) => updateElement({ breakBefore: event.target.value as FlowElement['breakBefore'] })} className={fieldClass}><option value="auto">Automatic</option><option value="page">New page</option></select></label>
                            <div className="flex flex-wrap gap-3 text-xs">
                              <label className="flex items-center gap-1"><input type="checkbox" checked={selectedElement.keepTogether} onChange={(event) => updateElement({ keepTogether: event.target.checked })} /> Keep together</label>
                              <label className="flex items-center gap-1"><input type="checkbox" checked={selectedElement.keepWithNext} onChange={(event) => updateElement({ keepWithNext: event.target.checked })} /> Keep with next</label>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <label className="text-xs">Space before (mm)<input type="number" min={0} max={50} value={selectedElement.spacingBeforeMm} onChange={(event) => updateElement({ spacingBeforeMm: Number(event.target.value) })} className={fieldClass} /></label>
                              <label className="text-xs">Space after (mm)<input type="number" min={0} max={50} value={selectedElement.spacingAfterMm} onChange={(event) => updateElement({ spacingAfterMm: Number(event.target.value) })} className={fieldClass} /></label>
                            </div>
                            {textControl(selectedElement) && <label className="block text-xs">Text<textarea value={selectedElement.text} rows={3} onChange={(event) => updateElement({ text: event.target.value })} className={fieldClass} /></label>}
                            {selectedElement.type === 'dynamic_field' && (
                              <>
                                <label className="block text-xs">Data binding<select value={selectedElement.binding} onChange={(event) => updateElement({ binding: event.target.value as typeof selectedElement.binding })} className={fieldClass}>{dynamicBindings.map((binding) => <option key={binding} value={binding}>{binding}</option>)}</select></label>
                                <div className="grid grid-cols-2 gap-2"><label className="text-xs">Prefix<input value={selectedElement.prefix} onChange={(event) => updateElement({ prefix: event.target.value })} className={fieldClass} /></label><label className="text-xs">Suffix<input value={selectedElement.suffix} onChange={(event) => updateElement({ suffix: event.target.value })} className={fieldClass} /></label></div>
                              </>
                            )}
                            {hasTextStyle(selectedElement) && (
                              <div className="grid grid-cols-2 gap-2">
                                <label className="text-xs">Font size (pt)<input type="number" min={6} max={72} value={selectedElement.fontSizePt} onChange={(event) => updateElement({ fontSizePt: Number(event.target.value) })} className={fieldClass} /></label>
                                <label className="text-xs">Alignment<select value={selectedElement.alignment} onChange={(event) => updateElement({ alignment: event.target.value as typeof selectedElement.alignment })} className={fieldClass}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
                                <label className="text-xs">Font<select value={selectedElement.fontFamily} onChange={(event) => updateElement({ fontFamily: event.target.value as typeof selectedElement.fontFamily })} className={fieldClass}><option value="serif">Serif</option><option value="sans-serif">Sans serif</option></select></label>
                                <label className="text-xs">Text color<input value={selectedElement.color} onChange={(event) => updateElement({ color: event.target.value })} className={fieldClass} /></label>
                                <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={selectedElement.bold} onChange={(event) => updateElement({ bold: event.target.checked })} /> Bold</label>
                              </div>
                            )}
                            {selectedElement.type === 'table' && (
                              <div className="space-y-2 border-t border-leaf-100 pt-2">
                                <label className="block text-xs">Data table<select value={selectedElement.binding} onChange={(event) => changeTableBinding(event.target.value as TableBinding)} className={fieldClass}>{Object.keys(tableFields).map((binding) => <option key={binding} value={binding}>{binding}</option>)}</select></label>
                                {selectedElement.columns.map((column, index) => (
                                  <fieldset key={`${selectedElement.id}-column-${index}`} className="grid grid-cols-2 gap-2 rounded border border-leaf-100 p-2">
                                    <legend className="px-1 text-xs">Column {index + 1}</legend>
                                    <label className="text-xs">Field<select value={column.field} onChange={(event) => updateTableColumn(index, { field: event.target.value as TableField })} className={fieldClass}>{tableFields[selectedElement.binding].map((field) => <option key={field} value={field}>{field}</option>)}</select></label>
                                    <label className="text-xs">Label<input value={column.label} onChange={(event) => updateTableColumn(index, { label: event.target.value })} className={fieldClass} /></label>
                                    <label className="text-xs">Width (%)<input type="number" min={1} max={100} value={column.widthPercent} onChange={(event) => updateTableColumn(index, { widthPercent: Number(event.target.value) })} className={fieldClass} /></label>
                                    <label className="text-xs">Align<select value={column.alignment} onChange={(event) => updateTableColumn(index, { alignment: event.target.value as typeof column.alignment })} className={fieldClass}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
                                    <label className="col-span-2 flex items-center justify-between text-xs"><span><input type="checkbox" checked={column.visible} onChange={(event) => updateTableColumn(index, { visible: event.target.checked })} /> Visible</span><button type="button" onClick={() => updateElement({ columns: selectedElement.columns.filter((_, columnIndex) => columnIndex !== index) })} className="text-red-700 underline">Remove column</button></label>
                                  </fieldset>
                                ))}
                                <button type="button" onClick={addTableColumn} className={secondaryButton}>Add table column</button>
                                <label className="block text-xs">Table font size (pt)<input type="number" min={6} max={24} value={selectedElement.fontSizePt} onChange={(event) => updateElement({ fontSizePt: Number(event.target.value) })} className={fieldClass} /></label>
                                <label className="block text-xs">Empty table text<input value={selectedElement.emptyText} onChange={(event) => updateElement({ emptyText: event.target.value })} className={fieldClass} /></label>
                                <div className="grid grid-cols-2 gap-2"><label className="text-xs">Header background<input value={selectedElement.headerBackground} onChange={(event) => updateElement({ headerBackground: event.target.value })} className={fieldClass} /></label><label className="text-xs">Header text<input value={selectedElement.headerColor} onChange={(event) => updateElement({ headerColor: event.target.value })} className={fieldClass} /></label></div>
                                <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={selectedElement.repeatHeader} onChange={(event) => updateElement({ repeatHeader: event.target.checked })} /> Repeat header on new pages</label>
                                <label className="block text-xs">Row behavior<select value={selectedElement.rowBehavior} onChange={(event) => updateElement({ rowBehavior: event.target.value as typeof selectedElement.rowBehavior })} className={fieldClass}><option value="allow-split">Allow rows to split</option><option value="keep-together">Keep rows together</option></select></label>
                              </div>
                            )}
                            {(selectedElement.type === 'photo_group' || selectedElement.type === 'photo') && (
                              <div className="grid grid-cols-2 gap-2 border-t border-leaf-100 pt-2">
                                {selectedElement.type === 'photo_group' ? (
                                  <>
                                    <label className="text-xs">Start photo<input type="number" min={0} max={11} value={selectedElement.startIndex} onChange={(event) => updateElement({ startIndex: Number(event.target.value) })} className={fieldClass} /></label>
                                    <label className="text-xs">Maximum<input type="number" min={1} max={12} value={selectedElement.maxPhotos} onChange={(event) => updateElement({ maxPhotos: Number(event.target.value) })} className={fieldClass} /></label>
                                    <label className="text-xs">Grid columns<input type="number" min={1} max={6} value={selectedElement.columns} onChange={(event) => updateElement({ columns: Number(event.target.value) })} className={fieldClass} /></label>
                                    <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={selectedElement.continueAcrossPages} onChange={(event) => updateElement({ continueAcrossPages: event.target.checked })} /> Continue to pages</label>
                                  </>
                                ) : <label className="text-xs">Photo index<input type="number" min={0} max={11} value={selectedElement.index} onChange={(event) => updateElement({ index: Number(event.target.value) })} className={fieldClass} /></label>}
                                <label className="text-xs">Image height (mm)<input type="number" min={20} max={250} value={selectedElement.imageHeightMm} onChange={(event) => updateElement({ imageHeightMm: Number(event.target.value) })} className={fieldClass} /></label>
                                <label className="text-xs">Image fit<select value={selectedElement.fit} onChange={(event) => updateElement({ fit: event.target.value as typeof selectedElement.fit })} className={fieldClass}><option value="contain">Contain</option><option value="cover">Cover</option></select></label>
                                <label className="text-xs">Alignment<select value={selectedElement.alignment} onChange={(event) => updateElement({ alignment: event.target.value as typeof selectedElement.alignment })} className={fieldClass}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
                                <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={selectedElement.type === 'photo_group' ? selectedElement.showCaptions : selectedElement.showCaption} onChange={(event) => selectedElement.type === 'photo_group' ? updateElement({ showCaptions: event.target.checked }) : updateElement({ showCaption: event.target.checked })} /> Show captions</label>
                              </div>
                            )}
                            {selectedElement.type === 'signature' && (
                              <div className="space-y-2">
                                {(['preparedByLabel', 'name', 'position', 'dateLabel'] as const).map((key) => <label key={key} className="block text-xs">{key}<input value={selectedElement[key]} onChange={(event) => updateElement({ [key]: event.target.value })} className={fieldClass} /></label>)}
                                <label className="block text-xs">Date mode<select value={selectedElement.dateMode} onChange={(event) => updateElement({ dateMode: event.target.value as typeof selectedElement.dateMode })} className={fieldClass}><option value="report_date">Report date</option><option value="blank">Blank</option></select></label>
                              </div>
                            )}
                            {(selectedElement.type === 'logo' || selectedElement.type === 'photo') && (
                              <div className="grid grid-cols-2 gap-2">
                                <label className="text-xs">Width (%)<input type="number" min={1} max={100} value={selectedElement.widthPercent} onChange={(event) => updateElement({ widthPercent: Number(event.target.value) })} className={fieldClass} /></label>
                                {selectedElement.type === 'logo' && (
                                  <>
                                    <label className="text-xs">Image height (mm)<input type="number" min={5} max={100} value={selectedElement.imageHeightMm} onChange={(event) => updateElement({ imageHeightMm: Number(event.target.value) })} className={fieldClass} /></label>
                                    <label className="text-xs">Fit<select value={selectedElement.fit} onChange={(event) => updateElement({ fit: event.target.value as typeof selectedElement.fit })} className={fieldClass}><option value="contain">Contain</option><option value="cover">Cover</option></select></label>
                                    <label className="text-xs">Alignment<select value={selectedElement.alignment} onChange={(event) => updateElement({ alignment: event.target.value as typeof selectedElement.alignment })} className={fieldClass}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
                                  </>
                                )}
                              </div>
                            )}
                            {selectedElement.type === 'divider' && <div className="grid grid-cols-2 gap-2"><label className="text-xs">Color<input value={selectedElement.color} onChange={(event) => updateElement({ color: event.target.value })} className={fieldClass} /></label><label className="text-xs">Thickness (mm)<input type="number" min={0.1} max={5} value={selectedElement.thicknessMm} onChange={(event) => updateElement({ thicknessMm: Number(event.target.value) })} className={fieldClass} /></label></div>}
                            {selectedElement.type === 'page_number' && <label className="block text-xs">Format<input value={selectedElement.format} onChange={(event) => updateElement({ format: event.target.value })} className={fieldClass} /><span className="block text-leaf-900/60">Use {'{page}'} and {'{pages}'} tokens.</span></label>}
                            <div className="flex justify-between gap-2 border-t border-leaf-100 pt-2">
                              <div className="flex gap-2"><button type="button" onClick={() => moveElement(-1)} className={secondaryButton}>↑</button><button type="button" onClick={() => moveElement(1)} className={secondaryButton}>↓</button></div>
                              <button type="button" onClick={removeElement} className="rounded-lg border-2 border-red-700 px-3 py-2 text-sm font-semibold text-red-700">Remove element</button>
                            </div>
                          </div>
                        )}
                        {selectedElement.type === 'page_break' && <p className="mt-2 text-sm text-leaf-900/70">This element starts a new printed page.</p>}
                      </details>
                    ) : <p className="text-sm text-leaf-900/60">Select an element on the page to edit it.</p>}
                  </>
                )}
              </section>
            </div>

            {error && <p role="alert" className="rounded-lg border-2 border-red-600 bg-red-50 p-3 text-sm text-red-900">{error}</p>}
            {draftMessage && <p role="status" className="text-sm text-leaf-900/70">{draftMessage}</p>}
            {draftLoadError && <p role="alert" className="text-sm text-red-800">{draftLoadError}</p>}
            {draft && document && <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-leaf-50 p-2 text-sm"><span>Saved draft available: {draft.document.name}</span><button type="button" onClick={() => startFrom(draft.document)} className={secondaryButton}>Load saved draft</button></div>}
            {issues.length > 0 && <ul className="list-disc space-y-1 rounded-lg bg-amber-50 p-3 pl-8 text-sm text-amber-900">{issues.map((issue, index) => <li key={`${index}-${issue}`}>{issue}</li>)}</ul>}
            {validation && !validation.success && <p className="text-xs text-amber-800">{validation.error.issues.length} validation issue(s) need attention.</p>}
            {previewUrl && (
              <section className="space-y-2 rounded-xl border-2 border-leaf-100 p-3" aria-label="PDF preview">
                <div className="flex items-center justify-between"><h3 className="font-semibold">Rendered PDF preview</h3><button type="button" onClick={() => setPreviewUrl(null)} className={secondaryButton}>Close preview</button></div>
                <iframe title="Rendered report PDF preview" src={previewUrl} className="h-[65vh] w-full rounded-lg border border-leaf-100" />
              </section>
            )}
            <div className="flex flex-wrap items-end justify-between gap-3 border-t border-leaf-100 pt-3">
              <div className="flex flex-wrap items-end gap-2">
                <label className="text-xs">Preview year<input type="number" min={2020} max={2100} value={year} onChange={(event) => setYear(Number(event.target.value))} className={fieldClass} /></label>
                <label className="text-xs">Quarter<select value={quarter} onChange={(event) => setQuarter(Number(event.target.value))} className={fieldClass}><option value={1}>Q1</option><option value={2}>Q2</option><option value={3}>Q3</option><option value={4}>Q4</option></select></label>
                <button type="button" onClick={() => void preview()} disabled={busy || !document} className={secondaryButton}>{busy ? 'Rendering…' : 'Preview PDF'}</button>
                <button type="button" onClick={() => void saveDraft()} disabled={busy || !document} className={secondaryButton}>Save draft</button>
                {draft && <button type="button" onClick={() => void discardDraft()} disabled={busy} className={secondaryButton}>Discard saved draft</button>}
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={onClose} className={secondaryButton}>Cancel</button>
                <button type="button" onClick={() => void save()} disabled={busy || !document} className={primaryButton}>{busy ? 'Working…' : 'Save and publish'}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
