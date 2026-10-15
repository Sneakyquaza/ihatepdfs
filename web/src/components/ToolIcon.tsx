import {
  Archive, ArrowDownUp, Combine, Contrast, Crop, Droplets, Eraser, EyeOff, FileArchive, FileCode, FileMinus, FileOutput, FileText, FileType,
  GitCompare, Globe, Grid2x2, Hash, Image, ImagePlus, Images, Layers, LayoutGrid, ListOrdered, Lock, LockOpen, type LucideIcon,
  type LucideProps, Minimize2, PanelTop, PencilLine, Presentation, Repeat, RotateCcwSquare, RotateCw, Scaling, ScanFace,
  ScanLine, ScanText, Scissors, Sheet, Signature, SquareSplitHorizontal, Stamp, Tags, TextCursorInput, Wrench, ZoomIn,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  Archive, ArrowDownUp, Combine, Contrast, Crop, Droplets, Eraser, EyeOff, FileArchive, FileCode, FileMinus, FileOutput, FileText, FileType,
  GitCompare, Globe, Grid2x2, Hash, Image, ImagePlus, Images, Layers, LayoutGrid, ListOrdered, Lock, LockOpen, Minimize2,
  PanelTop, PencilLine, Presentation, Repeat, RotateCcwSquare, RotateCw, Scaling, ScanFace, ScanLine, ScanText, Scissors, Sheet,
  Signature, SquareSplitHorizontal, Stamp, Tags, TextCursorInput, Wrench, ZoomIn,
};

export function ToolIcon({ name, ...props }: { name: string } & LucideProps) {
  const Icon = ICONS[name] ?? FileText;
  return <Icon {...props} />;
}
