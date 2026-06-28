import type { IpcMainInvokeEvent } from 'electron';
type Session = {
    userId: number;
    role: string;
};
export declare function bindSession(e: IpcMainInvokeEvent, userId: number, role: string): void;
export declare function clearSession(e: IpcMainInvokeEvent): void;
export declare function clearSessionById(senderId: number): void;
export declare function getSession(senderId: number): Session | undefined;
export declare function getSessionRole(e: IpcMainInvokeEvent): string | undefined;
export type Override = {
    userId: number;
    password: string;
};
export {};
