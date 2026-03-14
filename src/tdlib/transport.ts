import { CString, type Pointer } from "bun:ffi";
import { loadTdjsonLibrary } from "./ffi";

export interface TdTransport {
  send(requestJson: string): void;
  receive(timeoutSeconds: number): string | null;
  execute(requestJson: string): string | null;
  destroy(): void;
}

export class FfiTdTransport implements TdTransport {
  readonly libraryPath: string;
  private readonly client: Pointer;
  private readonly symbols: ReturnType<typeof loadTdjsonLibrary>["lib"]["symbols"];
  private readonly closeLibrary: () => void;

  constructor(explicitPath?: string) {
    const { libraryPath, lib } = loadTdjsonLibrary(explicitPath);
    this.libraryPath = libraryPath;
    this.symbols = lib.symbols;
    this.closeLibrary = lib.close;
    this.symbols.td_set_log_verbosity_level(0);
    const client = this.symbols.td_json_client_create();
    if (!client) {
      throw new Error("Failed to create TDLib client");
    }
    this.client = client;
  }

  send(requestJson: string) {
    this.symbols.td_json_client_send(this.client, toCString(requestJson));
  }

  receive(timeoutSeconds: number) {
    const raw = this.symbols.td_json_client_receive(this.client, timeoutSeconds);
    if (!raw) {
      return null;
    }
    return String(new CString(raw));
  }

  execute(requestJson: string) {
    const raw = this.symbols.td_json_client_execute(this.client, toCString(requestJson));
    if (!raw) {
      return null;
    }
    return String(new CString(raw));
  }

  destroy() {
    this.symbols.td_json_client_destroy(this.client);
    this.closeLibrary();
  }
}

function toCString(value: string) {
  return Buffer.from(`${value}\0`);
}
