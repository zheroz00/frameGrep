/**
 * FPV move dictionary — single source of truth for FPV maneuver vocabulary
 * used in clip-identification prompts.
 *
 * Definitions are sourced from FPV community references (Rotor Riot Tricktionary,
 * WREKD Master List, WikiFPV, FPV TOGO) and reviewed against pilot usage.
 * See docs/fpv-move-research.md for full source citations per move.
 *
 * This file is intentionally data-heavy (>300 lines). Same exception as
 * defaultPresets.ts — it is prompt content, not logic.
 */

export type FpvMoveCategory =
  | 'rotation'   // pitch/roll/yaw rotations: loops, rolls, flips, spins
  | 'orbital'    // circular flight around a fixed object
  | 'gap'        // gap-flying and threading
  | 'proximity'  // close-to-surface flying
  | 'combo'      // multi-axis or chained tricks
  | 'vertical'   // dramatic vertical changes: dive, punch, stall
  | 'hover';     // static orientation holds

export type FpvMoveDifficulty = 'basic' | 'intermediate' | 'advanced';

export interface FpvMove {
  id: string;
  name: string;
  aliases: string[];
  category: FpvMoveCategory;
  difficulty: FpvMoveDifficulty;
  /** One-to-two sentence canonical definition, model-facing. */
  definition: string;
  /** Per-frame observable patterns from the FPV camera POV. */
  visualSignals: string[];
  /** Motor / wind / impact cues. */
  audioSignals: string[];
  /** Common confusions: short notes distinguishing this move from similar ones. */
  distinguishFrom?: string[];
}

