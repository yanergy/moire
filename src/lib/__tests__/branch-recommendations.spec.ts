import { describe, it, expect } from 'vitest';
import {
    detectDevelopmentBranch,
    detectMainBranch,
    recommendedBase,
    recommendedHead,
    resolveBranchRoles,
} from '@/lib/branch-recommendations';
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

    it('recommends the configured branches instead of the detected ones', () => {
        const list = [local('feature', true), remote('origin/trunk'), remote('origin/dev')];
        expect(recommendedBase(list, { main: 'origin/trunk', development: 'origin/dev' })).toEqual([
            { name: 'origin/dev', meta: '' },
            { name: 'origin/trunk', meta: 'default' },
            { name: 'feature', meta: 'current' },
        ]);
    });
});

describe('detectMainBranch', () => {
    it('prefers the origin/HEAD target, then the conventional names', () => {
        expect(detectMainBranch([remote('origin/main'), remote('origin/trunk', true)])).toBe(
            'origin/trunk'
        );
        expect(detectMainBranch([local('master')])).toBe('master');
        expect(detectMainBranch([local('feature')])).toBeUndefined();
    });
});

describe('detectDevelopmentBranch', () => {
    it('falls back through development, develop and dev, remotes first', () => {
        expect(detectDevelopmentBranch([remote('origin/dev'), remote('origin/develop')])).toBe(
            'origin/develop'
        );
        expect(detectDevelopmentBranch([local('dev'), remote('origin/dev')])).toBe('origin/dev');
        expect(detectDevelopmentBranch([local('develop')])).toBe('develop');
        expect(detectDevelopmentBranch([local('main')])).toBeUndefined();
    });
});

describe('resolveBranchRoles', () => {
    const list = [remote('origin/main', true), remote('origin/development'), local('trunk')];

    it('detects both when nothing is configured', () => {
        expect(resolveBranchRoles(list)).toEqual({
            main: 'origin/main',
            development: 'origin/development',
        });
    });

    it('uses the configured branches while they exist', () => {
        expect(resolveBranchRoles(list, { main: 'trunk', development: 'trunk' })).toEqual({
            main: 'trunk',
            development: 'trunk',
        });
    });

    it('falls back to detection when a configured branch is gone', () => {
        expect(resolveBranchRoles(list, { main: 'gone', development: 'gone' })).toEqual({
            main: 'origin/main',
            development: 'origin/development',
        });
    });

    it('leaves the development branch out when it is set to None', () => {
        expect(resolveBranchRoles(list, { development: null })).toEqual({ main: 'origin/main' });
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
