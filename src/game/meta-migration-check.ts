import assert from 'node:assert/strict';
import {
  LEGACY_META_SAVE_KEY,
  LEGACY_META_V1_SAVE_KEY,
  META_SAVE_KEY,
  MetaStore,
  SHOP_OFFERS,
} from './meta';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

function parsedSave(storage: Storage): Record<string, unknown> {
  const saved = storage.getItem(META_SAVE_KEY);
  assert.ok(saved, 'migration should persist a v3 save');
  return JSON.parse(saved) as Record<string, unknown>;
}

function checkV2Migration(): void {
  const storage = new MemoryStorage();
  storage.setItem(LEGACY_META_SAVE_KEY, JSON.stringify({
    version: 2,
    notes: 100,
    lifetimeNotes: 1_000,
    runs: 4,
    bestTimeS: 500,
    lifetimeKills: 100,
    lifetimeHeadliners: 3,
    purchases: [
      'heavyAmp', 'metro', 'clap', 'basement', 'arp', 'dawn',
      'secondWind', 'startItem', 'gold', 'metro', 'bogus',
    ],
    unlockedWeapons: ['kick', 'clap', 'arp'],
    unlockedItems: ['highTops', 'heavyAmp'],
    unlockedVenues: ['alley', 'metro', 'basement', 'dawn'],
    rerolls: 0,
    secondWind: true,
    startItem: 'heavyAmp',
    milestones: ['first5m', 'fullBand', 'retiredMilestoneA', 'retiredMilestoneB'],
    mastery: { clap: { damage: 123, kills: 4, evolutions: 1 } },
    seen: ['venue:alley', 'venue:dawn'],
  }));

  const store = new MetaStore(storage);
  assert.equal(store.state.version, 3);
  assert.equal(store.state.notes, 570, 'each removed purchase should be refunded once');
  assert.equal(store.state.lifetimeNotes, 1_000);
  assert.deepEqual(store.state.purchases, [
    'heavyAmp', 'clap', 'arp', 'secondWind', 'startItem', 'gold',
  ]);
  assert.deepEqual(store.state.milestones, ['first5m', 'fullBand']);
  assert.deepEqual(store.state.mastery.clap, { damage: 123, kills: 4, evolutions: 1 });
  assert.equal(store.state.lifetimeHeadliners, 3);
  assert.equal(store.state.secondWind, true);
  assert.equal(store.state.startItem, 'heavyAmp');
  assert.equal(store.hasGoldPalette(), true);
  assert.equal(store.unlockedRoles().has('clap'), true);
  assert.equal(store.unlockedRoles().has('arp'), true);
  assert.equal(store.unlockedItemIds().has('heavyAmp'), true);

  const migrated = parsedSave(storage);
  assert.equal(migrated.version, 3);
  const serialized = JSON.stringify(migrated);
  for (const removed of [
    'unlockedVenues', 'seen', 'metro', 'basement', 'dawn',
    'retiredMilestoneA', 'retiredMilestoneB',
  ]) {
    assert.equal(serialized.includes(removed), false, `v3 save still contains ${removed}`);
  }

  const reopened = new MetaStore(storage);
  assert.equal(reopened.state.notes, 570, 'v3 must take precedence and prevent a second refund');

  const settlement = reopened.settleRun({
    timeS: 12,
    kills: 2,
    notesCollected: 3,
    headlinersKilled: 1,
    evolutionsMade: 1,
    milestones: ['hitlessHeadliner'],
    damageByRole: { clap: 20 },
    killsByRole: { clap: 1 },
    evolutionsByRole: { clap: 1 },
  });
  assert.equal(settlement.notesEarned, 3);
  assert.equal(settlement.walletAfter, 573);
  assert.equal(settlement.state.lifetimeHeadliners, 4);
  assert.deepEqual(settlement.newMilestones, ['hitlessHeadliner']);
  assert.equal('newVenues' in settlement, false);
  assert.deepEqual(settlement.state.mastery.clap, { damage: 143, kills: 5, evolutions: 2 });
}

function checkV1Migration(): void {
  const storage = new MemoryStorage();
  storage.setItem(LEGACY_META_V1_SAVE_KEY, JSON.stringify({
    version: 1,
    reputation: 4_000,
    runs: 2,
    bestTimeS: 300,
    lifetimeKills: 50,
    lifetimeHeadliners: 1,
    unlockedWeapons: ['kick', 'clap', 'arp'],
    unlockedItems: ['highTops', 'heavyAmp', 'recoveryTape'],
    unlockedVenues: ['metro', 'dawn'],
    rerolls: 2,
    secondWind: true,
    startItem: 'heavyAmp',
    milestones: ['first5m', 'retiredMilestoneA'],
  }));

  const store = new MetaStore(storage);
  assert.equal(store.state.notes, 1_330);
  assert.equal(store.state.lifetimeNotes, 1_330);
  assert.deepEqual(store.state.purchases, [
    'heavyAmp', 'recoveryTape', 'clap', 'arp',
    'reroll1', 'reroll2', 'secondWind', 'startItem', 'gold',
  ]);
  assert.equal(store.state.rerolls, 2);
  assert.equal(store.state.secondWind, true);
  assert.equal(store.state.startItem, 'heavyAmp');
  assert.deepEqual(store.state.milestones, ['first5m']);
  assert.equal(parsedSave(storage).version, 3);
}

function checkNativeV3CannotMintRefunds(): void {
  const storage = new MemoryStorage();
  storage.setItem(META_SAVE_KEY, JSON.stringify({
    version: 3,
    notes: 25,
    lifetimeNotes: 25,
    purchases: ['clap', 'metro', 'basement', 'dawn'],
    unlockedVenues: ['metro', 'basement', 'dawn'],
  }));
  const store = new MetaStore(storage);
  assert.equal(store.state.notes, 25);
  assert.deepEqual(store.state.purchases, ['clap']);
  assert.equal('unlockedVenues' in store.state, false);
  assert.equal('seen' in store.state, false);
}

function checkRetunedShop(): void {
  assert.equal(SHOP_OFFERS.length, 15);
  assert.equal(SHOP_OFFERS.some((offer) => (offer.kind as string) === 'venue'), false);
  assert.equal(SHOP_OFFERS.some((offer) => ['metro', 'basement', 'dawn'].includes(offer.id as string)), false);

  const minOwned = Object.fromEntries(SHOP_OFFERS.map((offer) => [offer.id, offer.minOwned]));
  assert.equal(minOwned.lead, 4);
  assert.equal(minOwned.extensionCable, 4);
  assert.equal(minOwned.paddedJacket, 4);
  assert.equal(minOwned.bell, 6);
  assert.equal(minOwned.magnetLanyard, 6);
  assert.equal(minOwned.secondWind, 6);
  assert.equal(minOwned.startItem, 6);
  assert.equal(minOwned.reroll2, 10);
  assert.equal(minOwned.gold, 10);
}

checkV2Migration();
checkV1Migration();
checkNativeV3CannotMintRefunds();
checkRetunedShop();

console.log('meta migration checks passed');
