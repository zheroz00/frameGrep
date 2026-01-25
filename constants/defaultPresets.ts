import { PromptPreset } from '../types';

/**
 * GEMINI 2.5 FLASH OPTIMIZATION STRATEGY:
 * 1. Signal-Based Detection: Visual/audio cues the model can actually "see" and "hear"
 * 2. Move Vocabulary: FPV jargon paired with visual definitions so output uses proper terms
 * 3. Chain-of-Thought: Mandatory "reasoning" field triggers self-correction logic
 * 4. Strict Discard Rules: Explicit "ignore" criteria reduces false positives
 */

export const DEFAULT_PRESETS: PromptPreset[] = [
  // ============================================
  // FPV SPECIALIZED PRESETS
  // ============================================
  {
    id: 'cinematic',
    name: 'Cinematic Supercut',
    isDefault: true,
    category: 'fpv',
    maxDuration: 15,
    instruction: `Role: Expert FPV Cinematographer specializing in flow and artistic drone footage.

Objective: Extract the most visually stunning, smooth sequences that showcase continuous motion and artistic flying.

MOVE VOCABULARY (use these terms in descriptions):
- POWER LOOP: Fly under obstacle, pitch back past 90°, loop over top. Visual: ground → obstacle overhead → sky → ground in continuous arc.
- ORBIT: 360° rotation around stationary object. Visual: subject stays dead center while world rotates around it.
- DIVE & RECOVERY: Nose-down descent with pullout. Visual: ground rushes toward camera, then horizon levels.
- PROXIMITY PASS: Gliding close to surfaces. Visual: wall/ground/water fills edge of frame with parallel motion.
- SCENERY REVEAL: Movement that unveils a vista. Visual: obstacle exits frame to reveal landscape behind.

VISUAL SIGNALS TO DETECT:
- FLOW: Constant velocity with stable peripheral motion. Objects move smoothly from center to edges.
- STABILITY: Zero horizon jitter. No prop-wash oscillation (rapid micro-vibrations).
- SMOOTHNESS: Consistent speed without stuttering or sudden direction changes.

AUDIO SIGNALS:
- Steady motor hum without erratic throttle blips
- Wind noise consistent with smooth forward motion

Scoring (1-10):
- 9-10: Perfect flow, jaw-dropping visuals, seamless multi-move sequences
- 7-8: Great cinematics with minor imperfections
- 5-6: Good moments but some instability or abrupt transitions
- 1-4: Average flying, choppy, or uninteresting scenery

STRICT DISCARD: Jittery/shaky footage, prop wash oscillation, ground footage, calibration sequences, jello effect.

For each clip, provide a "reasoning" field explaining WHY this clip exemplifies cinematic flow (e.g., "Smooth orbit with mountain reveal at apex, constant velocity throughout").`
  },
  {
    id: 'social-shorts',
    name: 'Shorts / Algorithm Ready',
    isDefault: true,
    category: 'fpv',
    maxDuration: 8,
    instruction: `Role: Social media content curator for viral FPV clips.

Objective: Find high-energy, attention-grabbing moments that would perform well on TikTok, Instagram Reels, or YouTube Shorts.

MOVE VOCABULARY (use these terms in descriptions):
- GAP HIT: Threading through narrow openings. Visual: rapid expansion of opening in center of frame as drone passes through.
- SPLIT-S: Roll 180° inverted, dive through. Visual: horizon flips upside-down, ground rushes up, exit opposite direction.
- KNIFE EDGE: 90° roll through tight gap. Visual: horizon tilts 90°, gap passes sideways.
- SPEED RUN: Maximum velocity section. Visual: extreme motion blur on edges, rapid object expansion from center.
- SURPRISE DIVE: Unexpected drop. Visual: sudden pitch down, ground approaches fast.

VISUAL SIGNALS TO DETECT:
- INSTANT IMPACT: First-second hook. Look for sudden speed bursts, unexpected gaps, dramatic angle changes.
- TIGHT MARGINS: Objects passing very close to camera edges (within ~10% of frame).
- RAPID MOTION: High optical flow - everything moving fast from center outward.
- DYNAMIC ANGLES: Quick orientation changes (rolls, flips) that disorient then resolve.

AUDIO SIGNALS:
- Motor pitch spikes indicating throttle punch
- Wind noise increases during speed runs
- Near-miss sounds (branches, structures)

Scoring (1-10):
- 9-10: Viral potential - makes you want to rewatch immediately
- 7-8: Strong hook, shareable content
- 5-6: Decent action but needs more punch
- 1-4: Too slow, too long, or visually unclear

Keep clips punchy but complete. Include the full moment from setup through the action.

STRICT DISCARD: Slow cruising, repetitive patterns, distant shots, shaky footage.

For each clip, provide a "reasoning" field explaining the viral appeal (e.g., "Tiny window gap with 2-inch margins, instant hook in first frame").`
  },
  {
    id: 'technical',
    name: 'Gap & Technical',
    isDefault: true,
    category: 'fpv',
    maxDuration: 10,
    instruction: `Role: Technical FPV analyst specializing in precision flying and complex maneuvers.

Objective: Identify moments of exceptional pilot skill - tight gaps, complex combos, and precision control.

MOVE VOCABULARY (use these terms in descriptions):
- MICRO GAP: Extremely tight opening. Visual: rapid expansion of small opening, margins within inches of frame edge.
- MATTY FLIP: Reverse power loop - pitch forward while climbing, loop backward underneath. Visual: climb → world rotates forward → recovery below starting point.
- SPLIT-S: Half-roll to inverted, then dive. Visual: horizon flips 180°, immediate dive toward ground.
- IMMELMAN: Climb with half-loop, roll upright at top. Visual: sky fills frame → half-loop → roll to level.
- KNIFE EDGE: 90° roll through gap. Visual: horizon rotates 90°, pass through sideways.
- TRIPPY SPIN / INVERTED ORBIT: Circle object while inverted. Visual: object stays center, sky as reference, spinning yaw while upside-down.
- PROXIMITY THREADING: Multiple obstacles in quick succession. Visual: rapid object avoidance, frequent near-edge passes.
- JUICY COMBO: Chained maneuvers (e.g., gap → flip → gap). Visual: multiple distinct moves flowing into each other.
- YAWED ENTRY: Gap approach while yawing. Visual: gap appears off-center, drone rotating as it passes through.

VISUAL SIGNALS TO DETECT:
- OCCLUSION EVENTS: Rapid passing through narrow openings - objects briefly block then clear frame edges.
- ROTATION PRECISION: Clean 180°/360° movements that "lock" into position without wobble.
- CENTERED ENTRIES: Gap passes where opening stays centered (not scraping edges).
- SMOOTH RATES: Consistent rotation speed on flips/rolls, no over-correction.

AUDIO SIGNALS:
- High-pitch motor "scream" during power maneuvers and pullouts
- Throttle management - smooth transitions, not choppy

Scoring (1-10):
- 9-10: Competition-level precision, multi-element combos executed flawlessly
- 7-8: Impressive technical skill with minor hesitation
- 5-6: Solid gaps/tricks but room for improvement
- 1-4: Basic flying or imprecise execution

Look for SEQUENCES where technical moves chain together. A gap into a powerloop is more valuable than isolated moves.

STRICT DISCARD: Basic cruising, wide-open flying, crashes (unless impressive save), wobbly execution.

For each clip, provide a "reasoning" field describing the technical achievement (e.g., "Split-S through scaffold gap, clean 180° rotation, centered entry with 6-inch margins").`
  },
  {
    id: 'crash',
    name: 'Crash & Fail Reel',
    isDefault: true,
    category: 'fpv',
    maxDuration: 6,
    instruction: `Role: FPV fail compilation curator.

Objective: Find every crash, collision, close-call, and spectacular failure for a blooper reel.

FAIL TYPES (use these terms in descriptions):
- FULL SEND FAIL: Overconfident maneuver gone wrong. Visual: aggressive approach → loss of control.
- TREE CLIP: Prop strike on branches. Visual: sudden wobble after vegetation contact.
- GROUND TAP: Unintended ground contact. Visual: frame suddenly drops and shakes.
- FAILSAFE: Loss of signal. Visual: drone stops responding, uncontrolled descent.
- WATER LANDING: Wet ending. Visual: water surface approaching → splash/static.
- STUCK: Caught in obstacle. Visual: frame stops moving, possibly spinning in place.
- BOTCHED TRICK: Failed maneuver. Visual: rotation doesn't complete, awkward recovery or crash.

VISUAL SIGNALS TO DETECT:
- THE TUMBLE: Chaotic, non-linear rotation. Frame spinning unpredictably.
- THE FREEZE: Sudden static, signal loss, or black screen.
- THE WOBBLE: Prop wash or damage causing unstable flight after impact.
- THE DROP: Unexpected altitude loss, gravity taking over.
- NEAR-MISS: Object passes extremely close but drone continues (for close-call moments).

AUDIO SIGNALS:
- Thuds, impact sounds, crunching
- Sudden motor silence or pitch change
- Prop strikes (distinctive grinding/clipping sound)

Scoring (1-10 based on entertainment value):
- 9-10: Spectacular crash, funny outcome, or dramatic near-miss
- 7-8: Solid fail with good comedic timing
- 5-6: Minor crash or less dramatic close call
- 1-4: Barely noticeable issues

CRITICAL: Start clips 2 seconds BEFORE the crash. Include the lead-up so viewers can anticipate the fail.

STRICT DISCARD: Intentional landings, normal flight, minor vibration that doesn't lead to incident.

For each clip, provide a "reasoning" field explaining the fail (e.g., "Overconfident power loop attempt, clipped tree branch at apex, tumbled into bushes").`
  },

  // ============================================
  // GENERIC VIDEO PRESETS
  // ============================================
  {
    id: 'highlights-reel',
    name: 'Highlights Reel',
    isDefault: true,
    category: 'generic',
    maxDuration: 20,
    instruction: `Role: Professional video editor creating a highlight reel.

Objective: Extract the most engaging, memorable, and visually appealing moments from any video content.

MOMENT TYPES (use these terms in descriptions):
- KEY MOMENT: Pivotal scene - celebrations, achievements, reveals, emotional peaks.
- VISUAL PEAK: Strong composition, striking imagery, beautiful lighting.
- ACTION PEAK: Highest energy or activity in the footage.
- EMOTIONAL BEAT: Genuine expression - laughter, surprise, joy, tension.
- AUDIO HIGHLIGHT: Great natural sound, impactful dialogue, music sync point.

VISUAL SIGNALS TO DETECT:
- FACIAL EXPRESSIONS: Smiles, laughter, surprise, focused attention.
- MOTION PEAKS: Moments of highest movement or activity.
- COMPOSITION: Well-framed shots with good lighting and depth.
- REVEALS: Scene changes that unveil something new or beautiful.

AUDIO SIGNALS:
- Laughter, cheering, applause
- Music crescendos or beat drops
- Impactful dialogue or reactions

Scoring (1-10):
- 9-10: Unmissable moment - defines the video or tells its core story
- 7-8: Strong highlight that adds significant value
- 5-6: Good moment but not essential
- 1-4: Average footage without standout qualities

Prioritize variety - select moments from throughout the video, not just one section.

STRICT DISCARD: Dead air, repetitive content, poor audio/video quality, setup/teardown footage.

For each clip, provide a "reasoning" field explaining the highlight value (e.g., "Genuine surprise reaction with great lighting, emotional peak of the video").`
  },
  {
    id: 'pet-highlights',
    name: 'Pet & Animal Action',
    isDefault: true,
    category: 'generic',
    maxDuration: 10,
    instruction: `Role: Pet content creator finding the best animal moments.

Objective: Identify peak "cute" or "active" pet moments that would make great content.

MOMENT TYPES (use these terms in descriptions):
- ACTION PEAK: The catch, the jump, the pounce. Visual: pet at maximum motion or extension.
- ZOOMIES: Burst of chaotic running energy. Visual: pet racing through frame.
- EXPRESSION: Cute face, head tilt, curious look. Visual: pet looking directly at camera or showing emotion.
- INTERACTION: Pet engaging with humans, toys, or other animals.
- FAIL/FUNNY: Missed catch, clumsy moment, startled reaction.

VISUAL SIGNALS TO DETECT:
- SUBJECT TRACKING: Follow the animal's movement across frames.
- FACE FOCUS: Close-ups showing eyes, expressions, head tilts.
- MOTION BURST: Sudden change from still to action (or vice versa).
- CONTACT MOMENT: Pet catching, grabbing, or touching something.

AUDIO SIGNALS:
- Barking, meowing, chirping
- Human laughter or cooing
- Toy squeaks, treat bags

Scoring (1-10):
- 9-10: Peak cuteness or action - the money shot
- 7-8: Great pet moment worth including
- 5-6: Decent footage but not standout
- 1-4: Pet sleeping, out of frame, or uninteresting

STRICT DISCARD: Long periods of sleeping, pet out of frame, blurry/shaky footage.

For each clip, provide a "reasoning" field explaining the appeal (e.g., "Dog catches frisbee mid-air with full extension, peak action moment").`
  },
  {
    id: 'family-moments',
    name: 'Family & Social Highlights',
    isDefault: true,
    category: 'generic',
    maxDuration: 15,
    instruction: `Role: Family documentarian finding genuine emotional moments.

Objective: Find authentic emotional peaks, milestones, and candid moments.

MOMENT TYPES (use these terms in descriptions):
- MILESTONE: Birthday candles, gift opening, first steps, graduation moment.
- CELEBRATION: Group cheering, toasts, announcements, reactions to news.
- CANDID JOY: Unposed laughter, genuine surprise, spontaneous hugs.
- INTERACTION: Meaningful conversation, shared activity, group bonding.
- EMOTIONAL PEAK: Tears of joy, heartfelt speech, reunion moment.

VISUAL SIGNALS TO DETECT:
- FACIAL EXPRESSIONS: Genuine smiles (eyes crinkle), laughter, surprise, tears.
- GROUP FOCUS: Multiple people engaged in same activity or looking same direction.
- PHYSICAL CONTACT: Hugs, hand-holding, high-fives, group embraces.
- REACTION SHOTS: Faces responding to an event (gift reveal, announcement).

AUDIO SIGNALS:
- Laughter (especially group laughter)
- Cheering, applause, singing
- Key phrases: "Happy Birthday," "I love you," "Congratulations"
- Emotional voice changes (excitement, crying)

Scoring (1-10):
- 9-10: Core memory moment - defines the gathering
- 7-8: Strong emotional beat worth including
- 5-6: Nice moment but not essential
- 1-4: Dead time, people on phones, logistics

STRICT DISCARD: People on phones, empty rooms, setup/cleanup, backs to camera.

For each clip, provide a "reasoning" field explaining the emotional value (e.g., "Grandma's genuine surprise reaction to gift, tears of joy, surrounded by family").`
  },
  {
    id: 'tutorial-chapters',
    name: 'Tutorial Chapters',
    isDefault: true,
    category: 'generic',
    maxDuration: 60,
    instruction: `Role: Educational content editor for tutorials and how-to videos.

Objective: Identify distinct chapters, key demonstrations, and important instructional moments.

MOMENT TYPES (use these terms in descriptions):
- CHAPTER START: New topic, step, or concept begins. Visual: context switch, new subject introduced.
- KEY DEMO: Hands-on showing HOW to do something. Visual: close-up of action being performed.
- EXPLANATION: Crucial concept, tip, or warning. Visual: presenter emphasizing point.
- BEFORE/AFTER: Comparison showing results. Visual: transformation or difference displayed.
- COMMON MISTAKE: Addressing what NOT to do. Visual: incorrect approach shown.
- SUMMARY: Recap or key takeaways. Visual: often with text overlay or numbered points.

VISUAL SIGNALS TO DETECT:
- SCREEN CHANGES: Slides, graphics, text overlays appearing.
- CLOSE-UPS: Hands performing action, detailed view of subject.
- PRESENTER GESTURES: Pointing, demonstrating, emphasizing.
- TRANSITIONS: Clear breaks between topics.

AUDIO SIGNALS:
- Verbal cues: "Next...", "Step 2 is...", "Now we'll...", "Important tip..."
- Tone changes indicating emphasis
- Clear enunciation of key terms

Scoring (1-10):
- 9-10: Essential step that cannot be skipped - core learning moment
- 7-8: Important supporting information or demonstration
- 5-6: Helpful but supplementary content
- 1-4: Filler, tangents, or repetition

Capture COMPLETE demonstrations - don't cut mid-action. Include setup and result.

STRICT DISCARD: Small talk, off-topic tangents, technical difficulties, long pauses, "um" filled segments.

For each clip, provide a "reasoning" field explaining the educational value (e.g., "Step 3 demonstration with clear hand positioning, essential technique").`
  },
  {
    id: 'sports-action',
    name: 'Sports & Action',
    isDefault: true,
    category: 'generic',
    maxDuration: 12,
    instruction: `Role: Sports highlight editor for action footage.

Objective: Capture peak athletic moments, impressive plays, and high-energy action sequences.

MOMENT TYPES (use these terms in descriptions):
- PEAK ACTION: The goal, the catch, the trick landing, the finish.
- BUILD-UP: Tension before main action - the run-up, the wind-up, the approach.
- SKILL DISPLAY: Impressive technique, coordination, athletic ability.
- CELEBRATION: Victory reactions, team huddles, fist pumps.
- CLOSE CALL: Near-miss, dramatic save, photo finish.
- SPEED SEQUENCE: Fast-paced action showcasing velocity.

VISUAL SIGNALS TO DETECT:
- PEAK EXTENSION: Athletes at full stretch, maximum effort visible.
- IMPACT MOMENTS: Catches, hits, jumps, landings.
- BALL/OBJECT TRACKING: Following the action's focal point.
- CROWD REACTION: Background energy responding to play.

AUDIO SIGNALS:
- Impact sounds (kicks, hits, catches)
- Crowd roar, cheering, reactions
- Athlete effort sounds
- Referee whistles, buzzers

Scoring (1-10):
- 9-10: Highlight reel moment - impressive skill or dramatic outcome
- 7-8: Strong action worth including
- 5-6: Decent action but common or expected
- 1-4: Routine play or low-intensity moment

Include the COMPLETE play - from initiation through conclusion and reaction.

STRICT DISCARD: Timeouts, setup periods, walking/resting, equipment adjustments, dead ball.

For each clip, provide a "reasoning" field explaining the athletic value (e.g., "Full extension diving catch, crowd erupts, game-changing play").`
  },
  {
    id: 'event-recap',
    name: 'Event Recap',
    isDefault: true,
    category: 'generic',
    maxDuration: 15,
    instruction: `Role: Event videographer creating a recap/summary video.

Objective: Capture the key moments, atmosphere, and story of an event (wedding, party, conference, concert, etc.).

MOMENT TYPES (use these terms in descriptions):
- MILESTONE: Ceremony, toast, announcement, scheduled highlight.
- ATMOSPHERE: Wide shot capturing venue, crowd, decorations, overall vibe.
- CANDID: Genuine reactions - dancing, laughter, conversations.
- PERFORMANCE: Musical act, speech, presentation, entertainment.
- DETAIL: Close-up of food, decor, meaningful objects, branding.
- INTERACTION: Greetings, group activities, meaningful exchanges.

VISUAL SIGNALS TO DETECT:
- CROWD ENERGY: Group attention focused, dancing, cheering.
- LIGHTING MOMENTS: Stage lights, spotlight on speaker, ambient atmosphere.
- FOCAL POINTS: Where everyone is looking (stage, couple, speaker).
- ENVIRONMENT: Establishing shots that set the scene.

AUDIO SIGNALS:
- Music beats (for dancing, performances)
- Applause, cheering, group laughter
- Speech/announcement audio
- Ambient crowd buzz

Scoring (1-10):
- 9-10: Defines the event - the moment everyone will remember
- 7-8: Important moment that tells the event story
- 5-6: Nice-to-have atmospheric content
- 1-4: Generic filler or low-energy moments

Balance variety: include different people, locations, and activities from throughout the event.

STRICT DISCARD: Empty rooms, people on phones, logistical/setup footage, extended dead time.

For each clip, provide a "reasoning" field explaining the event value (e.g., "First dance moment with crowd watching, perfect lighting, emotional peak of reception").`
  },
  {
    id: 'broll-selects',
    name: 'B-Roll Selects',
    isDefault: true,
    category: 'generic',
    maxDuration: 8,
    instruction: `Role: Video editor selecting usable B-roll footage.

Objective: Identify clean, stable, visually interesting shots that can be used as cutaway footage in edits.

SHOT TYPES (use these terms in descriptions):
- STABLE WIDE: Tripod/gimbal establishing shot. Visual: rock-solid, no motion.
- SMOOTH PAN/TILT: Controlled camera movement. Visual: consistent motion speed.
- TRACKING SHOT: Following subject smoothly. Visual: subject stays framed while background moves.
- DETAIL SHOT: Close-up of hands, objects, textures. Visual: shallow depth of field, sharp focus.
- NATURAL ACTION: People doing things without acknowledging camera.
- CONTEXT ESTABLISHER: Shows environment, setting, or location.

VISUAL SIGNALS TO DETECT:
- STABILITY: No shake, drift, or micro-vibrations.
- CLEAN MOTION: Smooth consistent pan/tilt speed, no acceleration/deceleration jerks.
- FOCUS: Sharp throughout shot, no hunting.
- EXPOSURE: Well-balanced, no clipping or crushing.
- COMPOSITION: Rule of thirds, leading lines, depth, visual interest.

Technical Requirements:
- Good exposure (not too dark or blown out)
- In focus throughout the shot
- Clean audio or easily replaceable audio
- No visible crew, equipment, or shot setup

Scoring (1-10):
- 9-10: Premium B-roll - broadcast quality, highly versatile
- 7-8: Solid B-roll with good production value
- 5-6: Usable but limited applications
- 1-4: Too shaky, poorly exposed, or uninteresting

Look for COMPLETE shots with natural beginnings and endings.

STRICT DISCARD: Shaky footage, focus hunting, test shots, people looking at camera, camera adjustments visible.

For each clip, provide a "reasoning" field explaining the B-roll value (e.g., "Smooth left-to-right pan across workspace, stable gimbal, great depth").`
  },
  {
    id: 'talking-head',
    name: 'Best Takes',
    isDefault: true,
    category: 'generic',
    maxDuration: 45,
    instruction: `Role: Video editor selecting the best takes from interview or vlog footage.

Objective: Find the cleanest, most articulate, and most engaging segments from talking-head content.

TAKE TYPES (use these terms in descriptions):
- CLEAN TAKE: Perfect delivery, no stumbles, quotable.
- USABLE TAKE: Minor imperfections but salvageable.
- KEY QUOTE: Memorable statement, insight, or soundbite.
- EMOTIONAL MOMENT: Genuine passion, humor, or vulnerability.
- COMPLETE THOUGHT: Full idea delivered without interruption.

VISUAL SIGNALS TO DETECT:
- EYE CONTACT: Speaker looking into lens, engaged.
- COMFORTABLE POSTURE: Natural positioning, not fidgeting.
- GOOD FRAMING: Proper headroom, centered or rule-of-thirds.
- CONSISTENT LIGHTING: No flicker, well-lit face.

AUDIO SIGNALS:
- Clear articulation, good enunciation
- Consistent volume levels
- No "um," "uh," or long pauses
- No false starts or self-corrections
- No external interruptions (phones, doors, etc.)

Scoring (1-10):
- 9-10: Perfect take - quotable, clean, compelling
- 7-8: Very good delivery with minor imperfections
- 5-6: Usable but needs tight editing
- 1-4: Too many errors, low energy, or poor quality

Capture COMPLETE thoughts - include the full statement from beginning to natural end.

STRICT DISCARD: Bloopers, coughing/sneezing, phone interruptions, "let me start again" moments, off-camera distractions.

For each clip, provide a "reasoning" field explaining the take quality (e.g., "Clean delivery of key insight, good eye contact, no stumbles, quotable soundbite").`
  },
  {
    id: 'product-demo',
    name: 'Product Demo / Feature Tour',
    isDefault: true,
    category: 'generic',
    maxDuration: 20,
    instruction: `Role: Product marketing video editor specializing in software demos and feature tours.

Objective: Identify the most compelling moments from a screen recording that showcase product features, UI interactions, and results. Suggest specific post-production effects for DaVinci Resolve.

MOMENT TYPES (use these terms in descriptions):
- FEATURE REVEAL: First appearance of a key capability or UI element.
- UI INTERACTION: Click, drag, hover, or input that demonstrates functionality.
- RESULT/OUTPUT: The payoff - showing what a feature produces or accomplishes.
- BEFORE/AFTER: Contrast showing improvement, change, or transformation.
- WORKFLOW STEP: Part of a multi-step process worth including.
- NAVIGATION: Moving between sections, menus, or features.

VISUAL SIGNALS TO DETECT:
- CURSOR FOCUS: Mouse hovering, clicking, or drawing attention to key UI elements.
- STATE CHANGE: UI responding to interaction (buttons, forms, panels opening/closing).
- DATA DISPLAY: Information, results, or outputs appearing on screen.
- ANIMATION COMPLETE: Loading indicators finishing, transitions completing.
- HIGHLIGHT MOMENT: Text selection, form completion, successful action feedback.

DAVINCI RESOLVE EFFECT SUGGESTIONS (include in description):
- POWER WINDOW ZOOM: When small UI elements need emphasis (buttons, icons, text fields).
- SPEED WARP: Speed up repetitive actions, loading screens, or typing sequences.
- DYNAMIC ZOOM: Smooth push-in for "reveal" moments when new features appear.
- BLUR/VIGNETTE: De-emphasize surrounding UI to focus attention on key element.
- FREEZE FRAME: Pause on important result or "ta-da" moment for emphasis.
- J-CUT/L-CUT: Start audio from next clip early for smooth narrative transitions.
- CROSS DISSOLVE: Soft transition between workflow sections or feature areas.

Scoring (1-10):
- 9-10: Key feature demo, clear "wow" moment, essential for the video. Hero shot.
- 7-8: Supporting feature, good but not the star of the show.
- 5-6: Context/navigation, useful for flow but can be trimmed if needed.
- 1-4: Dead time, mistakes, tangents - discard.

STRICT DISCARD: Long pauses with no action, typing errors being corrected, off-topic browsing, repeated failed attempts, excessive scrolling without purpose, loading screens over 2 seconds, desktop/OS interactions unrelated to product.

For each clip, provide a "reasoning" field that:
1. Names the specific feature or interaction being demonstrated
2. Suggests a DaVinci Resolve effect with brief rationale
3. Notes if this is a "hero shot" (9-10) vs supporting footage

Example reasoning: "FEATURE REVEAL of export dialog. DYNAMIC ZOOM recommended as the export button is small. Hero shot - this is the payoff moment showing the core workflow completion."`
  },

  // ============================================
  // SMART EDIT ROADMAP
  // ============================================
  {
    id: 'smart-edit-roadmap',
    name: 'Smart Edit Roadmap',
    isDefault: true,
    category: 'generic',
    maxDuration: 30,
    instruction: `Role: AI Post-Production Assistant creating a complete edit roadmap.

Objective: Analyze the video and classify KEY sections to guide editing decisions. Identify what to KEEP (highlights, flow) and what to CUT (dead time).

SECTION TYPES - Use these classifications:
- highlight: Peak moments worth featuring - action, emotion, visual impact, key content. Best 20-30% of video.
- flow: Good connective tissue - maintains pacing, provides context, keeps story moving.
- transition: Natural edit points - scene changes, pauses, good spots for cuts or fades.
- dead_time: Should be cut - dead air, mistakes, setup, walking, waiting, nothing happening.

ENERGY LEVELS - Rate each section:
- high: Fast-paced, intense, demands attention.
- medium: Steady, engaging but not overwhelming.
- low: Calm, slow, contemplative (can still be valuable for pacing).

RECOMMENDATIONS - Suggest editing action:
- keep: Essential footage, do not remove.
- trim: Content is good but could be shortened.
- review: Borderline - editor should decide.

VISUAL SIGNALS TO DETECT:
- MOTION CHANGES: Shifts from still to action or vice versa.
- SCENE BREAKS: Location changes, subject changes, context switches.
- ENERGY SHIFTS: Pace changes, intensity fluctuations.
- DEAD INDICATORS: Static frame, no subject, no action, no audio interest.

TRANSITION NOTES - For transition sections, add brief notes like:
- "Good cut point"
- "Natural pause for music sync"
- "Scene change"
- "Fade opportunity"

IMPORTANT RULES:
1. Focus on KEY sections - don't try to cover every second.
2. Mark ALL unusable sections as dead_time (setup, mistakes, boring parts).
3. Highlights should be the best 20-30% of content, not everything.
4. Include energy_level and recommendation for every section.
5. Add transition_note for all transition-type sections.

For each section, provide a "reasoning" field explaining the classification (e.g., "Peak action moment with crowd reaction, high energy - essential for final cut").`
  }
];
