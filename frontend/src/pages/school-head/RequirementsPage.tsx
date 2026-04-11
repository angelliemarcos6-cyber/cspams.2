import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "@/context/Auth";
import { apiRequest, buildApiUrl, type ApiRequestAuth } from "@/lib/api";
import { FileUploadField } from "@/components/forms/FileUploadField";

interface AcademicYearOption {
  id: string;
  name: string;
  isCurrent: boolean;
}

interface AcademicYearsResponse {
  data: AcademicYearOption[];
}

interface UploadFileInfo {
  filename: string;
  uploadedAt: string;
  size?: number;
}

interface SubmissionFilesInfo {
  targetsMet?: {
    filename?: string | null;
    uploaded_at?: string | null;
  };
  smea?: {
    filename?: string | null;
    uploaded_at?: string | null;
  };
}

interface SubmissionRecord {
  id: number;
  school_id: number;
  academic_year_id: number;
  form_data?: Record<string, unknown> | null;
  files?: SubmissionFilesInfo;
}

interface CreateSubmissionResponse {
  id?: number;
  submission?: SubmissionRecord;
  files?: SubmissionFilesInfo;
}

function hasAuth(auth: ApiRequestAuth | null): auth is ApiRequestAuth {
  return auth !== null;
}

async function uploadSubmissionFile(
  auth: ApiRequestAuth,
  submissionId: number,
  file: File,
  type: "targets_met" | "smea",
): Promise<UploadFileInfo> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("type", type);

  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  if (auth.authMode === "token") {
    headers.Authorization = `Bearer ${auth.token}`;
  }

  const response = await fetch(buildApiUrl(`/api/submissions/${submissionId}/upload-file`), {
    method: "POST",
    headers,
    body: formData,
    credentials: auth.authMode === "cookie" ? "include" : "omit",
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      typeof payload?.message === "string"
        ? payload.message
        : typeof payload?.error === "string"
          ? payload.error
          : "Failed to upload file.",
    );
  }

  return {
    filename: payload?.file_info?.filename ?? file.name,
    uploadedAt: payload?.file_info?.uploadedAt ?? new Date().toISOString(),
    size: payload?.file_info?.size,
  };
}

