import SwiftUI
import WidgetKit

/// Must match `extra.widgetAppGroup` in `app.config.ts` and the entitlement in
/// `expo-target.config.js`. Hardcoded because the widget process has no access
/// to the JS config.
private let appGroupIdentifier = "group.com.jarydhermann.littlemoments.widget"

/// Single key holding the whole payload as JSON. One key rather than several so
/// a write can never be observed half-applied.
private let snapshotKey = "snapshot"

/// Just opens the app.
///
/// `app/+native-intent.tsx` maps `/app` to `/`, which is the root index — the
/// only entry point that restores the session and then decides where the user
/// belongs. Linking straight to a tab route instead skipped that and left the
/// app sitting on its launch screen forever, because nothing downstream of the
/// deep link ever resolved the session.
///
/// Three slashes, not two: with `littlemoments://app` the `app` lands in the
/// host position and the path arrives empty, so `redirectSystemPath` never sees
/// the `/app` prefix it matches on.
private let openAppURL = URL(string: "littlemoments:///app")!

private let daysPerWeek = 7

/// Monday-first calendar, matching `weekCaptureProgress` in `lib/yearCapture.ts`.
private var mondayCalendar: Calendar {
    var calendar = Calendar.current
    calendar.firstWeekday = 2
    return calendar
}

private let dayKeyFormatter: DateFormatter = {
    let formatter = DateFormatter()
    formatter.calendar = Calendar(identifier: .gregorian)
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.dateFormat = "yyyy-MM-dd"
    return formatter
}()

// MARK: - Payload

/// Mirror of the object written by `lib/widgetSnapshot.ts`.
private struct Snapshot: Codable {
    let totalMoments: Int
    let capturedDays: Int
    let days: [Bool]
    let weekStart: String
}

private func loadSnapshot() -> Snapshot? {
    guard
        let defaults = UserDefaults(suiteName: appGroupIdentifier),
        let raw = defaults.string(forKey: snapshotKey),
        let data = raw.data(using: .utf8),
        let snapshot = try? JSONDecoder().decode(Snapshot.self, from: data)
    else { return nil }
    return snapshot
}

private func currentWeekStart(for date: Date) -> String? {
    guard let start = mondayCalendar.dateInterval(of: .weekOfYear, for: date)?.start
    else { return nil }
    return dayKeyFormatter.string(from: start)
}

// MARK: - Timeline

private struct CaptureEntry: TimelineEntry {
    let date: Date
    let totalMoments: Int
    let days: [Bool]
    let hasData: Bool

    var capturedDays: Int { days.filter { $0 }.count }

    /// Monday-indexed position of `date` in its week.
    var todayIndex: Int {
        (mondayCalendar.component(.weekday, from: date) + 5) % daysPerWeek
    }
}

private func makeEntry(for date: Date) -> CaptureEntry {
    guard let snapshot = loadSnapshot() else {
        return CaptureEntry(
            date: date,
            totalMoments: 0,
            days: Array(repeating: false, count: daysPerWeek),
            hasData: false
        )
    }

    // The app only rewrites the snapshot when it runs, so by the time a new
    // week starts the stored flags can describe the previous one. Total moments
    // stays valid either way; only the week row is discarded.
    let isCurrentWeek = snapshot.weekStart == currentWeekStart(for: date)
    let days =
        isCurrentWeek && snapshot.days.count == daysPerWeek
        ? snapshot.days
        : Array(repeating: false, count: daysPerWeek)

    return CaptureEntry(
        date: date,
        totalMoments: snapshot.totalMoments,
        days: days,
        hasData: true
    )
}

private struct CaptureProvider: TimelineProvider {
    func placeholder(in context: Context) -> CaptureEntry {
        makeEntry(for: Date())
    }

    func getSnapshot(in context: Context, completion: @escaping (CaptureEntry) -> Void) {
        completion(makeEntry(for: Date()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<CaptureEntry>) -> Void) {
        let now = Date()
        let calendar = mondayCalendar
        // Refresh at midnight so the dot row advances and the week resets on
        // Monday without waiting for the app to be opened.
        let nextMidnight =
            calendar.date(byAdding: .day, value: 1, to: calendar.startOfDay(for: now))
            ?? now.addingTimeInterval(60 * 60)

        completion(
            Timeline(entries: [makeEntry(for: now)], policy: .after(nextMidnight))
        )
    }
}

// MARK: - Views

private struct WeekRow: View {
    let days: [Bool]
    let todayIndex: Int

    var body: some View {
        HStack(spacing: 6) {
            ForEach(Array(days.enumerated()), id: \.offset) { index, captured in
                Circle()
                    .fill(captured ? Color("$accent") : Color.white.opacity(0.16))
                    .frame(width: 8, height: 8)
                    .overlay(
                        Circle()
                            .stroke(Color.white.opacity(0.5), lineWidth: 1)
                            .opacity(index == todayIndex && !captured ? 1 : 0)
                    )
            }
        }
    }
}

private struct CaptureWidgetView: View {
    let entry: CaptureEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top, spacing: 0) {
                // Black line art on transparent, same asset the app uses for
                // its empty photo states — drawn as a template so it takes the
                // accent colour instead of disappearing into the background.
                Image("noPic")
                    .renderingMode(.template)
                    .resizable()
                    .scaledToFit()
                    .frame(width: 22, height: 22)
                    .foregroundStyle(Color("$accent"))

                Spacer(minLength: 0)

                Image("logo")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 20, height: 20)
                    .clipShape(RoundedRectangle(cornerRadius: 5, style: .continuous))
            }

            Spacer(minLength: 8)

            if entry.hasData {
                Text("\(entry.totalMoments)")
                    .font(.system(size: 40, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)
                    .minimumScaleFactor(0.6)
                    .lineLimit(1)

                Text(entry.totalMoments == 1 ? "moment" : "moments")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(.white.opacity(0.5))

                Spacer(minLength: 10)

                WeekRow(days: entry.days, todayIndex: entry.todayIndex)

                Text("\(entry.capturedDays) of \(daysPerWeek) this week")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(.white.opacity(0.4))
                    .padding(.top, 6)
            } else {
                Text("Capture your\nfirst moment")
                    .font(.system(size: 19, weight: .semibold, design: .rounded))
                    .foregroundStyle(.white)
                    .lineSpacing(2)

                Spacer(minLength: 6)

                Text("Tap to open Little Moments")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(.white.opacity(0.4))
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .containerBackground(for: .widget) { Color.black }
        .widgetURL(openAppURL)
    }
}

// MARK: - Widget

struct LittleMomentsCaptureWidget: Widget {
    /// Referenced by `ExtensionStorage.reloadWidget(...)` in `lib/widgetSnapshot.ts`.
    static let kind = "LittleMomentsCaptureWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: Self.kind, provider: CaptureProvider()) { entry in
            CaptureWidgetView(entry: entry)
        }
        .configurationDisplayName("Add a moment")
        .description("Your moments so far, and how this week is going.")
        .supportedFamilies([.systemSmall])
    }
}

@main
struct LittleMomentsWidgetBundle: WidgetBundle {
    var body: some Widget {
        LittleMomentsCaptureWidget()
    }
}
