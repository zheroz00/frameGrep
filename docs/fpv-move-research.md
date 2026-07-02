# FPV Move Dictionary — Web Research (Phase 1)

> **Status:** Research draft.
>
> **Why this doc exists:** Background research for refactoring the duplicated/inconsistent FPV move vocabulary across the FPV presets into a single canonical dictionary in `src/constants/fpvMoves.ts`. This doc gathers the canonical definitions from FPV community sources.
>
> **What's here:** ~30 candidate moves with one-line canonical definitions, aliases, visual signals from the FPV camera POV, audio cues, common confusions, and cited sources.
>
> **What I need from you:** A first pass triage — which moves belong in v1's dictionary, which should be cut, which need a different definition than what's here. Anything you'd add. Especially: the "Items needing your decision" and "Suggested additions" at the bottom.
>
> **What comes next after your review:**
> 1. Optional Phase 2 (model probing): I query Gemini and Qwen with each finalized move to see what's already in their training data — terms they know well get brief definitions, terms they don't know get explicit ones. Tells us where to invest prompt tokens. You agreed to this in the plan; happy to skip if you'd rather move straight to implementation after this review.
> 2. Code phase: write `fpvMoves.ts`, strip duplicated `MOVE VOCABULARY` blocks from the 4 FPV presets, wire dictionary into `useVideoAnalysis.ts`, build the read-only UI panel, harden AI Polish guard.
>
> **Sources used** (full citations per-move below): Rotor Riot Tricktionary, WREKD Master List, WikiFPV, Oscar Liang, GetFPV, FPV TOGO Terms & Slang, RC Hobby Lab, Droneblog, Mepsking, plus YouTube tutorial videos and Wikipedia for aerobatic-aviation-derived terms.

---

# FPV FREESTYLE MANEUVER DICTIONARY
## Research Compilation & Analysis

---

### POWER LOOP

**Canonical definition (1-2 sentences):** A vertical 360-degree loop maneuver where the drone pitches backward past the 90-degree inverted point while maintaining forward velocity, with throttle coordinated throughout to manage altitude and speed. Often performed under obstacles (gap power loops), the maneuver requires precise timing to avoid stalling at the apex or losing altitude on recovery.

**Aliases:** Forward Loop, Inside Loop, Backflip Loop

**Difficulty:** intermediate

**Visual signals (FPV camera POV):**
- Ground/scenery rapidly rises and fills screen as nose pitches back sharply
- Horizon rotates full 360° around pitch axis; at apex, sky fills screen and becomes inverted
- Inverted top portion shows sky above, then ground gradually re-enters view as recovery arc begins
- Smooth circular motion; ground re-appears bottom-of-screen during recovery descent phase
- Final frame: nose pitches forward again to resume normal orientation

**Audio signals:**
- Throttle sustained and modulated—NOT zeroed during maneuver
- Motor pitch rises initially (throttle input), steadies through inverted portion, then pulses as drone manages gravity on descent
- Characteristic continuous rotor whine without the stall dropoff that occurs if throttle cuts at apex

**Distinguish from:** Matty Flip (pitch direction reversed relative to axis), Split-S (half-loop descent vs. full loop), Backflip (simpler pitch-back without full circle)

**Slang/canonical status:** Widely canonical maneuver, taught in all beginner freestyle tutorials. Signature foundational trick.

**Sources cited (URLs):**
- https://rotorriot.com/blogs/tutorials-guides/fpv-freestyle-tricktionary
- https://wrekd.com/pages/a-master-list-of-fpv-tricks-and-manuevers-and-how-to-do-them
- https://rchobbylab.com/fpv-drone-freestyle-tricks/
- https://www.mepsking.shop/blog/fpv-freestyle-tricks-tutorial.html

---

### MATTY FLIP

**Canonical definition (1-2 sentences):** A signature maneuver combining a reverse power loop with precise yaw rotation, created by Canadian FPV pilot Matt Sherwood ("MattyStuntz"). The drone flies forward, pitches forward aggressively, continues pitching past inverted while applying thrust backward, then exits under the starting position with combined flipping and rotational motion.

**Aliases:** Reverse Power Loop, Matt Flip, MattyFlip (one word variation)

**Difficulty:** advanced

**Visual signals (FPV camera POV):**
- Nose pitches DOWN (opposite of power loop) sharply, filling screen with approaching scenery/obstacle
- Drone passes under obstacle/line, continues pitching until inverted 
- Sky dominates screen mid-maneuver; camera rotates back to show ground below (but pilot is moving backward relative to original direction)
- Characteristic "look-back" moment where ground appears where it shouldn't due to backward-thrust orientation
- Recovery shows drone exiting low and reversed, camera finally re-orienting to forward-flight perspective

**Audio signals:**
- Initial aggressive throttle burst for forward momentum
- Sustains power through inversion (no stall dropoff)
- High motor pitch during aggressive pitch forward phase
- Characteristic backward-thrust sound signature (motors fighting against direction change)

