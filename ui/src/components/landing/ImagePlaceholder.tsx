import { Image } from 'lucide-react';

interface ImagePlaceholderProps {
  aspectRatio: string;
  width: number;
  height: number;
  description: string;
  alt: string;
  className?: string;
}

export default function ImagePlaceholder({
  aspectRatio,
  width,
  height,
  description,
  alt,
  className = '',
}: ImagePlaceholderProps) {
  return (
    <div
      className={`relative bg-slate-800/50 border-2 border-dashed border-slate-600 rounded-xl overflow-hidden ${className}`}
      style={{ aspectRatio }}
    >
      <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
        <Image className="w-16 h-16 text-slate-600 mb-4" />
        <div className="space-y-2">
          <p className="text-slate-400 font-medium">{alt}</p>
          <p className="text-sm text-slate-500">{description}</p>
          <div className="flex items-center justify-center gap-4 mt-3">
            <span className="px-3 py-1 bg-slate-700/50 text-slate-400 text-xs rounded-full font-mono">
              {aspectRatio}
            </span>
            <span className="px-3 py-1 bg-slate-700/50 text-slate-400 text-xs rounded-full font-mono">
              {width}x{height}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
