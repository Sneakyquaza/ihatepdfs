import {
  Archive, Combine, Contrast, Crop, Droplets, Eraser, EyeOff, FileArchive, FileMinus, FileOutput, FileText, FileType,
  GitCompare, Globe, Grid2x2, Image, ImagePlus, Layers, LayoutGrid, ListOrdered, Lock, LockOpen, type LucideIcon,
  type LucideProps, Minimize2, PencilLine, Presentation, Repeat, RotateCcwSquare, RotateCw, Scaling, ScanFace,
  ScanText, Scissors, Sheet, Signature, Stamp, Tags, Wrench, ZoomIn,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  Archive, Combine, Contrast, Crop, Droplets, Eraser, EyeOff, FileArchive, FileMinus, FileOutput, FileText, FileType,
  GitCompare, Globe, Grid2x2, Image, ImagePlus, Layers, LayoutGrid, ListOrdered, Lock, LockOpen, Minimize2,
  PencilLine, Presentation, Repeat, RotateCcwSquare, RotateCw, Scaling, ScanFace, ScanText, Scissors, Sheet,
  Signature, Stamp, Tags, Wrench, ZoomIn,
};

export function ToolIcon({ name, ...props }: { name: string } & LucideProps) {
  const Icon = ICONS[name] ?? FileText;
  return <Icon {...props} />;
}
