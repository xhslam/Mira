export interface VaultStorage {
  read(path: string): Promise<string | null>;
  write(path: string, contents: string): Promise<void>;
  move(from: string, to: string): Promise<void>;
  remove(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
}
