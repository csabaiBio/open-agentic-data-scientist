import { useState } from 'react'
import { X, ZoomIn, Image as ImageIcon } from 'lucide-react'
import type { GeneratedFile } from '../types'
import { getFileUrl } from '../api'

interface Props {
  projectId: string
  files: GeneratedFile[]
}

export default function FigureGallery({ projectId, files }: Props) {
  const [selected, setSelected] = useState<GeneratedFile | null>(null)

  const figures = files.filter(f => f.type === 'figure')

  if (figures.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-400">
        <ImageIcon className="w-10 h-10 mb-2 opacity-40" />
        <p className="text-sm">No figures generated yet</p>
      </div>
    )
  }

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {figures.map((fig) => (
          <button
            key={fig.path}
            onClick={() => setSelected(fig)}
            className="group relative aspect-[4/3] rounded-xl overflow-hidden bg-gray-100 border border-gray-200 hover:border-brand-300 transition-all hover:shadow-lg"
          >
            <img
              src={getFileUrl(projectId, fig.path)}
              alt={fig.name}
              className="w-full h-full object-contain p-2"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
              <ZoomIn className="w-6 h-6 text-white opacity-0 group-hover:opacity-80 transition-opacity drop-shadow-lg" />
            </div>
            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent px-3 py-2">
              <p className="text-xs text-white font-medium truncate">{fig.name}</p>
            </div>
          </button>
        ))}
      </div>

      {/* Lightbox */}
      {selected && (
        <div
          className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-8 animate-fade-in"
          onClick={() => setSelected(null)}
        >
          <button
            onClick={() => setSelected(null)}
            className="absolute top-6 right-6 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <div
            className="max-w-5xl max-h-[85vh] w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={getFileUrl(projectId, selected.path)}
              alt={selected.name}
              className="w-full h-full object-contain rounded-lg"
            />
            <p className="text-white/80 text-sm text-center mt-3 font-medium">{selected.name}</p>
          </div>
        </div>
      )}
    </>
  )
}
