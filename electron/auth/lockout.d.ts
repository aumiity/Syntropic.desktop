import type Database from 'better-sqlite3';
export declare function checkLocked(db: Database.Database, userId: number): {
    locked: boolean;
    remainingMs: number;
};
export declare function recordFailure(db: Database.Database, userId: number): void;
export declare function clearFailures(db: Database.Database, userId: number): void;
export declare function checkRecoveryLocked(db: Database.Database, userId: number): {
    locked: boolean;
    remainingMs: number;
};
export declare function recordRecoveryFailure(db: Database.Database, userId: number): void;
export declare function clearRecoveryFailures(db: Database.Database, userId: number): void;
