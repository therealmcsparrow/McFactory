// The shared office state OS that every maker in src/office receives (see index.ts for the pattern).
//
// Each maker is typed by what exists when it runs: the shared values, the hand-typed late references below, and
// the merged returns of the makers before it (OSAt*). The full OfficeState is the chain after the last maker.
// The chain is acyclic because a maker's parameter type only names earlier makers; members a maker reads from a
// LATER maker at call time (OS.bldgs, OS.walkIn ...) are typed by hand in OfficeLate, never derived.
import type * as THREE from 'three';
import type { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import type { SceneCtx, Agent, P2 } from '../common/types.js';
import type { RoadNet, Ring, Office, Pov, Person, SportsCar, LaneSample, PoliceState, WalkPt, RobState } from './types.js';
import type { makeLayout } from './layout.js';
import type { makeSeats } from './seats.js';
import type { makeProps } from './props.js';
import type { makeBank, makeBankStock } from './buildings/bank.js';
import type { makePoliceStation } from './buildings/police-station.js';
import type { makeOffices } from './buildings/offices.js';
import type { makeRoads } from './roads.js';
import type { makeTraffic } from './vehicles/traffic.js';
import type { makeSportsCars } from './vehicles/sports-car.js';
import type { makePeople } from './people.js';
import type { makePackets } from './packets.js';
import type { makeArmouredCars, makeDispatch } from './vehicles/armoured-car.js';
import type { makeFolk } from './folk.js';
import type { makePolice } from './police.js';
import type { makeRobbery } from './robbery.js';
import type { makeSync } from './sync.js';
import type { makeFrame } from './frame.js';
import type { makeFocus } from './focus.js';
import type { Bubbles } from './bubbles.js';
import type { HomeTrip } from './homes.js';
import type { Crossings } from './crossings.js';

/** What main.ts hands the office scene besides the stage context. */
export interface OfficeKit { frustum: number }

export type { RoadNet };

/** Values more than one part reassigns; they live on OS so every part sees the current value. */
export interface SharedOfficeState {
  ctx: SceneCtx; kit: OfficeKit;
  stackN: number; stackShown: number; moreLab: CSS2DObject | null;
  focusF: Office | null; markedTask: string | null; pov: Pov | null;
  net: RoadNet; pForced: number; lastFrame: number; // performance.now() of the last frame (people.ts leave: no frames = hidden)
  simT: number; tMin: number; tMinAt: (string | number)[][] | null; // tMin/tMinAt: the closest two vehicles came, and where (probe traffic())
}

/** Members a maker reads at call time from a maker that runs after it. Hand-typed to keep the chain acyclic. */
export interface OfficeLate {
  INX: number; OGX: number; OGZ: number; // people, read by seats
  bldgs: Map<string, Office>; // offices, read by bank
  dropPerson: (P: Person) => void; dropCar: (c: SportsCar) => void; // people / sports cars, read by offices
  ringAt: (x: number, z: number) => Ring | null; samples: () => LaneSample[]; adiff: (a: number, b: number) => number; // traffic / police, read by roads
  pol: PoliceState; pub: (x: number, z: number) => boolean; // police, read by traffic
  walkIn: (P: Person, sx: number | null) => WalkPt[]; // people, read by sports cars
  povMark: (a: Agent | null | undefined | false) => void; // focus, read by people
  emit: (F: Office, zone: string | null | undefined, x: number | null | undefined, c: THREE.Color, delay: number, deco?: boolean) => void; // packets, read by people
  rob: RobState; // robbery, read by police
  bubbles?: Bubbles; // the one set of speech bubbles (bubbles.ts), made in index.ts after the makers, read by robbery (and traffic stops) at call time
  homeTrip?: (c: SportsCar) => HomeTrip | null; homeStay?: (c: SportsCar) => void; // finished agents going home (homes.ts), made in index.ts after the makers, read by sports cars at call time
  zeb?: Crossings; // who gives way at the zebras (crossings.ts), made in index.ts after the makers, read by traffic and the dog walkers at call time
  feet?: () => number[]; // the dog walkers and their dogs on the go, as x, z pairs (dogs.ts), set in index.ts, read by traffic: nobody drives into one
}

type Base = SharedOfficeState & OfficeLate;
export type OSAtLayout = Base;
export type OSAtSeats = OSAtLayout & ReturnType<typeof makeLayout>;
export type OSAtProps = OSAtSeats & ReturnType<typeof makeSeats>;
export type OSAtBank = OSAtProps & ReturnType<typeof makeProps>;
export type OSAtPoliceStation = OSAtBank & ReturnType<typeof makeBank>;
export type OSAtBankStock = OSAtPoliceStation & ReturnType<typeof makePoliceStation>;
export type OSAtOffices = OSAtBankStock & ReturnType<typeof makeBankStock>;
export type OSAtRoads = OSAtOffices & ReturnType<typeof makeOffices>;
export type OSAtTraffic = OSAtRoads & ReturnType<typeof makeRoads>;
export type OSAtSportsCars = OSAtTraffic & ReturnType<typeof makeTraffic>;
export type OSAtPeople = OSAtSportsCars & ReturnType<typeof makeSportsCars>;
export type OSAtPackets = OSAtPeople & ReturnType<typeof makePeople>;
export type OSAtArmouredCars = OSAtPackets & ReturnType<typeof makePackets>;
export type OSAtDispatch = OSAtArmouredCars & ReturnType<typeof makeArmouredCars>;
export type OSAtFolk = OSAtDispatch & ReturnType<typeof makeDispatch>;
export type OSAtPolice = OSAtFolk & ReturnType<typeof makeFolk>;
export type OSAtRobbery = OSAtPolice & ReturnType<typeof makePolice>;
export type OSAtSync = OSAtRobbery & ReturnType<typeof makeRobbery>;
export type OSAtFrame = OSAtSync & ReturnType<typeof makeSync>;
export type OSAtFocus = OSAtFrame & ReturnType<typeof makeFrame>;
export type OfficeState = OSAtFocus & ReturnType<typeof makeFocus>;
