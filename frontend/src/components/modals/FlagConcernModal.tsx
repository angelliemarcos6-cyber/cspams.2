import { useState, type FormEvent } from "react";
import { buildApiUrl, type ApiRequestAuth } from "@/lib/api";
import { useAuth } from "@/context/Auth";

const CONCERN_CATEGORIES = [
  { value: "child_protection", label: "Child Protection / Abuse" },
  { value: "financial_difficulty", label: "Financial Difficulty" },
  { value: "dropout_risk", label: "Dropout Risk" },
  { value: "irregular_attendance", label: "Irregular Attendance" },
  { value: "family_situation", label: "Family Situation" },
  { value: "health_medical", label: "Health / Medical" },
  { value: "bullying", label: "Bullying" },
  { value: "other", label: "Other" },
] as const;

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

function hasAuth(auth: ApiRequestAuth | null): auth is ApiRequestAuth {
  return auth !== null;
}

export function FlagConcernModal({ open, onClose, onSuccess }: Props) {
  const { requestAuth } = useAuth();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    grade_level: "",
    section: "",
    category: "",
    description: "",
  });
  const [attachments, setAttachments] = useState<File[]>([]);
  const [error, setError] = useState("");

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (!hasAuth(requestAuth)) {
      setLoading(false);
      setError("You are not authenticated.");
      return;
    }

    if (attachments.length > 3) {
      setLoading(false);
      setError("Maximum of 3 attachments is allowed.");
      return;
    }

    try {
      const formData = new FormData();
      formData.append("grade_level", form.grade_level);
      formData.append("section", form.section);
      formData.append("category", form.category);
      formData.append("description", form.description);

      attachments.forEach((file) => {
        formData.append("attachments[]", file);
      });

      const headers: Record<string, string> = {
        Accept: "application/json",
      };

      if (requestAuth.authMode === "token") {
        headers.Authorization = `Bearer ${requestAuth.token}`;
      }

      const response = await fetch(buildApiUrl("/api/concerns/flag"), {
        method: "POST",
        headers,
        body: formData,
        credentials: requestAuth.authMode === "cookie" ? "include" : "omit",
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof payload?.message === "string"
            ? payload.message
            : "Failed to flag concern. Please try again.",
        );
      }

      onSuccess();
      onClose();
      setForm({ grade_level: "", section: "", category: "", description: "" });
      setAttachments([]);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to flag concern. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-lg bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold">Flag a Student Concern</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Grade Level</label>
              <input
                value={form.grade_level}
                onChange={(e) => setForm({ ...form, grade_level: e.target.value })}
                placeholder="e.g., Grade 5"
                required
                className="w-full rounded border px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Section</label>
              <input
                value={form.section}
                onChange={(e) => setForm({ ...form, section: e.target.value })}
                placeholder="e.g., Masigasig"
                required
                className="w-full rounded border px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Category</label>
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="w-full rounded border px-3 py-2 text-sm"
              required
            >
              <option value="">Select a category</option>
              {CONCERN_CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Describe the concern (no student names or personal identifiers)"
              rows={5}
              required
              className="w-full rounded border px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-gray-500">
              Do NOT include student names, LRN, or other personal identifiers
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Attachments (Optional)</label>
            <input
              type="file"
              multiple
              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
              onChange={(e) => setAttachments(Array.from(e.target.files || []))}
              className="block w-full rounded border px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-gray-500">
              Max 3 files (PDF, JPG, PNG, DOC, DOCX)
            </p>
          </div>

          {error && (
            <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4">
            <button
              type="button"
              className="rounded border px-4 py-2 text-sm"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-60"
            >
              {loading ? "Flagging..." : "Flag Concern"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
