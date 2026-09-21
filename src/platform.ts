import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export type StructureFile = { name: string; data: Uint8Array };

export interface SchematicBridge {
  chooseFile(): Promise<string | undefined>;
  readFile(reference: string): Promise<StructureFile>;
  pathForFile?(file: File): string;
  onOpenFile(cb: (reference?: string) => void): void;
  setTextureState(enabled: boolean): void;
  thumbnailReady(error?: string): void;
  onTextureMode(cb: (enabled: boolean) => void): void;
}

type NativeReference = { uri?: string };
type NativeFile = { name: string; data: string };

interface SchemyFilesPlugin {
  pickFile(): Promise<NativeReference>;
  getLaunchFile(): Promise<NativeReference>;
  readFile(options: { uri: string }): Promise<NativeFile>;
  addListener(eventName: 'fileOpen', listener: (event: NativeReference) => void): Promise<PluginListenerHandle>;
}

const NativeFiles = registerPlugin<SchemyFilesPlugin>('SchemyFiles');

function decodeBase64(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let offset = 0; offset < binary.length; offset += 1) bytes[offset] = binary.charCodeAt(offset);
  return bytes;
}

const androidBridge: SchematicBridge = {
  async chooseFile() {
    return (await NativeFiles.pickFile()).uri;
  },
  async readFile(uri) {
    const file = await NativeFiles.readFile({ uri });
    return { name: file.name, data: decodeBase64(file.data) };
  },
  onOpenFile(cb) {
    void NativeFiles.getLaunchFile().then(({ uri }) => { if (uri) cb(uri); });
    void NativeFiles.addListener('fileOpen', ({ uri }) => { if (uri) cb(uri); });
  },
  setTextureState() {},
  thumbnailReady() {},
  onTextureMode() {},
};

function browserBridge(): SchematicBridge {
  let input: HTMLInputElement | undefined;
  const files = new Map<string, File>();
  return {
    chooseFile: () => new Promise(resolve => {
      input ??= Object.assign(document.createElement('input'), { type: 'file', accept: '.schematic,.schem,.nbt,.litematic' });
      input.onchange = () => {
        const file = input?.files?.[0];
        if (!file) return resolve(undefined);
        const reference = `browser:${crypto.randomUUID()}`;
        files.set(reference, file);
        resolve(reference);
      };
      input.value = '';
      input.click();
    }),
    async readFile(reference) {
      const file = files.get(reference);
      if (!file) throw new Error('The selected file is no longer available');
      return { name: file.name, data: new Uint8Array(await file.arrayBuffer()) };
    },
    onOpenFile() {},
    setTextureState() {},
    thumbnailReady() {},
    onTextureMode() {},
  };
}

export const isAndroid = Capacitor.getPlatform() === 'android';
export const schematicBridge: SchematicBridge = window.schematic
  ?? (isAndroid ? androidBridge : browserBridge());
