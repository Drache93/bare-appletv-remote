import { Discovery, DiscoveryOptions } from 'bare-mdns-discovery'

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

export type AppleTVDiscoveryOptions = Omit<DiscoveryOptions, 'service'>

export declare class AppleTVDiscovery extends Discovery {
  constructor(opts?: AppleTVDiscoveryOptions)

  discover(opts?: { first?: boolean; timeout?: number }): Promise<AppleTVDevice[]>

  on(event: 'service', listener: (device: AppleTVDevice) => void): this
  on(event: 'records', listener: (...args: any[]) => void): this
  on(event: 'error', listener: (err: Error) => void): this
  on(event: 'ready', listener: () => void): this
  on(event: 'close', listener: () => void): this
}

export default AppleTVDiscovery
