<?php

namespace Database\Seeders;

use App\Support\Auth\UserRoleResolver;
use Illuminate\Database\Seeder;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

class RolesAndPermissionsSeeder extends Seeder
{
    public function run(): void
    {
        app(PermissionRegistrar::class)->forgetCachedPermissions();

        $permissions = [
            'view schools',
            'manage schools',
            'view students',
            'manage students',
            'view sections',
            'manage sections',
            'view metrics',
            'manage metrics',
            'view performance records',
            'manage performance records',
            'view analytics',
            'view audit logs',
        ];

        foreach ($permissions as $permission) {
            Permission::query()->firstOrCreate(['name' => $permission]);
        }

        $monitor = Role::query()->firstOrCreate(['name' => UserRoleResolver::MONITOR]);
        $schoolHead = Role::query()->firstOrCreate(['name' => UserRoleResolver::SCHOOL_HEAD]);

        // Monitor is the single division-level role and inherits full control.
        $monitor->syncPermissions($permissions);

        $schoolHead->syncPermissions([
            'view schools',
            'view students',
            'manage students',
            'view sections',
            'manage sections',
            'view metrics',
            'view performance records',
            'manage performance records',
            'view analytics',
        ]);

        Role::query()->whereNotIn('name', [UserRoleResolver::MONITOR, UserRoleResolver::SCHOOL_HEAD])->delete();
    }
}

