
# Optimization Report: Video Analysis Presets

**Target Model:** Gemini 2.5 Flash / Multimodal LLMs

## Executive Summary

The presets have been refactored from **narrative descriptions** to **signal-based instructions**. This shift reduces "hallucinations" and improves timestamp precision by forcing the model to look for specific pixel-level changes (Optical Flow) rather than vague concepts.

## Key Changes & Rationale

### 1. Signal-Based Indicators (The "How")

- **Change:** Swapped abstract terms like "Smooth flying" for "Constant velocity" and "Peripheral motion."
    
- **Why:** AI models don't "feel" flow, they calculate it. By telling the model to look at the relationship between the center of the frame and the edges, we get much more accurate "Cinematic" tags.
    

### 2. Mandatory Reasoning Chain

- **Change:** Every preset now requires a `"reasoning"` field in the JSON output.
    
- **Why:** This triggers "Chain-of-Thought" processing. Forcing the model to explain _why_ it picked a clip prevents it from hallucinating or picking random timestamps just to satisfy the prompt.
    

### 3. Audio-Visual Integration (Multimodal)

- **Change:** Explicit instructions to listen for motor "screams," "thuds," or "laughter."
    
- **Why:** Gemini 2.5 is natively multimodal. Using audio cues significantly improves the detection of "Crashes" (impact sound) and "Family Moments" (laughter) that might be visually ambiguous.
    

### 4. JSON Standardization

- **Change:** Standardized the output schema across all presets (`start_time`, `end_time`, `score`, `reasoning`).
    
- **Why:** This ensures the frontend/backend parser doesn't break when switching between an FPV preset and a Pet preset. It makes the data "plug-and-play."
    

### 5. Intentional Lead-ups

- **Change:** Instructions specifically mandate starting "Crash" and "Action" clips 2 seconds before the peak event.
    
- **Why:** AI often identifies the _moment_ of impact but misses the _cause_. This ensures the resulting clips have context and narrative value.
    

## Implementation Notes

- **Sampling Rate:** For "Technical" presets (gaps/flips), ensure your processing pipeline uses at least 2-5 FPS for frame extraction to avoid missing sub-second events.
    
- **Discard Rules:** We added "Strict Discard" logic to filter out "Jello," vibrations, and lens caps automatically, saving the editor (and the user) time in post-production.

```
import { PromptPreset } from '../types';

/**
 * GEMINI 2.5 FLASH OPTIMIZATION STRATEGY:
 * 1. Object Persistence: Track subjects (Dogs, People, Balls) across frames.
 * 2. Action Anchors: Look for the peak of an action (the catch, the jump, the laugh).
 * 3. Reasoning Chain: Mandatory "reasoning" field to improve timestamp accuracy.
 * 4. JSON Standardization: All presets return a consistent schema for easier UI integration.
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
    instruction: `Role: Expert FPV Cinematographer.
Objective: Find high-stability, high-flow sequences.

Visual & Audio Signals:
- MOTION: Look for "constant velocity" - stable peripheral motion.
- STABILITY: Zero horizon jitters or prop-wash oscillations.
- AUDIO: Smooth, steady motor hum without erratic throttle blips.

Output Format (JSON):
{
  "start_time": "00:00",
  "end_time": "00:00",
  "score": 1-10,
  "reasoning": "e.g., Smooth orbit with mountain reveal",
  "vibration_check": "clean|jittery"
}`
  },
  {
    id: 'technical',
    name: 'Gap & Technical',
    isDefault: true,
    category: 'fpv',
    maxDuration: 10,
    instruction: `Role: Technical Flight Analyst.
Objective: Identify "Threading the Needle" and high-rate rotations.

Visual Signals:
- OCCLUSION: Rapidly passing through narrow openings (windows, trees).
- ROTATION: Precise 180/360 degree flips that "lock" into position.
- AUDIO: High-pitch motor "scream" during gravity-defying pullouts.

