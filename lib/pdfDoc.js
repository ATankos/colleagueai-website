/**
 * lib/pdfDoc.js - a small text-layout layer over pdf-lib for the order documents (lib/agreementPdf.js,
 * lib/invoicePdf.js): A4 pages, one embedded Unicode font (DejaVu Sans, so Czech, German, Polish and other
 * European names render as typed), word-wrapped paragraphs, headings, label/value rows, simple tables, automatic
 * page breaks and a footer with the document id and page numbers on every page.
 *
 * Nothing here knows about orders. It produces bytes; the callers decide the words. Fonts are read once per process.
 */
import { readFileSync } from 'node:fs';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

const A4 = [595.28, 841.89];
const MARGIN = { top: 56, right: 50, bottom: 60, left: 50 };
const INK = rgb(0.1, 0.11, 0.13);
const MUTED = rgb(0.4, 0.42, 0.46);
const RULE = rgb(0.82, 0.83, 0.85);

let fontBytes = null;
function fonts() {
  if (!fontBytes) {
    const dir = new URL('./fonts/', import.meta.url);
    fontBytes = {
      regular: readFileSync(new URL('DejaVuSans.ttf', dir)),
      bold: readFileSync(new URL('DejaVuSans-Bold.ttf', dir)),
    };
  }
  return fontBytes;
}

export class PdfDoc {
  /** @param {{ title: string, author?: string, subject?: string, footer?: string, created?: Date }} meta */
  static async create(meta) {
    const pdf = await PDFDocument.create();
    pdf.registerFontkit(fontkit);
    const f = fonts();
    const doc = new PdfDoc();
    doc.pdf = pdf;
    doc.font = await pdf.embedFont(f.regular, { subset: true });
    doc.bold = await pdf.embedFont(f.bold, { subset: true });
    doc.mono = await pdf.embedFont(StandardFonts.Courier);
    doc.meta = meta;
    doc.pages = [];
    pdf.setTitle(meta.title);
    pdf.setAuthor(meta.author || 'Colleague AI s.r.o.');
    if (meta.subject) pdf.setSubject(meta.subject);
    pdf.setProducer('ColleagueAI order documents');
    pdf.setCreator('colleagueai-website lib/pdfDoc.js');
    const created = meta.created || new Date();
    pdf.setCreationDate(created);
    pdf.setModificationDate(created);
    doc.addPage();
    return doc;
  }

  addPage() {
    const page = this.pdf.addPage(A4);
    this.pages.push(page);
    this.page = page;
    this.y = A4[1] - MARGIN.top;
    return page;
  }

  get width() { return A4[0] - MARGIN.left - MARGIN.right; }

  ensure(height) {
    if (this.y - height < MARGIN.bottom) this.addPage();
  }

  /** Break a string into lines that fit `width` at `size` with `font`. Hard newlines are respected. */
  wrap(text, { font = this.font, size = 10, width = this.width } = {}) {
    const lines = [];
    for (const para of String(text ?? '').split('\n')) {
      const words = para.split(/\s+/).filter(Boolean);
      if (!words.length) { lines.push(''); continue; }
      let line = '';
      for (const w of words) {
        const candidate = line ? `${line} ${w}` : w;
        if (font.widthOfTextAtSize(candidate, size) <= width) { line = candidate; continue; }
        if (line) lines.push(line);
        // A single token wider than the column (a hash, a URL) is split by characters.
        if (font.widthOfTextAtSize(w, size) > width) {
          let piece = '';
          for (const ch of w) {
            if (font.widthOfTextAtSize(piece + ch, size) > width) { lines.push(piece); piece = ch; } else piece += ch;
          }
          line = piece;
        } else line = w;
      }
      lines.push(line);
    }
    return lines;
  }

  drawLines(lines, { x = MARGIN.left, font = this.font, size = 10, color = INK, lineHeight = size * 1.42, maxWidth = this.width } = {}) {
    for (const line of lines) {
      this.ensure(lineHeight);
      this.page.drawText(line, { x, y: this.y - size, size, font, color, maxWidth });
      this.y -= lineHeight;
    }
  }

