// The whole story in order: the five missions of chapter one, then the four of chapter two. Systems
// that count or look up missions read this list instead of either chapter's file.
import { STORY } from './storyMissions.js';
import { CHAPTER_TWO } from './chapterTwo.js';

export const ALL_MISSIONS = [...STORY, ...CHAPTER_TWO];
export const MISSION_BY_ID = Object.fromEntries(ALL_MISSIONS.map((m) => [m.id, m]));
/** Missions after which a chapter card is shown. */
export const CHAPTER_ENDS = new Set(['finale', 'lowtide']);

export function chapterOf(id) { return CHAPTER_TWO.some((m) => m.id === id) ? 2 : 1; }

/** Title of the mission at `index`, or a closing line once the story is done. */
export function missionTitle(index) { return ALL_MISSIONS[index]?.title ?? 'The story is told'; }