export function RequirementsPage() {
  const { schoolId } = useParams<{ schoolId?: string }>();
  const { user, requestAuth } = useAuth();
  const [loading, setLoading] = useState(true);
  const [submission, setSubmission] = useState<SubmissionRecord | null>(null);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [uploadedFiles, setUploadedFiles] = useState<{
    targetsMet: UploadFileInfo | null;
    smea: UploadFileInfo | null;
  }>({
    targetsMet: null,
    smea: null,
  });
  const [uploadingType, setUploadingType] = useState<"targets_met" | "smea" | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const formIsComplete = useMemo(() => Object.keys(formData).length > 0, [formData]);
  const allRequirementsComplete = formIsComplete && Boolean(uploadedFiles.targetsMet) && Boolean(uploadedFiles.smea);

  useEffect(() => {
    if (!user?.schoolId || !hasAuth(requestAuth)) {
      return;
    }

    let active = true;
    const targetSchoolId = Number(schoolId ?? user.schoolId);

    const bootstrapSubmission = async () => {
      setLoading(true);
      setError("");

      try {
        const years = await apiRequest<AcademicYearsResponse>("/api/indicators/academic-years", {
          auth: requestAuth,
        });
        const currentYear = years.data.find((year) => year.isCurrent) ?? years.data[0];

        if (!currentYear) {
          throw new Error("No academic year is available.");
        }

        const created = await apiRequest<CreateSubmissionResponse>("/api/submissions/create", {
          method: "POST",
          auth: requestAuth,
          body: {
            school_id: targetSchoolId,
            academic_year_id: Number(currentYear.id),
          },
        });

        const record = created.submission ?? ({
          id: Number(created.id ?? 0),
          school_id: targetSchoolId,
          academic_year_id: Number(currentYear.id),
        } as SubmissionRecord);

        if (!active) {
          return;
        }

        setSubmission(record);
        setFormData(record.form_data ?? {});
        setUploadedFiles({
          targetsMet: record.files?.targetsMet?.filename
            ? {
                filename: record.files.targetsMet.filename,
                uploadedAt: record.files.targetsMet.uploaded_at ?? new Date().toISOString(),
              }
            : null,
          smea: record.files?.smea?.filename
            ? {
                filename: record.files.smea.filename,
                uploadedAt: record.files.smea.uploaded_at ?? new Date().toISOString(),
              }
            : null,
        });
      } catch (err) {
        if (!active) {
          return;
        }
        setError(err instanceof Error ? err.message : "Unable to load submission.");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void bootstrapSubmission();

    return () => {
      active = false;
    };
  }, [requestAuth, schoolId, user?.schoolId]);

  const handleIMetaChange = (sectionKey: string, value: unknown) => {
    setFormData((prev) => ({
      ...prev,
      [sectionKey]: value,
    }));
  };

  const handleSchoolIdentificationChange = (field: string, value: string) => {
    const previous = (formData.schoolIdentification as Record<string, unknown> | undefined) ?? {};

    handleIMetaChange("schoolIdentification", {
      ...previous,
      [field]: value,
    });
  };

  const handleTargetsMETUpload = async (file: File) => {
    if (!submission || !hasAuth(requestAuth)) {
      return;
    }

    setUploadingType("targets_met");
    setError("");
    setSuccess("");

    try {
      const fileInfo = await uploadSubmissionFile(requestAuth, submission.id, file, "targets_met");
      setUploadedFiles((prev) => ({
        ...prev,
        targetsMet: fileInfo,
      }));
      setSuccess("TARGETS-MET file uploaded.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload TARGETS-MET file.");
    } finally {
      setUploadingType(null);
    }
  };

  const handleSMEAUpload = async (file: File) => {
    if (!submission || !hasAuth(requestAuth)) {
      return;
    }

    setUploadingType("smea");
    setError("");
    setSuccess("");

    try {
      const fileInfo = await uploadSubmissionFile(requestAuth, submission.id, file, "smea");
      setUploadedFiles((prev) => ({
        ...prev,
        smea: fileInfo,
      }));
      setSuccess("SMEA file uploaded.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload SMEA file.");
    } finally {
      setUploadingType(null);
    }
  };

  const handleSubmit = async () => {
    if (!submission || !hasAuth(requestAuth)) {
      return;
    }

    setError("");
    setSuccess("");

    try {
      await apiRequest(`/api/submissions/${submission.id}/imeta-form`, {
        method: "POST",
        auth: requestAuth,
        body: {
          form_data: formData,
        },
      });

      await apiRequest(`/api/submissions/${submission.id}/submit`, {
        method: "POST",
        auth: requestAuth,
      });

      setSuccess("All requirements submitted successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed.");
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <p className="text-sm text-gray-600">Loading annual requirements...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="mb-2 text-2xl font-bold">Annual Requirements</h1>
      <p className="mb-6 text-sm text-gray-600">
        Centralized School Performance and Monitoring System
      </p>

      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          {success}
        </div>
      )}

      <div className="mb-8 flex justify-between gap-4">
        <div className="flex-1 rounded border p-3">
          <div className="mb-1 text-sm font-medium">
            1. I-META Form {formIsComplete ? "[Done]" : ""}
          </div>
          <p className="text-xs text-gray-600">Quality assurance self-evaluation</p>
        </div>
        <div className="flex-1 rounded border p-3">
          <div className="mb-1 text-sm font-medium">
            2. TARGETS-MET {uploadedFiles.targetsMet ? "[Done]" : ""}
          </div>
          <p className="text-xs text-gray-600">Upload KPI targets file</p>
        </div>
        <div className="flex-1 rounded border p-3">
          <div className="mb-1 text-sm font-medium">
            3. SMEA {uploadedFiles.smea ? "[Done]" : ""}
          </div>
          <p className="text-xs text-gray-600">Upload institutional strength file</p>
        </div>
      </div>

      <section className="mb-8 border-t pt-6">
        <h2 className="mb-4 text-xl font-bold">1. I-META Form</h2>

        <div className="mb-6 rounded bg-gray-50 p-4">
          <h3 className="mb-4 font-semibold">School Identification</h3>
          <div className="grid grid-cols-2 gap-4">
            <input
              type="text"
              placeholder="School Name"
              className="rounded border p-2"
              value={String((formData.schoolIdentification as Record<string, unknown> | undefined)?.schoolName ?? "")}
              onChange={(e) => handleSchoolIdentificationChange("schoolName", e.target.value)}
            />
            <input
              type="text"
              placeholder="School Code"
              className="rounded border p-2"
              value={String((formData.schoolIdentification as Record<string, unknown> | undefined)?.schoolCode ?? "")}
              onChange={(e) => handleSchoolIdentificationChange("schoolCode", e.target.value)}
            />
            <input
              type="text"
              placeholder="Address"
              className="col-span-2 rounded border p-2"
              value={String((formData.schoolIdentification as Record<string, unknown> | undefined)?.address ?? "")}
              onChange={(e) => handleSchoolIdentificationChange("address", e.target.value)}
            />
            <input
              type="text"
              placeholder="Principal Name"
              className="col-span-2 rounded border p-2"
              value={String((formData.schoolIdentification as Record<string, unknown> | undefined)?.principalName ?? "")}
              onChange={(e) => handleSchoolIdentificationChange("principalName", e.target.value)}
            />
          </div>
        </div>

        <div className="mb-6 rounded border-l-4 border-blue-400 bg-blue-50 p-4">
          <h3 className="mb-4 font-semibold">I.A - Leadership & Governance</h3>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">1. Does the school have a strategic plan?</label>
              <div className="mt-2 flex gap-4">
                {[1, 2, 3, 4, 5].map((score) => (
                  <label key={score} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="ia_1"
                      value={score}
                      checked={Number((formData.ia_1 as number | undefined) ?? 0) === score}
                      onChange={() => handleIMetaChange("ia_1", score)}
                    />
                    <span className="text-sm">{score}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded bg-gray-50 p-4 text-sm text-gray-600">
          [More sections: I.B, I.C, I.D, I.E would go here]
        </div>
      </section>

      <section className="mb-8 border-t pt-6">
        <h2 className="mb-4 text-xl font-bold">2. TARGETS-MET Report</h2>
        <p className="mb-4 text-sm text-gray-600">
          Upload your TARGETS-MET report (Excel or PDF format). This file should contain your Key Performance
          Indicator targets for the year.
        </p>

        <FileUploadField
          label="TARGETS-MET File"
          description="Accepted formats: Excel (.xlsx), PDF (.pdf)"
          acceptedFormats={[".xlsx", ".xls", ".pdf"]}
          maxSizeMB={10}
          onFileSelected={handleTargetsMETUpload}
          currentFile={uploadedFiles.targetsMet}
          isLoading={uploadingType === "targets_met"}
        />
      </section>

      <section className="mb-8 border-t pt-6">
        <h2 className="mb-4 text-xl font-bold">3. SMEA Report</h2>
        <p className="mb-4 text-sm text-gray-600">
          Upload your SMEA report (School Management and Effectiveness Assessment). Can be in Word or PDF format.
        </p>

        <FileUploadField
          label="SMEA File"
          description="Accepted formats: Word (.docx), PDF (.pdf)"
          acceptedFormats={[".docx", ".doc", ".pdf"]}
          maxSizeMB={10}
          onFileSelected={handleSMEAUpload}
          currentFile={uploadedFiles.smea}
          isLoading={uploadingType === "smea"}
        />
      </section>

      <div className="flex gap-4 border-t pt-6">
        <button
          onClick={handleSubmit}
          disabled={!allRequirementsComplete}
          className="rounded bg-blue-600 px-6 py-2 text-white disabled:opacity-50"
        >
          Submit All Requirements
        </button>
        <button
          onClick={() => setFormData({})}
          className="rounded border border-gray-300 px-6 py-2"
        >
          Clear Form
        </button>
      </div>
    </div>
  );
}
