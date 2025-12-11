import type { GoogleCalendarEvent } from './types';

// People we're tracking
export const TRACKED_PEOPLE = [
  { initials: 'RM', name: 'Rhys Morgan' },
  { initials: 'DW', name: 'David Williamson' },
  { initials: 'AW', name: 'Andrew Williams' },
  { initials: 'KB', name: 'Kaine Bent' },
  { initials: 'SG', name: 'Stuart Gardener' },
  { initials: 'JH', name: 'Jordan Haggett' },
  { initials: 'EW', name: 'Ethan Williams' },
  { initials: 'NC', name: 'Nathan Cook' },
  { initials: 'LW', name: 'Laura Warren' },
  { initials: 'WT', name: 'William Thomas' },
  { initials: 'MB', name: 'Max Barron' },
  { initials: 'CB', name: 'Clark Brooks' },
  { initials: 'KH', name: 'Kristian Hutchinson' },
] as const;

export const DEFAULT_LOCATION = 'OFFICE';

export interface PersonLocation {
  initials: string;
  name: string;
  location: string;
  eventId?: string;
  eventSummary?: string;
}

/**
 * Parse event summary to extract initials and location
 * Format: "{initials} - {location}"
 * Examples: "AW - WFH", "AW - SICK", "AW - AL", "AW - LBG"
 */
export function parseEventSummary(summary: string): { initials: string; location: string } | null {
  if (!summary) return null;

  const match = summary.trim().match(/^([A-Z]{2,3})\s*-\s*(.+)$/i);
  if (!match) return null;

  const initials = match[1].toUpperCase();
  const location = match[2].trim().toUpperCase();

  return { initials, location };
}

/**
 * Build status board from today's events
 * Returns a map of initials -> location
 */
export function buildLocationStatus(events: GoogleCalendarEvent[]): Map<string, PersonLocation> {
  const status = new Map<string, PersonLocation>();

  // Initialize all people with default location
  for (const person of TRACKED_PEOPLE) {
    status.set(person.initials, {
      initials: person.initials,
      name: person.name,
      location: DEFAULT_LOCATION,
    });
  }

  // Process events to update locations
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const event of events) {
    if (event.status === 'cancelled') continue;

    const parsed = parseEventSummary(event.summary || '');
    if (!parsed) continue;

    const { initials, location } = parsed;

    // Check if this person is tracked
    if (!status.has(initials)) continue;

    // Check if event is for today
    const startDate = event.start?.dateTime
      ? new Date(event.start.dateTime)
      : event.start?.date
        ? new Date(event.start.date + 'T00:00:00')
        : null;

    if (!startDate) continue;

    const eventDate = new Date(startDate);
    eventDate.setHours(0, 0, 0, 0);

    if (eventDate.getTime() === today.getTime()) {
      // Update location for this person
      status.set(initials, {
        initials,
        name: status.get(initials)!.name,
        location,
        eventId: event.id,
        eventSummary: event.summary,
      });
    }
  }

  return status;
}

/**
 * Format status board as Discord embed
 */
export function formatStatusBoard(status: Map<string, PersonLocation>): any {
  const today = new Date();
  const dateStr = today.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // Group people by location
  const byLocation = new Map<string, PersonLocation[]>();
  
  for (const person of status.values()) {
    const loc = person.location || DEFAULT_LOCATION;
    if (!byLocation.has(loc)) {
      byLocation.set(loc, []);
    }
    byLocation.get(loc)!.push(person);
  }

  // Build fields (sorted by location name)
  const fields: any[] = [];
  const sortedLocations = Array.from(byLocation.keys()).sort();

  for (const location of sortedLocations) {
    const people = byLocation.get(location)!;
    const peopleList = people.map(p => `**${p.name}** (${p.initials})`).join(', ');
    
    fields.push({
      name: location,
      value: peopleList || '_No one_',
      inline: false,
    });
  }

  return {
    title: '📍 Team Location Status',
    description: `Status for ${dateStr}`,
    color: 0x4285f4, // Google Calendar blue
    fields,
    footer: {
      text: 'Updated automatically from calendar events',
    },
    timestamp: new Date().toISOString(),
  };
}
