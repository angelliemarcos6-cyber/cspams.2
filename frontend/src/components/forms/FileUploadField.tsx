interface FileUploadFieldProps {
  label: string;
  description?: string;
  acceptedFormats: string[];
  maxSizeMB: number;
  onFileSelected: (file: File) => void;
  currentFile?: {
    filename: string;
    uploadedAt: string;
  } | null;
  isLoading?: boolean;
  error?: string;
}

export function FileUploadField({
  label,
  description,
  acceptedFormats,
  maxSizeMB,
  onFileSelected,
  currentFile,
  isLoading,
  error,
}: FileUploadFieldProps) {
  return (
    <div className="rounded-lg border-2 border-dashed p-6">
      <label className="mb-2 block text-sm font-medium">{label}</label>

      {description && (
        <p className="mb-3 text-xs text-gray-600">{description}</p>
      )}

      {currentFile ? (
        <div className="mb-3 rounded border border-green-200 bg-green-50 p-3">
          <p className="text-sm text-green-800">
            Uploaded: {currentFile.filename}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Uploaded: {new Date(currentFile.uploadedAt).toLocaleDateString()}
          </p>
        </div>
      ) : null}

      <input
        type="file"
        accept={acceptedFormats.join(",")}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            if (file.size > maxSizeMB * 1024 * 1024) {
              return;
            }
            onFileSelected(file);
          }
        }}
        disabled={isLoading}
        className="w-full"
      />

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
