export declare function hashSecret(plain: string): string;
export declare function verifySecret(plain: string, stored: string): {
    ok: boolean;
    legacy: boolean;
};
export declare function genRecoveryCode(): string;
