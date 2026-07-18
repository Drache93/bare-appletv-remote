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
  /** Skip mDNS discovery and connect directly to this host. */
  host?: string
  /** Port to use when host is set (defaults to 49152). */
  port?: number
  /** Milliseconds of inactivity before the session is auto-closed. Defaults to 0 (never). */
  idleTimeout?: number
  debug?: boolean
}

export interface SwipeOptions {
  /** Number of intermediate move steps. Default 8. */
  steps?: number
  /** Total swipe distance on the 0–1000 touchpad surface, centered. Default 1000 (edge to edge). */
  distance?: number
  /** Delay in ms between each step. Default 18. */
  stepDelay?: number
}

export interface ScanOptions {
  debug?: boolean
  first?: boolean
}

export interface PairOptions {
  debug?: boolean
  /** Re-pair with an existing identity so the Apple TV replaces the old pairing record instead of adding a new peer. */
  identity?: Pick<Credentials, 'clientId' | 'ltsk' | 'ltpk'>
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

  /** Resolves once credentials are loaded or obtained via pairing. The session itself opens lazily on the first command. */
  ready(): Promise<void>
  close(): Promise<void>

  /**
   * Explicitly re-pair with the Apple TV, reusing the existing identity so the
   * ATV replaces the old pairing record. Prompts via onpin. Call this when a
   * command rejects with error code 'EREVOKED'.
   */
  repair(): Promise<void>

  /** Put the Apple TV to sleep. */
  sleep(): Promise<void>
  /** Toggle play/pause. */
  playPause(): Promise<void>
  /** Press the back/menu button. */
  back(): Promise<void>
  /** Increase volume by one step. */
  volumeUp(): Promise<void>
  /** Decrease volume by one step. */
  volumeDown(): Promise<void>
  /** Navigate up. */
  up(): Promise<void>
  /** Navigate down. */
  down(): Promise<void>
  /** Navigate left. */
  left(): Promise<void>
  /** Navigate right. */
  right(): Promise<void>
  /** Select / click the focused item. */
  click(): Promise<void>
  /** Press the menu button (same physical key as back on most remotes). */
  menu(): Promise<void>
  /** Send a touch-begin event at (x, y) on the 0–1000 touchpad surface. */
  touchBegin(x: number, y: number): Promise<void>
  /** Send a touch-move event at (x, y). */
  touchMove(x: number, y: number): Promise<void>
  /** Send a touch-end event at (x, y). */
  touchEnd(x: number, y: number): Promise<void>
  /** Simulate a swipe gesture across the virtual touchpad. */
  swipe(direction: 'up' | 'down' | 'left' | 'right', opts?: SwipeOptions): Promise<void>
  /** Wake the Apple TV via Wake-on-LAN (requires MAC address in credentials). */
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
