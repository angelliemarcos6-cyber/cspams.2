<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('welfare_concern_threads', function (Blueprint $table) {
            $table->id();
            $table->foreignId('concern_id')->constrained('welfare_concerns')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users');
            $table->text('message');
            $table->timestamps();

            $table->index(['concern_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('welfare_concern_threads');
    }
};
