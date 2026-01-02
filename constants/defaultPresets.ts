import { PromptPreset } from '../types';

export const DEFAULT_PRESETS: PromptPreset[] = [
  {
    id: 'cinematic',
    name: 'Cinematic Supercut',
    isDefault: true,
    category: 'fpv',
    maxDuration: 15,
    instruction: `Role: Expert FPV Cinematographer specializing in flow and artistic drone footage.

Objective: Extract the most visually stunning, smooth sequences that showcase continuous motion and artistic flying.

What to look for:
- FLOW LINES: Extended sequences where the drone maintains smooth, unbroken motion through the environment. Look for S-curves, banking turns, and fluid transitions between obstacles.
- PROXIMITY FLYING: Moments where the drone glides close to surfaces (walls, trees, water, ground) with controlled, steady movement. The closer and smoother, the better.
- POWER LOOPS & ORBITS: Large, sweeping vertical loops or orbital paths around objects. These should feel expansive and graceful.
- DIVE & RECOVERY: Controlled dives from height followed by smooth pullouts, especially over scenic terrain or towards interesting subjects.
- SCENERY REVEALS: Moments where the drone movement reveals a beautiful landscape, structure, or vista.
- CONNECTED MANEUVERS: When multiple moves flow together (e.g., proximity pass → power loop → dive), treat as ONE continuous clip.

Visual cues to prioritize:
- Stable horizon or intentional smooth rolls
- Consistent speed without stuttering
- Clean lines through architecture or nature
- Moments of "weightlessness" or floating sensation

Scoring (1-10):
- 9-10: Perfect flow, jaw-dropping visuals, seamless multi-move sequences
- 7-8: Great cinematics with minor imperfections
- 5-6: Good moments but some instability or abrupt transitions
- 1-4: Average flying, choppy, or uninteresting scenery

Ignore: Jittery/shaky footage, crashes, prop wash oscillation, technical troubleshooting, ground footage, calibration sequences.`
  },
  {
    id: 'social-shorts',
    name: 'Shorts / Algorithm Ready',
    isDefault: true,
    category: 'fpv',
    maxDuration: 8,
    instruction: `Role: Social media content curator for viral FPV clips.

Objective: Find high-energy, attention-grabbing moments that would perform well on TikTok, Instagram Reels, or YouTube Shorts.

What makes a clip "algorithm ready":
- INSTANT IMPACT: The clip should hook viewers in the first second. Look for sudden speed bursts, unexpected gaps, or dramatic angle changes.
- GAP HITS: Drone threading through tight openings (windows, doorways, branches, structures). Smaller gaps = higher score.
- SPEED RUNS: Sections of maximum velocity, especially through complex environments.
- SURPRISE ELEMENTS: Unexpected obstacles appearing and being narrowly avoided, sudden reveals, or creative angles.
- ACROBATIC MOVES: Quick flips, rolls, or spins that are visually dynamic but controlled.
- REACTION-WORTHY: Would someone watching say "whoa" or "no way"?

Audio cues (if available):
- Motor pitch changes indicating throttle spikes
- Wind noise increases during speed runs
- Impact sounds (for close calls)

Scoring (1-10):
- 9-10: Viral potential - makes you want to rewatch immediately
- 7-8: Strong hook, shareable content
- 5-6: Decent action but needs more punch
- 1-4: Too slow, too long, or visually unclear

Keep clips punchy but complete. Include the full moment from setup through the action - don't cut mid-maneuver.

Ignore: Slow cruising, repetitive patterns, distant shots, shaky footage.`
  },
  {
    id: 'technical',
    name: 'Gap & Technical',
    isDefault: true,
    category: 'fpv',
    maxDuration: 10,
    instruction: `Role: Technical FPV analyst specializing in precision flying and complex maneuvers.

Objective: Identify moments of exceptional pilot skill - tight gaps, complex combos, and precision control.

Technical elements to extract:
- MICRO GAPS: Drone passing through extremely tight openings where margins are measured in inches. Windows, fence gaps, tree branches, structural gaps.
- SPLIT-S & MATTY FLIPS: Inverted diving maneuvers that require precise throttle and stick control.
- PROXIMITY THREADING: Flying between multiple obstacles in quick succession (e.g., between tree trunks, through scaffolding).
- INVERTED FLYING: Sustained inverted flight or inverted proximity passes.
- JUICY MOVES: Combination maneuvers like gap → flip → gap or dive → powerloop → proximity pass.
- RECOVERY SAVES: Moments where the pilot recovers from near-disaster with skilled stick input.
- YAWED ENTRIES: Flying through gaps while yawing, making the entry angle more challenging.

Precision indicators:
- Consistent stick movements (smooth throttle, no over-correction)
- Centered gap entries (not scraping edges)
- Quick but controlled direction changes
- Smooth rotation rates on flips/rolls

Scoring (1-10):
- 9-10: Competition-level precision, multi-element combos executed flawlessly
- 7-8: Impressive technical skill with minor hesitation
- 5-6: Solid gaps/tricks but room for improvement
- 1-4: Basic flying or imprecise execution

Look for SEQUENCES where technical moves chain together. A gap into a powerloop is more valuable than isolated moves.

Ignore: Basic cruising, wide-open flying, crashes (unless it's an impressive save).`
  },
  {
    id: 'crash',
    name: 'Crash & Fail Reel',
    isDefault: true,
    category: 'fpv',
    maxDuration: 6,
    instruction: `Role: FPV fail compilation curator.

Objective: Find every crash, collision, close-call, and spectacular failure for a blooper reel.

What to extract:
- FULL CRASHES: Direct impacts with objects, ground, water, or structures. Include the approach and the moment of impact.
- CLOSE CALLS: Near-misses where disaster was barely avoided. The "almost crashed" moments.
- LOSS OF CONTROL: Tumbling, spinning out, failsafes, or loss of video signal moments.
- PROP STRIKES: Clipping objects that cause wobble or loss of control.
- WATER LANDINGS: Intentional or unintentional water contact.
- STUCK DRONES: Getting caught in trees, nets, or structures.
- PILOT ERROR: Mistimed tricks, botched gaps, or overconfident maneuvers gone wrong.

Scoring (1-10 based on entertainment value):
- 9-10: Spectacular crash, funny outcome, or dramatic near-miss
- 7-8: Solid fail with good comedic timing
- 5-6: Minor crash or less dramatic close call
- 1-4: Barely noticeable issues

Important: Include the LEAD-UP to the crash. Start 1-2 seconds before the mistake happens so viewers can anticipate the fail.

Visual/Audio cues:
- Sudden camera shake or tumbling
- Screen going dark or to static
- Motor sounds cutting out or changing pitch dramatically
- Rapid uncontrolled rotation

Include: Hard landings, failed recovery attempts, pilot overconfidence moments.
Ignore: Intentional landings, normal flight, minor vibration.`
  }
];
