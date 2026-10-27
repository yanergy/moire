import { describe, it, expect } from 'vitest';
import { recommendedBase, recommendedHead } from '@/lib/branch-recommendations';
import type { BranchInfo } from '@/shared/types';
import { WORKING_TREE } from '@/shared/types';

const local = (name: string, isCurrent = false): BranchInfo =>
    isCurrent ? { name, kind: 'local', isCurrent } : { name, kind: 'local' };
const remote = (name: string, isDefault = false): BranchInfo =>
    isDefault ? { name, kind: 'remote', isDefault } : { name, kind: 'remote' };

describe('recommendedBase', () => {
    it('lists origin/development, the default branch, then the current branch', () => {
        const list = [
            local('feature', true),
            remote('origin/main', true),
            remote('origin/development'),
        ];
        expect(recommendedBase(list)).toEqual([
            { name: 'origin/development', meta: '' },
            { name: 'origin/main', meta: 'default' },
            { name: 'feature', meta: 'current' },
        ]);
    });

    it('takes the default branch from origin/HEAD over the conventional names', () => {
        const list = [local('main'), remote('origin/main'), remote('origin/trunk', true)];
        expect(recommendedBase(list)).toEqual([{ name: 'origin/trunk', meta: 'default' }]);
    });

    it('falls back to the conventional names when origin/HEAD is not set', () => {
        expect(recommendedBase([local('master'), remote('origin/master')])).toEqual([
            { name: 'origin/master', meta: 'default' },
        ]);
        expect(recommendedBase([local('feature'), local('main')])).toEqual([
            { name: 'main', meta: 'default' },
        ]);
    });

    it('lists a branch once when it is both the default and the current one', () => {
        expect(recommendedBase([local('main', true), local('feature')])).toEqual([
            { name: 'main', meta: 'default' },
        ]);
    });

    it('recommends nothing when no candidate exists', () => {
        expect(recommendedBase([local('feature')])).toEqual([]);
    });
});

describe('recommendedHead', () => {
    it('recommends the working tree, then the checked-out branch', () => {
        const list = [local('main'), local('feature', true), remote('origin/main', true)];
        expect(recommendedHead(list)).toEqual([
            { name: WORKING_TREE, meta: 'on disk' },
            { name: 'feature', meta: 'current' },
        ]);
    });

    it('recommends only the working tree on a detached HEAD', () => {
        expect(recommendedHead([local('main')])).toEqual([{ name: WORKING_TREE, meta: 'on disk' }]);
    });
});
