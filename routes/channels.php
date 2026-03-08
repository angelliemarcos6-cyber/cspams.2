<?php

use Illuminate\Support\Facades\Broadcast;

Broadcast::channel('cspams-updates', static fn () => true);
