export {};
declare global { interface Window { schematic: { chooseFile(): Promise<string | undefined>; readFile(path: string): Promise<{name: string; data: Uint8Array}>; pathForFile(file: File): string; onOpenFile(cb: (path?: string) => void): void; setTextureState(enabled:boolean):void; thumbnailReady(error?:string):void; onTextureMode(cb:(enabled:boolean)=>void):void } } }
