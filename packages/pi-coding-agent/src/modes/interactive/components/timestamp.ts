/**
 * Timestamp formatting for message display.
 *
 * Formats:
 * - "date-time-iso":  10:34
 * - "date-time-us":   10:34 AM
 */

export type TimestampFormat = "date-time-iso" | "date-time-us";

function pad2(n: number): string {
	return n.toString().padStart(2, "0");
}

function isoTime(d: Date): string {
	return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function usTime(d: Date): string {
	const hours = d.getHours();
	const period = hours >= 12 ? "PM" : "AM";
	const h = hours % 12 || 12;
	return `${h}:${pad2(d.getMinutes())} ${period}`;
}

/**
 * Format a timestamp for message display using the specified format.
 */
export function formatTimestamp(timestamp: number, format: TimestampFormat = "date-time-iso"): string {
	const d = new Date(timestamp);

	switch (format) {
		case "date-time-iso":
			return isoTime(d);
		case "date-time-us":
			return usTime(d);
	}
}
