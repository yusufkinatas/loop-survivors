import type { Kit, Role } from '../audio/kits';
import type { MusicEngine } from '../audio/engine';
import type { DevFixture } from './fixture';
import type { RoomSession } from './lifecycle';

export type DevRoomKind = 'gym' | 'zoo' | 'museum' | 'archive';
export type DevStatus =
  | 'CURRENT'
  | 'EXPERIMENTAL'
  | 'DORMANT'
  | 'PARKED'
  | 'REMOVED'
  | 'HISTORICAL';

export type RoomAdapter =
  | 'world'
  | 'picks'
  | 'music'
  | 'determinism'
  | 'ui'
  | 'input'
  | 'bot'
  | 'catalog'
  | 'museum'
  | 'boss-hazard'
  | 'legacy-frame'
  | 'parked'
  | 'health';

export interface RoomPreset {
  id: string;
  label: string;
  description: string;
  values?: Record<string, string>;
}

export interface DevRoomDefinition {
  issue: number;
  slug: string;
  kind: DevRoomKind;
  status: DevStatus;
  title: string;
  purpose: string;
  systems: readonly string[];
  keywords: readonly string[];
  adapter: RoomAdapter;
  presets: readonly RoomPreset[];
  blockers?: readonly number[];
  statusNote?: string;
  sourceLinks?: readonly { label: string; path: string }[];
}

export interface RoomCapabilities {
  play?: boolean;
  step?: boolean;
  speed?: boolean;
  audio?: boolean;
  overlays?: boolean;
  reroll?: boolean;
}

export interface DevRoomSession extends RoomSession<DevFixture> {
  readonly capabilities: RoomCapabilities;
  setPlaying?(playing: boolean): void;
  step?(): void;
  setSpeed?(speed: number): void;
  setAudio?(audio: boolean): void;
  setOverlays?(overlays: boolean): void;
  reroll?(): void;
}

export interface RoomMountContext {
  root: HTMLElement;
  audioContext: AudioContext;
  kits: Map<Role, Kit>;
  fixture: DevFixture;
  room: DevRoomDefinition;
  createEngine(): MusicEngine;
  navigate(room: DevRoomDefinition, fixture?: Partial<DevFixture>): void;
}

export type RoomMount = (context: RoomMountContext) => Promise<DevRoomSession>;

export const STATUS_ORDER: readonly DevStatus[] = [
  'CURRENT',
  'EXPERIMENTAL',
  'DORMANT',
  'HISTORICAL',
  'PARKED',
  'REMOVED',
];

export function roomPath(room: DevRoomDefinition): string {
  return `#dev/${room.kind}/${room.slug}`;
}
