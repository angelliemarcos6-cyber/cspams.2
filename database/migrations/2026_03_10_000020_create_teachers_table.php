<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('teachers', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('school_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('sex')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index('school_id');
            $table->index(['school_id', 'name']);
            $table->index(['school_id', 'sex']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('teachers');
    }
};

