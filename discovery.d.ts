import { MDNSOptions } from 'bare-mdns-discovery'

export interface AppleTVTxt {
  rpMac?: string
  rpHN?: string
  rpFl?: string
  rpHA?: string
  rpMd?: string
  rpVr?: string
  rpAD?: string
  rpHI?: string
  rpBA?: string
  rpMRtID?: string
  [key: string]: string | boolean | undefined
}

export interface AppleTVDevice {
  uid: string
  name: string
  address: string
  port: number
  model: string
  version: string
  txt: AppleTVTxt
}

export type AppleTVDiscoveryOptions = Omit<MDNSOptions, 'service'>

export declare class AppleTVDiscovery {
  constructor(opts?: AppleTVDiscoveryOptions)

  debug: boolean
  iface: string | null
  services: Map<string, AppleTVDevice>

  ready(): Promise<void>
  close(): Promise<void>
  query(name: string, type?: number): void

  discover(opts?: { first?: boolean; timeout?: number }): Promise<AppleTVDevice[]>

  on(event: 'service', listener: (device: AppleTVDevice) => void): this
  on(event: 'records', listener: (...args: any[]) => void): this
  on(event: 'error', listener: (err: Error) => void): this
  on(event: 'ready', listener: () => void): this
  on(event: 'close', listener: () => void): this

  once(event: 'service', listener: (device: AppleTVDevice) => void): this
  once(event: string, listener: (...args: any[]) => void): this
}

export default AppleTVDiscovery
