<?php

namespace Database\Seeders;

use App\Models\School;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

class RolesAndUsersSeeder extends Seeder
{
    /**
     * Change this once, and all seeded accounts update on re-run.
     */
    private const DEFAULT_PASSCODE = '123456';

    public function run(): void
    {
        // Avoid stale role/permission cache issues
        app(PermissionRegistrar::class)->forgetCachedPermissions();

        // Roles (guard: web)
        $monitorRole = Role::findOrCreate('monitor', 'web');
        $headRole    = Role::findOrCreate('school_head', 'web');

        // Schools (School Admin tab uses schools.code as "School ID")
        $schoolA = $this->upsertSchool('103842', 'Santiago West Central School - Special Science Elementary School');
        $schoolB = $this->upsertSchool('502696', 'Santiago North Central School');
        $schoolC = $this->upsertSchool('103815', 'Mabini Elementary School');
        $schoolD = $this->upsertSchool('103827', 'Dubinan Elementary School');

        // Monitor (Monitor tab "School ID" = email)
        $monitor = $this->upsertUser(
            name: 'Division Monitor',
            email: 'monitor@gmail.com',
            schoolId: null,
            passcode: self::DEFAULT_PASSCODE
        );
        $monitor->syncRoles([$monitorRole]);

        // School Heads (School Admin tab "School ID" = school.code, so account ties to school_id)
        $headSWCS = $this->upsertUser('Head - SWCS', 'head.swcs@gmail.com', $schoolA->id, self::DEFAULT_PASSCODE);
        $headSNCS = $this->upsertUser('Head - SNCS', 'head.sncs@gmail.com', $schoolB->id, self::DEFAULT_PASSCODE);
        $headMab  = $this->upsertUser('Head - Mabini', 'head.mabini@gmail.com', $schoolC->id, self::DEFAULT_PASSCODE);
        $headDub  = $this->upsertUser('Head - Dubinan', 'head.dubinan@gmail.com', $schoolD->id, self::DEFAULT_PASSCODE);

        $headSWCS->syncRoles([$headRole]);
        $headSNCS->syncRoles([$headRole]);
        $headMab->syncRoles([$headRole]);
        $headDub->syncRoles([$headRole]);
    }

    /**
     * Robust school upsert:
     * - If code exists, update name.
     * - Else if name exists (old seed before code), set code.
     * - Else create.
     */
    private function upsertSchool(string $code, string $name): School
    {
        $school = School::query()
        ->where('code', $code)
        ->first();

        if (! $school) {
            $school = School::query()
            ->where('name', $name)
            ->first();
        }

        if (! $school) {
            $school = new School();
        }

        $school->code = $code;
        $school->name = $name;
        $school->save();

        return $school;
    }

    private function upsertUser(string $name, string $email, ?int $schoolId, string $passcode): User
    {
        return User::updateOrCreate(
            ['email' => $email],
            [
                'name'      => $name,
                'password'  => Hash::make($passcode),
                                    'school_id' => $schoolId,
            ]
        );
    }
}
