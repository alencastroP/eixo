import { useRef, useState, type DragEvent } from 'react';
import { vehiclesApi } from '../api/endpoints';
import { ApiError } from '../api/client';
import type { VehicleDetail, VehiclePhoto } from '../types';
import { CameraIcon, StarIcon, TrashIcon } from './icons';

interface Props {
  vehicleId: string;
  photos: VehiclePhoto[];
  onChange: (detail: VehicleDetail) => void;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Galeria avançada: upload em lote via drag-and-drop, reordenação arrastando as
 * miniaturas e definição da foto de capa. Cada operação persiste no backend.
 */
export function PhotoGallery({ vehicleId, photos, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOverUpload, setDragOverUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const uploadFiles = async (files: FileList | File[]) => {
    const images = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (images.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const dataUrls = await Promise.all(images.map(readAsDataUrl));
      onChange(await vehiclesApi.addPhotos(vehicleId, dataUrls));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao enviar as fotos');
    } finally {
      setUploading(false);
    }
  };

  const onDropUpload = (e: DragEvent) => {
    e.preventDefault();
    setDragOverUpload(false);
    if (e.dataTransfer.files?.length) void uploadFiles(e.dataTransfer.files);
  };

  const persistOrder = async (ordered: VehiclePhoto[], coverId?: string) => {
    setBusy(true);
    try {
      onChange(await vehiclesApi.reorderPhotos(vehicleId, ordered.map((p) => p.id), coverId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao reordenar');
    } finally {
      setBusy(false);
    }
  };

  // reordenação por arrasto entre miniaturas
  const handleThumbDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const ordered = [...photos].sort((a, b) => a.position - b.position);
    const from = ordered.findIndex((p) => p.id === dragId);
    const to = ordered.findIndex((p) => p.id === targetId);
    if (from < 0 || to < 0) return;
    const [moved] = ordered.splice(from, 1);
    ordered.splice(to, 0, moved);
    void persistOrder(ordered);
  };

  const setCover = (photoId: string) => {
    const ordered = [...photos].sort((a, b) => a.position - b.position);
    void persistOrder(ordered, photoId);
  };

  const remove = async (photoId: string) => {
    setBusy(true);
    setError(null);
    try {
      onChange(await vehiclesApi.deletePhoto(vehicleId, photoId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao remover');
    } finally {
      setBusy(false);
    }
  };

  const sorted = [...photos].sort((a, b) => a.position - b.position);

  return (
    <div className="gallery">
      <div
        className={`dropzone ${dragOverUpload ? 'over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOverUpload(true);
        }}
        onDragLeave={() => setDragOverUpload(false)}
        onDrop={onDropUpload}
        onClick={() => inputRef.current?.click()}
      >
        <CameraIcon size={26} />
        <div>
          <strong>Arraste fotos aqui</strong> ou clique para selecionar
        </div>
        <span className="muted small">JPG, PNG ou WebP · até 20 por vez</span>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) void uploadFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {uploading && <div className="muted small upload-status">Enviando fotos…</div>}
      {error && <div className="alert alert-error">{error}</div>}

      {sorted.length > 0 && (
        <>
          <div className="gallery-hint muted small">
            Arraste as miniaturas para reordenar · clique na estrela para definir a capa
          </div>
          <div className={`thumb-grid ${busy ? 'busy' : ''}`}>
            {sorted.map((p) => (
              <div
                key={p.id}
                className={`thumb ${p.isCover ? 'cover' : ''} ${overId === p.id ? 'drag-target' : ''} ${
                  dragId === p.id ? 'dragging' : ''
                }`}
                draggable
                onDragStart={() => setDragId(p.id)}
                onDragEnd={() => {
                  setDragId(null);
                  setOverId(null);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOverId(p.id);
                }}
                onDragLeave={() => setOverId((c) => (c === p.id ? null : c))}
                onDrop={() => {
                  handleThumbDrop(p.id);
                  setOverId(null);
                }}
              >
                <img src={p.url} alt="Foto do veículo" />
                {p.isCover && <span className="cover-tag">Capa</span>}
                <div className="thumb-actions">
                  <button
                    type="button"
                    className={`thumb-btn ${p.isCover ? 'active' : ''}`}
                    title="Definir como capa"
                    onClick={() => setCover(p.id)}
                    disabled={busy}
                  >
                    <StarIcon size={14} />
                  </button>
                  <button
                    type="button"
                    className="thumb-btn danger"
                    title="Remover"
                    onClick={() => remove(p.id)}
                    disabled={busy}
                  >
                    <TrashIcon size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
