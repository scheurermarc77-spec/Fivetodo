# FiveTodo – Version ohne Benachrichtigungen

Diese Version enthält den ursprünglichen FiveTodo-Stand ohne Push-/Benachrichtigungsfunktion.

Enthalten:
- 5 Tage: Vorgestern bis Übermorgen
- 10 Todos pro Tag
- gemeinsame Live-Synchronisation über Firebase / Firestore
- Bravo-Einblendung nach dem Erledigen
- PWA / Home-Bildschirm-Icon
- Offline-Cache über Service Worker

Nicht enthalten:
- Push-Benachrichtigungen
- Cloudflare-Worker für Push
- pushTokens
- Firebase Cloud Messaging


## Neue-Aufgaben-Anzeige

Diese Version merkt sich auf jedem iPhone lokal, wann FiveTodo zuletzt geöffnet wurde.

Wird danach auf einem anderen Gerät eine neue Aufgabe eingetragen:
- erscheint beim nächsten Öffnen oben z. B. „1 neue Aufgabe seit deinem letzten Besuch“
- die betreffende Aufgabe erhält ein kleines „NEU“-Label
- es werden weiterhin keine Push-Mitteilungen verwendet

Wichtig:
- Nur Aufgaben, die mit dieser neuen Version erstellt werden, besitzen einen Erstellzeitpunkt.
- Bereits bestehende alte Aufgaben werden beim ersten Start nicht fälschlich als neu markiert.
