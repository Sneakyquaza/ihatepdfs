/** Data produced by the visual editors and consumed by the processors. */

export interface OrganizeItem {
  file: number; // index into the input files
  page: number; // zero-based page index
  rotation: number; // extra rotation in degrees (multiple of 90)
}

/** Rectangle in fractions (0..1) of the page as displayed (rotation applied), origin top-left. */
export interface Box {
  page: number; // zero-based
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SignPlacement extends Box {
  image: string; // PNG data URL
}

export type EditItem =
  | (Box & { kind: "text"; text: string; size: number; color: string }) // size in PDF points
  | (Box & { kind: "rect"; color: string })
  | (Box & { kind: "whiteout" })
  | (Box & { kind: "highlight"; color: string });

export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FormFillData {
  values: Record<string, string | boolean | string[]>; // fully-qualified field name -> new value
}

export type EditorData = FormFillData | OrganizeItem[] | SignPlacement[] | EditItem[] | Box[] | CropRect | CropRect[] | null;
