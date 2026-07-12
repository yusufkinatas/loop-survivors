import type { Kit, Role } from '../audio/kits';
import type { MusicEngine } from '../audio/engine';
import type { DevRoom } from './lifecycle';

export type RoomKind = 'gym' | 'zoo' | 'museum' | 'archive';
export type ContentStatus = 'CURRENT' | 'EXPERIMENTAL' | 'DORMANT' | 'PARKED' | 'REMOVED' | 'HISTORICAL';

export interface DevContext {
  readonly engine: MusicEngine;
  readonly kits: ReadonlyMap<Role, Kit>;
}

export interface RoomRegistration {
  readonly id: string;
  readonly kind: RoomKind;
  readonly title: string;
  readonly description: string;
  readonly status: ContentStatus;
  readonly tags: readonly string[];
  create(context: DevContext): DevRoom;
}

const rooms: RoomRegistration[] = [];

export function registerRoom(room: RoomRegistration): void {
  if (rooms.some((entry) => entry.id === room.id)) throw new Error(`duplicate dev room: ${room.id}`);
  rooms.push(room);
}

export function registeredRooms(): readonly RoomRegistration[] {
  return rooms;
}

export function roomPath(room: Pick<RoomRegistration, 'kind' | 'id'>): string {
  return `#dev/${room.kind}/${room.id}`;
}

export function roomFromHash(hash: string): RoomRegistration | undefined {
  const match = /^#dev\/(gym|zoo|museum|archive)\/([^?]+)/.exec(hash);
  return match ? rooms.find((room) => room.kind === match[1] && room.id === match[2]) : undefined;
}
