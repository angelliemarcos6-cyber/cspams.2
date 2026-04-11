<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('welfare_concern_attachments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('concern_id')->constrained('welfare_concerns')->cascadeOnDelete();
            $table->string('file_path'); // Encrypted path
            $table->string('original_filename');
            $table->enum('file_type', ['pdf', 'jpg', 'png', 'doc', 'docx']);
            $table->foreignId('uploaded_by')->constrained('users');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('welfare_concern_attachments');
    }
};
