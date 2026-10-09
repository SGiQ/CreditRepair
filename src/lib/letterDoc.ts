import { PDFDocument, StandardFonts } from "pdf-lib";
import { AlignmentType, Document, ImageRun, Packer, Paragraph, TextRun } from "docx";
import type { Client, Letter } from "./types";
import { LETTER_TYPES } from "./types";

export interface Block {
  text: string;
  /** Renders the client's signature image in place of text. */
  signature?: boolean;
  bold?: boolean;
  center?: boolean;
}
const BLANK: Block = { text: "" };

const longDate = (iso: string) => {
  const d = iso ? new Date(iso.length <= 10 ? `${iso}T12:00:00` : iso) : new Date();
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
};

const lines = (s: string): Block[] => s.split("\n").map((text) => ({ text: text.trimEnd() }));

/** One layout shared by the PDF and DOCX renderers. */
export function letterBlocks(client: Client, letter: Letter): Block[] {
  const to = LETTER_TYPES[letter.type]?.to;
  // The signature only appears on text the client approved.
  const signed = Boolean(letter.signed_at && client.signature);
  const date = longDate(letter.sent_at);

  if (letter.type === "cfpb_complaint") {
    return [
      { text: "CFPB Complaint Narrative", bold: true },
      { text: letter.recipient_name },
      { text: `Prepared for ${client.name} — ${date}` },
      { text: "Submit at consumerfinance.gov/complaint" },
      BLANK,
      { text: letter.subject, bold: true },
      BLANK,
      ...lines(letter.body),
    ];
  }

  const sender: Block[] = [
    { text: client.name },
    ...[client.address1, client.address2, [client.city, client.state].filter(Boolean).join(", ") + (client.zip ? ` ${client.zip}` : "")]
      .filter((l) => l.trim())
      .map((text) => ({ text })),
  ];
  // Bureaus need identifiers to locate the file; collectors and creditors do not get them.
  if (to === "bureau" || to === "agency") {
    if (client.dob) sender.push({ text: `Date of Birth: ${client.dob}` });
    // Bureaus need the full SSN to find the file; the app only stores the last four, so the rest is written by hand.
    if (client.ssn_last4) sender.push({ text: `SSN: ______-____-${client.ssn_last4}` });
  }

  const out: Block[] = [
    ...sender,
    BLANK,
    { text: date },
    BLANK,
    { text: letter.recipient_name },
    ...lines(letter.recipient_address).filter((b) => b.text),
    BLANK,
  ];

  if (letter.type === "identity_theft_affidavit") {
    out.push(
      { text: "IDENTITY THEFT AFFIDAVIT AND REQUEST TO BLOCK INFORMATION", bold: true, center: true },
      { text: "Fair Credit Reporting Act §605B (15 U.S.C. §1681c-2)", center: true },
      BLANK,
      ...lines(letter.body),
      BLANK,
      BLANK,
      { text: "______________________________" },
      { text: client.name },
      { text: "Date: ____________________" },
      BLANK,
      { text: "NOTARY ACKNOWLEDGMENT", bold: true },
      { text: "State of ____________________, County of ____________________" },
      {
        text: `Subscribed and sworn to (or affirmed) before me on this _____ day of ______________, 20____, by ${client.name}, proved to me on the basis of satisfactory evidence to be the person who appeared before me.`,
      },
      BLANK,
      { text: "______________________________" },
      { text: "Notary Public" },
      { text: "My commission expires: ______________" },
    );
  } else {
    out.push(
      { text: `Re: ${letter.subject}`, bold: true },
      BLANK,
      ...lines(letter.body),
      BLANK,
      { text: "Sincerely," },
      ...(signed ? [{ text: "", signature: true }] : [BLANK, BLANK, BLANK]),
      { text: client.name },
    );
  }

  if (letter.enclosures.length) {
    out.push(BLANK, { text: "Enclosures:" }, ...letter.enclosures.map((e) => ({ text: `- ${e}` })));
  }
  return out;
}