export const FPV_MOVES: FpvMove[] = [
  // ============================================================
  // ROTATIONS — pitch / roll / yaw axis maneuvers
  // ============================================================
  {
    id: 'power_loop',
    name: 'Power Loop',
    aliases: ['Forward Loop', 'Inside Loop', 'Backflip Loop'],
    category: 'rotation',
    difficulty: 'intermediate',
    definition:
      'A vertical 360° loop where the drone pitches nose-up at speed and arcs over the top through the inverted point, recovering nose-down to the original heading. Throttle is sustained through the maneuver to maintain altitude.',
    visualSignals: [
      'Ground recedes as nose pitches up and sky enters frame',
      'At apex, sky fills screen and rotates to inverted; brief glimpse of horizon overhead',
      'Ground re-enters bottom of frame during recovery arc',
      'Horizon line rotates full 360° around the pitch axis',
    ],
    audioSignals: [
      'Throttle sustained through the loop, not zeroed at apex',
      'Motor pitch rises on entry, steady through inverted portion, pulses on recovery',
    ],
    distinguishFrom: [
      'MATTY FLIP — pitches nose-DOWN first, arc goes downward',
      'SPLIT-S — half-loop combined with a roll, ends opposite heading',
      'FLIP — simpler pitch rotation without the wide arc',
    ],
  },
  {
    id: 'matty_flip',
    name: 'Matty Flip',
    aliases: ['Reverse Power Loop', 'MattyStuntz Flip'],
    category: 'rotation',
    difficulty: 'advanced',
    definition:
      'A reverse power loop: the drone pitches nose-down aggressively, arcs underneath through the inverted point, and recovers backward of the starting point. Named after Canadian pilot Matt "MattyStuntz" Sherwood.',
    visualSignals: [
      'Nose pitches sharply DOWN; ground rushes up and fills screen',
      'Drone passes through inverted with sky overhead as it arcs backward',
      'Recovery exits below and behind the start position; camera re-orients to forward',
      'Characteristic "look-back" moment as the drone reverses direction',
    ],
    audioSignals: [
      'Aggressive throttle burst on entry for forward-then-reverse momentum',
      'Sustained motor pitch through the inverted portion (no stall dropoff)',
      'Distinctive backward-thrust signature as motors fight the direction change',
    ],
    distinguishFrom: [
      'POWER LOOP — pitches UP first, arc goes upward and forward',
      'SPLIT-S — has a half-roll component; does not recover behind starting point',
    ],
  },
  {
    id: 'split_s',
    name: 'Split-S',
    aliases: ['Split-S Maneuver', 'Half-Roll Half-Loop'],
    category: 'rotation',
    difficulty: 'intermediate',
    definition:
      'A reversal maneuver: half-roll to inverted, then pitch through a descending half-loop to exit level and facing the opposite direction. Borrowed from manned aerobatics.',
    visualSignals: [
      'Horizon rotates 180° around the roll axis as the drone inverts',
      'Sky fills screen at the inverted point',
      'Nose pitches down through a descending arc; ground re-enters from the top',
      'Exit is level but facing opposite the entry direction; altitude is lower than entry',
    ],
    audioSignals: [
      'Steady throttle through the roll to prevent stalling',
      'Motor pitch lowers slightly through the descending arc as gravity assists',
    ],
    distinguishFrom: [
      'IMMELMANN — opposite sequence: climbs and ends with a half-roll',
      'POWER LOOP — full circle, no roll, recovers on original heading',
      'ROLL — no pitch component; maintains altitude and direction',
    ],
  },
  {
    id: 'immelmann',
    name: 'Immelmann',
    aliases: ['Immelmann Turn', 'Roll-off-the-Top'],
    category: 'rotation',
    difficulty: 'intermediate',
    definition:
      'A climbing reversal: pull through a half-loop to inverted at altitude, then half-roll upright to exit level in the opposite direction at a higher altitude. Named after German WWI ace Max Immelmann.',
    visualSignals: [
      'Nose pitches up steeply; sky fills screen',
      'Drone reaches inverted at the top of the half-loop; ground appears briefly overhead',
      'Immediate 180° roll rights the drone level',
      'Exit is level, reversed heading, noticeably higher altitude than entry',
    ],
    audioSignals: [
      'Sustained high throttle through the climb (fighting gravity)',
      'Throttle eases through the inverted apex (reduced load at top)',
      'Smooth re-engagement during the roll-out',
    ],
    distinguishFrom: [
      'SPLIT-S — descends instead of climbs; opposite sequence',
      'POWER LOOP — full loop, no roll, same heading on exit',
    ],
  },
  {
    id: 'roll',
    name: 'Roll',
    aliases: ['Axial Roll', '360 Roll', 'Level Roll'],
    category: 'rotation',
    difficulty: 'basic',
    definition:
      'A 360° rotation around the longitudinal (roll) axis while maintaining forward flight. Nose stays pointed in the same direction; the airframe rotates around the flight path.',
    visualSignals: [
      'Horizon spins around screen center like a clock hand',
      'Sky and ground trade places once at the 180° point',
      'Scenery continues advancing forward; no pitch or yaw change',
    ],
    audioSignals: [
      'Steady throttle throughout',
      'Consistent motor pitch — no altitude loss',
    ],
    distinguishFrom: [
      'BARREL ROLL — uses forward power for a helical/spiral path',
      'YAW SPIN — rotates on vertical axis instead',
      'FLIP — rotation around the pitch axis instead of roll axis',
    ],
  },
  {
    id: 'barrel_roll',
    name: 'Barrel Roll',
    aliases: ['Powered Roll', 'Spiral Roll', 'Corkscrew Roll'],
    category: 'rotation',
    difficulty: 'intermediate',
    definition:
      'A 360° roll combined with forward momentum and power, creating a helical corkscrew flight path through the air rather than rotation in place.',
    visualSignals: [
      'Horizon rotates around screen center while scenery continues to advance',
      'Spiral visual effect from combined rotation + translation',
      'Scenery traces a diagonal/helical path relative to forward motion',
    ],
    audioSignals: [
      'High sustained throttle to maintain power through the rotation',
      'Elevated motor pitch held constant; wind noise from forward velocity',
    ],
    distinguishFrom: [
      'ROLL — no forward power component; rotates in place',
      'POWER LOOP — vertical circle instead of spiral path',
    ],
  },
  {
    id: 'flip',
    name: 'Flip',
    aliases: ['Forward Flip', 'Back Flip', 'Pitch Flip'],
    category: 'rotation',
    difficulty: 'basic',
    definition:
      'A fast 180° or 360° rotation around the pitch axis. Forward flip pitches nose-down; back flip pitches nose-up. Distinguished from a power loop by speed and lack of a wide arc.',
    visualSignals: [
      'Forward flip: ground rapidly approaches and fills screen, then sky re-enters',
      'Back flip: sky rapidly fills screen, then ground re-enters',
      'Rapid 180-360° rotation around the pitch axis; minimal forward travel',
    ],
    audioSignals: [
      'Aggressive rapid throttle application initiating the flip',
      'High motor pitch during execution; wind noise rises with rotation speed',
    ],
    distinguishFrom: [
      'POWER LOOP — wide forward arc through full circle',
      'ROLL — rotation around the roll axis instead of pitch',
    ],
  },
  {
    id: 'yaw_spin',
    name: 'Yaw Spin',
    aliases: ['Yaw Rotation', 'Helicopter Spin', 'Stationary Spin'],
    category: 'rotation',
    difficulty: 'basic',
    definition:
      'A 360° rotation around the vertical (yaw) axis while hovering or flying forward. Camera perspective stays static while the world rotates around it.',
    visualSignals: [
      'Scenery rotates around screen center as the drone yaws',
      'Horizon line rotates a full 360° relative to a fixed camera orientation',
      'Hovering variant: minimal altitude change; forward variant: creates a circular path',
    ],
    audioSignals: [
      'Steady throttle (hover-level or forward-flight level)',
      'Consistent motor pitch — fixed altitude',
    ],
    distinguishFrom: [
      'ROLL — rotation around the roll axis instead',
      'ORBIT — circular flight around a fixed external object',
    ],
  },

  // ============================================================
  // ORBITAL — circular flight around objects
  // ============================================================
  {
    id: 'orbit',
    name: 'Orbit',
    aliases: ['Object Circle', '360 Circle'],
    category: 'orbital',
    difficulty: 'intermediate',
    definition:
      'A circular flight pattern around a stationary object, keeping the object centered in the camera view through 360° of travel.',
    visualSignals: [
      'Subject stays centered or near-center of frame throughout',
      'Surrounding scenery rotates around the subject as the drone circles',
      'Horizon tilts as the drone banks into the circular path',
      'Subject size remains relatively constant (consistent radius)',
    ],
    audioSignals: [
      'Sustained steady throttle maintaining altitude through the bank',
      'Smooth motor engagement; no pulsing or correction bursts',
    ],
    distinguishFrom: [
      'INVERTED ORBIT — same pattern but executed upside-down',
      'YAW SPIN — rotates in place; no external focal object',
    ],
  },
  {
    id: 'inverted_orbit',
    name: 'Inverted Orbit',
    aliases: ['Trippy Spin', 'Cyclone', 'Upside-Down Orbit'],
    category: 'orbital',
    difficulty: 'advanced',
    definition:
      'A 360° circular flight around a stationary object while the drone remains completely inverted. Requires elevated throttle to maintain altitude while upside-down.',
    visualSignals: [
      'Subject remains centered while the camera points downward from inverted orientation',
      'Sky fills the screen where ground normally appears',
      'Surrounding scenery appears inverted and rotates around the subject',
      'Disorienting visual where "up" and "down" feel reversed',
    ],
    audioSignals: [
      'Elevated throttle compared to a normal orbit (fighting gravity while inverted)',
      'Motor pitch consistently high throughout',
    ],
    distinguishFrom: [
      'ORBIT — same pattern, upright orientation',
      'INVERTED HOVER — no circular motion; static position',
    ],
  },

  // ============================================================
  // GAP — gap-flying and threading
  // ============================================================
  {
    id: 'gap_hit',
    name: 'Gap Hit',
    aliases: ['Gap Flying', 'Threading', 'Gap Pass', 'Micro Gap (tight variant)'],
    category: 'gap',
    difficulty: 'intermediate',
    definition:
      'Flying through a gap between obstacles (trees, poles, structures) with precise alignment. Difficulty scales with gap width — wide openings are beginner-level; "micro gaps" with inches of clearance are advanced.',
    visualSignals: [
      'Obstacle edges frame the sides of the screen, narrowing as the drone approaches',
      'Gap or opening stays centered in viewfinder during approach',
      'Edges sweep past screen edges as the drone passes through',
      'Post-gap frame opens to clear space beyond the obstacle',
      'Micro-gap variant: very little lateral margin visible; obstacles nearly clip frame edges',
    ],
    audioSignals: [
      'Steady throttle on approach; minimal correction bursts',
      'Wind noise may increase from close proximity to obstacle surfaces',
    ],
    distinguishFrom: [
      'KNIFE EDGE — specifically uses a 90° roll to fit through a tall narrow gap',
      'PROXIMITY PASS — emphasizes close-to-surface flying without a defined gap to thread',
    ],
  },
  {
    id: 'knife_edge',
    name: 'Knife Edge',
    aliases: ['Knife Edge Gap', 'Sideways Pass'],
    category: 'gap',
    difficulty: 'advanced',
    definition:
      'A 90° roll held briefly to fly the drone sideways through a tall narrow gap (between two close vertical surfaces). The drone presents its side profile rather than its front.',
    visualSignals: [
      'Horizon rotates 90° as the drone rolls to sideways orientation',
      'Camera view tilts — sky on one side, ground on the other',
      'Gap or wall edges appear as vertical bands in the camera view',
      'Recovery rolls back 90° to level flight',
    ],
    audioSignals: [
      'Steady, even motor pitch during the sustained roll hold',
      'Slightly elevated throttle to maintain altitude while tilted',
    ],
    distinguishFrom: [
      'ROLL — continuous rotation, not held at 90°',
      'GAP HIT — flat through a wide-enough opening, no roll required',
    ],
  },

  // ============================================================
  // PROXIMITY — close-to-surface flying
  // ============================================================
  {
    id: 'proximity_pass',
    name: 'Proximity Pass',
    aliases: ['Proximity Flying', 'Proximity Threading', 'Close Pass'],
    category: 'proximity',
    difficulty: 'advanced',
    definition:
      'Flying extremely close to obstacles or terrain (trees, walls, ground, water) at speed. Defined by minimal distance from objects rather than a specific movement pattern.',
    visualSignals: [
      'Objects (trees, walls, ground) occupy significant screen real estate',
      'High parallax — nearby objects sweep past quickly',
      'Minimal clear sky visible; scenery dominates the viewport',
      'Object edges may appear to clip frame edges momentarily',
    ],
    audioSignals: [
      'High motor pitch from elevated throttle for sustained speed',
      'Wind noise prominent and rising as proximity increases',
      'Possible subtle frame-tap sounds if grazing surfaces',
    ],
    distinguishFrom: [
      'GAP HIT — a defined opening to thread; proximity is incidental',
      'WALL RIDE — parallel to a single large vertical surface',
      'SPEED RUN style — speed without the proximity constraint',
    ],
  },
  {
    id: 'wall_ride',
    name: 'Wall Ride',
    aliases: ['Wall Pass', 'Wall Skim', 'Building Fly'],
    category: 'proximity',
    difficulty: 'advanced',
    definition:
      'Flying parallel and extremely close to a single vertical surface (wall, building, cliff) while maintaining altitude and forward momentum.',
    visualSignals: [
      'Vertical surface fills one side of the frame consistently',
      'Wall details (windows, ledges, textures) scroll past at high speed',
      'Minimal distance between camera and surface; little air gap visible',
    ],
    audioSignals: [
      'High throttle for sustained speed',
      'Steady motor pitch; possible wall-echo audio if close enough',
      'Wind noise prominent from the proximity to the surface',
    ],
    distinguishFrom: [
      'PROXIMITY PASS — past trees/objects rather than along one continuous surface',
      'KNIFE EDGE — rolled sideways; wall ride is upright',
    ],
  },

  // ============================================================
  // COMBO — multi-axis or chained tricks
  // ============================================================
  {
    id: 'rubiks_cube',
    name: "Rubik's Cube",
    aliases: ['Cube Roll', 'Complex Tumble'],
    category: 'combo',
    difficulty: 'advanced',
    definition:
      'A rapid sequence of half-rolls and pitch flips in quick succession, creating a chaotic multi-axis tumbling effect reminiscent of rotating a Rubik\'s Cube.',
    visualSignals: [
      'Horizon rotates in multiple non-circular directions in fast succession',
      'Sky and ground alternate quickly without a smooth circular arc',
      '2-4 distinct horizon flips within ~1-2 seconds',
      'Recovery returns to normal orientation after a disorienting middle phase',
    ],
    audioSignals: [
      'Sustained throttle through the tumble',
      'Rapid motor pitch oscillations reflecting quick stick input changes',
    ],
    distinguishFrom: [
      'FLIP — single rotation, not a multi-axis sequence',
      'BARREL ROLL — single smooth spiral, not chaotic',
    ],
  },
  {
    id: 'throwback',
    name: 'Throwback',
    aliases: ['Backward Reversal', 'Throw-Back'],
    category: 'combo',
    difficulty: 'intermediate',
    definition:
      'A directional reversal where the drone transitions from forward flight to powered backward flight, then reverses again to forward — creating a distinctive "throw and return" motion.',
    visualSignals: [
      'Scenery moves forward toward camera initially',
      'Brief freeze or reversal point where motion pauses',
      'Backward phase: parallax reverses direction',
      'Final reversal returns to forward motion',
    ],
    audioSignals: [
      'Initial forward throttle',
      'Throttle cut/reversal at the transition',
      'Aggressive re-application for the backward power phase',
    ],
    distinguishFrom: [
      'BOOMERANG — curved single path, not a reversal',
      'PUNCH OUT — vertical not horizontal',
    ],
  },
  {
    id: 'alley_oop',
    name: 'Alley-Oop',
    aliases: ['Oop', 'Pop-and-Pivot'],
    category: 'combo',
    difficulty: 'intermediate',
    definition:
      'A quick "pop" upward followed by a pivot rotation and return to roughly the original position. Named after the basketball pass for its compact, elevated arc.',
    visualSignals: [
      'Upward motion: sky approaches camera',
      'Brief hang-time where vertical motion pauses',
      'Pivot rotation at the top — horizon rotates around vertical axis',
      'Return to original altitude and orientation',
    ],
    audioSignals: [
      'Throttle burst upward, then steady through the pivot',
      'Throttle decrease on the descent back',
    ],
    distinguishFrom: [
      'PUNCH OUT — vertical launch without the pivot/return',
      'YAW SPIN — pure rotation; no vertical pop',
    ],
  },
  {
    id: 'boomerang',
    name: 'Boomerang',
    aliases: ['Returning Arc'],
    category: 'combo',
    difficulty: 'intermediate',
    definition:
      'A curved flight path that returns toward the starting point while the nose stays pointed outward — the drone\'s body traces a boomerang shape rather than orbiting a fixed object.',
    visualSignals: [
      'Curved forward motion; scenery sweeps across the camera view',
      'Constant outward-facing perspective despite the curved path',
      'Gradual return toward the starting position',
      'No inverted or upside-down component',
    ],
    audioSignals: [
      'Modulated throttle through the curved path',
      'Variable motor pitch reflecting banked turns',
    ],
    distinguishFrom: [
      'ORBIT — circles a specific object; nose tracks the object',
      'THROWBACK — straight-line reversal, not a curve',
    ],
  },

  // ============================================================
  // VERTICAL — dramatic vertical changes
  // ============================================================
  {
    id: 'dive_recovery',
    name: 'Dive & Recovery',
    aliases: ['Dive', 'Nose-Down Dive', 'Stall Dive'],
    category: 'vertical',
    difficulty: 'basic',
    definition:
      'A steep nose-down descent followed by controlled recovery. Throttle cuts to minimum while pitching down, then re-applies aggressively before ground impact.',
    visualSignals: [
      'Nose pitches sharply downward; ground rapidly approaches and fills frame',
      'Horizon moves up and off the top of frame; sky disappears',
      'Ground detail scales up quickly during descent',
      'Recovery: ground stops accelerating toward camera and begins receding',
    ],
    audioSignals: [
      'Throttle cuts to minimum on the dive — characteristic dropoff in motor sound',
      'Wind noise increases as descent velocity builds',
      'Throttle surge on recovery; motor pitch jumps back up sharply',
    ],
    distinguishFrom: [
      'POWER LOOP — curves through inverted, doesn\'t maintain straight descent',
      'STALL — passive loss of momentum, not an intentional dive',
      'FLIP — rotation around pitch axis, not a sustained descent',
    ],
  },
  {
    id: 'punch_out',
    name: 'Punch Out',
    aliases: ['Punch', 'Eject', 'Vertical Launch'],
    category: 'vertical',
    difficulty: 'basic',
    definition:
      'A rapid vertical ascent triggered by suddenly applying max throttle. Often used to escape a tight situation or as a dramatic visual transition.',
    visualSignals: [
      'Ground/scenery rapidly moves downward off the bottom of frame',
      'Horizon descends; sky expands to fill the frame',
      'Rapid altitude gain evident from scenery scaling away',
    ],
    audioSignals: [
      'Sudden sharp throttle burst — motor pitch jumps to maximum instantly',
      'High sustained rotor whine through the climb',
      'Wind noise rises with climbing velocity',
    ],
    distinguishFrom: [
      'DIVE & RECOVERY — opposite vertical direction',
      'ALLEY-OOP — adds a pivot rotation and return',
      'INVERTED HOVER — static, no vertical motion',
    ],
  },
  {
    id: 'stall',
    name: 'Stall',
    aliases: ['Hover Stall', 'Flight Stall'],
    category: 'vertical',
    difficulty: 'intermediate',
    definition:
      'A momentary loss of forward momentum where the drone briefly suspends in the air before dropping. Can be intentional (as a trick element) or unintentional (from over-aggressive throttle cut).',
    visualSignals: [
      'Forward motion abruptly stops; scenery freezes momentarily',
      'Brief static view before descent begins',
      'Possible nose-down or nose-up attitude visible at the stall moment',
      'Drop or recovery follows',
    ],
    audioSignals: [
      'Throttle suddenly cuts or drops to near-zero',
      'Motor pitch drops significantly — characteristic dropoff',
      'Brief silence or rotor whine reduction before recovery throttle',
    ],
    distinguishFrom: [
      'DIVE & RECOVERY — intentional pitch-down, not a passive freeze',
      'INVERTED HOVER — sustained controlled hover, not momentary',
    ],
  },

  // ============================================================
  // HOVER — static orientation
  // ============================================================
  {
    id: 'inverted_hover',
    name: 'Inverted Hover',
    aliases: ['Upside-Down Hover', 'Inverted Flight'],
    category: 'hover',
    difficulty: 'intermediate',
    definition:
      'Maintaining stable level flight while completely inverted (upside-down), requiring elevated throttle to fight gravity in the reversed thrust direction.',
    visualSignals: [
      'Sky fills the center of the screen where ground normally appears',
      'Horizon inverted; ground plane becomes the "ceiling"',
      'Minimal motion during the hold; scenery remains relatively stable',
    ],
    audioSignals: [
      'Elevated steady throttle compared to a normal hover',
      'High motor pitch sustained throughout',
      'Possible wobble or oscillation audio if the hold is unstable',
    ],
    distinguishFrom: [
      'INVERTED ORBIT — adds circular motion around an object',
      'STALL — passive, momentary; inverted hover is sustained and controlled',
    ],
  },
];

/**
 * Render the dictionary as a prompt-ready string section appended to FPV preset
 * instructions in useVideoAnalysis.ts.
 */
export function renderFpvMoveDictionary(): string {
  const header =
    'FPV MOVE DICTIONARY (use these canonical terms in clip descriptions when applicable; the model output should reference these names rather than ad-hoc paraphrases):';
  const entries = FPV_MOVES.map(renderMove).join('\n\n');
  return `${header}\n\n${entries}`;
}

function renderMove(move: FpvMove): string {
  const aliasLine =
    move.aliases.length > 0 ? ` (aliases: ${move.aliases.join(', ')})` : '';
  const lines = [
    `${move.name.toUpperCase()}${aliasLine}`,
    move.definition,
    `Visual: ${move.visualSignals.join('; ')}.`,
    `Audio: ${move.audioSignals.join('; ')}.`,
  ];
  if (move.distinguishFrom && move.distinguishFrom.length > 0) {
    lines.push(`Distinguish from: ${move.distinguishFrom.join('; ')}.`);
  }
  return lines.join('\n');
}
