import { useEffect, useRef, useState } from "react";
import { FileText, Image as ImageIcon, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";

type FileUploadFieldProps = {
  label: string;
  description?: string;
  accept?: string;
  file: File | null;
  onChange: (file: File | null) => void;
  maxSizeMb?: number;
  error?: string;
};

const formatBytes = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

const isImage = (file: File | null) => Boolean(file && file.type.startsWith("image/"));

const FileUploadField = ({
  label,
  description,
  accept = ".pdf,.png,.jpg,.jpeg",
  file,
  onChange,
  maxSizeMb = 8,
  error,
}: FileUploadFieldProps) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!isImage(file)) {
      setPreviewUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(file!);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-sm font-medium">{label}</label>
        {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
      </div>

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className={cn(
          "w-full rounded-xl border border-dashed p-5 text-left transition",
          error ? "border-destructive bg-destructive/5" : "border-border bg-muted/30 hover:bg-muted/50"
        )}
      >
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-background p-2 text-primary shadow-sm">
            <Upload className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-medium">{file ? "Trocar arquivo" : "Selecionar arquivo"}</p>
            <p className="text-xs text-muted-foreground">PDF, PNG, JPG ou JPEG ate {maxSizeMb} MB.</p>
          </div>
        </div>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(event) => onChange(event.target.files?.[0] || null)}
      />

      {file && (
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-muted p-2 text-foreground">
                {isImage(file) ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
              </div>
              <div>
                <p className="text-sm font-medium">{file.name}</p>
                <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
              </div>
            </div>
            <button type="button" onClick={() => onChange(null)} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          {previewUrl && (
            <div className="mt-3 overflow-hidden rounded-lg border border-border">
              <img src={previewUrl} alt={file.name} className="max-h-48 w-full object-cover" />
            </div>
          )}
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
};

export default FileUploadField;
