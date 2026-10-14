import {
  Archive, Combine, Crop, Droplets, Eraser, FileArchive, FileMinus, FileOutput, FileText, GitCompare, Globe, Image,
  ImagePlus, LayoutGrid, ListOrdered, Lock, LockOpen, type LucideIcon, type LucideProps, Minimize2, PencilLine,
  Presentation, Repeat, RotateCcwSquare, RotateCw, Scaling, ScanText, Scissors, Sheet, Signature, Stamp, Wrench, ZoomIn,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  Archive, Combine, Crop, Droplets, Eraser, FileArchive, FileMinus, FileOutput, FileText, GitCompare, Globe, Image,
  ImagePlus, LayoutGrid, ListOrdered, Lock, LockOpen, Minimize2, PencilLine, Presentation, Repeat, RotateCcwSquare,
  RotateCw, Scaling, ScanText, Scissors, Sheet, Signature, Stamp, Wrench, ZoomIn,
};

export function ToolIcon({ name, ...props }: { name: string } & LucideProps) {
  const Icon = ICONS[name] ?? FileText;
  return <Icon {...props} />;
}
