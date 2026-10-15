import {
  PDFCheckBox, PDFDict, PDFDocument, PDFDropdown, PDFName, PDFOptionList, PDFRadioGroup, PDFTextField,
} from "pdf-lib";
import { AppError } from "./errors";

/** Widget rectangle in fractions (0..1) of the page as displayed (rotation applied), origin top-left. */
export interface FormWidget {
  page: number; // zero-based
  x: number;
  y: number;
  w: number;
  h: number;
  option?: string; // radio groups: the value this widget selects
}

export type FormValue = string | boolean | string[];

export interface FormFieldInfo {
  name: string;
  kind: "text" | "check" | "radio" | "dropdown" | "list";
  value: FormValue;
  readOnly: boolean;
  multiline: boolean;
  maxLength?: number;
  options: string[]; // dropdown / option list choices
  multiSelect: boolean;
  widgets: FormWidget[];
}

/**
 * Inverse of placeBox() (processors/pdf.ts) for a rectangle: maps a rect in unrotated user space to
 * display fractions for a page with the given CropBox and rotation (0/90/180/270).
 */
export function rectToDisplay(
  crop: { x: number; y: number; width: number; height: number },
  rotation: number,
  rect: { x: number; y: number; width: number; height: number },
) {
  const r = ((rotation % 360) + 360) % 360;
  const { width: W, height: H } = crop;
  const pt = (px: number, py: number): [number, number] => {
    const rx = px - crop.x;
    const ry = py - crop.y;
    switch (r) {
      case 90: return [ry / H, rx / W];
      case 180: return [1 - rx / W, ry / H];
      case 270: return [1 - ry / H, 1 - rx / W];
      default: return [rx / W, 1 - ry / H];
    }
  };
  const a = pt(rect.x, rect.y);
  const b = pt(rect.x + rect.width, rect.y + rect.height);
  const x = Math.min(a[0], b[0]);
  const y = Math.min(a[1], b[1]);
  return { x, y, w: Math.abs(a[0] - b[0]), h: Math.abs(a[1] - b[1]) };
}

/** Read the AcroForm fields of a loaded PDF. Throws no_form_fields / xfa_form when there is nothing to fill. */
export function readFormFields(doc: PDFDocument, name = ""): FormFieldInfo[] {
  const pages = doc.getPages();
  const pageOf = new Map<PDFDict, number>();
  pages.forEach((p, i) => {
    const annots = p.node.Annots();
    for (let k = 0; annots && k < annots.size(); k++) {
      const a = annots.lookupMaybe(k, PDFDict);
      if (a) pageOf.set(a, i);
    }
  });

  const out: FormFieldInfo[] = [];
  for (const field of doc.getForm().getFields()) {
    try {
      const info: FormFieldInfo = {
        name: field.getName(), kind: "text", value: "", readOnly: field.isReadOnly(), multiline: false,
        options: [], multiSelect: false, widgets: [],
      };
      if (field instanceof PDFTextField) {
        info.value = field.getText() ?? "";
        info.multiline = field.isMultiline();
        info.maxLength = field.getMaxLength();
      } else if (field instanceof PDFCheckBox) {
        info.kind = "check";
        info.value = field.isChecked();
      } else if (field instanceof PDFRadioGroup) {
        info.kind = "radio";
        info.value = field.getSelected() ?? "";
        info.options = field.getOptions();
      } else if (field instanceof PDFDropdown || field instanceof PDFOptionList) {
        info.kind = field instanceof PDFDropdown ? "dropdown" : "list";
        info.options = field.getOptions();
        info.multiSelect = field instanceof PDFOptionList && field.isMultiselect();
        const sel = field.getSelected();
        info.value = info.multiSelect ? sel : (sel[0] ?? "");
      } else continue; // buttons, signatures
      field.acroField.getWidgets().forEach((w, i) => {
        const page = pageOf.get(w.dict) ?? (() => {
          const ref = w.P();
          const idx = ref ? pages.findIndex((p) => p.ref === ref) : -1;
          return idx < 0 ? undefined : idx;
        })();
        if (page === undefined) return;
        const rect = w.getRectangle();
        if (rect.width <= 0 || rect.height <= 0) return;
        const p = pages[page];
        info.widgets.push({
          page, ...rectToDisplay(p.getCropBox(), p.getRotation().angle, rect),
          option: info.kind === "radio" ? (info.options[i] ?? w.getOnValue()?.decodeText()) : undefined,
        });
      });
      if (info.widgets.length) out.push(info);
    } catch {
      // a malformed field must not hide the others
    }
  }
  if (!out.length) {
    const acro = doc.catalog.lookupMaybe(PDFName.of("AcroForm"), PDFDict);
    throw new AppError(acro?.has(PDFName.of("XFA")) ? "xfa_form" : "no_form_fields", { name });
  }
  return out;
}
