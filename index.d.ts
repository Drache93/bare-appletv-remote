import { EventEmitter } from 'events'

export interface Device {
  uid: string
  name: string
  address: string
  port: number
  model: string
  version: string
  txt: Record<string, string>
}

export interface Credentials {
  clientId: string
  ltsk: string
  ltpk: string
  serverId: string
  serverLtpk: string
  name: string
  address: string
  port: number
  model: string
  mac: string | null
}

export interface AppleTVRemoteOptions {
  /** Called with no arguments when a PIN is displayed on the Apple TV screen. Must return the PIN string. */
  onpin?: () => Promise<string> | string
  /** Bypass disk and pass credentials directly. */
  credentials?: Credentials
  /** Override the default credentials file path (~/.appletv-credentials.json). */
  credentialsFile?: string
  debug?: boolean
}

export interface ScanOptions {
  debug?: boolean
  first?: boolean
}

export interface PairOptions {
  debug?: boolean
}

export declare class AppleTVRemote extends EventEmitter {
  name: string | null
  address: string | null
  port: number | null
  mac: string | null
  debug: boolean

  opening: Promise<void> | null
  closing: Promise<void> | null
  opened: boolean
  closed: boolean

  constructor(opts?: AppleTVRemoteOptions)

  /** Resolves once connected and credentials are loaded or obtained via pairing. */
  ready(): Promise<void>
  close(): Promise<void>

  /** Put the Apple TV to sleep. */
  sleep(): Promise<void>
  /** Wake the Apple TV via Wake-on-LAN. */
  wake(): Promise<void>

  /** Emitted after a successful first-time pairing and credential save. */
  on(event: 'paired', listener: (credentials: Credentials) => void): this
  on(event: 'ready', listener: () => void): this
  on(event: 'close', listener: () => void): this
  on(event: string, listener: (...args: any[]) => void): this

  /** Scan the local network for Apple TVs. */
  static scan(opts?: ScanOptions): Promise<Device[]>
  /** Pair with a specific device. Returns credentials to pass to the constructor. */
  static pair(
    device: Device,
    getPinFn: () => Promise<string> | string,
    opts?: PairOptions
  ): Promise<Credentials>
}

export default AppleTVRemote