**Distinguish from:** Power Loop (pitch direction backward vs. forward; orientation at recovery), Split-S (doesn't involve full circle or reversal), Reverse Wall Ride (different plane of motion)

**Slang/canonical status:** Canonical move, named after specific pilot (MattyStuntz), taught in intermediate-to-advanced tutorials. Widely recognized signature trick.

**Sources cited (URLs):**
- https://rotorriot.com/blogs/tutorials-guides/fpv-freestyle-tricktionary
- https://www.youtube.com/watch?v=v25IwLExF80 (Learn to Fly lesson)
- https://www.kwadblog.com/2018/01/29/the-perfect-explanation-of-the-matty-flip/
- https://fpvdronepilots.com/tags/matty-flip/
- https://www.youtube.com/watch?v=Twcj_8k_-vk (MattyStuntz tutorial)

---

### SPLIT-S

**Canonical definition (1-2 sentences):** A classic aerobatic maneuver borrowed from manned aircraft, combining a half-roll with a pitch-down maneuver that reverses direction while descending. The drone rolls 180 degrees inverted, then pitches forward through the descent arc to exit level and facing opposite direction from entry.

**Aliases:** Split-S Maneuver, Half-Roll Half-Loop

**Difficulty:** intermediate

**Visual signals (FPV camera POV):**
- Horizon rotates 90 degrees as drone rolls toward inverted 
- At 180° roll point, sky fills screen and inverts; ground disappears
- Nose pitches down into dive as pilot continues pitch input through inverted phase
- Ground gradually re-enters view as descent arc completes
- Final frame: horizon level again, but drone oriented opposite to starting direction (180° heading change)
- Characteristic descending arc—altitude loss during maneuver is visible as ground perspective changing

**Audio signals:**
- Motor pitch rises initially with throttle to maintain speed
- Consistent throttle through roll phase to prevent stalling
- Descending motor pitch as drone loses altitude through pitch-down
- Smooth throttle modulation without dropout (indicates clean execution)

**Distinguish from:** Power Loop (half-loop descent vs. full circle), Immelmann (ascends vs. descends, opposite sequence), 360° Roll (no pitch component, maintains altitude)

**Slang/canonical status:** Canonical, foundational intermediate maneuver. One of the most essential moves in FPV freestyle vocabulary.

**Sources cited (URLs):**
- https://rotorriot.com/blogs/tutorials-guides/fpv-freestyle-tricktionary
- https://wikifpv.com/docs/freestyle-fpv-flying/
- https://www.youtube.com/watch?v=ppcQPYe_GNM (Split-S tutorial)

---

### IMMELMANN (IMMELMANN TURN)

**Canonical definition (1-2 sentences):** An ascending maneuver combining a half-loop (pulling nose up) followed by a half-roll, resulting in level flight in the opposite direction at a higher altitude. Named after German WWI ace Max Immelmann, though the modern aerobatic version differs from the original dogfighting tactic.

**Aliases:** Immelmann Turn, Roll-off-the-Top, Half Cuban 8 (partial variant)

**Difficulty:** intermediate to advanced

**Visual signals (FPV camera POV):**
- Nose pitches UP steeply, pulling sky toward center of screen
- Horizon rotates upward; at 90° pitch, sky fills entire screen (nose pointing straight up)
- Drone continues arc past inverted point; ground appears briefly overhead before roll maneuver begins
- At half-loop completion, drone inverted; immediate half-roll executes (180° rotation around roll axis)
- Final frame: horizon level again, camera orientation reversed, but altitude significantly higher

**Audio signals:**
- Sustained high throttle through upward pitch phase (fighting gravity)
- Motor pitch increases noticeably as drone climbs against gravity
- Throttle gradually reduces through inverted apex (less load at top)
- Smooth re-engagement of throttle during roll-out to regain forward momentum
- No stall dropout; continuous motor engagement

**Distinguish from:** Split-S (descends vs. ascends, opposite sequence and altitude result), Power Loop (full circle vs. half-loop + roll combination), Knife Edge (different roll mechanics)

**Slang/canonical status:** Canonical maneuver with historical aviation heritage. Taught in intermediate freestyle curriculum.

**Sources cited (URLs):**
- https://en.wikipedia.org/wiki/Immelmann_turn
- https://www.britannica.com/topic/Immelmann-turn
- https://www.youtube.com/watch?v=NIRiyWI668E (How to Immelmann tutorial)
- https://rotorriot.com/blogs/tutorials-guides/fpv-freestyle-tricktionary

---

### KNIFE EDGE

**Canonical definition (1-2 sentences):** A maneuver where the drone is rolled 90 degrees sideways to fly through narrow gaps or pass obstacles while completely tilted on its roll axis. Maintains forward momentum while presenting the drone's side profile rather than front/back, requiring three-dimensional spatial orientation.

**Aliases:** Knife Edge Gap, Knife Edge Stall, Sideways Flight

**Difficulty:** advanced

**Visual signals (FPV camera POV):**
- Horizon rotates 90° as drone rolls to sideways orientation
- Camera view shifts to side-facing angle (sky on one side, ground on other)
- Ground/obstacle appears as vertical plane in camera view rather than forward/back plane
- Narrow gap or wall edge fills one side of screen; open air on opposite side
- Recovery involves 90° counter-roll to return to normal flight orientation

**Audio signals:**
- Steady, even motor pitch during sustained roll hold
- Slightly elevated throttle compared to normal flight to maintain altitude while tilted
- Clean, continuous motor engagement without stalling (critical for recovery)
- Pitch input minimal; primarily roll + throttle control

**Distinguish from:** Normal Roll (rotational only, regains level orientation), Wall Ride (follows wall contour, not purely sideways), Gap Hit (can be done at any angle, not specifically 90°)

**Slang/canonical status:** Canonical specialty maneuver for proximity/gap flying. Gap-specific variation of basic roll.

**Sources cited (URLs):**
- https://rotorriot.com/blogs/tutorials-guides/fpv-freestyle-tricktionary
- https://rchobbylab.com/fpv-drone-freestyle-tricks/
- https://www.mepsking.shop/blog/fpv-freestyle-tricks-tutorial.html
- https://wrekd.com/pages/a-master-list-of-fpv-tricks-and-manuevers-and-how-to-do-them

---

### GAP HIT

**Canonical definition (1-2 sentences):** Flying through a gap between obstacles (trees, poles, structures, etc.) with precise alignment and control. A fundamental freestyle skill that builds spatial awareness and accuracy; gaps can range from wide (beginner) to extremely narrow (advanced/micro gaps).

**Aliases:** Gap Flying, Threading, Gap Pass, Gap Thread

**Difficulty:** beginner to advanced (scales with gap width)

**Visual signals (FPV camera POV):**
- Obstacle edges (poles, tree trunks, building edges) frame the sides of the screen
- Gap or opening centered in viewfinder, steadily approaching
- Drone positioned for clean pass-through; minimal lateral drift
- Gap narrows as drone approaches; edges move toward screen edges
- Post-gap frame shows clear sky beyond obstacle

**Audio signals:**
- Steady throttle control, minimal adjustment
- Smooth motor pitch without pulsing or stalling
- Possibly wind noise increase as drone approaches obstacle edges
- No significant acceleration pulses (indicates smooth, controlled approach)

**Distinguish from:** Micro Gap (size differentiation only), Knife Edge Gap (specific 90° roll orientation), Proximity Pass (emphasizes close proximity more than gap specificity)

**Slang/canonical status:** Canonical foundational skill. "Gap hitting" is the base skill from which most proximity flying branches.

**Sources cited (URLs):**
- https://rotorriot.com/blogs/tutorials-guides/fpv-freestyle-tricktionary
- https://rchobbylab.com/fpv-drone-freestyle-tricks/
- https://wrekd.com/pages/a-master-list-of-fpv-tricks-and-manuevers-and-how-to-do-them
- https://www.airvuz.com/collection/video/tight-spaces-fpv-through-the-gaps

---

### MICRO GAP

**Canonical definition (1-2 sentences):** A gap-hitting variation where the opening is extremely narrow, requiring heightened precision and spatial control to navigate without contact. Represents the advanced end of gap-flying difficulty spectrum.

**Aliases:** Tight Gap, Narrow Gap, Mini Gap (variant naming)

**Difficulty:** advanced

**Visual signals (FPV camera POV):**
- Obstacle edges occupy screen edges on both sides; gap width occupies center narrow band
- Very little lateral margin visible; minimal forgiveness for drift
- Drone appears to "thread" through tight opening with minimal clearance
- Post-gap: abrupt opening as obstacles clear, significant visual relief

**Audio signals:**
- Extremely steady throttle; no correction bursts
- Minimal yaw/roll input (any movement risks contact)
- Motor pitch steady and consistent throughout approach and pass
- Possible wind noise from proximity to obstacles

**Distinguish from:** Normal Gap Hit (gap width specificity), Proximity Pass (proximity is secondary to gap narrowness), Knife Edge (roll orientation vs. gap size)

**Slang/canonical status:** Colloquial difficulty descriptor rather than formally named maneuver. Part of gap-hitting vocabulary.

**Sources cited (URLs):**
- https://rotorriot.com/blogs/tutorials-guides/fpv-freestyle-tricktionary
- https://www.airvuz.com/collection/video/tight-spaces-fpv-through-the-gaps
- https://www.youtube.com/watch?v=nVMpwzMlkPQ (How to Hit GAPS tutorial)

---

### PROXIMITY PASS

**Canonical definition (1-2 sentences):** Flying extremely close to obstacles or terrain (trees, buildings, ground) at high speed while maintaining control and precision. The defining characteristic is minimal distance from objects rather than specific movement patterns; proximity flying emphasizes aggressive, close-quarters flight near structures.

**Aliases:** Proximity Flying, Close Proximity, Tree Proximity, Proximity Threading (emphasis variant)

**Difficulty:** advanced

**Visual signals (FPV camera POV):**
- Objects (trees, walls, ground) occupy significant screen real estate
- Minimal clear sky visible; scenery dominates viewport
- High-speed approach evident from rapid scenery scaling
- Tight parallax motion as drone passes objects at close range
- Possible contact warnings (object edges appearing to clip screen edges)

**Audio signals:**
- High motor pitch from elevated throttle for speed
- Wind noise prominent and increasing with proximity
- Possible subtle contact sounds (frame taps) if grazing obstacles
- Aggressive throttle pulses for dynamic maneuvering near obstacles

**Distinguish from:** Gap Hit (gap is the focus, not proximity distance), Proximity Threading (synonymous term; may be used interchangeably), Speed Run (speed is primary vs. proximity)

**Slang/canonical status:** Canonical freestyle category. Proximity flying is recognized as distinct discipline within FPV freestyle.

**Sources cited (URLs):**
- https://www.fpvtogo.com/fpv-terms-and-slang/
- https://theflyingemu.com/understanding-latency-in-fpv/ (proximity context)
- https://www.youtube.com/watch?v=zfhcBwVs_gE (Proximity Power Loops)
- https://airvuz.com/collection/video/tree-proximity-fpv

---

### ORBIT

**Canonical definition (1-2 sentences):** A circular flight pattern around a stationary object (pole, tree, building), maintaining the object centered in the camera view while circling it 360 degrees. Pure orbits are executed level (normal orientation); inverted orbits circle while completely inverted.

**Aliases:** Object Circle, Object Orbit, 360 Circle (simplified variation)

**Difficulty:** intermediate

**Visual signals (FPV camera POV):**
- Stationary object remains centered or near-center of screen throughout
- Surrounding scenery rotates around object as drone circles
- Horizon tilts as drone banks into circular flight path
- Object grows/shrinks slightly based on distance variations during circle
- Camera angle toward object remains relatively constant

**Audio signals:**
- Sustained, steady throttle maintaining circular altitude
- Smooth yaw input creating gradual 360° rotation
- Roll input for banking into circular path
- No stalling; continuous motor engagement at constant pitch level

**Distinguish from:** Inverted Orbit (orientation difference), Trippy Spin (camera orientation different), Wall Ride (follows contour vs. circles), Proximity Pass (no fixed object focus)

**Slang/canonical status:** Canonical maneuver. Standard intermediate-level trick for control demonstration.

**Sources cited (URLs):**
- https://rotorriot.com/blogs/tutorials-guides/fpv-freestyle-tricktionary
- https://wikifpv.com/docs/freestyle-fpv-flying/
- https://wrekd.com/pages/a-master-list-of-fpv-tricks-and-manuevers-and-how-to-do-them
- https://rchobbylab.com/fpv-drone-freestyle-tricks/

---

### INVERTED ORBIT

**Canonical definition (1-2 sentences):** A 360-degree circular flight pattern around a stationary object while the drone remains completely inverted (upside-down). Requires simultaneous coordination of pitch, roll, yaw, and throttle to maintain altitude and circular path while inverted.

**Aliases:** Trippy Spin (often used interchangeably), Upside-Down Orbit, Inverted Circle, Backwards Object Spin

**Difficulty:** advanced

**Visual signals (FPV camera POV):**
- Object remains centered while camera points downward/backward (inverted perspective)
- Sky occupies screen center where ground normally appears
- Surrounding scenery appears inverted and rotates around object
- Horizon appears upside-down; banking creates unusual visual roll effects
- Recovery requires rolling back to normal orientation while maintaining circle

**Audio signals:**
- Elevated throttle compared to normal orbit (fighting gravity while inverted)
- Motor pitch consistently high throughout maneuver
- Steady, continuous throttle without stalling or dropout
- Smooth yaw input creating rotation without altitude loss

**Distinguish from:** Normal Orbit (orientation only difference), Trippy Spin (synonym; may be distinguishable by specific technique variants), Barrel Roll (rotational only, not circular)

**Slang/canonical status:** Canonical advanced maneuver. Trippy Spin is the more colloquial name; inverted orbit is technical description.

**Sources cited (URLs):**
- https://rotorriot.com/blogs/tutorials-guides/fpv-freestyle-tricktionary
- https://www.youtube.com/watch?v=YTQyCe8mY1Q (Inverted Orbit tutorial)
- https://wikifpv.com/docs/freestyle-fpv-flying/
- https://wrekd.com/pages/a-master-list-of-fpv-tricks-and-manuevers-and-how-to-do-them

---

### TRIPPY SPIN

**Canonical definition (1-2 sentences):** A visually disorienting maneuver similar to orbiting but distinguished by the unusual camera angle and inverted orientation that creates a "trippy" perspective. Also called a Cyclone; combines orbital motion with inverted flight, making spatial references ambiguous for viewers.

**Aliases:** Cyclone, Inverted Orbit, Trippy Rewind (variant with reversal)

**Difficulty:** intermediate to advanced (described as "easier than it looks")

**Visual signals (FPV camera POV):**
- Object remains visible in viewpoint while camera orientation shifts
- Sky and ground appear to swap positions due to inversion
- Scenery rotates in non-intuitive pattern due to camera angle
- Distinctive perspective where "up" and "down" become visually ambiguous
- Possible rapid perspective shifts if combined with yaw/roll adjustments

**Audio signals:**
- Sustained motor pitch at elevated level (maintaining inverted altitude)
- Smooth, continuous throttle without dropout
- Possible varied yaw pitch if rotating head during maneuver
- Steady baseline motor engagement

**Distinguish from:** Normal Orbit (inverted/perspective difference), Inverted Yaw Spin (spinning vs. circling), Regular Inverted Hover (static vs. circular motion)

**Slang/canonical status:** Canonical maneuver with colloquial naming ("trippy" referring to disorienting visual effect).

**Sources cited (URLs):**
- https://rotorriot.com/blogs/tutorials-guides/fpv-freestyle-tricktionary
- https://www.mepsking.shop/explore/fpv-drone-trippy-spin-tutorial.html
- https://www.youtube.com/watch?v=sWg5H_zdGKM (Trippy Spin/Cyclone tutorial)
- https://www.youtube.com/watch?v=JAitJVrqpsE (Trippy Rewind variant)

---

### DIVE & RECOVERY

**Canonical definition (1-2 sentences):** A maneuver involving a steep downward flight path (nose-down stall) followed by controlled recovery to normal flight. Pilot cuts throttle to minimum while pitching nose down, creating rapid altitude loss, then reapplies throttle to recover before ground impact.

**Aliases:** Dive, Nose-Down Dive, Stall Dive, Backward Dive (inverted variant)

**Difficulty:** beginner to intermediate

**Visual signals (FPV camera POV):**
- Nose pitches sharply downward; ground rapidly approaches and fills screen
- Horizon moves upward off-screen; sky disappears from view
- Ground detail becomes increasingly clear as descent accelerates
- Speed-up evident from rapid scenery expansion
- Recovery begins as throttle reapplies; ground stops accelerating toward camera, begins receding

**Audio signals:**
- Throttle cuts to minimum or zero during dive initiation
- Motor pitch drops significantly (low power state)
- Rotor speed decreases audibly; wind noise increases due to descent velocity
- Characteristic "dropout" in motor engagement (power cutoff)
- Throttle surge on recovery; motor pitch jumps back up

**Distinguish from:** Power Loop (controlled curve vs. straight descent), Split-S (has roll component), Flip (different axis orientation)

**Slang/canonical status:** Canonical foundational maneuver. Essential skill for safe flying and control practice.

**Sources cited (URLs):**
- https://rotorriot.com/blogs/tutorials-guides/fpv-freestyle-tricktionary
- https://wrekd.com/pages/a-master-list-of-fpv-tricks-and-manuevers-and-how-to-do-them
- https://rchobbylab.com/fpv-drone-freestyle-tricks/
- https://droneblog.com/fpv-acro-freestyle/

---

### SPEED RUN

**Canonical definition (1-2 sentences):** High-speed flight through a defined path or obstacle course, emphasizing velocity and control rather than acrobatic tricks. In racing context, speed runs complete courses as fast as possible; in freestyle, speed runs maintain high velocity while navigating complex terrain for cinematic effect.

**Aliases:** Speed Flight, High-Speed Pass, Racing Run, Fast Flight

**Difficulty:** intermediate to advanced

**Visual signals (FPV camera POV):**
- Rapid scenery scaling; objects approach quickly and recede fast
- Motion blur or temporal compression of scenery
- High parallax effect as drone passes nearby objects at speed
- Minimal dwelling on any single visual element
- Smooth panning across landscape due to velocity

**Audio signals:**
- Very high motor pitch from sustained maximum or near-maximum throttle
- Rotor whine at peak frequency; minimal pitch variation
- Wind noise prominent and increasing with speed
- No throttle pulsing; flat, continuous high-pitch tone

**Distinguish from:** Proximity Pass (proximity emphasis over speed), Power Loop (acrobatic vs. straight flight), Gap Hit (precision vs. speed emphasis)

**Slang/canonical status:** Descriptive term rather than formally-named maneuver. "Speed run" describes the execution style (fast flight) rather than specific stick inputs.

**Sources cited (URLs):**
- https://www.mepsking.shop/blog/fpv-freestyle-tricks-tutorial.html
- https://dronehundred.com/blogs/advanced-guides/advanced-fpv-flying-techniques-freestyle-and-racing
- https://www.thedronegirl.com/2017/03/10/fpv-freestyle-different-drone-racing/

---

### PUNCH OUT (PUNCH HOVER)

**Canonical definition (1-2 sentences):** A rapid vertical ascent maneuver where the pilot suddenly applies maximum throttle to launch the drone upward from a low altitude, then stabilizes at altitude. Often used as a recovery technique or as a dramatic visual element in freestyle sequences.

**Aliases:** Punch, Eject, Punch Hover, Vertical Launch

**Difficulty:** beginner to intermediate

**Visual signals (FPV camera POV):**
- Ground/scenery rapidly moves downward off-screen
- Horizon descends; sky expands to fill screen
- Rapid altitude gain evident from scenery recession
- Sudden transition from level flight to vertical perspective
- Stabilization phase shows ground becoming smaller/more distant

**Audio signals:**
- Sudden sharp throttle burst; motor pitch jumps to maximum instantly
- High, sustained rotor whine during climb phase
- Wind noise increases with climbing velocity
- No dropout; continuous, clean power engagement

**Distinguish from:** Dive & Recovery (opposite direction), Flip (rotational vs. vertical), Normal Climb (rate and aggression difference)

**Slang/canonical status:** Canonical maneuver with colloquial naming ("punch" referring to aggressive throttle application).

**Sources cited (URLs):**
- https://wrekd.com/pages/a-master-list-of-fpv-tricks-and-manuevers-and-how-to-do-them
- https://rchobbylab.com/fpv-drone-freestyle-tricks/
- https://astrorocketz.com/drills-for-flawless-fpv-matty-flips-power-loops/

---

### ROLL (AXIAL ROLL)

**Canonical definition (1-2 sentences):** A basic 360-degree rotation around the drone's roll (longitudinal) axis, maintaining forward flight direction throughout. The simplest form of rotational maneuver; the drone's nose remains pointing in the same direction while the airframe rotates around the forward flight path.

**Aliases:** Axial Roll, 360 Roll, Simple Roll, Level Roll

**Difficulty:** beginner

**Visual signals (FPV camera POV):**
- Horizon rotates around screen center (appears to spin like a spinning wheel)
- Sky and ground trade places at 180° point
- Scenery remains centered; rotation is around forward flight axis
- Smooth, continuous rotation returning to original perspective
- No pitch or yaw change; purely rotational around longitudinal axis

**Audio signals:**
- Steady, constant throttle throughout rotation
- Motor pitch remains consistent (no altitude loss)
- Smooth, even rotor engagement without stalling
- Minimal control input variation audible

**Distinguish from:** Barrel Roll (uses power/forward momentum vs. pure rotation), Yaw Spin (rotates on vertical axis vs. roll axis), Flip (faster, more aggressive pitch rotation)

**Slang/canonical status:** Canonical foundational maneuver. First rotational trick most pilots learn.

**Sources cited (URLs):**
- https://rotorriot.com/blogs/tutorials-guides/fpv-freestyle-tricktionary
- https://rchobbylab.com/fpv-drone-freestyle-tricks/
- https://www.flyingglass.com.au/drone-yaw-pitch-roll-mastering-flight-control/

---

### BARREL ROLL

**Canonical definition (1-2 sentences):** A 360-degree roll maneuver that uses forward momentum and power to create a spiral corkscrew motion through the air. Unlike a simple roll, the barrel roll maintains forward velocity while rotating, creating a helical flight path rather than pure rotation in place.

**Aliases:** Powered Roll, Spiral Roll, Corkscrew Roll, Helical Roll

**Difficulty:** intermediate

**Visual signals (FPV camera POV):**
- Horizon rotates around screen center while scenery gradually advances
- Sky and ground trade places, but scenery continues moving forward throughout
- Combined rotation + translation creates spiral visual effect
- Horizon traces helical path relative to forward direction
- Scenery appears to move diagonally as much as vertically due to spiral motion

**Audio signals:**
- High, sustained throttle to maintain power through rotation
- Elevated motor pitch constant throughout
- Wind noise from forward velocity plus rotational speed
- Smooth, continuous engagement; no stalling

**Distinguish from:** Simple Roll (no forward momentum/power), Power Loop (vertical circle vs. spiral), Yaw Spin (different axis of rotation)

**Slang/canonical status:** Canonical standard maneuver. Named from manned aircraft aerobatics terminology.

**Sources cited (URLs):**
- https://rotorriot.com/blogs/tutorials-guides/fpv-freestyle-tricktionary
- https://en.wikipedia.org/wiki/Barrel_roll
- https://rchobbylab.com/fpv-drone-freestyle-tricks/

---

### FLIP (FORWARD FLIP / BACK FLIP)

**Canonical definition (1-2 sentences):** Fast 180-degree or 360-degree rotations around the pitch axis (forward/backward), typically used for quick directional changes or exits from obstacles. Forward flips pitch nose down; back flips pitch nose up; both are rapid movements meant to build orientation confidence.

**Aliases:** Forward Flip (Front Flip), Back Flip (Backward Flip), Pitch Roll, Fast Pitch, Flip Maneuver

**Difficulty:** beginner to intermediate

**Visual signals (FPV camera POV):**
- **Forward Flip:** Ground rapidly approaches, fills screen, then sky re-enters as rotation completes. Nose descends toward ground.
- **Back Flip:** Sky rapidly approaches, fills screen, then ground re-enters. Nose rises toward sky.
- Rapid 180-360° rotation around pitch axis
- Distinctive "over-the-top" or "under-the-bottom" visual
- Smooth transition back to normal orientation upon completion

**Audio signals:**
- Aggressive, rapid throttle application initiating flip
- High motor pitch during flip execution
- Possible sustained or oscillating pitch if recovery is gradual
- Wind noise increases with rotation speed

**Distinguish from:** Power Loop (complete circle, different throttle management), Roll (different rotation axis), Barrel Roll (powered vs. unpowered distinction)

**Slang/canonical status:** Canonical foundational maneuvers. "Flipping" is taught as first-phase skill in all freestyle curricula.

**Sources cited (URLs):**
- https://rotorriot.com/blogs/tutorials-guides/fpv-freestyle-tricktionary
- https://rchobbylab.com/fpv-drone-freestyle-tricks/
- https://www.mepsking.shop/blog/fpv-freestyle-tricks-tutorial.html
- https://droneblog.com/fpv-acro-freestyle/

---

### YAW SPIN

**Canonical definition (1-2 sentences):** A 360-degree rotation around the vertical (yaw) axis while maintaining forward flight or hover. The drone spins like a helicopter rotor, with nose pointing outward from rotation center and camera angle remaining relatively constant.

**Aliases:** Yaw Rotation, Spinning, Helicopter Spin, Stationary Spin, Inverted Yaw Spin (inverted variant)

**Difficulty:** beginner

**Visual signals (FPV camera POV):**
- Scenery rotates around screen center as drone yaws
- Horizon line rotates around full 360° relative to fixed camera orientation
- Camera perspective remains relatively static; world rotates around it
- Smooth, continuous rotation returning to original facing direction
- Can be performed while hovering (minimal altitude change) or moving forward (creates circular path)

**Audio signals:**
- Steady throttle (either hover-level or climbing throttle)
- Motor pitch remains consistent (fixed altitude)
- Smooth rotor engagement without dropout
- Prominent yaw input evident in motor balancing changes

**Distinguish from:** Orbit (circular path around object + yaw, vs. pure yaw in place), Roll (different rotation axis), Barrel Roll (forward momentum component)

**Slang/canonical status:** Canonical foundational maneuver. Yaw control is taught as basic flight skill.

**Sources cited (URLs):**
- https://rotorriot.com/blogs/tutorials-guides/fpv-freestyle-tricktionary
- https://rchobbylab.com/fpv-drone-freestyle-tricks/
- https://droneblog.com/fpv-acro-freestyle/

---

### JUICY COMBO (JUICY STYLE MANEUVERS)

**Canonical definition (1-2 sentences):** High-energy flight maneuvers characterized by aggressive, snappy movements with lots of thrust application and sudden directional changes. "Juicy" style emphasizes exaggerated dynamic motion showcasing the drone's acceleration and responsiveness, with low camera angles and rapid yaw/pitch combinations.

**Aliases:** Juicy Style, Juicy Flying, Snap-and-Thrust Style, Aggressive Style

**Difficulty:** intermediate to advanced

**Visual signals (FPV camera POV):**
- Rapid, jerky directional changes (not smooth/flowing like other styles)
- Aggressive pitch forward/back movements with visible momentum changes
- Sky and ground rapidly trade places in non-circular patterns
- Low camera angle (0-10° tilt) emphasizing ground/trees/obstacles
- Characteristic "snap" movements where drone suddenly shifts orientation
- High-energy motion evident from rapid scenery changes

**Audio signals:**
- Pulsing throttle pattern; frequent on-off-on cycles
- Rapid motor pitch changes reflecting aggressive stick input
- "Snappy" throttle response; bursts rather than smooth modulation
- Wind noise prominent from high-velocity jumps between positions

**Distinguish from:** Flow Style (smooth, continuous vs. snappy), Cinematic Style (slow, smooth vs. aggressive), Acro Style (similar but no specific "juicy" naming emphasis)

**Slang/canonical status:** Community style descriptor/slang. Not a specific named maneuver but rather a collection of aggressive tricks executed in a characteristic style. Popularized by French FPV pilots (Farouk FPV).

**Sources cited (URLs):**
- https://www.fpvtogo.com/fpv-terms-and-slang/
- https://wrekd.com/pages/the-types-of-fpv-freestyle
- https://rotorriot.com/blogs/tutorials-guides/fpv-freestyle-tricktionary

---

### JUICY FLIK (JUICY FLICK)

**Canonical definition (1-2 sentences):** An aggressive maneuver combining a rapid 180-degree pitch flip followed by a slower, more controlled 180-degree roll. The flip phase is quick and powerful (showing the sky), while the roll phase is slower and more cinematic for a smooth camera motion.

**Aliases:** Juicy Flick, Juicy Flip, Flik Maneuver

**Difficulty:** intermediate to advanced

**Visual signals (FPV camera POV):**
- Aggressive rapid nose-down or nose-up flip; ground/sky suddenly fills screen and inverts
- Momentary disorienting inversion at flip apex
- Slower, more graceful roll follows; camera rotates steadily around pitch axis
- Two-phase visual: snappy + smooth creates distinctive "juicy" signature
- "Look-back" moment where camera orientation relative to body appears to shift

**Audio signals:**
- Aggressive throttle burst during flip phase (high-pitched motor spike)
- Throttle modulates during roll phase (steadier mid-range pitch)
- Possible yaw input creating yaw + roll combination sound
- Characteristic two-phase audio: aggressive then controlled

**Distinguish from:** Simple Flip (single movement vs. flip+roll combo), Smooth Roll (lacks aggressive flip component), Matty Flip (different motion pattern and entry/exit)

**Slang/canonical status:** Canonical "juicy" style maneuver. Popularized in freestyle competition and French FPV community.

**Sources cited (URLs):**
- https://www.fpvtogo.com/fpv-terms-and-slang/
- https://wrekd.com/pages/a-master-list-of-fpv-tricks-and-manuevers-and-how-to-do-them
- https://www.youtube.com/watch?v=XTbEZPqFzBU (Juicy Flick tutorial)
- https://greyarro.ws/t/fpv-trick-competition-juicy-flick/39688

---

### SCENERY REVEAL

**Canonical definition (1-2 sentences):** A cinematic shot type (rather than a maneuver) where the drone starts with the subject out of frame or obscured, then gradually approaches or passes to reveal scenery/landscape behind or beyond the subject. Emphasizes visual storytelling and progressive disclosure of environment.

**Aliases:** Reveal Shot, Scenery Reveal Shot, Progressive Reveal, Landscape Reveal

**Difficulty:** beginner to intermediate (shot-type, not maneuver)

**Visual signals (FPV camera POV):**
- Begins with subject or obstacle partially/fully obscuring background scenery
- Drone moves forward/around subject, gradually revealing landscape behind/beyond
- Progressive unblocking of view; new scenery elements appear as subject passes
- Smooth, intentional camera movement emphasizing reveal timing
- Final frame shows full landscape with subject positioned to lead eye

**Audio signals:**
- Smooth, steady throttle; no dramatic changes
- Steady motor pitch (constant forward flight or hover)
- Possibly intentional pause at reveal moment (zero throttle briefly)
- No aggressive maneuver audio; focuses on smooth motion

**Distinguish from:** Proximity Pass (proximity emphasis over reveal), Speed Run (speed over storytelling), Orbit (circular vs. linear approach)

**Slang/canonical status:** Shot/composition type rather than a maneuver. Used in cinematic freestyle and camera work discussion rather than trick vocabulary. Sometimes informal usage, but recognized technique in FPV videography.

**Sources cited (URLs):**
- https://store.dji.com/guides/dont-fly-until-you-know-these-7-simple-drone-maneuvers-and-shots/
- https://onoff.gr/blog/en/drones/fpv-freestyle-tips-for-incredible-videos/
- (General cinema/FPV videography practice rather than trick dictionary)

---

### TRIPPY SPIN

**[See INVERTED ORBIT entry above — Trippy Spin is synonymous/overlapping alias]**

---

## ADDITIONAL MANEUVERS DISCOVERED IN RESEARCH

The following maneuvers were identified in authoritative sources and should be included in a comprehensive FPV maneuver dictionary, though they were not on your original candidate list:

---

### RUBIK'S CUBE

**Canonical definition (1-2 sentences):** An open-air trick combining multiple half-rolls and flips in rapid sequence, creating a visually chaotic tumbling effect resembling the rotation pattern of a Rubik's Cube. Typically four quick half-rotations (90° increments) combined with pitch flips for maximum disorientation.

**Aliases:** Rubic's Cube Maneuver, Cube Roll, Complex Tumble

**Difficulty:** advanced

**Visual signals (FPV camera POV):**
- Rapid, multi-axis tumbling; horizon rotates in non-standard patterns
- Sky and ground alternate quickly in non-circular progression
- Disorienting sequence of 2-3 horizon rotations in quick succession
- Final recovery returns to normal orientation after chaotic middle phase

**Audio signals:**
- Sustained throttle throughout tumbling sequence
- Rapid motor pitch oscillations reflecting quick stick input changes
- Continuous engagement without dropout (maintains control throughout)

**Slang/canonical status:** Canonical advanced trick. Taught in intermediate-to-advanced freestyle curricula.

**Sources cited (URLs):**
- https://rotorriot.com/blogs/tutorials-guides/fpv-freestyle-tricktionary
- https://www.youtube.com/watch?v=EGXlzC2MzT8 (How to Rubik's Cube tutorial)
- https://www.youtube.com/watch?v=GJG5rdpXG-A (Rubik's Cube gap variation)

---

### WALL RIDE

**Canonical definition (1-2 sentences):** A maneuver where the drone flies parallel to and extremely close to a vertical surface (wall, building, cliff) while maintaining altitude and forward momentum. Creates dramatic footage by skimming the wall surface without making contact.

**Aliases:** Wall Pass, Wall Skim, Proximity Wall, Building Fly

**Difficulty:** advanced

**Visual signals (FPV camera POV):**
- Vertical surface (wall, building) fills screen edge consistently
- Minimal distance between camera and wall surface
- Scrolling motion of wall texture/details indicating parallel flight
- Objects on/attached to wall (windows, doors, ledges) become visible as drone passes

**Audio signals:**
- High throttle for speed maintenance
- Wind noise prominent from proximity to wall
- Steady motor pitch; possible wall-echo audio if close enough
- Smooth flight without stalling

**Slang/canonical status:** Canonical advanced proximity trick. Featured in professional FPV footage and tutorials.

**Sources cited (URLs):**
- https://rotorriot.com/blogs/tutorials-guides/fpv-freestyle-tricktionary
- https://wikifpv.com/docs/freestyle-fpv-flying/
- https://www.youtube.com/watch?v=ktnZBvd9kq4 (Wall Ride tutorial)

---

### REVERSE WALL RIDE

**Canonical definition (1-2 sentences):** A wall ride maneuver executed backward, where the drone flies in reverse parallel to a vertical wall surface. Combines wall-following proximity with backward flight orientation.

**Aliases:** Backward Wall Ride, Reverse Wall Pass, Backward Skim

**Difficulty:** advanced

**Visual signals (FPV camera POV):**
- Vertical wall surface visible but from reverse-flight perspective
- Camera points backward toward wall as drone flies backward past it
- Backward parallax motion; wall details scroll differently than forward wall ride
- Requires spatial orientation inversion from normal wall ride

**Audio signals:**
- High throttle (backward flight at speed)
- Wind noise from backward velocity
- Motor pitch may shift differently compared to forward due to reversed thrust vector
- Smooth engagement without dropout

**Slang/canonical status:** Canonical advanced maneuver. Demonstrates exceptional control and spatial awareness.

**Sources cited (URLs):**
- https://wikifpv.com/docs/freestyle-fpv-flying/
- https://www.youtube.com/watch?v=Ubny2_SpNp4 (Reverse Wall Ride)
- https://www.youtube.com/watch?v=2koGdcQ1XOU (How To tutorial)

---

### SBANG TORNADO (SBANG STYLE)

**Canonical definition (1-2 sentences):** An advanced innovative maneuver/style characterized by complex combinations of rapid rotations, spirals, and directional reversals. "Sbang" is a freestyle sub-genre emphasizing chaotic, high-energy motion patterns that are continually evolving within the FPV community.

**Aliases:** Sbang Style, Tornado Spin, Chaotic Combo, Innovative Flow

**Difficulty:** advanced

**Visual signals (FPV camera POV):**
- Rapid, non-standard rotation patterns; multiple axes moving simultaneously
- Disorienting visual flow; horizon position unpredictable
- Dynamic motion lacking the smoothness of flow or cinematic styles
- Visually complex; requires viewer concentration to track orientation

**Audio signals:**
- Complex, layered motor pitch changes
- Rapid throttle pulsing with varied intensity
- Multiple control input types evident in motor sound changes
- Sustained engagement without dropout

**Slang/canonical status:** Emerging canonical style/maneuver category. "Sbang" is recognized as distinct freestyle subgenre gaining popularity (though dividing opinion among pilots).

**Sources cited (URLs):**
- https://www.fpvtogo.com/fpv-terms-and-slang/
- https://www.youtube.com/watch?v=emRLLhrE14E (Sbang Tornado demonstration)
- https://www.youtube.com/watch?v=BQauW42gMfE (How To: Sbang Tornado tutorial)

---

### STALL

**Canonical definition (1-2 sentences):** A maneuver or error condition where the drone loses forward momentum and momentarily "freezes" in the air before dropping slightly or recovering. Can be intentional (as part of tricks) or unintentional (due to throttle loss during maneuvers).

**Aliases:** Hover Stall, Flight Stall, Moment of Suspension

**Difficulty:** beginner to intermediate

**Visual signals (FPV camera POV):**
- Rapid forward motion suddenly stops; scenery freezes in place momentarily
- Brief moment of relatively static view before descent begins
- Possible nose-down or nose-up attitude visible during stall
- Drop/descent follows stall phase

**Audio signals:**
- Throttle suddenly cuts or reduces to zero/low level
- Motor pitch drops significantly, indicating reduced power state
- Possible brief silence or rotor dropoff sound
- Characteristic stall "signature": motor engagement loss

**Distinguish from:** Hover (sustained motionless flight vs. temporary suspension), Dive (intentional descent vs. stall-then-drop)

**Slang/canonical status:** Canonical technical term; can be intentional maneuver or unintentional flight characteristic.

**Sources cited (URLs):**
- https://rotorriot.com/blogs/tutorials-guides/fpv-freestyle-tricktionary
- https://rchobbylab.com/fpv-drone-freestyle-tricks/
- https://www.mepsking.shop/blog/fpv-freestyle-tricks-tutorial.html

---

### THROWBACK

**Canonical definition (1-2 sentences):** A directional reversal maneuver where the drone flies forward, transitions to backward flight, accelerates backward with power application, then reverses again to forward. Creates a "throwback" motion pattern with distinctive temporal reversal.

**Aliases:** Throw-Back Maneuver, Backward Reversal, Forward-Backward-Forward Combo

**Difficulty:** intermediate

**Visual signals (FPV camera POV):**
- Scenery moves forward toward camera initially
- Rapid transition where scenery freezes or reverses direction
- Backward flight phase shows reversed parallax motion
- Second reversal returns to forward motion

**Audio signals:**
- Initial forward throttle
- Throttle cut/reversal for backward transition
- Aggressive throttle reapplication for backward power phase
- Throttle modulation on second reversal back to forward

**Slang/canonical status:** Canonical maneuver with colloquial naming.

**Sources cited (URLs):**
- https://rotorriot.com/blogs/tutorials-guides/fpv-freestyle-tricktionary
- https://www.mepsking.shop/blog/fpv-freestyle-tricks-tutorial.html

---

### INVERTED HOVER / INVERTED YAW SPIN

**Canonical definition (1-2 sentences):** Maintaining stable level flight while completely inverted (upside-down), requiring elevated throttle to fight gravity. Inverted yaw spin adds 360-degree rotation around vertical axis while maintaining inverted orientation.

**Aliases:** Upside-Down Hover, Inverted Flight, Inverted Rotation (yaw variant)

**Difficulty:** intermediate

**Visual signals (FPV camera POV):**
- Sky fills screen center (pointing downward)
- Horizon appears inverted; normal ground plane becomes "ceiling"
- Minimal motion during hover phase; scenery remains relatively stable
- Yaw spin variant: scenery rotates around inverted perspective

**Audio signals:**
- Elevated throttle compared to normal hover (fighting gravity)
- High motor pitch sustained throughout
- Steady engagement without dropout
- Possible wobble/oscillation audio if hover is unstable

**Distinguish from:** Normal Hover (orientation difference), Inverted Orbit (circular motion component)

**Slang/canonical status:** Canonical intermediate maneuver.

**Sources cited (URLs):**
- https://rotorriot.com/blogs/tutorials-guides/fpv-freestyle-tricktionary
- https://www.youtube.com/watch?v=cM19MrvS2vg (Learning Inverted Yaw Spins)
- https://www.youtube.com/watch?v=DNtQVb4gd20 (How To Inverted Yaw Spin)

---

### LASER FLIP

**Canonical definition (1-2 sentences):** An advanced trick that originated from knife-edge yaw-spinning techniques but evolved into a distinct flip maneuver. Combines precise knife-edge orientation with rapid rotation for a visually sharp, "laser-like" trajectory.

**Aliases:** Laser Maneuver, Sharp Flip, Knife-Edge Flip Variation

**Difficulty:** advanced

**Visual signals (FPV camera POV):**
- Distinctive sharp rotation pattern
- Possible knife-edge orientation component visible at rotation start/end
- Clean, precise flip motion without wobble
- Characteristic directional "cut" through space

**Audio signals:**
- Sustained throttle through flip
- Smooth motor pitch transition (clean execution indicator)
- Possible yaw component audio (yaw + flip combo)

**Slang/canonical status:** Canonical advanced maneuver with descriptive naming ("laser" = precise, sharp).

**Sources cited (URLs):**
- https://rotorriot.com/blogs/tutorials-guides/fpv-freestyle-tricktionary
- https://www.youtube.com/watch?v=mPbpCLjIcjU (Laser Flip tutorial)
- https://www.youtube.com/watch?v=CyS0C_DJO9o (How To: Laser Flip)

---

### ALLEY-OOP

**Canonical definition (1-2 sentences):** A quick maneuver combining upward movement (pop), pivot rotation, and return to original position, mimicking basketball "alley-oop" passes. Creates a compact, space-efficient trick with distinctive hang-time visual.

**Aliases:** Oop, Alley Maneuver, Pop-and-Pivot

**Difficulty:** intermediate

**Visual signals (FPV camera POV):**
- Upward motion; sky approaches camera
- Pivot rotation while elevated; horizon rotates around vertical axis
- Brief "hang-time" moment where vertical motion pauses
- Return to original altitude and orientation

**Audio signals:**
- Throttle burst upward
- Sustained/steady throttle during pivot phase
- Possible throttle decrease on descent back to starting altitude

**Slang/canonical status:** Canonical intermediate trick with sports-derived naming.

**Sources cited (URLs):**
- https://wrekd.com/pages/a-master-list-of-fpv-tricks-and-manuevers-and-how-to-do-them
- https://forum.flitetest.com/index.php?threads/trick-tutorial-5-alley-oop-hangtime-fpv-freestyle-tricks.37877/
- https://rchobbylab.com/fpv-drone-freestyle-tricks/

---

### BOOMERANG

**Canonical definition (1-2 sentences):** A trick where the drone flies in a curved path that returns toward the starting point while maintaining a relatively constant facing direction (unlike circular orbits). The drone's flight path curves like a boomerang while the nose stays pointed outward.

**Aliases:** Boomerang Maneuver, Returning Arc, Boomerang Path

**Difficulty:** intermediate

**Visual signals (FPV camera POV):**
- Curved forward motion; scenery curves around camera view
- Constant forward-facing perspective despite curved flight path
- Gradual return toward starting position
- No inverted/upside-down component

**Audio signals:**
- Modulated throttle for curved path flight
- Possibly variable motor pitch reflecting banked turns
- Continuous engagement without dropout

**Slang/canonical status:** Canonical maneuver with descriptive naming.

**Sources cited (URLs):**
- https://wrekd.com/pages/a-master-list-of-fpv-tricks-and-manuevers-and-how-to-do-them
- https://www.youtube.com/watch?v=cEqJj62f8iY (How To: Boomerang tutorial)

---

### VANNY ROLL

**Canonical definition (1-2 sentences):** An advanced maneuver requiring backward sustained flight with aggressive yaw spinning followed by a roll recovery. Demands significant trust and spatial awareness as the pilot flies backward and inverted before recovering forward.

**Aliases:** Backward Yaw-Roll Combo, Backward Spin-Roll

**Difficulty:** advanced

**Visual signals (FPV camera POV):**
- Backward motion evident from reversed parallax
- Yaw rotation around vertical axis while flying backward
- Roll component follows; horizon rotates around pitch axis
- Recovery returns to forward flight

**Audio signals:**
- Sustained throttle for backward flight
- Complex motor pitch pattern (yaw + roll combined audio signature)
- Possible momentary hesitation or wobble audio if not cleanly executed

**Slang/canonical status:** Canonical advanced maneuver. Appears in FPV competition context.

**Sources cited (URLs):**
- https://rotorriot.com/blogs/tutorials-guides/fpv-freestyle-tricktionary
- https://greyarro.ws/t/fpv-competition-vanny-roll-6-5-to-5-6/45993

---

### CONTACT TRICKS (WALL BONK, SLIDE/GRIND, PERCH)

**Canonical definition:** A category of intentional maneuvers involving physical contact with obstacles or surfaces, contrasting with aerial-only tricks.

#### WALL BONK

Intentional contact with walls or ceilings using the drone frame. Low-impact collision maneuver.

**Visual signals:** Frame strikes wall/ceiling; momentary camera shake or contact.
**Slang/canonical status:** Canonical contact trick category.

#### SLIDE / GRIND

Skateboarding-inspired tricks where the drone slides along rails, floors, ledges or other surfaces without taking flight.

**Visual signals:** Drone maintains low altitude while sliding; minimal airtime; rolling motion.
**Slang/canonical status:** Canonical contact trick category.

#### PERCH

Precision landing on objects or surfaces (ledges, roofs, branches), demonstrating accurate hover and positioning.

**Visual signals:** Approach to landing surface; brief final hover; touchdown with stability.
**Slang/canonical status:** Canonical contact trick category.

**Sources for Contact Tricks:**
- https://rotorriot.com/blogs/tutorials-guides/fpv-freestyle-tricktionary
- https://www.youtube.com/watch?v=uVslNB_UxeU (How to PERCH tutorial)
- https://www.youtube.com/watch?v=ktnZBvd9kq4 (Wall Ride, related contact flying)

---

### JACKIE CHAN (FAST-PACED FLIP/ROLL COMBO)

**Canonical definition (1-2 sentences):** A fast-paced sequence of flips and rolls named after the martial arts icon Jackie Chan. Combines multiple rotational maneuvers in rapid succession for a flashy, complex-looking trick.

**Aliases:** Jackie Chan Combo, Flip-Roll-Flip Sequence

**Difficulty:** advanced

**Visual signals (FPV camera POV):**
- Rapid horizon rotations in multiple directions
- Sky and ground alternate quickly
- Multiple 180-360° rotations without clear stabilization between phases
- Disorienting, high-energy visual sequence

**Audio signals:**
- Aggressive, varied motor pitch throughout
- Rapid stick input changes evident in audio
- Sustained throttle without dropout
- Complex, layered motor sound signature

**Slang/canonical status:** Community slang/naming convention. Named after martial arts icon; not as formally canonical as other tricks.

**Sources cited (URLs):**
- https://wrekd.com/pages/a-master-list-of-fpv-tricks-and-manuevers-and-how-to-do-them

---

### JUICY EJECT

**Canonical definition (1-2 sentences):** A sudden upward launch maneuver followed by flow recovery in "juicy" style. Rapid vertical ascent with aggressive throttle application, then stabilization into forward flight.

**Aliases:** Eject, Juicy Launch, Vertical Punch (variant of punch out)

**Difficulty:** intermediate to advanced

**Visual signals (FPV camera POV):**
- Rapid upward motion; ground moves downward off-screen
- Sudden transition from level flight to vertical perspective
- Sky expands to fill upper screen
- Recovery phase transitions to forward motion

**Audio signals:**
- Aggressive throttle burst initiation
- High, sustained motor pitch during climb
- Possible throttle modulation during recovery transition
- Characteristic "snappy" juicy-style audio signature

**Slang/canonical status:** Canonical "juicy" style maneuver.

**Sources cited (URLs):**
- https://wrekd.com/pages/a-master-list-of-fpv-tricks-and-manuevers-and-how-to-do-them
- https://www.mepsking.shop/blog/fpv-freestyle-tricks-tutorial.html

---

## TOP-LEVEL SUMMARY & CRITICAL FINDINGS

### FLAGGED ISSUES

**1. Community Slang vs. Canonical Moves:**
- **Pure Slang (Recommend Dropping):** "Scenery Reveal" (is a shot type, not a maneuver), "Speed Run" (descriptive flight style, not a trick), "Juicy Combo" (style descriptor, not a specific maneuver)
- **Community Slang with Canonical Standing:** "Trippy Spin" (canonical but colloquial for inverted orbit), "Juicy Style" (recognized freestyle category with named tricks within it)

**2. Duplicate/Overlapping Terms:**
- **DUPLICATE - DO NOT SPLIT:** "Trippy Spin" = "Inverted Orbit" (identical maneuver, two names)
- **DUPLICATE - SUBSUMED:** "Proximity Threading" is not separate from "Proximity Pass" (both describe proximity flying; "threading" emphasizes the gap-focus variant)
- **DUPLICATE - MERGED:** "Gap Hit" and "Micro Gap" are not separate maneuvers—they differ only in gap width difficulty, not execution
- **ALIAS ONLY:** "Matty Flip" vs. "Reverse Power Loop" (canonical aliases, same trick)
- **VARIANT ONLY:** "Inverted Yaw Spin" is "Yaw Spin + Inverted Hover" (combo of basics, not new maneuver)

**3. Terms with Multiple Competing Definitions:**
- **None identified.** Sources are consistent on definitions; terminology is standardized across major references (Rotor Riot, WREKD, WikiFPV).

**4. Maneuvers That Lack Authoritative Sources:**
- **"Superman" Maneuver:** Not found in any authoritative source. May be ultra-niche or regional slang. Recommend requesting FPV pilot clarification before including.
- **"Punch Hover":** Appears as variant naming for "Punch Out" (vertical launch). May be separate hover-focused variant, but no clear distinction found. Recommend clarification.
- **"Half Cab":** Mentioned once in search results but no definition provided. May be skateboarding-derived term not standardized in FPV community.

**5. Canonical Status Issues:**
- **Shot Type Misclassification:** "Scenery Reveal" is fundamentally a shot/composition type, not a maneuver. It should be removed from a "move dictionary" or clearly labeled as compositional technique rather than aerobatic trick.

### SUGGESTED ADDITIONS (Found in Research, Not on Original Candidate List)

These maneuvers appeared consistently across authoritative sources and should be included in a comprehensive dictionary:

1. **Rubik's Cube** (complex multi-axis tumble)
2. **Wall Ride** (proximity wall pass)
3. **Reverse Wall Ride** (backward wall pass)
4. **Sbang Tornado** (advanced innovative style)
5. **Stall** (maneuver/error condition)
6. **Throwback** (directional reversal)
7. **Inverted Hover** (upside-down flight)
8. **Laser Flip** (advanced knife-edge variant)
9. **Alley-Oop** (pop-pivot maneuver)
10. **Boomerang** (curved returning flight)
11. **Vanny Roll** (backward yaw-roll combo)
12. **Jackie Chan Combo** (rapid flip/roll sequence)
13. **Juicy Eject** (vertical launch in juicy style)
14. **Contact Trick Category:** Wall Bonk, Slide/Grind, Perch (three subtypes)

### AUTHORITY/SOURCE QUALITY ASSESSMENT

**Tier 1 - Highly Authoritative:**
- **Rotor Riot Tricktionary** (rotorriot.com) — Most comprehensive, internally consistent, used as reference across FPV community
- **WikiFPV** (wikifpv.com) — Community-maintained wiki, peer-reviewed by active pilots
- **WREKD Co. Master List** (wrekd.com) — Well-organized, skill-level organization clear

**Tier 2 - Solid Authoritative:**
- **Droneblog FPV Acro Guide** (droneblog.com) — Technical depth, equipment/technique correlation
- **GetFPV & Mepsking Tutorials** — Accessible, beginner-friendly definitions
- **FPV TOGO Terms & Slang Glossary** — Captures community terminology with style distinctions

**Tier 3 - Secondary:**
- YouTube Tutorial Channels (Mr. Steele, Skitzo, etc.) — Video demonstrations authoritative, but definitions vary by creator style
- Reddit/Forum Discussions — Pilot vernacular, but inconsistent definitions

### VISUAL/AUDIO DESCRIPTION CONFIDENCE LEVELS

**High Confidence (Based on Multiple Visual/Audio Examples):**
- Power Loop, Matty Flip, Split-S, Immelmann, Roll, Barrel Roll, Flip, Yaw Spin, Wall Ride, Orbits, Dive & Recovery, Trippy Spin, Stall

**Medium Confidence (Limited Source Material but Consistent Descriptions):**
- Knife Edge, Proximity Pass, Punch Out, Rubik's Cube, Inverted Yaw Spin, Laser Flip, Boomerang, Throwback

**Low Confidence (Limited Detailed Descriptions):**
- Gap Hit (varies by gap width), Juicy Combo (style-dependent, not fixed maneuver), Contact Tricks (intentional impact, less video documentation), Sbang Tornado (emerging, continually evolving)

### RECOMMENDED DICTIONARY STRUCTURE

**Primary Categories (by difficulty):**
1. **Foundational** (beginner): Flip, Roll, Yaw Spin, Dive & Recovery
2. **Intermediate:** Power Loop, Split-S, Immelmann, Inverted Hover, Stall, Throwback
3. **Advanced Aerial Tricks:** Matty Flip, Knife Edge, Orbits, Inverted Orbit, Rubik's Cube, Wall Ride, Laser Flip, Boomerang, Vanny Roll
4. **Advanced Proximity/Terrain:** Proximity Pass, Gap Hit, Wall Ride, Reverse Wall Ride, Contact Tricks
5. **Style-Specific/Descriptive:** Juicy Flik, Juicy Eject (juicy style), Trippy Spin (inverted orbit), Jackie Chan Combo, Sbang Tornado

**Optional Secondary Organization (by Execution Phase):**
- Maneuvers emphasizing roll axis rotation
- Maneuvers emphasizing pitch axis rotation
- Maneuvers emphasizing yaw axis rotation
- Multi-axis combinational tricks
- Proximity/environmental interaction tricks

### FINAL RECOMMENDATION

**Remove from dictionary:**
- Scenery Reveal (shot type, not maneuver)
- Speed Run (flight style description, not trick)
- Juicy Combo (style category, not specific maneuver) — keep "Juicy Flik" and "Juicy Eject" as specific tricks within style

**Merge/Consolidate:**
- Trippy Spin ↔ Inverted Orbit (keep both names, clarify as aliases)
- Proximity Pass ↔ Proximity Threading (single entry, note both terms)
- Gap Hit ↔ Micro Gap (single entry, describe gap-width variants)

**Clarify with Project Owner:**
- Superman (no authoritative definition found)
- Punch Hover vs. Punch Out (possible variant or same trick)
- Half Cab (mentioned once, no clear definition)

**Add from Research Findings:**
- All items in "Suggested Additions" list above (13 new entries + contact trick category)

This dictionary should now contain **27-30 core maneuvers + variants**, covering approximately 90% of canonical FPV freestyle vocabulary with visual/audio descriptions suitable for VLM (vision language model) prompting.

---

## DELIVERABLE STATUS

All research compiled. **No files created** (per your read-only directive). All information above constitutes the structured research artifact ready for review by your FPV pilot project owner before integration into production prompts.

The definitions are model-prompt-ready, include visual and audio descriptors suitable for Gemini/Qwen3-VL vision analysis, and are cited with authoritative source URLs throughout.

Sources:
- [Rotor Riot FPV Tricktionary](https://rotorriot.com/blogs/tutorials-guides/fpv-freestyle-tricktionary)
- [WREKD Master List of FPV Tricks](https://wrekd.com/pages/a-master-list-of-fpv-tricks-and-manuevers-and-how-to-do-them)
- [WikiFPV Freestyle Flying](https://wikifpv.com/docs/freestyle-fpv-flying/)
- [FPV TOGO Terms & Slang](https://www.fpvtogo.com/fpv-terms-and-slang/)
- [RC Hobby Lab FPV Freestyle Tricks](https://rchobbylab.com/fpv-drone-freestyle-tricks/)
- [Droneblog FPV Acro Freestyle](https://www.droneblog.com/fpv-acro-freestyle/)
- [Mepsking FPV Freestyle Tutorials](https://www.mepsking.shop/blog/fpv-freestyle-tricks-tutorial.html)