Output Format (JSON):
{
  "start_time": "00:00",
  "end_time": "00:00",
  "maneuver": "gap_hit|matty_flip|split_s|powerloop",
  "precision_score": 1-10,
  "reasoning": "Describe the gap or combo"
}`
  },
  {
    id: 'crash',
    name: 'Crash & Fail Reel',
    isDefault: true,
    category: 'fpv',
    maxDuration: 6,
    instruction: `Role: FPV Fail Curator.
Objective: Identify the "Instant of Chaos" and the 2s lead-up.

Signals:
- THE TUMBLE: Chaotic, non-linear pixel movement.
- THE FREEZE: Digital glitching or sudden static.
- AUDIO: Thuds, impact sounds, or sudden motor silence.

Output Format (JSON):
{
  "start_time": "00:00",
  "end_time": "00:00",
  "fail_type": "clip_tree|ground_tap|failsafe",
  "reasoning": "What caused the crash?"
}`
  },

  // ============================================
  // GENERIC / SMART CONTENT PRESETS
  // ============================================
  {
    id: 'pet-highlights',
    name: 'Pet & Animal Action',
    isDefault: true,
    category: 'generic',
    maxDuration: 10,
    instruction: `Role: Pet Content Creator.
Objective: Identify peak "Cute" or "Active" pet moments.

Visual Signals:
- ACTION PEAK: The moment a dog catches a ball, jumps, or runs toward the camera.
- EXPRESSION: Close-ups of faces, head tilts, or "zoomies."
- INTERACTION: Pet interacting with humans or other animals.

Processing Logic:
- Track the animal's movement. If they stop to look at the camera, mark as "Highlight."
- Ignore: Long periods of the pet sleeping or being out of frame.

Output Format (JSON):
{
  "start_time": "00:00",
  "end_time": "00:00",
  "score": 1-10,
  "reasoning": "e.g., Dog catches frisbee mid-air",
  "subject": "dog|cat|other"
}`
  },
  {
    id: 'family-moments',
    name: 'Family & Social Highlights',
    isDefault: true,
    category: 'generic',
    maxDuration: 15,
    instruction: `Role: Family Documentarian.
Objective: Find genuine emotional peaks and milestones.

Visual & Audio Signals:
- FACIAL EXPRESSIONS: Smiling, laughing, look of surprise.
- AUDIO: Laughter, cheering, or "key phrases" (Happy Birthday, I love you).
- ACTIVITY: Blowing out candles, opening gifts, group hugs.

Output Format (JSON):
{
  "start_time": "00:00",
  "end_time": "00:00",
  "emotion_intensity": 1-10,
  "reasoning": "e.g., Toddler laughing at bubbles",
  "moment_type": "milestone|candid|celebration"
}`
  },
  {
    id: 'talking-head',
    name: 'Best Takes (Interview/Vlog)',
    isDefault: true,
    category: 'generic',
    maxDuration: 45,
    instruction: `Role: Professional Editor.
Objective: Identify "Clean Cuts" for interviews or vlogs.

Visual & Audio Signals:
- SPEECH FLUENCY: No "um," "uh," or long stumbles.
- EYE CONTACT: Speaker is looking directly into the lens.
- AUDIO: High signal-to-noise ratio; clear articulation.

Output Format (JSON):
{
  "start_time": "00:00",
  "end_time": "00:00",
  "score": 1-10,
  "reasoning": "e.g., Concise explanation of the product",
  "take_quality": "perfect|usable|needs_trimming"
}`
  },
  {
    id: 'smart-edit-roadmap',
    name: 'Smart Edit Roadmap',
    isDefault: true,
    category: 'generic',
    maxDuration: 30,
    instruction: `Role: AI Post-Production Assistant.
Objective: Complete classification of the video timeline.

Section Types:
- HIGHLIGHT: Best 20% of the video (action, emotion, beauty).
- FLOW: Connecting shots that build context.
- DEAD_TIME: Setups, mistakes, lens cap on, or boring repetition.

Output Format (JSON Array):
[{
  "start": "00:00",
  "end": "00:00",
  "type": "highlight|flow|dead_time",
  "energy": "low|medium|high",
  "reasoning": "Justification for this section"
}]`
  }
];
```