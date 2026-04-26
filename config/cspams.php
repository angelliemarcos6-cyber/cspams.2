<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Submission File Upload Limit
    |--------------------------------------------------------------------------
    |
    | Maximum upload size (in KB) for BMEF/SMEA files.
    | Default keeps current behavior at 10MB.
    |
    */
    'submission_file_max_kb' => (int) env('CSPAMS_SUBMISSION_FILE_MAX_KB', 10240),
];