  title(text) {
    this.drawLines(this.wrap(text, { font: this.bold, size: 18 }), { font: this.bold, size: 18 });
    this.y -= 4;
  }

  heading(text) {
    // A heading is never the last thing on a page: keep room for the rule and at least two lines under it.
    this.ensure(72);
    this.y -= 8;
    this.drawLines(this.wrap(text, { font: this.bold, size: 12 }), { font: this.bold, size: 12 });
    this.rule();
  }

  rule() {
    this.ensure(8);
    this.page.drawLine({ start: { x: MARGIN.left, y: this.y - 2 }, end: { x: MARGIN.left + this.width, y: this.y - 2 }, thickness: 0.6, color: RULE });
    this.y -= 8;
  }

  paragraph(text, { size = 10, muted = false, mono = false } = {}) {
    const font = mono ? this.mono : this.font;
    this.drawLines(this.wrap(text, { font, size }), { font, size, color: muted ? MUTED : INK });
    this.y -= size * 0.6;
  }

  /** Label on the left, value wrapped on the right. */
  row(label, value, { labelWidth = 150, size = 10 } = {}) {
    const valueWidth = this.width - labelWidth - 8;
    const lines = this.wrap(value ?? '', { size, width: valueWidth });
    const labelLines = this.wrap(label, { font: this.bold, size, width: labelWidth });
    const lineHeight = size * 1.42;
    const height = Math.max(lines.length, labelLines.length) * lineHeight;
    this.ensure(height + 2);
    const top = this.y;
    for (let i = 0; i < labelLines.length; i++) {
      this.page.drawText(labelLines[i], { x: MARGIN.left, y: top - size - i * lineHeight, size, font: this.bold, color: INK });
    }
    for (let i = 0; i < lines.length; i++) {
      this.page.drawText(lines[i], { x: MARGIN.left + labelWidth + 8, y: top - size - i * lineHeight, size, font: this.font, color: INK });
    }
    this.y = top - height - 3;
  }

  /** A table with a header row; column widths are fractions of the text width. Rows wrap; a row never splits across pages. */
  table(header, rows, widths, { size = 9 } = {}) {
    const total = widths.reduce((a, b) => a + b, 0);
    const cols = widths.map((w) => (w / total) * this.width);
    const lineHeight = size * 1.42;
    const pad = 4;
    const rowHeight = (cells, font) => {
      const wrapped = cells.map((c, i) => this.wrap(c ?? '', { font, size, width: cols[i] - pad * 2 }));
      return { wrapped, height: Math.max(...wrapped.map((w) => w.length)) * lineHeight + pad * 2 };
    };
    const drawRow = (cells, font, keepWith = 0) => {
      const { wrapped, height } = rowHeight(cells, font);
      // The header row is never left alone at the foot of a page: it moves with the first data row.
      this.ensure(height + keepWith);
      let x = MARGIN.left;
      const top = this.y;
      for (let i = 0; i < cells.length; i++) {
        for (let j = 0; j < wrapped[i].length; j++) {
          this.page.drawText(wrapped[i][j], { x: x + pad, y: top - pad - size - j * lineHeight, size, font, color: INK });
        }
        x += cols[i];
      }
      this.y = top - height;
      this.page.drawLine({ start: { x: MARGIN.left, y: this.y }, end: { x: MARGIN.left + this.width, y: this.y }, thickness: 0.4, color: RULE });
    };
    drawRow(header, this.bold, rows.length ? rowHeight(rows[0], this.font).height : 0);
    for (const r of rows) drawRow(r, this.font);
    this.y -= 6;
  }

  space(h = 8) { this.y -= h; }

  async bytes() {
    const n = this.pages.length;
    const footer = this.meta.footer || '';
    this.pages.forEach((p, i) => {
      const text = `${footer}${footer ? ' · ' : ''}Page ${i + 1} of ${n}`;
      p.drawText(text, { x: MARGIN.left, y: 30, size: 8, font: this.font, color: MUTED });
    });
    return this.pdf.save({ useObjectStreams: false });
  }
}

export function fmtMoney(minor, currency) {
  const n = (Number(minor || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${String(currency || '').toUpperCase()} ${n}`;
}

export function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');
}