const SIGNATURE_HEIGHT = 46; // points
const PNG_PREFIX = "data:image/png;base64,";
const signaturePng = (client: Client): Buffer | null =>
  client.signature?.startsWith(PNG_PREFIX) ? Buffer.from(client.signature.slice(PNG_PREFIX.length), "base64") : null;

// Standard PDF fonts only cover WinAnsi; normalise what the model commonly emits and drop the rest.
function winAnsi(s: string): string {
  return s
    .replace(/[‘’′]/g, "'")
    .replace(/[“”″]/g, '"')
    .replace(/[–—−]/g, "-")
    .replace(/…/g, "...")
    .replace(/[•●◦]/g, "-")
    .replace(/[   \t]/g, " ")
    .replace(/[^\x20-\x7E\xA1-\xFF]/g, "");
}

export async function renderPdf(client: Client, letter: Letter): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${LETTER_TYPES[letter.type]?.label ?? "Letter"} - ${letter.recipient_name}`);
  pdf.setAuthor(client.name);
  const regular = await pdf.embedFont(StandardFonts.TimesRoman);
  const bold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const size = 11.5;
  const leading = 15.5;
  const margin = 72;
  const [W, H] = [612, 792];
  const maxW = W - margin * 2;

  let page = pdf.addPage([W, H]);
  let y = H - margin;
  const advance = () => {
    y -= leading;
    if (y < margin) {
      page = pdf.addPage([W, H]);
      y = H - margin;
    }
  };

  for (const block of letterBlocks(client, letter)) {
    if (block.signature) {
      const png = signaturePng(client);
      if (png) {
        const img = await pdf.embedPng(png);
        const h = SIGNATURE_HEIGHT;
        const w = (img.width / img.height) * h;
        if (y - h < margin) {
          page = pdf.addPage([W, H]);
          y = H - margin;
        }
        page.drawImage(img, { x: margin, y: y - h + leading * 0.6, width: w, height: h });
        y -= h;
      }
      continue;
    }
    const font = block.bold ? bold : regular;
    const text = winAnsi(block.text);
    if (!text.trim()) {
      advance();
      continue;
    }
    const hang = /^- /.test(text) ? regular.widthOfTextAtSize("- ", size) : 0;
    let line = "";
    let first = true;
    const flush = () => {
      const indent = first ? 0 : hang;
      const x = block.center ? (W - font.widthOfTextAtSize(line, size)) / 2 : margin + indent;
      page.drawText(line, { x, y, size, font });
      advance();
      first = false;
      line = "";
    };
    for (const word of text.split(/ +/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && font.widthOfTextAtSize(candidate, size) > maxW - (first ? 0 : hang)) {
        flush();
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) flush();
  }
  return pdf.save();
}

export async function renderDocx(client: Client, letter: Letter): Promise<Buffer> {
  const doc = new Document({
    creator: client.name,
    title: `${LETTER_TYPES[letter.type]?.label ?? "Letter"} - ${letter.recipient_name}`,
    styles: { default: { document: { run: { font: "Times New Roman", size: 23 } } } },
    sections: [
      {
        properties: { page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
        children: letterBlocks(client, letter).map((b) => {
          const png = b.signature ? signaturePng(client) : null;
          if (png) {
            const height = SIGNATURE_HEIGHT * (96 / 72);
            const width = (png.readUInt32BE(16) / png.readUInt32BE(20)) * height;
            return new Paragraph({ children: [new ImageRun({ type: "png", data: png, transformation: { width, height } })] });
          }
          return new Paragraph({
              alignment: b.center ? AlignmentType.CENTER : AlignmentType.LEFT,
              spacing: { after: 0, line: 300 },
              indent: /^- /.test(b.text) ? { left: 240, hanging: 240 } : undefined,
              children: [new TextRun({ text: b.text, bold: b.bold })],
            });
        }),
      },
    ],
  });
  return Packer.toBuffer(doc);
}

export function letterFilename(client: Client, letter: Letter, ext: string): string {
  const slug = (s: string) => s.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${slug(client.name)}_${slug(LETTER_TYPES[letter.type]?.label ?? letter.type)}_${slug(letter.recipient_name).slice(0, 40)}_R${letter.round}_${letter.id}.${ext}`;
}
